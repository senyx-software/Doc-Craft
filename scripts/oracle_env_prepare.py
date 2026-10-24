#!/usr/bin/env python3
"""Make private staging copies from explicitly approved existing files; never edit sources."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from urllib.parse import urlsplit

from oracle_env_deploy import EXPECTED, private_file
from oracle_env_remote import require, target_name

ROOT = Path(__file__).resolve().parents[1]
PORTS = json.loads((ROOT / 'deploy/config/runtime-map.json').read_text())['ports']
COMMON = {'NODE_ENV', 'ENV', 'PORT', 'SERVICE_AUTH_CONFIG_FILE', 'SERVICE_TLS_CERT_FILE',
          'SERVICE_TLS_KEY_FILE', 'SERVICE_REQUIRE_TLS', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE',
          'PG_REQUIRE_TLS', 'PGSSLROOTCERT', 'ADMIN_RUN_MIGRATIONS', 'DOCUMENT_RUN_MIGRATIONS',
          'NOTIFICATION_RUN_MIGRATIONS'}


def validate_compose(values, plan):
    compose = (ROOT / 'deploy/docker/compose.production.yml').read_text()
    central_names = set(re.findall(r'\$\{([A-Z][A-Z0-9_]*)', compose)) | {'LOCAL_AI_ENABLED', 'CONFIG_VERSION', 'REGISTRY_PREFIX'}
    require(not set(values) - central_names, 'Unknown root Compose configuration')
    require(not any(re.search(r'(PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL|REDIS_URL|KEYRING)', key) for key in values),
            'Root Compose interpolation must not contain credentials')
    require(values.get('DOCCRAFT_HOME') == '/opt/doccraft' and values.get('DOCCRAFT_RUNTIME') == '/opt/doccraft/config'
            and values.get('DOCCRAFT_CONTROL') == '/opt/doccraft/control', 'Preserve staging Compose path wiring')
    require(values.get('POSTGRES_DB') == plan['staging_database'] and values.get('LOCAL_AI_ENABLED') == 'false',
            'Use the staging database and leave local inference disabled')
    for key, value in values.items():
        if key.endswith('_IMAGE'):
            require(re.fullmatch(r'[^\s]+@sha256:[0-9a-f]{64}', value), 'Use immutable application images')


def read_env(path):
    """Literal dotenv subset. Refuse expansion/multiline syntax rather than reinterpret it."""
    require(not path.is_symlink() and path.is_file(), 'Missing source environment file')
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r'(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=(.*)', line)
        require(match is not None, 'Unsupported environment syntax; review source manually')
        key, value = match.groups()
        require(key not in values, 'Duplicate environment variable')
        value = value.strip()
        if value.startswith(('"', "'")):
            quote = value[0]
            require(value.endswith(quote), 'Unsupported quoted environment value')
            value = value[1:-1]
            require(quote not in value and '\\' not in value, 'Unsupported quoted escapes')
        else:
            value = re.split(r'\s+#', value, maxsplit=1)[0].rstrip()
        require(not any(token in value for token in ('${', '$(', '\x00', '\r', '\n')),
                'Environment interpolation is prohibited')
        values[key] = value
    return values


def validate_runtime(target, values, plan):
    if not target.startswith('config/'):
        return
    service = Path(target).stem
    require(service in PORTS, 'Only actual backend services have runtime environment files')
    mapping = json.loads((ROOT / 'deploy/config/runtime-map.json').read_text())
    allowed = COMMON | set(mapping['settings_by_service'][service]) | set(mapping['secret_allowlist'][service])
    if service == 'admin-api':
        allowed.add('AI_CREDENTIAL_KEYRING_FILE')
    require(not set(values) - allowed, 'Service environment contains unrelated or unsupported variable names')
    require(values.get('PORT') == str(PORTS[service]), 'Preserve the existing internal service port')
    require(values.get('NODE_ENV') == 'production' and values.get('ENV') == 'production',
            'Staging uses production security code paths')
    for name in ('ADMIN_RUN_MIGRATIONS', 'DOCUMENT_RUN_MIGRATIONS', 'NOTIFICATION_RUN_MIGRATIONS'):
        require(values.get(name) == 'false', 'Runtime migrations must remain disabled')
    require(values.get('SERVICE_REQUIRE_TLS') == 'true' and values.get('SERVICE_AUTH_CONFIG_FILE') == '/run/secrets/service_identity',
            'Preserve authenticated private service transport')
    redis = urlsplit(values.get('REDIS_URL', ''))
    require(redis.scheme == 'rediss' and redis.hostname == 'redis' and redis.username and redis.password,
            'Use scoped Docker Redis TLS credentials')
    require(all(values.get(key) for key in mapping['required_secrets'][service]), 'Required scoped runtime credentials missing')
    for key, expected in {'SERVICE_TLS_CERT_FILE': '/run/secrets/service.crt', 'SERVICE_TLS_KEY_FILE': '/run/secrets/service.key',
                          'NODE_EXTRA_CA_CERTS': '/run/secrets/ca.crt', 'SSL_CERT_FILE': '/run/secrets/ca.crt',
                          'PGSSLROOTCERT': '/run/secrets/ca.crt', 'PG_REQUIRE_TLS': 'true'}.items():
        require(values.get(key) == expected, 'Private TLS identity and trust settings are required')
    for name in ('DATABASE_URL', 'DIRECT_URL', 'ADMIN_DATABASE_URL'):
        if name in values:
            url = urlsplit(values[name])
            require(url.scheme == 'postgresql' and url.hostname == 'postgres' and url.path == '/' + plan['staging_database'],
                    'Database must be the approved private staging database')
            require(url.username == 'doccraft_' + service.replace('-', '_'), 'Runtime must use the scoped database role')
            from urllib.parse import parse_qs
            query = parse_qs(url.query)
            require(query.get('sslmode') in (['require'], ['verify-full']), 'PostgreSQL TLS must not be disabled')
            if service in ('admin-api', 'analytics', 'document'):
                require(query.get('sslmode') == ['verify-full'] and query.get('sslrootcert') == ['/run/secrets/ca.crt'],
                        'Python PostgreSQL clients require verified TLS')
            else:
                require(query.get('sslmode') == ['require'] and query.get('sslaccept') == ['strict']
                        and query.get('sslcert') == ['/run/secrets/ca.crt'], 'Prisma PostgreSQL clients require strict CA verification')
    for name, value in values.items():
        if name in ('DATABASE_URL', 'DIRECT_URL', 'ADMIN_DATABASE_URL', 'REDIS_URL'):
            continue
        if name.endswith('_SERVICE_URL') or name in ('ADMIN_API_URL', 'GATEWAY_URL', 'SIDECAR_URL', 'CHAT_SERVICE_MCP_URL'):
            parsed = urlsplit(value)
            require(parsed.scheme == 'https' and parsed.hostname in PORTS and not parsed.username and not parsed.password,
                    'Internal URLs must use private Docker service TLS names')
        if name.startswith('VITE_'):
            raise ValueError('Frontend build configuration must never be copied into backend runtime files')
        if 'KEYRING' in name:
            require(service == 'admin-api' and name == 'AI_CREDENTIAL_KEYRING_FILE' and value == '/run/secrets/ai_credential_keyring',
                    'Only admin-api may receive the file-backed AI keyring')
    if service == 'admin-api':
        require(values.get('AI_CREDENTIAL_KEYRING_FILE') == '/run/secrets/ai_credential_keyring', 'Preserve file-backed admin-only keyring')
    if service == 'payment':
        require(values.get('PADDLE_SANDBOX') == 'true' and values.get('PAYHERE_SANDBOX') == 'true', 'Live payments are forbidden in staging')


def prepare(plan_path, output):
    private_file(plan_path)
    plan = json.loads(plan_path.read_text())
    require(plan.get('environment') == 'staging' and plan.get('version') == 1, 'Only staging plans are accepted')
    require(re.fullmatch(r'[a-zA-Z0-9_]*staging[a-zA-Z0-9_]*', plan.get('staging_database', '')), 'Name an explicit staging database')
    require(plan.get('approval_reference'), 'Document the operator staging-reuse approval')
    require(not output.exists() and not output.is_symlink(), 'Never overwrite an existing staging bundle')
    entries = plan.get('files', [])
    require(0 < len(entries) <= 128, 'Provide an explicit file allowlist')
    files, seen = [], set()
    for entry in entries:
        name = target_name(entry['target'])
        require(name not in seen, 'Duplicate target')
        seen.add(name)
        require(entry.get('approved_for_staging') is True, 'Every source needs operator staging approval')
        require(entry.get('kind') in ('env', 'secret', 'keyring'), 'Invalid file kind')
        if name == '.env' or name.startswith('config/'):
            require(entry['kind'] == 'env', 'Configuration files require environment validation')
        if 'keyring' in name:
            require(entry['kind'] == 'keyring', 'Keyring requires immutable preservation checks')
        if entry['kind'] == 'env':
            values = {}
            for source in entry.get('sources', []):
                path = Path(source['path'])
                require(path.is_absolute(), 'Use explicit absolute source paths')
                original = read_env(path)
                keys = source['include']
                require(isinstance(keys, list) and keys and len(keys) == len(set(keys)), 'Approve an explicit unique variable list')
                require(all(key in original for key in keys), 'Approved source variable is missing')
                require(not set(keys) & values.keys(), 'Resolve conflicting original assignments explicitly')
                values.update({key: original[key] for key in keys})
            # Overrides are an operator-maintained private dotenv file, never CLI secret arguments.
            if entry.get('override_file'):
                values.update(read_env(private_file(Path(entry['override_file']))))
            require(values, 'Empty environment output')
            if name == '.env':
                validate_compose(values, plan)
            validate_runtime(name, values, plan)
            data = ''.join(key + '=' + value + '\n' for key, value in sorted(values.items())).encode()
        else:
            path = private_file(Path(entry['source']))
            data = path.read_bytes()
            if entry['kind'] == 'keyring':
                require(name == 'secrets/ai-credential-keyring.json', 'Use the existing keyring secret path')
                ring = json.loads(data)
                require(ring.get('active_kid') in ring.get('keys', {}), 'Invalid existing encryption keyring')
        require(data and len(data) <= 4 * 1024 * 1024, 'Invalid file size')
        require(b'OPENSSH PRIVATE KEY' not in data and b'BEGIN RSA PRIVATE KEY' not in data and b'BEGIN DSA PRIVATE KEY' not in data and b'PuTTY-User-Key-File' not in data,
                'SSH private keys must never be copied')
        files.append((name, entry['kind'], data))
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = Path(tempfile.mkdtemp(prefix='.oracle-prepare-', dir=output.parent))
    try:
        manifest = {'version': 1, 'environment': 'staging', 'identity': EXPECTED, 'target_root': '/opt/doccraft',
                    'staging_database': plan['staging_database'], 'approval_reference': plan['approval_reference'], 'files': []}
        for name, kind, data in files:
            path = temporary / name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with path.open('xb') as stream:
                stream.write(data)
            path.chmod(0o600)
            manifest['files'].append({'source': name, 'target': name, 'kind': kind,
                                      'approved_for_staging': True, 'sha256': hashlib.sha256(data).hexdigest()})
        path = temporary / 'transfer-manifest.json'
        path.write_text(json.dumps(manifest, indent=2) + '\n')
        path.chmod(0o600)
        os.rename(temporary, output)
    except BaseException:
        shutil.rmtree(temporary)
        raise
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        os.umask(0o077)
        count = prepare(args.plan, args.output)
    except (OSError, ValueError, KeyError, TypeError):
        print('Staging preparation refused. Check approved source names, safe overrides, permissions, staging database and scope. No values printed.', file=sys.stderr)
        return 1
    print(json.dumps({'staging_files_prepared': count, 'original_files_changed': 0, 'files_transferred': 0}))
    return 0


if __name__ == '__main__':
    sys.exit(main())

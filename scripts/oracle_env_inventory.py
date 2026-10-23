#!/usr/bin/env python3
"""Redacted environment inventory: names, consumers and validation states only."""
import argparse
import ast
import json
import os
from pathlib import Path
import re
import stat
from urllib.parse import urlsplit

from oracle_env_prepare import ROOT, read_env

SKIP = {'.git', 'node_modules', 'dist', 'build', '__pycache__', '.terraform', '.pytest_cache', 'site-packages', 'vendor', 'generated', '.venv-local', 'redis-bin'}
SERVICES = json.loads((ROOT / 'deploy/config/runtime-map.json').read_text())
SENSITIVE = re.compile(r'(PASSWORD|SECRET|TOKEN|API_KEY|SERVICE_KEY|SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL|REDIS_URL|KEYRING|CREDENTIAL|SERVICE_AUTH_CONFIG)')


def category(key):
    if SENSITIVE.search(key):
        return 'SENSITIVE'
    if key.startswith('VITE_'):
        return 'BUILD-TIME/PUBLIC'
    if key in ('FRONTEND_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CALLBACK_URL', 'PAYMENT_SERVICE_PUBLIC_URL'):
        return 'PUBLIC'
    return 'INTERNAL'


def consumer(path):
    name = str(path)
    if name.startswith('.local/secrets/'):
        return 'Local Compose scoped credentials; provenance is unapproved for OCI staging'
    if name.startswith('.local/'):
        return 'Generated local test/tooling artifact; excluded from deployment'
    if path.name == '.env' and len(path.parts) > 1:
        return 'Standalone service Compose interpolation / dotenv fallback'
    if name == 'doccraft.env':
        return 'Legacy aggregate; not referenced by current root/production Compose'
    if path.name == 'admin.env':
        return 'Empty legacy file; Vite does not auto-load this filename'
    if name.startswith('user-frontend/'):
        return 'Legacy frontend file; Vite requires .env.* or explicit build environment'
    if name.startswith('deploy/config/'):
        return 'Central hardened deployment template; placeholders only'
    if name.startswith('services/'):
        return path.parts[1] + ' runtime (root Compose env_file; dotenv where implemented)'
    return 'Not mapped; requires manual review'


def state(key, value):
    result = []
    if not value:
        return ['empty']
    if any(word in value.lower() for word in ('your_', 'your-', 'change_me', 'changeme', '<', 'placeholder')):
        result.append('placeholder-or-review')
    if key in ('NODE_ENV', 'ENV') and value != 'production':
        result.append('development-mode')
    if key in ('PADDLE_SANDBOX', 'PAYHERE_SANDBOX'):
        result.append('sandbox-true' if value == 'true' else 'not-explicitly-sandbox')
    if '://' in value:
        try:
            parsed = urlsplit(value)
            host = parsed.hostname or ''
            if host in ('localhost', '127.0.0.1', '::1'):
                result.append('loopback-needs-consumer-review')
            elif host in SERVICES['ports'] or host in ('redis', 'postgres'):
                result.append('docker-dns')
            else:
                result.append('external-target-needs-staging-approval')
            if parsed.username or parsed.password:
                result.append('contains-connection-credentials')
            if parsed.scheme in ('http', 'redis'):
                result.append('plaintext-transport')
            if key == 'GOOGLE_CALLBACK_URL' and parsed.path != '/v1/auth/oauth/google/callback':
                result.append('incorrect-current-oauth-callback-path')
        except ValueError:
            result.append('invalid-url')
    if category(key) == 'SENSITIVE':
        result.append('credential-provenance-unverified')
    return result or ['configured-value-not-disclosed']


def inventory():
    rows = []
    for base, directories, files in os.walk(ROOT):
        directories[:] = sorted(d for d in directories if d not in SKIP and not d.startswith('.venv'))
        for name in sorted(files):
            if not (name == '.env' or name.startswith('.env.') or name.endswith(('.env', '.env.example', '.env.template'))):
                continue
            absolute = Path(base) / name
            relative = absolute.relative_to(ROOT)
            scope = 'generated-local' if str(relative).startswith('.local/') else 'project'
            try:
                values = read_env(absolute)
                variables = [{'name': key, 'classification': category(key), 'states': state(key, value)} for key, value in sorted(values.items())]
                error = None
            except (OSError, ValueError, UnicodeError):
                variables, error = [], 'Unsupported syntax, symlink or unreadable file; contents withheld'
            mode = stat.S_IMODE(absolute.stat().st_mode)
            rows.append({'path': str(relative), 'scope': scope, 'consumer': consumer(relative),
                         'mode': format(mode, '04o'), 'variables': variables, 'parse_error': error,
                         'permission_review': bool(mode & 0o077 and any(v['classification'] == 'SENSITIVE' for v in variables))})
    required = {}
    for service, keys in SERVICES['required_secrets'].items():
        source = ROOT / 'services' / service / (service + '.env')
        scoped = ROOT / '.local/secrets' / (service + '.env')
        actual = {}
        for path in (source, scoped):
            if path.is_file():
                try:
                    actual.update(read_env(path))
                except ValueError:
                    pass
        required[service] = {'source': str(source.relative_to(ROOT)), 'scoped_source': str(scoped.relative_to(ROOT)),
                             'required_hardened_secret_names': keys,
                             'missing_or_empty_after_local_compose_precedence': [key for key in keys if not actual.get(key)],
                             'staging_credential_approval': 'BLOCKED; operator confirmation required'}
    source = source_inventory()
    return {'scope': 'Local static inspection only; no credentials tested against external services',
            'root_env_exists': (ROOT / '.env').is_file(), 'files': rows, 'required_by_service': required,
            'source_variables': source['variables'], 'source_review_items': source['review_items'],
            'notes': ['Generated .local fixtures are inventoried separately and are not approved staging input.',
                      'No values, credential hashes, connection hosts, addresses or key IDs are recorded.']}


def expected_format(key):
    if key in ('DATABASE_URL', 'DIRECT_URL', 'ADMIN_DATABASE_URL', 'STAGING_MIGRATION_DATABASE_URL'):
        return 'PostgreSQL URI with scoped role, staging database and verified TLS'
    if key == 'REDIS_URL':
        return 'rediss URI with scoped ACL credentials'
    if key.endswith(('URL', 'ENDPOINT', 'ENDPOINTS')):
        return 'URL/path; separate browser HTTPS, Docker DNS and host tooling'
    if key.endswith(('FILE', 'DIR', 'PATH')) or key == 'PUPPETEER_EXECUTABLE_PATH':
        return 'Absolute path inside the consuming container or host'
    if key in ('ENV', 'NODE_ENV'):
        return 'production for staging security paths'
    if any(part in key for part in ('ENABLED', 'SANDBOX', 'REQUIRE_TLS', 'RUN_MIGRATIONS')):
        return 'Boolean; use the exact parser documented by source'
    if any(part in key for part in ('ORIGINS', 'ALLOWED_ADMIN_IPS', 'TRUSTED_PROXY_IPS')):
        return 'CSV for gateway/chat; JSON string array for admin settings'
    if any(part in key for part in ('TIMEOUT', 'CONCURRENCY', 'CONCURRENT', 'LIMIT', 'SIZE', 'PORT', 'EXPIRE', '_MS')):
        return 'Numeric string; units/bounds at source location'
    if SENSITIVE.search(key):
        return 'Private credential or secret reference; provenance approval required'
    return 'String/enum; parser and supported values at source location'


def deployment_change(key):
    if key.startswith('VITE_'):
        return 'Build with staging public values; never embed private credentials'
    if key in ('DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR'):
        return 'Vite built-in; supplied by build mode'
    if key.endswith('_RUN_MIGRATIONS'):
        return 'Set false; approved schema-owner job only'
    if key in ('PADDLE_SANDBOX', 'PAYHERE_SANDBOX'):
        return 'Set true; test credentials only'
    if key in ('AI_CREDENTIAL_KEYRING', 'AI_CREDENTIAL_KEYRING_FILE'):
        return 'Preserve original keyring; admin-api read-only file mount only'
    if key in ('ENV', 'NODE_ENV'):
        return 'Set production while deployment identity remains staging'
    if key == 'LOCAL_AI_ENABLED':
        return 'Set false; no model downloads'
    if SENSITIVE.search(key):
        return 'Use approved staging/scoped credential; no implicit production reuse'
    if key.endswith(('_URL', '_HOST', '_ORIGIN', '_ORIGINS', '_FILE', '_DIR', '_PATH', '_ENDPOINTS')):
        return 'Review address/path for its actual consumer; preserve local development source'
    return 'Retain only if valid for measured VM capacity and staging policy'


def purpose(key):
    if key.startswith('VITE_ADMIN_'):
        return 'Public browser routing to the admin API'
    if key.startswith('VITE_'):
        return 'Public browser routing/build configuration'
    if key in ('DATABASE_URL', 'DIRECT_URL', 'ADMIN_DATABASE_URL', 'STAGING_MIGRATION_DATABASE_URL', 'POSTGRES_DB'):
        return 'Staging database/client or separately authorized migration connection'
    if key == 'REDIS_URL':
        return 'Scoped cache, queue, rate-limit and replay-nonce connection'
    if 'KEYRING' in key:
        return 'Decrypt existing AI credentials without replacing encryption keys'
    if key.startswith('SERVICE_AUTH'):
        return 'Request-bound service identity/signing configuration'
    if 'TLS' in key or key in ('SSL_CERT_FILE', 'PGSSLROOTCERT', 'NODE_EXTRA_CA_CERTS', 'PG_REQUIRE_TLS'):
        return 'Authenticated internal TLS and certificate trust'
    if 'JWT' in key or 'TOTP' in key:
        return 'User/admin authentication, token lifetime or MFA policy'
    if key.startswith(('GOOGLE_', 'FIREBASE_')):
        return 'Approved staging Google/Firebase identity integration'
    if key.startswith(('PADDLE_', 'PAYHERE_', 'PAYMENT_')):
        return 'Staging sandbox billing or payment service routing'
    if key.startswith(('RESEND_', 'EMAIL_')):
        return 'Approved staging email sender and delivery integration'
    if key.startswith('POSTHOG_'):
        return 'Approved staging analytics integration'
    if key.endswith(('_ORIGIN', '_ORIGINS')) or 'WHITELIST' in key or 'ALLOWED_ADMIN' in key or 'TRUSTED_PROXY' in key:
        return 'Browser/admin origin and trusted-source security policy'
    if key.endswith('_RUN_MIGRATIONS'):
        return 'Prevent schema changes by runtime services'
    if key.endswith('_IMAGE'):
        return 'Immutable architecture-compatible staging container release'
    if key.startswith(('AI_', 'GROQ_', 'ANTHROPIC_', 'CLAUDE_')):
        return 'AI provider endpoint, approved credentials or bounded execution'
    if key.startswith(('PDF_', 'SIDECAR_', 'PUPPETEER_')):
        return 'Private signed PDF rendering and concurrency limits'
    if key.endswith(('_URL', '_HOST', '_PORT')) or key in ('PORT', 'HOST'):
        return 'Service listener or consumer-specific staging network address'
    if key.endswith(('_FILE', '_DIR', '_PATH')) or key.startswith('DOCCRAFT_'):
        return 'Existing container/host deployment filesystem wiring'
    if key in ('ENV', 'NODE_ENV', 'DEV', 'PROD', 'MODE'):
        return 'Select secured staging runtime or browser build paths'
    return 'Service-specific staging behavior/tuning; retain development source separately'


def source_inventory():
    """Extract static JS/TS, Python AST, Pydantic, Zod, Prisma and Compose references.

    Does not import application modules or dump environment assignments. Dynamic
    expressions remain explicit review items rather than invented variable names.
    """
    rows, reviews = {}, []

    def add(key, path, line, default=None, required=False, phase='runtime', annotation=None):
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
            return
        relative = str(path.relative_to(ROOT))
        if relative.startswith('services/'):
            service = path.relative_to(ROOT).parts[1]
            if '/puppeteer/' in relative:
                service = 'pdf'
        elif relative.startswith('user-frontend/'):
            service = 'user-ui'
        elif relative.startswith('admin/'):
            service = 'admin-ui'
        elif relative.startswith('shared/'):
            service = 'shared runtime (backend consumers)'
        else:
            service = 'deployment tooling'
        if key.startswith('VITE_') or service in ('user-ui', 'admin-ui'):
            phase = 'build time / public browser bundle'
        if SENSITIVE.search(key):
            default_text = 'WITHHELD (sensitive); see source parser'
        elif default is None:
            default_text = 'No static default; conditional/dynamic behavior at source'
        else:
            default_text = json.dumps(default, ensure_ascii=True)
            if len(default_text) > 220 or re.search(r'://[^/\s]*@', default_text):
                default_text = 'Withheld complex source default; see source parser'
        row = rows.setdefault((service, key), {'name': key, 'service': service,
            'required_status': 'conditional or optional; review referenced code path',
            'expected_format': expected_format(key), 'source_defaults': [],
            'purpose': purpose(key),
            'sensitive': bool(SENSITIVE.search(key)), 'phase': phase,
            'vps_change': deployment_change(key), 'references': []})
        if phase not in row['phase'].split(' / also '):
            row['phase'] += ' / also ' + phase
        if required or key in SERVICES['required_secrets'].get(service, []):
            row['required_status'] = 'required for this service/staging path'
        if annotation:
            row['source_type'] = annotation
        if default_text not in row['source_defaults']:
            row['source_defaults'].append(default_text)
        ref = {'path': relative, 'line': line}
        if ref not in row['references']:
            row['references'].append(ref)

    suffixes = {'.ts', '.tsx', '.mjs', '.cjs', '.js', '.py', '.prisma', '.sh'}
    for top in ('services', 'shared', 'admin/src', 'user-frontend/src', 'deploy/scripts', 'deploy/staging'):
        for base, directories, files in os.walk(ROOT / top):
            directories[:] = sorted(d for d in directories if d not in SKIP and not d.startswith('.venv')
                                     and d not in ('tests', '__tests__', 'test'))
            for name in sorted(files):
                path = Path(base) / name
                if path.suffix not in suffixes or '.test.' in name or '.spec.' in name or name.startswith(('test_', 'test-')) or name.endswith('.d.ts'):
                    continue
                text = path.read_text(errors='replace')
                if path.suffix == '.py':
                    try:
                        tree = ast.parse(text)
                    except SyntaxError:
                        reviews.append({'path': str(path.relative_to(ROOT)), 'reason': 'Python parse failed'})
                        continue
                    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Call) and ast.unparse(node.func) in ('os.getenv', 'os.environ.get'):
                            if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                                default = None
                                if len(node.args) > 1:
                                    try:
                                        default = ast.literal_eval(node.args[1])
                                    except (ValueError, TypeError):
                                        pass
                                elif isinstance(parents.get(node), ast.BoolOp) and isinstance(parents[node].op, ast.Or):
                                    try:
                                        default = ast.literal_eval(parents[node].values[-1])
                                    except (ValueError, TypeError):
                                        pass
                                add(node.args[0].value, path, node.lineno, default)
                            else:
                                reviews.append({'path': str(path.relative_to(ROOT)), 'line': node.lineno, 'reason': 'Dynamic Python environment key'})
                        if isinstance(node, ast.Subscript) and ast.unparse(node.value) == 'os.environ':
                            if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
                                add(node.slice.value, path, node.lineno, required=True)
                            else:
                                reviews.append({'path': str(path.relative_to(ROOT)), 'line': node.lineno, 'reason': 'Dynamic Python environment subscript'})
                        if isinstance(node, ast.ClassDef) and any(ast.unparse(b).endswith('BaseSettings') for b in node.bases):
                            for field in node.body:
                                if not isinstance(field, ast.AnnAssign) or not isinstance(field.target, ast.Name) or field.target.id == 'model_config':
                                    continue
                                key, value, default = field.target.id, field.value, None
                                if isinstance(value, ast.Call):
                                    for kw in value.keywords:
                                        if kw.arg in ('validation_alias', 'alias') and isinstance(kw.value, ast.Constant):
                                            key = kw.value.value
                                        if kw.arg == 'default':
                                            try:
                                                default = ast.literal_eval(kw.value)
                                            except (ValueError, TypeError):
                                                pass
                                else:
                                    try:
                                        default = ast.literal_eval(value)
                                    except (ValueError, TypeError):
                                        pass
                                add(key, path, field.lineno, default, required=value is None, annotation=ast.unparse(field.annotation))
                    continue
                direct = r'(?:process|import\.meta)\.env(?:\.([A-Z][A-Z0-9_]*)|\[[\x27\x22]([A-Z][A-Z0-9_]*)[\x27\x22]\])'
                for match in re.finditer(direct, text):
                    tail = text[match.end():].split('\n', 1)[0]
                    fallback = re.match(r'\s*\)?\s*(?:\|\||\?\?)\s*([\x27\x22])([^\x27\x22]*)\1', tail)
                    number = re.match(r'\s*\)?\s*(?:\|\||\?\?)\s*(\d+)', tail)
                    default = fallback.group(2) if fallback else int(number.group(1)) if number else None
                    if re.match(r'\s*===\s*[\x27\x22]true[\x27\x22]', tail):
                        default = False
                    add(match.group(1) or match.group(2), path, text[:match.start()].count('\n') + 1, default)
                for match in re.finditer(r'(?:requireEnv|env)\([\x27\x22]([A-Z][A-Z0-9_]*)[\x27\x22]\)', text):
                    add(match.group(1), path, text[:match.start()].count('\n') + 1, required=True,
                        phase='Prisma client/schema tooling' if path.suffix == '.prisma' else 'runtime')
                if 'safeParse(process.env)' in text:
                    schema = text.split('z.object({', 1)[-1].split('\n});', 1)[0]
                    chunks = list(re.finditer(r'^\s*([A-Z][A-Z0-9_]*):', schema, re.M))
                    for i, match in enumerate(chunks):
                        field = schema[match.end():chunks[i+1].start() if i+1 < len(chunks) else len(schema)]
                        fallback = re.search(r'\.default\(([^\n]*?)\)', field)
                        default = None
                        if fallback:
                            try:
                                default = ast.literal_eval(fallback.group(1))
                            except (ValueError, TypeError):
                                pass
                        line = text[:text.find(schema) + match.start()].count('\n') + 1
                        add(match.group(1), path, line, default, required=not fallback and '.optional(' not in field)
                for match in re.finditer(r'(?:process|import\.meta)\.env\[([^\]]+)\]', text):
                    if not re.fullmatch(r'[\x27\x22][A-Z][A-Z0-9_]*[\x27\x22]', match.group(1)):
                        reviews.append({'path': str(path.relative_to(ROOT)), 'line': text[:match.start()].count('\n')+1,
                                        'reason': 'Dynamic JS key; requireEnv literal callers resolved separately' if 'requireEnv' in text else 'Dynamic JS environment key'})
                if path.suffix == '.sh':
                    for match in re.finditer(r'\$\{([A-Z][A-Z0-9_]*)(?::[-?][^}]*)?\}', text):
                        add(match.group(1), path, text[:match.start()].count('\n')+1, phase='host/container entrypoint')
    for file in ('deploy/docker/compose.production.yml', 'deploy/oracle/compose.staging.yml'):
        path = ROOT / file
        text = path.read_text()
        for match in re.finditer(r'\$\{([A-Z][A-Z0-9_]*)(?::([-?])([^}]*))?\}', text):
            add(match.group(1), path, text[:match.start()].count('\n')+1,
                default=match.group(3) if match.group(2) == '-' else None,
                required=match.group(2) == '?', phase='Compose interpolation on host')
    return {'variables': sorted(rows.values(), key=lambda r: (r['service'], r['name'])), 'review_items': reviews}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--markdown-output', type=Path)
    args = parser.parse_args()
    result = inventory()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    if args.markdown_output:
        args.markdown_output.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_output.write_text(markdown(result))
    rows = result['files']
    print(json.dumps({'project_env_files': sum(row['scope'] == 'project' for row in rows),
                      'generated_local_env_files': sum(row['scope'] == 'generated-local' for row in rows),
                      'permission_reviews': sum(row['scope'] == 'project' and row['permission_review'] for row in rows),
                      'values_disclosed': 0}))


def markdown(result):
    def cell(value):
        return str(value).replace('|', '&#124;').replace('\n', ' ')
    lines = ['# Environment inventory — staging preparation', '',
             'Local source inspection, 2026-10-22. No external credential was tested or approved for staging. '
             'Existing environment files were preserved. Configured values and credential digests are excluded.', '',
             '## Environment files and precedence', '',
             'Root `.env` is absent. Root development Compose uses service-named `*.env` files plus scoped `.local` overrides. '
             'Standalone service Compose files use their local `.env` interpolation. Hardened deployment uses '
             '`DOCCRAFT_RUNTIME/<service>.env` with raw dotenv parsing and explicit secret mounts. '
             '`doccraft.env`, `admin/admin.env` and `user-frontend/user-frontend.env` are legacy filenames; '
             'Vite does not automatically load these filenames.', '',
             '| File | Mode | Variables | Permission review | Consumer |',
             '| --- | --- | ---: | --- | --- |']
    for row in result['files']:
        if row['scope'] != 'project':
            continue
        lines.append('| ' + ' | '.join(map(cell, [row['path'], row['mode'], len(row['variables']),
            'required' if row['permission_review'] else 'no finding', row['consumer']])) + ' |')
    lines += ['', 'Fifteen secret-bearing project files require permission review in this snapshot. '
              'Their permissions have not been changed. Generated `.local` test artifacts are listed separately '
              'in [redacted evidence](evidence/environment-inventory.json) and are excluded from staging inputs.', '',
              '## Source variable inventory', '',
              'Each row includes the consuming service, required/optional status, expected format, source default, '
              'purpose, sensitivity, build/runtime phase, deployment change and source reference. '
              'Defaults come only from source literals; values from `.env` files never appear here. '
              'A conditional status requires review of the named feature path. A missing static default is not proof '
              'that a variable is mandatory. Shared runtime requirements apply to the backend services importing those modules. '
              'Tooling variables belong to migration/build/control jobs and must not be added to all runtime files.', '',
              'Static coverage includes direct JS/TS and Python environment reads, literal `requireEnv` calls, '
              'Zod environment schemas, Pydantic settings aliases, Prisma `env()` and hardened Compose interpolation. '
              'Dynamic accesses and deployment-generator allowlists still require semantic review. This inventory '
              'does not establish runtime credential validity or permission to reuse production credentials.', '']
    previous = None
    for row in result['source_variables']:
        if previous != row['service']:
            previous = row['service']
            lines += ['### ' + previous, '',
                      '| Name | Required/optional | Expected format | Source default | Purpose | Sensitive | Phase | VPS change | Source |',
                      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
        ref = row['references'][0]
        source = f"[{ref['path']}:{ref['line']}](../../{ref['path']}#L{ref['line']})"
        values = [row['name'], row['required_status'], row['expected_format'], '; '.join(row['source_defaults']),
                  row['purpose'], 'yes' if row['sensitive'] else 'no', row['phase'], row['vps_change'], source]
        lines.append('| ' + ' | '.join(map(cell, values)) + ' |')
    lines += ['', '## Dynamic accesses', '']
    for row in result['source_review_items']:
        lines.append(f"- `{row['path']}:{row.get('line', '?')}`: {row['reason']}.")
    lines += ['', '## Staging corrections and unresolved inputs', '',
              '- Preserve local files. Use the existing allowlisted preparation tool and a private operator-reviewed plan; '
              'no actual staging credential bundle has been generated.',
              '- PostgreSQL uses `postgres`, a database name containing `staging`, scoped runtime roles and verified TLS. '
              'Redis uses `rediss://redis:6379` with existing scoped ACL users; include credentials only in protected runtime files.',
              '- Internal URLs use HTTPS Docker service names and their existing ports. `SIDECAR_URL` ends in `/generate`. '
              'Browser builds use `/v1` for the user UI and `/api/v1` for admin behind the approved HTTPS reverse proxy. '
              'Host migration tools may legitimately use a verified tunnel endpoint.',
              '- `NODE_ENV=production` and `ENV=production` activate secure staging code paths. '
              'All runtime migration flags stay false. Google callback path is `/v1/auth/oauth/google/callback`; '
              'Google client registration, approved staging DNS, exact CORS origins and callback approval remain missing.',
              '- The Firebase web-client configuration is currently hardcoded in `user-frontend/src/lib/firebase.ts`, '
              'rather than provided through Vite variables. It is public client configuration, not a backend credential. '
              'Its project/domain approval for staging is unverified; do not claim Google login is configured or silently '
              'change that existing integration. Confirm the approved project and authorized staging domain before use.',
              '- Sandbox flags must both be true. Payment and notification/provider credentials need explicit staging provenance. '
              'No live billing or provider test was attempted.',
              '- Preserve the existing AI keyring, service identities, private CA and Redis nonce enforcement. '
              'Managed AI routing is database-owned, not controlled by `LOCAL_AI_ENABLED`; inspect it before rollout. '
              'Staging verification now rejects enabled managed routing. No Ollama profile is enabled.',
              '- The hardened generator has a narrower supported tuning allowlist than all source variables. '
              'Do not silently discard a requested custom setting: review and extend that allowlist when needed.', '',
              'Regenerate this report without displaying configured values:', '', '```sh',
              'python3 scripts/oracle_env_inventory.py --output docs/oracle-deployment/evidence/environment-inventory.json \\',
              '  --markdown-output docs/oracle-deployment/02-ENVIRONMENT-INVENTORY.md', '```', '']
    return '\n'.join(lines)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Approved staging application rollout. No migrations, host setup or secret transfer."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from oracle_env_deploy import EXPECTED, private_file
from oracle_env_prepare import PORTS, read_env, validate_compose, validate_runtime
from oracle_env_remote import directory, discovery, regular, require, verify_identity

CONTROL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CONTROL / 'deploy/scripts'))
from controller import release_manifest

HOME = Path('/opt/doccraft')
APP_SERVICES = [*PORTS, 'user-ui', 'admin-ui', 'edge']


def configuration_digest(home):
    paths = [home / '.env', *sorted((home / 'config').glob('*.env')), *sorted((home / 'secrets').iterdir())]
    digest = hashlib.sha256()
    for path in paths:
        regular(path)
        digest.update(str(path.relative_to(home)).encode() + b'\0' + path.read_bytes() + b'\0')
    return digest.hexdigest()


def atomic(path, data):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', opener=lambda p, flags: os.open(p, flags | os.O_NOFOLLOW, 0o600)) as out:
        json.dump(data, out, indent=2)
        out.flush()
        os.fsync(out.fileno())
    os.replace(temporary, path)


class Staging:
    def __init__(self, home=HOME):
        self.home = home
        directory(home)
        regular(home / '.doccraft-staging')
        require(json.loads((home / '.doccraft-staging').read_text()) == {**EXPECTED, 'environment': 'staging'}, 'Staging marker mismatch')
        require(not any(p.exists() for p in (home / 'production-enabled', Path('/etc/doccraft/production-enabled'))), 'Production marker present')
        verify_identity(discovery(), EXPECTED)
        self.config = read_env(private_file(home / '.env'))
        self.database = self.config.get('POSTGRES_DB', '')
        require(re.fullmatch(r'[A-Za-z0-9_]*staging[A-Za-z0-9_]*', self.database), 'Expected staging database')
        validate_compose(self.config, {'staging_database': self.database})
        for service in PORTS:
            validate_runtime('config/' + service + '.env', read_env(private_file(home / 'config' / (service + '.env'))),
                             {'staging_database': self.database})
        registry = self.config.get('REGISTRY_PREFIX', '')
        require(re.fullmatch(r'ghcr\.io/[a-z0-9][a-z0-9._-]*/doccraft', registry), 'Approved registry required')
        self.registry = registry
        self.state = home / '.staging-releases'
        directory(self.state, create=True)
        self.log = None

    def compose(self, release, *args):
        env = {k: v for k, v in os.environ.items() if k in ('PATH', 'DOCKER_CONFIG')}
        env.update(self.config)
        env['COMPOSE_PROFILES'] = ''
        env.update({name.upper().replace('-', '_') + '_IMAGE': value for name, value in release['images'].items()})
        command = ['docker', 'compose', '--project-name', 'doccraft-staging', '--project-directory', str(CONTROL),
                   '--env-file', str(self.home / '.env'), '-f', str(CONTROL / 'deploy/docker/compose.production.yml'),
                   '-f', str(CONTROL / 'deploy/oracle/compose.staging.yml'), *args]
        result = subprocess.run(command, env=env, stdin=subprocess.DEVNULL, stdout=self.log, stderr=self.log, timeout=1200)
        require(result.returncode == 0, 'Staging Compose operation failed; inspect protected deployment log')

    def database_gate(self, release):
        path = private_file(self.home / '.database-staging-approved.json')
        gate = json.loads(path.read_text())
        require(gate.get('database') == self.database and gate.get('schema_epoch') == release['schema_epoch'], 'Database/schema approval mismatch')
        require(gate.get('reviewed_commit') == release['commit'], 'This release requires database compatibility review')
        require(gate.get('restore_verified') is True and gate.get('managed_ai_disabled') is True and gate.get('approval_reference'),
                'Restorable staging backup and disabled managed AI require operator verification')

    def health(self, release):
        self.compose(release, 'run', '--rm', '-T', '--no-deps', 'verify')

    def rollout(self, release):
        self.compose(release, 'config', '--quiet')
        self.compose(release, 'pull', *APP_SERVICES, 'verify')
        # Pulling does not prove architecture compatibility. Inspect the selected platform locally.
        for image in set(release['images'].values()) - {release['images']['migration']}:
            result = subprocess.run(['docker', 'image', 'inspect', '--format', '{{.Architecture}}', image], capture_output=True, text=True, timeout=20)
            require(result.returncode == 0 and result.stdout.strip() == release['architecture'], 'Image architecture mismatch')
        # Read the real DB-owned switch before starting app containers. Environment
        # attestation alone cannot prove that an imported configuration is disabled.
        self.compose(release, 'run', '--rm', '-T', '--no-deps', 'verify', 'python', '-c',
                     'from app.services.ai_management import read_config; import sys; '
                     'sys.exit(1 if read_config()[1].enabled else 0)')
        # Database/Redis must already be provisioned under separate host/database approval.
        self.compose(release, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '240', *APP_SERVICES)
        self.health(release)

    def run(self, release, action, approval):
        require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}', approval or ''), 'Explicit deployment approval reference required')
        # release_manifest has an exact key allowlist. Architecture is a staging envelope field.
        architecture = release.pop('architecture', None)
        require(architecture in ('amd64', 'arm64'), 'Explicit architecture required')
        release_manifest(release, self.registry)
        release['architecture'] = architecture
        observed = discovery()
        actual = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(observed.get('architecture'))
        require(actual == architecture, 'VM architecture differs from release')
        require(observed['memory']['MemTotal_KiB'] >= 10 * 1024 * 1024, 'Baseline stack requires at least 10 GiB RAM including verifier/OS headroom; review sizing before reducing limits')
        require(observed['disk_free_bytes'] >= 15 * 1024**3, 'At least 15 GiB free disk required before image pulls')
        self.database_gate(release)
        result = subprocess.run(['git', '-C', str(CONTROL), 'rev-parse', 'HEAD'], capture_output=True, text=True, timeout=10)
        require(result.returncode == 0 and result.stdout.strip() == release['commit'], 'Control checkout must match the reviewed release')
        result = subprocess.run(['git', '-C', str(CONTROL), 'status', '--porcelain', '--untracked-files=normal'], capture_output=True, text=True, timeout=10)
        require(result.returncode == 0 and not result.stdout.strip(), 'Control checkout must be clean')
        stamp = configuration_digest(self.home)
        current_file = self.state / 'current.json'
        current = json.loads(private_file(current_file).read_text()) if current_file.exists() else None
        if action == 'health':
            self.health(release)
            return
        if action == 'rollback':
            require(current and current['release']['schema_epoch'] == release['schema_epoch']
                    and current['configuration_digest'] == stamp, 'Rollback requires unchanged configuration and same schema epoch')
        log_path = self.state / (str(time.time_ns()) + '.log')
        with log_path.open('x', opener=lambda p, flags: os.open(p, flags, 0o600)) as log:
            self.log = log
            try:
                self.rollout(release)
            except BaseException:
                # Never restore a database, rotate a key or auto-change the checked-out control code.
                atomic(self.state / 'failed.json', {'commit': release['commit'], 'approval_reference': approval,
                                                  'rollback': 'Operator review required; data/configuration preserved'})
                raise
        if current:
            atomic(self.state / 'previous.json', current)
        atomic(current_file, {'release': release, 'configuration_digest': stamp, 'approval_reference': approval})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('deploy', 'rollback', 'health'))
    parser.add_argument('--release', required=True, help='Manifest path or - for bounded SSH stdin')
    parser.add_argument('--approval-id', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        data = sys.stdin.buffer.read(65537) if args.release == '-' else Path(args.release).read_bytes()
        require(len(data) <= 65536, 'Manifest too large')
        release = json.loads(data)
        directory(HOME)
        lock_path = HOME / '.staging-deploy.lock'
        lock = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        regular(lock_path)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            Staging().run(release, args.action, args.approval_id)
        finally:
            os.close(lock)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('Staging operation refused or failed. Check identity, approvals, immutable release, capacity, scoped configuration and protected logs.', file=sys.stderr)
        return 1
    print(json.dumps({'staging_action': args.action, 'migrations_run': False, 'production_changed': False}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

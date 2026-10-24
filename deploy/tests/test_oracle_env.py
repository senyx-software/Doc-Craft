"""Isolated local filesystem/subprocess tests, never proof of a real SSH deployment."""
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import oracle_env_deploy as deploy
import oracle_env_prepare as prepare
import oracle_env_remote as remote
import oracle_cloud_audit as cloud
import oracle_staging as staging


class OracleEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)

    def tearDown(self):
        self.temp.cleanup()

    def private(self, name, data):
        path = self.root / name
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(0o600)
        return path

    def item(self, name, data, kind='env'):
        return {'target': name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'kind': kind}

    def manifest(self, entries):
        return self.private('manifest.json', json.dumps({'version': 1, 'environment': 'staging',
            'identity': deploy.EXPECTED, 'target_root': '/opt/doccraft', 'staging_database': 'doccraft_staging', 'files': entries}).encode())

    def test_preserves_original_and_atomic_backup_permissions(self):
        old = self.private('config/auth.env', b'PORT=3011\n')
        data = b'PORT=3011\nENV=production\n'
        receipt = remote.install(self.root, {'files': [self.item('config/auth.env', data)]}, io.BytesIO(data))
        self.assertEqual(old.read_bytes(), data)
        backup = self.root / receipt['backup_directory'] / 'backups/0'
        self.assertEqual(backup.read_bytes(), b'PORT=3011\n')
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(old.stat().st_mode & 0o777, 0o600)
        self.assertFalse(receipt['services_started'])
        self.assertFalse(receipt['migrations_run'])

    def test_bad_checksum_preserves_existing_bytes(self):
        old = self.private('.env', b'CONFIG_VERSION=old\n')
        data = b'CONFIG_VERSION=new\n'
        item = self.item('.env', data)
        item['sha256'] = '0' * 64
        with self.assertRaises(ValueError):
            remote.install(self.root, {'files': [item]}, io.BytesIO(data))
        self.assertEqual(old.read_bytes(), b'CONFIG_VERSION=old\n')

    def test_truncated_stream_preserves_existing_bytes(self):
        old = self.private('.env', b'CONFIG_VERSION=old\n')
        data = b'CONFIG_VERSION=new\n'
        with self.assertRaises(ValueError):
            remote.install(self.root, {'files': [self.item('.env', data)]}, io.BytesIO(data[:2]))
        self.assertEqual(old.read_bytes(), b'CONFIG_VERSION=old\n')

    def test_extra_stream_preserves_existing_bytes(self):
        old = self.private('.env', b'CONFIG_VERSION=old\n')
        data = b'CONFIG_VERSION=new\n'
        with self.assertRaises(ValueError):
            remote.install(self.root, {'files': [self.item('.env', data)]}, io.BytesIO(data + b'x'))
        self.assertEqual(old.read_bytes(), b'CONFIG_VERSION=old\n')

    def test_batch_failure_restores_prior_files(self):
        first = self.private('config/auth.env', b'PORT=3011\n')
        second = self.private('config/chat.env', b'PORT=3016\n')
        data = [b'PORT=3011\nENV=production\n', b'PORT=3016\nENV=production\n']
        original_replace = os.replace
        count = 0
        def fail_second(source, target):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError('Injected isolated file replacement failure')
            return original_replace(source, target)
        with patch.object(remote.os, 'replace', fail_second), self.assertRaises(OSError):
            remote.install(self.root, {'files': [self.item('config/auth.env', data[0]), self.item('config/chat.env', data[1])]}, io.BytesIO(b''.join(data)))
        self.assertEqual(first.read_bytes(), b'PORT=3011\n')
        self.assertEqual(second.read_bytes(), b'PORT=3016\n')

    def test_symlink_target_rejected(self):
        original = self.private('unrelated', b'unchanged')
        (self.root / '.env').symlink_to(original)
        with self.assertRaises(ValueError):
            remote.install(self.root, {'files': [self.item('.env', b'new')]}, io.BytesIO(b'new'))
        self.assertEqual(original.read_bytes(), b'unchanged')

    def test_symlink_directory_rejected(self):
        (self.root / 'elsewhere').mkdir(mode=0o700)
        (self.root / 'config').symlink_to(self.root / 'elsewhere')
        with self.assertRaises(ValueError):
            remote.install(self.root, {'files': [self.item('config/auth.env', b'new')]}, io.BytesIO(b'new'))

    def test_traversal_and_ssh_destinations_rejected(self):
        for name in ('../.env', '/etc/passwd', 'config/../.env', 'secrets/id_rsa', 'secrets/authorized_keys', 'control/launch.sh', 'config/*'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                remote.target_name(name)

    def test_existing_keyring_never_replaced(self):
        ring = {'active_kid': 'existing', 'keys': {'existing': secrets.token_urlsafe(32)}}
        original = json.dumps(ring).encode()
        self.private('secrets/ai-credential-keyring.json', original)
        ring['keys']['existing'] = secrets.token_urlsafe(32)
        data = json.dumps(ring).encode()
        with self.assertRaises(ValueError):
            remote.install(self.root, {'files': [self.item('secrets/ai-credential-keyring.json', data, 'keyring')]}, io.BytesIO(data))
        self.assertEqual((self.root / 'secrets/ai-credential-keyring.json').read_bytes(), original)

    def test_identical_keyring_retained(self):
        data = json.dumps({'active_kid': 'existing', 'keys': {'existing': secrets.token_urlsafe(32)}}).encode()
        self.private('secrets/ai-credential-keyring.json', data)
        self.assertTrue(remote.install(self.root, {'files': [self.item('secrets/ai-credential-keyring.json', data, 'keyring')]}, io.BytesIO(data))['checksums_verified'])

    def test_identity_mismatch_rejected(self):
        observed = {'instance': {'displayName': deploy.EXPECTED['instance'], 'region_identifier': 'wrong'},
                    'private_ips': ['10.0.0.88'], 'uid': 1000}
        with self.assertRaises(ValueError):
            remote.verify_identity(observed, deploy.EXPECTED)

    def test_root_identity_rejected(self):
        observed = {'instance': {'displayName': deploy.EXPECTED['instance'], 'region_identifier': 'ap-mumbai-1'},
                    'private_ips': ['10.0.0.88'], 'uid': 0}
        with self.assertRaises(ValueError):
            remote.verify_identity(observed, deploy.EXPECTED)

    def test_instance_ocid_pin_rejects_recreated_name_and_ip(self):
        observed = {'instance': {'id': deploy.EXPECTED['instance_ocid'], 'displayName': deploy.EXPECTED['instance'],
                                'region_identifier': deploy.EXPECTED['region']},
                    'private_ips': [deploy.EXPECTED['private_ip']], 'uid': 1000}
        remote.verify_identity(observed, deploy.EXPECTED)
        observed['instance']['id'] = 'different-instance-with-same-name-and-ip'
        with self.assertRaisesRegex(ValueError, 'OCID'):
            remote.verify_identity(observed, deploy.EXPECTED)

    def test_world_readable_sources_rejected(self):
        path = self.private('config.env', b'PORT=3011\n')
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            deploy.private_file(path)

    def test_changed_approved_file_rejected(self):
        source = self.private('source.env', b'PORT=3011\n')
        row = {'source': str(source), 'target': 'config/auth.env', 'kind': 'env',
               'approved_for_staging': True, 'sha256': '0' * 64}
        with self.assertRaises(ValueError):
            deploy.load_manifest(self.manifest([row]))

    def test_unapproved_source_rejected(self):
        source = self.private('source.env', b'PORT=3011\n')
        row = {'source': str(source), 'target': 'config/auth.env', 'kind': 'env',
               'approved_for_staging': False, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        with self.assertRaises(ValueError):
            deploy.load_manifest(self.manifest([row]))

    def test_keyring_kind_cannot_bypass_preservation(self):
        source = self.private('source.json', b'{}')
        row = {'source': str(source), 'target': 'secrets/ai-credential-keyring.json', 'kind': 'secret',
               'approved_for_staging': True, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        with self.assertRaises(ValueError):
            deploy.load_manifest(self.manifest([row]))

    def test_shell_expansion_and_duplicate_env_rejected(self):
        for data in (b'PORT=3011\nPORT=3016\n', b'PORT=$(id)\n', b'PORT=${OTHER}\n'):
            path = self.private('source.env', data)
            with self.assertRaises(ValueError):
                prepare.read_env(path)

    def test_literal_dotenv_values_preserved(self):
        path = self.private('source.env', b"PORT='3011'\nENV=production # local comment\n")
        self.assertEqual(prepare.read_env(path), {'PORT': '3011', 'ENV': 'production'})

    def test_preparation_does_not_overwrite_sources_or_output(self):
        source = self.private('original.env', b'CONFIG_VERSION=old\nNODE_ENV=development\n')
        plan = {'version': 1, 'environment': 'staging', 'staging_database': 'doccraft_staging', 'approval_reference': 'isolated-test',
                'files': [{'kind': 'secret', 'source': str(source), 'target': 'secrets/fixture.env', 'approved_for_staging': True}]}
        plan_path = self.private('plan.json', json.dumps(plan).encode())
        output = self.root / 'bundle'
        self.assertEqual(prepare.prepare(plan_path, output), 1)
        self.assertEqual(source.read_bytes(), b'CONFIG_VERSION=old\nNODE_ENV=development\n')
        self.assertEqual(deploy.load_manifest(output / 'transfer-manifest.json')[1], [source.read_bytes()])
        with self.assertRaises(ValueError):
            prepare.prepare(plan_path, output)

    def test_missing_transfer_approval_does_not_start_ssh(self):
        with patch.object(sys, 'argv', ['deploy-oracle-env.sh', '--transfer']), patch.object(deploy, 'remote_call') as ssh:
            self.assertEqual(deploy.main(), 1)
            ssh.assert_not_called()

    def test_host_fingerprint_pins_only_operator_verified_key(self):
        key = self.root / 'hostkey'
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(key)], check=True)
        public = key.with_suffix('.pub').read_text().split()
        known = self.private('known_hosts', ('host.example ' + public[0] + ' ' + public[1] + '\n').encode())
        checked = subprocess.run(['ssh-keygen', '-lf', str(known), '-E', 'sha256'], capture_output=True, text=True, check=True)
        fingerprint = checked.stdout.split()[1]
        self.assertIn(public[1], deploy.verified_known_host('host.example', 22, known, fingerprint))
        with self.assertRaises(ValueError):
            deploy.verified_known_host('host.example', 22, known, 'SHA256:' + 'A' * 43)

    def test_runtime_live_payments_are_rejected(self):
        values = {'PORT': '3014', 'NODE_ENV': 'production', 'ENV': 'production', 'ADMIN_RUN_MIGRATIONS': 'false',
                  'DOCUMENT_RUN_MIGRATIONS': 'false', 'NOTIFICATION_RUN_MIGRATIONS': 'false',
                  'SERVICE_REQUIRE_TLS': 'true', 'SERVICE_AUTH_CONFIG_FILE': '/run/secrets/service_identity',
                  'SERVICE_TLS_CERT_FILE': '/run/secrets/service.crt', 'SERVICE_TLS_KEY_FILE': '/run/secrets/service.key',
                  'NODE_EXTRA_CA_CERTS': '/run/secrets/ca.crt', 'SSL_CERT_FILE': '/run/secrets/ca.crt',
                  'PGSSLROOTCERT': '/run/secrets/ca.crt', 'PG_REQUIRE_TLS': 'true',
                  'REDIS_URL': 'rediss://payment:' + secrets.token_urlsafe(24) + '@redis:6379',
                  'DATABASE_URL': 'postgresql://doccraft_payment:' + secrets.token_urlsafe(24) + '@postgres:5432/doccraft_staging?sslmode=require&sslaccept=strict&sslcert=/run/secrets/ca.crt',
                  'PADDLE_SANDBOX': 'false', 'PAYHERE_SANDBOX': 'true'}
        values['DIRECT_URL'] = values['DATABASE_URL']
        with self.assertRaisesRegex(ValueError, 'Live payments'):
            prepare.validate_runtime('config/payment.env', values, {'staging_database': 'doccraft_staging'})

    def test_resealed_root_env_cannot_bypass_transfer_policy(self):
        source = self.private('unsafe.env', b'DOCCRAFT_HOME=/opt/production\nLOCAL_AI_ENABLED=true\n')
        row = {'source': str(source), 'target': '.env', 'kind': 'env',
               'approved_for_staging': True, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        with self.assertRaises(ValueError):
            deploy.load_manifest(self.manifest([row]))

    def test_root_config_rejects_embedded_credentials(self):
        with self.assertRaises(ValueError):
            prepare.validate_compose({'JWT_SECRET': secrets.token_urlsafe(24)}, {'staging_database': 'doccraft_staging'})

    def test_cloud_missing_config_does_not_attempt_api(self):
        class Args:
            oci = '/usr/bin/ssh'
            config_file = self.root / 'missing-config'
        with patch.object(cloud.subprocess, 'run') as command:
            command.return_value.returncode = 0
            command.return_value.stdout = 'test-version'
            audit = cloud.Audit(Args())
            audit.run()
            self.assertFalse(audit.evidence['authenticated'])
            self.assertEqual(audit.evidence['blocker'], 'OCI_CONFIG_MISSING_OR_SYMLINK')
            self.assertEqual(command.call_count, 1)

    def test_cloud_redaction_excludes_metadata_and_tags(self):
        observed = {'id': 'example', 'metadata': {'private': secrets.token_urlsafe(24)}, 'freeform-tags': {'private': 'hidden'}}
        self.assertEqual(cloud.select(observed, ['id']), {'id': 'example'})

    def test_successful_empty_oci_list_is_not_a_permission_failure(self):
        class Args:
            oci = '/operator/oci'
            config_file = self.root / 'config'
            profile = 'DEFAULT'
        audit = cloud.Audit(Args())
        with patch.object(cloud.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = ''
            run.return_value.stderr = ''
            self.assertEqual(audit.call('bastions', ['bastion', 'bastion', 'list', '--all'], ['id']), [])
        self.assertEqual(audit.evidence['operations']['bastions']['status'], 'OBSERVED')

    def test_empty_non_list_oci_response_is_not_success(self):
        class Args:
            oci = '/operator/oci'
            config_file = self.root / 'config'
            profile = 'DEFAULT'
        audit = cloud.Audit(Args())
        with patch.object(cloud.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = ''
            run.return_value.stderr = ''
            self.assertIsNone(audit.call('identity', ['iam', 'user', 'get'], ['id']))
        self.assertEqual(audit.evidence['operations']['identity']['status'], 'FAILED')

    def test_database_gate_refuses_unverified_backup_or_enabled_ai(self):
        runner = staging.Staging.__new__(staging.Staging)
        runner.home, runner.database = self.root, 'doccraft_staging'
        release = {'schema_epoch': 1, 'commit': 'a' * 40}
        gate = {'database': runner.database, 'schema_epoch': 1, 'reviewed_commit': release['commit'],
                'restore_verified': False, 'managed_ai_disabled': True, 'approval_reference': 'test-only'}
        for restore, disabled in ((False, True), (True, False)):
            gate.update(restore_verified=restore, managed_ai_disabled=disabled)
            self.private('.database-staging-approved.json', json.dumps(gate).encode())
            with self.assertRaises(ValueError):
                runner.database_gate(release)

    def test_staging_compose_uses_project_override_and_never_runs_migrations(self):
        runner = staging.Staging.__new__(staging.Staging)
        runner.home, runner.config, runner.log = self.root, {}, None
        with patch.object(staging.subprocess, 'run') as run:
            run.return_value.returncode = 0
            runner.compose({'images': {}}, 'config', '--quiet')
            command = run.call_args.args[0]
            self.assertEqual(command[command.index('--project-name')+1], 'doccraft-staging')
            self.assertIn(str(staging.CONTROL / 'deploy/oracle/compose.staging.yml'), command)
            self.assertNotIn('production-enabled', ' '.join(command))
            self.assertEqual(run.call_args.kwargs['env']['COMPOSE_PROFILES'], '')

    def test_enabled_managed_ai_preflight_blocks_application_startup(self):
        runner = staging.Staging.__new__(staging.Staging)
        calls = []
        def compose(release, *args):
            calls.append(args)
            if '-c' in args:
                raise ValueError('Synthetic enabled managed-AI configuration')
        release = {'architecture': 'amd64', 'images': {'migration': 'migration', 'admin-api': 'admin-image'}}
        with patch.object(runner, 'compose', side_effect=compose), patch.object(staging.subprocess, 'run') as inspect:
            inspect.return_value.returncode = 0
            inspect.return_value.stdout = 'amd64\n'
            with self.assertRaises(ValueError):
                runner.rollout(release)
        self.assertFalse(any('up' in call for call in calls))

    def test_staging_missing_approval_cannot_inspect_or_mutate_host(self):
        runner = staging.Staging.__new__(staging.Staging)
        with patch.object(staging, 'discovery') as discovery, self.assertRaises(ValueError):
            runner.run({}, 'deploy', '')
        discovery.assert_not_called()


if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env python3
"""Allowlisted SSH transfer for operator-approved OCI STAGING files only."""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import socket
import stat
import subprocess
import sys
import tempfile

from oracle_env_remote import MAX_FILE, MAX_TOTAL, require, target_name

EXPECTED = {'region': 'ap-mumbai-1', 'instance': 'instance-20261021-1441', 'private_ip': '10.0.0.88',
            'instance_ocid': 'ocid1.instance.oc1.ap-mumbai-1.anrg6ljr4wujdnqcezvcrlwboiuw3efznrg5ztawy7tes74vcz63m3yn46ra'}


def private_file(path):
    require(not path.is_symlink() and path.is_file(), 'Missing or symlinked local file')
    meta = path.stat()
    require(meta.st_uid == os.getuid() and not stat.S_IMODE(meta.st_mode) & 0o077,
            'Local private files must be owned by the operator and mode 0600')
    return path


def load_manifest(path):
    private_file(path)
    manifest = json.loads(path.read_text())
    require(manifest.get('version') == 1 and manifest.get('environment') == 'staging', 'Only staging manifests are accepted')
    require(manifest.get('target_root') == '/opt/doccraft', 'Unexpected remote root')
    require(manifest.get('identity') == EXPECTED, 'Unexpected staging identity')
    require(re.fullmatch(r'[a-zA-Z0-9_]*staging[a-zA-Z0-9_]*', manifest.get('staging_database', '')),
            'Specify the approved staging database in the manifest')
    rows = manifest.get('files')
    require(isinstance(rows, list) and 0 < len(rows) <= 128, 'No approved files')
    result, payloads, seen = [], [], set()
    for row in rows:
        target = target_name(row['target'])
        require(target not in seen, 'Duplicate destination')
        seen.add(target)
        require(row.get('approved_for_staging') is True, 'Every file needs staging approval')
        require(row.get('kind') in ('env', 'secret', 'keyring'), 'Invalid file kind')
        if target == '.env' or target.startswith('config/'):
            require(row['kind'] == 'env', 'Configuration files require environment validation')
        if 'keyring' in target:
            require(row['kind'] == 'keyring', 'Keyring requires immutable preservation checks')
        source = Path(row['source'])
        if not source.is_absolute():
            source = path.parent / source
        private_file(source)
        require(source.stat().st_size <= MAX_FILE, 'File exceeds limit')
        data = source.read_bytes()
        require(data and len(data) <= MAX_FILE, 'Empty or oversized file')
        require(b'OPENSSH PRIVATE KEY' not in data and b'BEGIN RSA PRIVATE KEY' not in data and
                b'BEGIN DSA PRIVATE KEY' not in data and b'PuTTY-User-Key-File' not in data,
                'SSH private keys must never be transferred')
        digest = hashlib.sha256(data).hexdigest()
        require(row.get('sha256') == digest, 'Approved file changed; review and reseal the manifest')
        if target == '.env' or target.startswith('config/'):
            # Lazy import avoids a module initialization cycle with the preparation CLI.
            from oracle_env_prepare import read_env, validate_runtime, validate_compose
            values = read_env(source)
            if target == '.env':
                validate_compose(values, manifest)
            else:
                validate_runtime(target, values, manifest)
        result.append({'target': target, 'kind': row['kind'], 'sha256': digest, 'size': len(data)})
        payloads.append(data)
    require(sum(map(len, payloads)) <= MAX_TOTAL, 'Transfer exceeds limit')
    return result, payloads


def verified_known_host(host, port, known_hosts, fingerprint):
    require(known_hosts.is_file() and not known_hosts.is_symlink(), 'Missing verified known_hosts')
    require(re.fullmatch(r'SHA256:[A-Za-z0-9+/]{43}', fingerprint), 'Expected operator-verified SHA256 host fingerprint')
    token = host if port == 22 else '[' + host + ']:' + str(port)
    found = subprocess.run(['ssh-keygen', '-F', token, '-f', str(known_hosts)], capture_output=True, text=True, timeout=10)
    for line in found.stdout.splitlines():
        if not line or line.startswith('#') or line.startswith('@'):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        candidate = 'doccraft-oracle-staging ' + parts[1] + ' ' + parts[2] + '\n'
        check = subprocess.run(['ssh-keygen', '-l', '-E', 'sha256', '-f', '-'],
                               input=candidate, capture_output=True, text=True, timeout=10)
        if check.returncode == 0 and fingerprint in check.stdout.split():
            return candidate
    raise ValueError('Known host key does not match the operator-verified fingerprint')


def ssh_command(args, known_hosts):
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.:-]*', args.host), 'Invalid SSH host')
    require(re.fullmatch(r'[a-z_][a-z0-9_-]*', args.user) and args.user != 'root', 'Use an explicit non-root deployment identity')
    require(1 <= args.port <= 65535, 'Invalid SSH port')
    private_file(args.key)
    addresses = socket.getaddrinfo(args.host, args.port, type=socket.SOCK_STREAM)
    if not args.approved_private_route:
        require(all(ipaddress.ip_address(item[4][0]).is_global for item in addresses),
                'Private endpoint requires an explicitly approved VPN/Bastion route')
    config = str(private_file(args.ssh_config)) if args.ssh_config else '/dev/null'
    # CLI security options precede the optional operator-reviewed ProxyCommand config.
    options = {'BatchMode': 'yes', 'IdentitiesOnly': 'yes', 'StrictHostKeyChecking': 'yes',
               'UserKnownHostsFile': str(known_hosts), 'GlobalKnownHostsFile': '/dev/null',
               'HostKeyAlias': 'doccraft-oracle-staging', 'ForwardAgent': 'no',
               'ClearAllForwardings': 'yes', 'RequestTTY': 'no', 'ControlMaster': 'no',
               'ControlPath': 'none', 'PasswordAuthentication': 'no', 'KbdInteractiveAuthentication': 'no',
               'ConnectTimeout': '10', 'ConnectionAttempts': '1', 'ServerAliveInterval': '15',
               'ServerAliveCountMax': '3', 'LogLevel': 'ERROR', 'UpdateHostKeys': 'no'}
    command = ['ssh', '-T', '-q', '-p', str(args.port), '-i', str(args.key)]
    for key, value in options.items():
        command += ['-o', key + '=' + value]
    return command + ['-F', config, args.user + '@' + args.host]


def remote_call(command, mode, data=None):
    # Source contains no credentials. File bytes travel only inside encrypted SSH stdin.
    source = Path(__file__).with_name('oracle_env_remote.py').read_text()
    entry = '\ntry:\n print(json.dumps(main(' + repr(mode) + ', ' + repr(EXPECTED) + ')))\nexcept BaseException:\n print("Staging operation refused or failed; existing backups are retained.", file=sys.stderr)\n sys.exit(1)\n'
    remote_command = 'python3 -c ' + shlex.quote(source + entry)
    result = subprocess.run(command + [remote_command], input=data, capture_output=True, timeout=180)
    require(result.returncode == 0, 'SSH discovery/transfer failed; check verified access, identity, marker, permissions and prerequisites')
    result = json.loads(result.stdout)
    require(isinstance(result, dict), 'Invalid SSH response')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check-local', action='store_true')
    mode.add_argument('--discover', action='store_true')
    mode.add_argument('--transfer', action='store_true')
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--host')
    parser.add_argument('--port', type=int, default=22)
    parser.add_argument('--user')
    parser.add_argument('--key', type=Path)
    parser.add_argument('--known-hosts', type=Path)
    parser.add_argument('--fingerprint')
    parser.add_argument('--ssh-config', type=Path, help='Private operator-reviewed Bastion configuration; all hops must verify host keys')
    parser.add_argument('--approved-private-route', action='store_true')
    parser.add_argument('--approval-id', help='Operator change approval reference; required for transfer')
    args = parser.parse_args()
    try:
        os.umask(0o077)
        if args.transfer:
            require(args.approval_id and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}', args.approval_id), 'Explicit operator transfer approval reference required')
        files, payloads = load_manifest(args.manifest) if args.manifest else ([], [])
        if args.check_local:
            require(files, 'Provide the sealed staging manifest')
            print(json.dumps({'local_files_validated': len(files), 'network_used': False, 'files_transferred': 0}))
            return 0
        require(all((args.host, args.user, args.key, args.known_hosts, args.fingerprint)), 'Supply SSH host, user, key path, verified known_hosts and fingerprint')
        if args.transfer:
            require(files, 'Provide the sealed staging manifest')
            require(all(data != private_file(args.key).read_bytes() for data in payloads),
                    'SSH identity must never be transferred')
        key_line = verified_known_host(args.host, args.port, args.known_hosts, args.fingerprint)
        with tempfile.TemporaryDirectory(prefix='doccraft-oracle-ssh-') as temp:
            hostfile = Path(temp) / 'known_hosts'
            hostfile.write_text(key_line)
            hostfile.chmod(0o600)
            command = ssh_command(args, hostfile)
            observed = remote_call(command, 'discover')
            if args.discover:
                print(json.dumps(observed, indent=2))
                return 0
            header = json.dumps({'files': files}, separators=(',', ':')).encode() + b'\n'
            result = remote_call(command, 'transfer', header + b''.join(payloads))
            print(json.dumps(result, indent=2))
            return 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('Validation or SSH operation failed. Check file names, approval, permissions, identity and verified host key. No secret values are printed.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

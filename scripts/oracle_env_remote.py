"""SSH-side staging discovery and transactional allowlisted file installation.

Only deploy-oracle-env invokes this module remotely. No Docker mutations,
package installations, credential generation, or migrations occur here.
"""
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import socket
import stat
import subprocess
import sys
import urllib.request
import uuid

MAX_TOTAL = 32 * 1024 * 1024
MAX_FILE = 4 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def target_name(name):
    require(isinstance(name, str), 'Invalid destination')
    require(name == '.env' or re.fullmatch(r'(config|secrets)/[A-Za-z0-9][A-Za-z0-9_.-]{0,100}', name),
            'Destination must be .env, config/<file>, or secrets/<file>')
    require('..' not in PurePosixPath(name).parts, 'Unsafe destination')
    require(not any(part in name.lower() for part in ('id_rsa', 'id_ed25519', 'authorized_keys', 'known_hosts')),
            'SSH credentials must never be transferred')
    return name


def run(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=12)
        return result.returncode, result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return 127, ''


def discovery():
    # IMDSv2 response is filtered: metadata, ssh keys and user_data are not emitted.
    instance = {}
    try:
        request = urllib.request.Request('http://169.254.169.254/opc/v2/instance/',
                                         headers={'Authorization': 'Bearer Oracle'})
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=4) as response:
            data = json.load(response)
        instance = {key: data.get(key) for key in ('id', 'displayName', 'region', 'regionInfo', 'shape')}
        info = instance.pop('regionInfo', None) or {}
        instance['region_identifier'] = info.get('regionIdentifier') or instance.get('region')
    except Exception:
        pass
    code, addresses = run(['ip', '-j', '-4', 'address', 'show'])
    try:
        ips = [item['local'] for interface in json.loads(addresses) for item in interface.get('addr_info', [])]
    except (KeyError, ValueError, TypeError):
        ips = []
    release = {}
    try:
        for line in Path('/etc/os-release').read_text().splitlines():
            key, sep, value = line.partition('=')
            if sep and key in ('ID', 'VERSION_ID', 'PRETTY_NAME'):
                release[key] = value.strip('"')
    except OSError:
        pass
    memory = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        if key in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'):
            memory[key + '_KiB'] = int(value.strip().split()[0])
    docker_code, _ = run(['docker', 'info', '--format', '{{.Architecture}}'])
    compose_code, compose = run(['docker', 'compose', 'version', '--short'])
    sudo_code, _ = run(['sudo', '-n', 'true'])
    _, sockets = run(['ss', '-H', '-lnt'])
    # Only listener addresses, never process arguments or environment.
    listeners = [line.split()[3] for line in sockets.splitlines() if len(line.split()) >= 4]
    base = Path('/opt/doccraft')
    disk = shutil.disk_usage(base if base.exists() else '/opt')
    return {'instance': instance, 'private_ips': ips, 'hostname': socket.gethostname(),
            'os': release, 'architecture': platform.machine(), 'logical_cpus': os.cpu_count(),
            'memory': memory, 'disk_total_bytes': disk.total, 'disk_free_bytes': disk.free,
            'uid': os.getuid(), 'docker_accessible': docker_code == 0,
            'compose_available': compose_code == 0, 'compose_version': compose if compose_code == 0 else None,
            'sudo_noninteractive': sudo_code == 0, 'listeners': listeners,
            'deployment_directory_exists': base.is_dir(),
            'deployment_directory_writable': os.access(base, os.W_OK) if base.exists() else False,
            'staging_marker_exists': (base / '.doccraft-staging').is_file()}


def verify_identity(observed, expected):
    instance = observed.get('instance', {})
    require(instance.get('displayName') == expected['instance'], 'OCI instance name did not match')
    require(instance.get('region_identifier') == expected['region'], 'OCI region did not match')
    require(expected['private_ip'] in observed.get('private_ips', []), 'OCI private IP did not match')
    if expected.get('instance_ocid'):
        require(instance.get('id') == expected['instance_ocid'], 'OCI instance OCID did not match')
    require(observed.get('uid') not in (None, 0), 'Use the non-root deployment account')


def directory(path, create=False):
    if not path.exists() and not path.is_symlink() and create:
        path.mkdir(mode=0o700)
    meta = path.lstat()
    require(stat.S_ISDIR(meta.st_mode) and not path.is_symlink(), 'Unsafe target directory')
    require(meta.st_uid == os.geteuid() and not stat.S_IMODE(meta.st_mode) & 0o077,
            'Target directories must be owned by the deployment account and mode 0700')


def regular(path):
    meta = path.lstat()
    require(stat.S_ISREG(meta.st_mode) and meta.st_nlink == 1, 'Unsafe target file')
    require(meta.st_uid == os.geteuid() and not stat.S_IMODE(meta.st_mode) & 0o077,
            'Target files must be owned by the deployment account and mode 0600')


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def install(root, header, stream):
    """Receive all bytes and verify before changing a destination. Caller gates identity."""
    os.umask(0o077)
    directory(root)
    files = header['files']
    require(isinstance(files, list) and 0 < len(files) <= 128, 'Invalid file count')
    names = [target_name(item['target']) for item in files]
    require(len(names) == len(set(names)), 'Duplicate destination')
    require(all(type(item['size']) is int and 0 < item['size'] <= MAX_FILE for item in files), 'Invalid file size')
    require(sum(item['size'] for item in files) <= MAX_TOTAL, 'Transfer exceeds size limit')
    for name in names:
        destination = root / name
        if destination.parent != root:
            # Missing directories are created only after complete payload validation.
            if destination.parent.exists() or destination.parent.is_symlink():
                directory(destination.parent)
        if destination.exists() or destination.is_symlink():
            regular(destination)
    lock_path = root / '.env-transfer.lock'
    lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    regular(lock_path)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        history = root / '.env-transfers'
        directory(history, create=True)
        transaction = history / uuid.uuid4().hex
        transaction.mkdir(mode=0o700)
        incoming = transaction / 'incoming'
        incoming.mkdir(mode=0o700)
        backups = transaction / 'backups'
        backups.mkdir(mode=0o700)
        for index, item in enumerate(files):
            data = stream.read(item['size'])
            require(len(data) == item['size'], 'Truncated transfer')
            require(hashlib.sha256(data).hexdigest() == item['sha256'], 'Transfer integrity failed')
            require(b'OPENSSH PRIVATE KEY' not in data, 'SSH private keys must never be transferred')
            require(b'BEGIN RSA PRIVATE KEY' not in data and b'BEGIN DSA PRIVATE KEY' not in data and b'PuTTY-User-Key-File' not in data,
                    'Legacy SSH private keys must never be transferred')
            name = item['target']
            destination = root / name
            if item['kind'] == 'keyring':
                ring = json.loads(data)
                require(ring.get('active_kid') in ring.get('keys', {}), 'Invalid encryption keyring')
                if destination.exists():
                    require(destination.read_bytes() == data, 'Existing keyring differs; replacement is prohibited')
            with (incoming / str(index)).open('xb') as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
        require(stream.read(1) == b'', 'Unexpected transfer data')
        replaced = []
        try:
            for index, item in enumerate(files):
                destination = root / item['target']
                directory(destination.parent, create=True)
                existed = destination.exists()
                if existed:
                    regular(destination)
                    # Do not share hardlinks with a subsequently mutable destination.
                    with destination.open('rb') as original, (backups / str(index)).open('xb') as backup:
                        shutil.copyfileobj(original, backup)
                        backup.flush()
                        os.fsync(backup.fileno())
                replaced.append((index, destination, existed))
                os.replace(incoming / str(index), destination)
                os.chmod(destination, 0o600)
                sync_dir(destination.parent)
            for item in files:
                destination = root / item['target']
                require(hashlib.sha256(destination.read_bytes()).hexdigest() == item['sha256'], 'Installed integrity failed')
                regular(destination)
        except BaseException:
            # Restore prior bytes atomically. Backups remain private for recovery.
            for index, destination, existed in reversed(replaced):
                if existed:
                    recovery = incoming / ('restore-' + str(index))
                    shutil.copyfile(backups / str(index), recovery)
                    os.chmod(recovery, 0o600)
                    os.replace(recovery, destination)
                else:
                    destination.unlink(missing_ok=True)
                sync_dir(destination.parent)
            raise
        (transaction / 'receipt.json').write_text(json.dumps({'files': names, 'verified': True}))
        sync_dir(transaction)
        return {'files_transferred': len(files), 'checksums_verified': True,
                'backup_directory': '.env-transfers/' + transaction.name,
                'services_started': False, 'migrations_run': False}
    finally:
        os.close(lock_fd)


def main(mode, expected):
    observed = discovery()
    verify_identity(observed, expected)
    if mode == 'discover':
        return observed
    root = Path('/opt/doccraft')
    directory(root)
    for gate in ('/etc/doccraft/production-enabled', '/opt/doccraft/production-enabled'):
        require(not Path(gate).exists(), 'Production gate detected; staging transfer refused')
    marker = root / '.doccraft-staging'
    regular(marker)
    require(json.loads(marker.read_text()) == {**expected, 'environment': 'staging'},
            'Operator staging identity marker does not match')
    line = sys.stdin.buffer.readline(65537)
    require(len(line) <= 65536 and line.endswith(b'\n'), 'Invalid transfer header')
    return install(root, json.loads(line), sys.stdin.buffer)

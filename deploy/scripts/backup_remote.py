#!/usr/bin/env python3
"""Operator-installed encrypted off-host backups. Never initializes/rekeys a repository.

Shares the deployment lock. Database dumps are snapshot-consistent; document/admin
writers are stopped briefly while dump + encrypted asset upload runs. This single
VPS maintenance operation needs a separately accepted outage window and a restore drill.
"""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit
from controller import Controller, atomic_json


def private_file(path):
    path = Path(path)
    stat = path.lstat()
    if not path.is_file() or path.is_symlink() or stat.st_uid != 0 or stat.st_mode & 0o077:
        raise ValueError('Backup configuration must be a root-owned private regular file')
    return path


def repository_location(value):
    """Local paths/loopback cannot be mistaken for disaster recovery storage."""
    value = value.strip()
    if value.startswith('s3:https://'):
        host = urlsplit(value[3:]).hostname
    elif value.startswith('rest:https://'):
        host = urlsplit(value[5:]).hostname
    elif value.startswith('sftp:'):
        host = urlsplit('ssh://' + value[5:]).hostname
    else:
        raise ValueError('Use an approved remote S3 HTTPS, REST HTTPS or SFTP repository')
    if not host or host.lower() in ('localhost', '127.0.0.1', '::1'):
        raise ValueError('Off-host repository is required')
    return value


def backup(controller, run=subprocess.run):
    home, state = controller.home, controller.state
    policy = json.loads(private_file(home / 'backup.json').read_text())
    if set(policy) != {'repository_file', 'password_file', 'credential_file', 'maintenance_approved'} or policy['maintenance_approved'] is not True:
        raise ValueError('Backup maintenance window must be explicitly approved')
    repository = private_file(policy['repository_file'])
    repository_location(repository.read_text())
    password = private_file(policy['password_file'])
    credentials = json.loads(private_file(policy['credential_file']).read_text())
    allowed = {'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_DEFAULT_REGION'}
    if not isinstance(credentials, dict) or set(credentials) - allowed or not all(isinstance(v,str) for v in credentials.values()):
        raise ValueError('Unexpected backup credential configuration')
    env = {'PATH': '/usr/bin:/bin', 'HOME': '/root', 'RESTIC_REPOSITORY_FILE': str(repository), 'RESTIC_PASSWORD_FILE': str(password), **credentials}
    release = json.loads((state / 'current.json').read_text())
    volumes = []
    for name in ('doccraft_documents', 'doccraft_admin_assets'):
        result = run(['docker','volume','inspect','--format','{{.Mountpoint}}',name], check=True,capture_output=True,text=True,timeout=30)
        path = Path(result.stdout.strip()).resolve()
        if not path.is_dir() or path.is_symlink() or path.name != '_data':
            raise ValueError('Invalid application volume mountpoint')
        volumes.append(path)
    # Validate all secret/config sources before stopping writers.
    sources = [home/'production.env', home/'secrets', home/'runtime', state/'current.json']
    if not all(p.exists() for p in sources):
        raise ValueError('Required recovery configuration is missing')
    with tempfile.TemporaryFile(mode='w+') as status:
        controller.compose(release,'ps','--status','running','--services',stdout=status)
        status.seek(0)
        if not {'document','admin-api'}.issubset(set(status.read().splitlines())):
            raise RuntimeError('Backup requires both application writers running before maintenance')
    stopped = False
    with tempfile.TemporaryDirectory(prefix='doccraft-backup-',dir=state) as folder:
        folder = Path(folder)
        try:
            # Set first so a partially failed stop still attempts service recovery.
            stopped = True
            controller.compose(release,'stop','--timeout','60','document','admin-api')
            dump = folder / 'database.dump'
            with open(dump,'xb',opener=lambda p,f:os.open(p,f,0o600)) as output:
                controller.compose(release,'run','--rm','-T','--no-deps','backup',stdout=output)
            if dump.stat().st_size < 32:
                raise RuntimeError('Empty database snapshot')
            with dump.open('rb') as source:
                controller.compose(release,'run','--rm','-T','--no-deps','--entrypoint','pg_restore','backup','--list',stdin=source)
            atomic_json(folder/'recovery.json',{'commit':release['commit'],'configuration_version':release['configuration']['CONFIG_VERSION'],
                'volume_sources':[str(p) for p in volumes], 'created_at':int(time.time()),'database':'database.dump'})
            # Never print restic output: errors can include repository credentials and filenames.
            run(['/usr/bin/restic','backup','--json','--tag','doccraft','--host','doccraft',str(folder),*[str(p) for p in sources+volumes]],
                env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=1800,check=True)
            run(['/usr/bin/restic','check','--read-data-subset=1%'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=900,check=True)
            atomic_json(state/'backup-last-success.json',{'at':int(time.time()),'commit':release['commit'],'encrypted_remote_upload':True,
                'restore_verified':False,'scope':'DB + document/admin volumes + runtime/config + original keyrings/identities'})
        finally:
            if stopped:
                controller.compose(release,'up','-d','--wait','--wait-timeout','180','document','admin-api')
    # No automatic forget/prune: off-host retention and immutable-copy policy need operator review.


def main():
    if os.geteuid()!=0:
        return 1
    os.umask(0o077)
    home,state,control=Path('/etc/doccraft'),Path('/var/lib/doccraft'),Path('/opt/doccraft/control')
    try:
        with (state/'deployment.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            controller=Controller(home,state,control)
            with (state/'backup-private.log').open('w') as log:
                controller.log=log
                backup(controller)
        print('Encrypted off-host snapshot completed; full restore acceptance remains required')
        return 0
    except Exception:
        print('Off-host backup failed; inspect restricted operational state',file=sys.stderr)
        return 1

if __name__=='__main__':
    sys.exit(main())

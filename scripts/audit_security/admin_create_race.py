"""Audit-only deterministic race probe; never connects to an existing database."""
import concurrent.futures
import json
import os
from pathlib import Path
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'docs/production-audit/evidence/admin-create-race.json'

with tempfile.TemporaryDirectory(prefix='doccraft-audit-race-') as directory:
    os.chdir(directory)
    os.environ['ADMIN_DATABASE_URL'] = 'sqlite:///' + str(Path(directory) / 'isolated.sqlite')
    os.environ['ADMIN_RUN_MIGRATIONS'] = 'false'
    os.environ['ENV'] = 'test'
    sys.path[:0] = [str(ROOT), str(ROOT / 'services/admin-api')]
    from app.db.admin_db import admin_db
    from app.repositories.admin_user_repository import AdminUserRepository

    admin_db.execute('''CREATE TABLE admin_users(
        id TEXT PRIMARY KEY,email TEXT UNIQUE,password_hash TEXT,name TEXT,role_id TEXT,
        role_name TEXT,is_super_admin INTEGER,totp_enabled INTEGER,totp_secret TEXT,
        status TEXT,created_at TEXT,updated_at TEXT)''')
    repository = AdminUserRepository()
    original = repository.list_all
    barrier = threading.Barrier(2)

    def synchronized_snapshot():
        rows = original()
        barrier.wait(timeout=5)
        return rows

    repository.list_all = synchronized_snapshot
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(repository.create, f'auditor-{number}@example.com',
                   'non-secret-audit-placeholder', 'role_staff', f'Auditor {number}')
                   for number in range(2)]
        outcomes = [future.result(timeout=10) for future in futures]
    rows = admin_db.fetch_all('SELECT id,email FROM admin_users ORDER BY id')
    result = {
        'probe': 'DB-001', 'type': 'actual_repository_isolated_sqlite_concurrency',
        'transport_mocked': False, 'database': 'fresh_temporary_sqlite',
        'concurrent_requests': 2, 'returned_ids': [row.id for row in outcomes],
        'persisted_rows': len(rows), 'unique_returned_ids': len({row.id for row in outcomes}),
        'race_reproduced': len(rows) == 1 and len({row.id for row in outcomes}) == 1,
        'synchronization': 'Barrier after both real list_all snapshots; real repository create/save executed',
        'expected': 'Two distinct staff rows with distinct identifiers',
        'actual': 'Two create operations chose one identifier; INSERT OR REPLACE retained only one account',
        'source': 'services/admin-api/app/repositories/admin_user_repository.py:71',
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    if not result['race_reproduced']:
        raise SystemExit('Expected audit finding did not reproduce; reassess before reporting')

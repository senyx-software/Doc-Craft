"""Actual admin API -> SQLite -> Redis/pubsub -> long-lived Node quota client.

All state and the Redis process belong exclusively to this probe.
"""
import json
import os
from pathlib import Path
import select
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
scratch = Path(tempfile.mkdtemp(prefix="doccraft-audit-sync-"))
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
os.environ.update({"ADMIN_DATABASE_URL": "sqlite:///" + str(scratch / "admin.sqlite"), "DATABASE_URL": "postgresql://audit:audit@127.0.0.1:9/audit", "DIRECT_URL": "postgresql://audit:audit@127.0.0.1:9/audit", "REDIS_URL": f"redis://127.0.0.1:{port}", "JWT_SECRET": "isolated-audit-sync-secret-with-32-characters", "INTERNAL_SERVICE_SECRET": "isolated-audit-sync-internal-secret", "ADMIN_API_SERVICE_URL": "http://127.0.0.1:9", "RESEND_API_KEY": "dummy-audit", "POSTHOG_API_KEY": "", "POSTHOG_PERSONAL_API_KEY": ""})
redis_process = subprocess.Popen([str(ROOT / "services/redis-bin/src/redis-server"), "--bind", "127.0.0.1", "--port", str(port), "--save", "", "--appendonly", "no", "--dir", str(scratch)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
node = None
results = []
try:
    import redis
    connection = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
    for _ in range(100):
        try:
            if connection.ping(): break
        except redis.ConnectionError: time.sleep(0.02)
    else: raise RuntimeError("Isolated Redis did not become ready")
    sys.path.insert(0, str(ROOT / "services/admin-api"))
    from app.main import app
    from app.repositories.admin_user_repository import admin_user_repository
    from app.repositories.plan_repository import plan_repository
    from app.security.authentication import create_admin_access_token
    import pyotp
    from fastapi.testclient import TestClient
    account = admin_user_repository.create("sync-probe@example.com", "unused-fixture-password", "role_super_admin", "Audit Fixture")
    account.totp_enabled = True; account.totp_secret = pyotp.random_base32(); admin_user_repository.save(account)
    token = create_admin_access_token(account.id, account.email, "Super Admin", ["*"], is_super_admin=True)
    client = TestClient(app)
    plan = plan_repository.get_plan_by_code("free")
    def change(limit):
        headers = {"Authorization": f"Bearer {token}", "X-Admin-2FA": pyotp.TOTP(account.totp_secret).now()}
        response = client.patch(f"/api/v1/admin/plans/{plan.id}", json={"monthly_quota": limit}, headers=headers)
        assert response.status_code == 200, response.text
        assert plan_repository.get_plan_by_id(plan.id).monthly_quota == limit
        assert json.loads(connection.get("quota:plan:free")) == limit
    change(7)
    node = subprocess.Popen([str(ROOT / "node_modules/.bin/tsx"), str(ROOT / "scripts/system_audit_quota_probe.ts")], cwd=ROOT, env=os.environ.copy(), text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    def read_limit():
        node.stdin.write("free\n"); node.stdin.flush()
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            ready, _, _ = select.select([node.stdout], [], [], 0.5)
            if ready:
                line = node.stdout.readline()
                if line.startswith("AUDIT_QUOTA "): return json.loads(line[12:])["limit"]
            if node.poll() is not None: raise RuntimeError("Node consumer exited before responding")
        raise RuntimeError("Node consumer timed out")
    assert read_limit() == 7
    for _ in range(60):
        if connection.pubsub_numsub("config_invalidation")[0][1] > 0: break
        time.sleep(0.05)
    else: raise RuntimeError("Quota consumer did not subscribe to invalidation")
    before = time.monotonic(); change(12)
    while read_limit() != 12:
        if time.monotonic() - before > 3: raise AssertionError("Consumer retained a stale quota")
        time.sleep(0.02)
    results.append({"scenario": "Admin plan quota update reaches an already-cached Node consumer over real Redis pub/sub", "status": "PASS", "initial_limit": 7, "updated_limit": 12, "elapsed_seconds": round(time.monotonic() - before, 3), "persistence": "Disposable SQLite plan row and real Redis key verified", "user_effect": "Quota client's returned generation allowance updated", "limitations": "Prisma/PostgreSQL quota counter and browser quota widget are outside this probe"})
    response = client.get(f"/api/v1/admin/plans", headers={"Authorization": f"Bearer {token}"})
    assert any(item["code"] == "free" and item["monthly_quota"] == 12 for item in response.json())
    results.append({"scenario": "Plan update survives a new admin API read", "status": "PASS"})
finally:
    if node:
        node.terminate()
        try: node.communicate(timeout=5)
        except subprocess.TimeoutExpired: node.kill(); node.communicate()
    redis_process.terminate()
    try: redis_process.wait(timeout=5)
    except subprocess.TimeoutExpired: redis_process.kill(); redis_process.wait()
    (ROOT / "docs/system-audit/evidence/synchronization-scenarios.json").write_text(json.dumps(results, indent=2))
print(json.dumps({"scenarios": len(results), "passed": len(results), "scope": "Real admin API, isolated SQLite, Redis, and persistent Node quota client"}))

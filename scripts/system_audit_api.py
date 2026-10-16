"""Probe the mounted admin API's authentication boundary using disposable state."""
import json
import os
from pathlib import Path
import re
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
scratch = Path(tempfile.mkdtemp(prefix="doccraft-api-audit-"))
os.environ.update({"ADMIN_DATABASE_URL": "sqlite:///" + str(scratch / "admin.sqlite"), "REDIS_URL": "redis://127.0.0.1:6397", "JWT_SECRET": "audit-api-fixture-secret-at-least-32-characters", "INTERNAL_SERVICE_SECRET": "audit-api-internal-fixture", "RESEND_API_KEY": "dummy-fixture", "POSTHOG_API_KEY": "", "POSTHOG_PERSONAL_API_KEY": ""})
sys.path.insert(0, str(ROOT / "services/admin-api"))
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)
schema = app.openapi()
results = []
inventory = []
public_auth = {"/api/v1/admin/auth/login", "/api/v1/admin/auth/verify-login-code", "/api/v1/admin/auth/forgot-password", "/api/v1/admin/auth/reset-password"}
for route, definition in schema["paths"].items():
    for method, operation in definition.items():
        if method.upper() not in {"GET", "POST", "PATCH", "PUT", "DELETE"}: continue
        inventory.append({"route": route, "method": method.upper(), "operation_id": operation.get("operationId"), "tags": operation.get("tags", [])})
        protected = route.startswith(("/api/v1/admin/", "/api/v1/users", "/api/v1/internal/")) and route not in public_auth
        if not protected: continue
        concrete = re.sub(r"\{[^}]+\}", "audit-nonexistent", route)
        internal_fixtures = {
            "/api/v1/admin/security/bot-detection-event": {"ip_address": "192.0.2.1", "reason": "audit fixture"},
            "/api/v1/admin/security/rate-limit-violation": {"ip_address": "192.0.2.1", "identifier": "fixture", "group_name": "fixture", "path": "/fixture", "limit_val": 1},
            "/api/v1/admin/security/auto-suspend": {"user_id": "audit-nonexistent", "reason": "audit fixture"},
        }
        response = client.request(method.upper(), concrete, **({"json": internal_fixtures.get(route, {})} if method != "get" else {}))
        results.append({"test_id": f"API-AUTH-{len(results)+1:03}", "route": route, "method": method.upper(), "expected": "401 or 403 before any protected handler executes", "actual": response.status_code, "status": "PASS" if response.status_code in {401, 403} else "FAIL", "methodology": "Actual mounted FastAPI app via in-process HTTP with disposable SQLite; no token"})
out = Path(os.environ.get("AUDIT_EVIDENCE_DIR", str(ROOT / "docs/system-audit/evidence")))
out.mkdir(parents=True, exist_ok=True)
(out / "mounted-admin-api.json").write_text(json.dumps(inventory, indent=2))
(out / "api-authorization-scenarios.json").write_text(json.dumps(results, indent=2))
print(json.dumps({"mounted_method_routes": len(inventory), "authorization_scenarios": len(results), "passed": sum(x["status"] == "PASS" for x in results), "failed": sum(x["status"] == "FAIL" for x in results)}))
if any(x["status"] == "FAIL" for x in results): raise SystemExit(1)

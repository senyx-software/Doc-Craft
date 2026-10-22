"""Run isolated, real PostgreSQL/Redis/API/worker integration checks.

Requires an explicitly local PostgreSQL server on PG_AUDIT_URL (default :55432).
Creates a uniquely named database; never resets or migrates an existing database.
All external provider credentials are synthetic. Email stays in the local queue.
"""
import concurrent.futures
import getpass
import hashlib
import json
import os
from pathlib import Path
import signal
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.parse import urlsplit, urlunsplit

import httpx
import psycopg2

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/system-audit/evidence/phase2"
OUT.mkdir(parents=True, exist_ok=True)
PYTHON = ROOT / ".venv-local/bin/python"
TSX = ROOT / "node_modules/.bin/tsx"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    previous = OUT / "stack-integration.json"
    if previous.exists():
        shutil.copyfile(previous, OUT / ("stack-attempt-" + str(time.time_ns()) + ".json"))
    pg_url = os.getenv("PG_AUDIT_URL", f"postgresql://{getpass.getuser()}@127.0.0.1:55432/postgres")
    parsed = urlsplit(pg_url)
    if parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("Refusing a non-loopback PostgreSQL instance")
    database = "doccraft_phase2_" + uuid.uuid4().hex[:12]
    control = psycopg2.connect(pg_url)
    control.autocommit = True
    with control.cursor() as cursor:
        cursor.execute('CREATE DATABASE "' + database + '"')
    database_url = urlunsplit((parsed.scheme, parsed.netloc, "/" + database, "", ""))
    checks = []
    processes = []
    logs = []
    started = time.monotonic()

    def record(name, passed, evidence=None, category="API"):
        checks.append({"id": f"P2-I{len(checks)+1:03d}", "workflow": name, "status": "VERIFIED" if passed else "UNRESOLVED", "category": category, "evidence": evidence})
        print(("PASS " if passed else "FAIL ") + name, flush=True)
        if not passed:
            raise AssertionError(name + ": " + str(evidence))

    with tempfile.TemporaryDirectory(prefix="doccraft-phase2-stack-") as folder:
        scratch = Path(folder)
        redis_port = free_port()
        ports = {name: free_port() for name in ("auth", "chat", "quota", "payment", "document", "admin", "sidecar", "gateway", "notification")}
        browser_ports = {"user-ui": free_port(), "admin-ui": free_port()}
        browser_urls = {name: f"http://127.0.0.1:{port}" for name, port in browser_ports.items()}
        urls = {name: f"http://127.0.0.1:{port}" for name, port in ports.items()}
        env = os.environ.copy()
        env.update({
            "NODE_ENV": "test", "ENV": "test", "DATABASE_URL": database_url, "DIRECT_URL": database_url,
            "ADMIN_DATABASE_URL": database_url, "REDIS_URL": f"redis://127.0.0.1:{redis_port}",
            "REDIS_HOST": "127.0.0.1", "REDIS_PORT": str(redis_port),
            "JWT_SECRET": "phase2-isolated-user-signing-secret-000000000", "JWT_REFRESH_SECRET": "phase2-isolated-refresh-signing-secret-000000000",
            "ADMIN_JWT_SECRET": "phase2-isolated-admin-signing-secret-000000000", "INTERNAL_SERVICE_SECRET": "phase2-isolated-internal-service-secret",
            "PADDLE_API_KEY": "pdl_test_fixture", "PADDLE_WEBHOOK_SECRET": "phase2-fixture-paddle-signature",  # gitleaks:allow -- isolated synthetic transport fixture
            "PADDLE_SANDBOX": "true", "PAYHERE_SANDBOX": "true", "PAYHERE_MERCHANT_ID": "fixture-merchant", "PAYHERE_MERCHANT_SECRET": "fixture-merchant-secret",
            "PADDLE_PRO_MONTHLY_PRICE_ID": "", "PADDLE_PRO_YEARLY_PRICE_ID": "", "PADDLE_MAX_MONTHLY_PRICE_ID": "", "PADDLE_MAX_YEARLY_PRICE_ID": "",
            "SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": "", "GROQ_API_KEY": "", "ANTHROPIC_API_KEY": "",
            "RESEND_API_KEY": "dummy-test-transport", "RESEND_WEBHOOK_SECRET": "", "POSTHOG_API_KEY": "dummy-test-project",
            "POSTHOG_HOST": "http://127.0.0.1:9", "POSTHOG_PERSONAL_API_KEY": "", "POSTHOG_PROJECT_ID": "",
            "ANALYTICS_SERVICE_URL": "http://127.0.0.1:9", "LOCAL_STORAGE_DIR": str(scratch / "storage"),
            "AUTH_SERVICE_URL": urls["auth"], "AI_SERVICE_URL": urls["chat"], "CHAT_SERVICE_URL": urls["chat"],
            "QUOTA_SERVICE_URL": urls["quota"], "PAYMENT_SERVICE_URL": urls["payment"], "BILLING_SERVICE_URL": urls["payment"],
            "DOCUMENT_SERVICE_URL": urls["document"], "NOTIFICATION_SERVICE_URL": urls["notification"],
            "CHAT_SERVICE_MCP_URL": urls["chat"] + "/internal/resources",
            "ADMIN_API_SERVICE_URL": urls["admin"], "ADMIN_API_URL": urls["admin"],
            "SIDECAR_URL": urls["sidecar"] + "/generate", "SIDECAR_PORT": str(ports["sidecar"]),
            "GATEWAY_URL": urls["gateway"], "CORS_ORIGINS": ",".join(browser_urls.values()),
            "ALLOWED_ORIGINS": json.dumps(list(browser_urls.values())),
            "SUPER_ADMIN_EMAIL": "phase2-admin@example.com", "SUPER_ADMIN_PASSWORD": "Phase2FixturePassword123!",
            "TRUSTED_PROXY_IPS": "[]", "IP_WHITELIST_ENABLED": "false", "FRONTEND_URL": "http://localhost:5183",
            "VITE_API_BASE_URL": urls["gateway"] + "/v1", "VITE_ADMIN_API_BASE_URL": urls["admin"] + "/api/v1",
            "RATE_LIMIT_MAX": "200", "API_RATE_LIMIT_MAX": "1000", "RATE_LIMIT_WINDOW": "60000",
        })

        def launch(name, command, directory=ROOT):
            stream = (scratch / f"{name}.log").open("w")
            logs.append((name, stream, scratch / f"{name}.log"))
            child_env = {**env, "PORT": str(ports.get(name, 0))}
            process = subprocess.Popen(list(map(str, command)), cwd=directory, env=child_env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            processes.append((name, process))
            return process

        client = httpx.Client(timeout=20)

        def request(method, service, path, token=None, expected=200, payload=None, headers=None):
            response = client.request(method, urls[service] + path, json=payload, headers={**({"Authorization": "Bearer " + token} if token else {}), **(headers or {})})
            if response.status_code != expected:
                raise AssertionError(f"{method} {service}{path}: expected {expected}, received {response.status_code}: {response.text[:350]}")
            return response.json() if response.content and "json" in response.headers.get("content-type", "") else response

        def wait_service(name):
            deadline = time.monotonic() + 35
            while time.monotonic() < deadline:
                process = next(p for n, p in processes if n == name)
                if process.poll() is not None:
                    raise RuntimeError(name + " exited during startup")
                try:
                    if client.get(urls[name] + "/health").status_code == 200:
                        return
                except httpx.HTTPError:
                    pass
                time.sleep(0.2)
            raise RuntimeError(name + " failed its local health check")

        try:
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    for service in ("auth", "chat", "payment", "quota"):
                        command = [ROOT / "node_modules/.bin/prisma", "migrate", "deploy", "--schema", ROOT / f"services/{service}/prisma/schema.prisma"]
                        migration = subprocess.run(list(map(str, command)), cwd=ROOT, env=env, text=True, capture_output=True)
                        if migration.returncode:
                            raise RuntimeError(service + " migration failed: " + migration.stderr[-800:])
                        record(service + " checked-in PostgreSQL migrations applied", True, "Fresh uniquely named database; real prisma migrate deploy", "Database")
            launch("redis", [ROOT / "services/redis-bin/src/redis-server", "--bind", "127.0.0.1", "--port", redis_port, "--save", "", "--appendonly", "no", "--dir", scratch])
            for name in ("auth", "quota", "chat", "payment", "notification"):
                launch(name, [TSX, "src/server.ts"], ROOT / f"services/{name}")
            launch("sidecar", [TSX, "puppeteer/server.ts"], ROOT / "services/document")
            launch("admin", [PYTHON, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ports["admin"]], ROOT / "services/admin-api")
            launch("document", [PYTHON, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ports["document"]], ROOT / "services/document")
            launch("gateway", [TSX, "src/index.ts"], ROOT / "services/gateway")
            for name in ports:
                wait_service(name)
                record(name + " local startup", True, "HTTP health endpoint", "Infrastructure")
            internal = {"X-Internal-Secret": env["INTERNAL_SERVICE_SECRET"]}
            password = "Phase2UserPassword123!"
            tokens = []
            users = []
            for index in range(2):
                email = f"phase2-user-{index}@example.com"
                request("POST", "gateway", "/v1/auth/register", expected=201, payload={"email": email, "password": password, "fullName": "Phase Two"})
                with psycopg2.connect(database_url) as connection:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT id,"verificationToken" FROM users WHERE email=%s', (email,))
                        user_id, code = cursor.fetchone()
                request("POST", "gateway", "/v1/auth/verify-email", payload={"email": email, "code": code})
                login = request("POST", "gateway", "/v1/auth/login", payload={"email": email, "password": password})
                tokens.append(login["accessToken"])
                users.append(user_id)
            record("Registration, stored verification challenge, verification and login through gateway", True, "Two isolated users; email transport is local fixture", "Authentication")
            profile = request("PATCH", "gateway", "/v1/auth/me", tokens[0], payload={"fullName": "Persisted Phase Two", "timezone": "Asia/Colombo"})
            reloaded = request("GET", "gateway", "/v1/auth/me", tokens[0])
            record("Profile update survives authenticated reload", reloaded["user"]["fullName"] == "Persisted Phase Two" and reloaded["user"]["timezone"] == "Asia/Colombo")

            # Admin sign-in uses the real password and stored second factor challenge.
            request("POST", "admin", "/api/v1/admin/auth/login", payload={"email": env["SUPER_ADMIN_EMAIL"], "password": env["SUPER_ADMIN_PASSWORD"]})
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT code FROM verification_codes WHERE email=%s", ("login:" + env["SUPER_ADMIN_EMAIL"],))
                    admin_code = cursor.fetchone()[0]
            admin_login = request("POST", "admin", "/api/v1/admin/auth/verify-login-code", payload={"email": env["SUPER_ADMIN_EMAIL"], "verification_code": admin_code})
            admin_token = admin_login["access_token"]
            record("Persisted administrator password + one-time code sign-in", True, "Real HTTP + PostgreSQL", "Authentication")

            def action_headers():
                request("POST", "admin", "/api/v1/admin/auth/request-action-code", admin_token, payload={})
                with psycopg2.connect(database_url) as connection:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT code FROM verification_codes WHERE email=%s", ("action:" + env["SUPER_ADMIN_EMAIL"],))
                        return {"X-Admin-2FA": cursor.fetchone()[0]}

            settings_payload = request("GET", "admin", "/api/v1/admin/config/settings", admin_token)
            settings_data = settings_payload.get("data", {})
            settings_data["rate_limits"] = {"auth": 30, "admin": 200, "user": 500, "public": 100}
            request("PUT", "admin", "/api/v1/admin/config/settings", admin_token, payload=settings_data, headers=action_headers())
            record("Isolated test rate policy persists through admin configuration", True, "500 authenticated requests/minute for accelerated fixture workflows", "Admin synchronization")
            plans = request("GET", "admin", "/api/v1/admin/plans", admin_token)
            free = next(plan for plan in plans if plan["code"] == "free")
            request("PATCH", "admin", "/api/v1/admin/plans/" + free["id"], admin_token, payload={"monthly_quota": 20}, headers=action_headers())
            quota = request("GET", "gateway", "/v1/quota/me", tokens[0])
            record("Admin daily allowance reaches authenticated user quota", quota["limit"] == 20, {"limit": quota["limit"]}, "Admin synchronization")

            request("POST", "admin", "/api/v1/users/" + users[1] + "/override", admin_token,
                    payload={"plan": "pro", "daily_limit": 7}, headers=action_headers())
            manual_profile = request("GET", "gateway", "/v1/auth/me", tokens[1])
            manual_quota = request("GET", "gateway", "/v1/quota/me", tokens[1])
            record("Unified admin override persists plan and quota into user APIs", manual_profile["user"]["plan"] == "pro" and manual_quota["limit"] == 7, category="Admin synchronization")
            request("DELETE", "admin", "/api/v1/admin/users/" + users[1] + "/quota-override", admin_token, expected=204, headers=action_headers())
            request("POST", "quota", "/v1/quota/plan/sync", payload={"userId": users[1], "plan": "pro"}, headers=internal)
            cleared = request("GET", "gateway", "/v1/quota/me", tokens[1])
            record("Override removal survives subsequent billing plan synchronization", cleared["limit"] != 7, {"limit": cleared["limit"]}, "Admin synchronization")
            request("PATCH", "admin", "/api/v1/users/" + users[1] + "/plan", admin_token, payload={"plan": "free"}, headers=action_headers())

            announcement = request("POST", "admin", "/api/v1/admin/notifications/announcements", admin_token, payload={"title": "Phase two announcement", "message": "Isolated fixture notice", "target_audience": "all_users"})["announcement"]
            feed = request("GET", "gateway", "/v1/notifications/announcements", tokens[0])
            record("Admin announcement reaches the authenticated user feed", any(item["id"] == announcement["id"] for item in feed["announcements"]), category="Admin synchronization")
            request("PATCH", "admin", "/api/v1/admin/notifications/announcements/" + announcement["id"], admin_token, payload={"is_active": False})
            feed = request("GET", "gateway", "/v1/notifications/announcements", tokens[0])
            record("Disabled announcement disappears from fresh user feed", not any(item["id"] == announcement["id"] for item in feed["announcements"]), category="Admin synchronization")
            request("DELETE", "admin", "/api/v1/admin/notifications/announcements/" + announcement["id"], admin_token, expected=204)

            for kind in (() if os.getenv("AUDIT_QUICK_BROWSER") == "1" else ("invoice", "quotation", "proposal", "receipt", "purchase_order")):
                template = {"invoice": "tmpl_invoice_2023_01", "quotation": "tmpl_quotation_modern", "proposal": "tmpl_proposal_corporate", "receipt": "tmpl_receipt_official", "purchase_order": "tmpl_purchase_order_classic"}[kind]
                session = request("POST", "gateway", "/v1/chat/api/chat/session", tokens[0], expected=201, payload={"documentTypeId": kind, "templateId": template, "title": "Phase 2 " + kind})
                session_id = session["sessionId"]
                path = "/v1/chat/api/chat/session/" + session_id
                request("GET", "gateway", path + "/messages", tokens[1], expected=403)
                state = session["state"]
                fields = {"businessName": "Nexora", "businessServices": "Software services", "senderAddress": "1 Fixture Road", "senderEmail": "fixture-business@example.com", "senderPhone": "+94771234567", "clientAddress": "2 Fixture Road", "clientEmail": "fixture-client@example.com", "clientPhone": "+94777654321", "clientName": "Phase Two Client", "invoiceNumber": "P2-001", "issueDate": "2026-10-15", "dueDate": "2026-11-15", "currency": "USD", "lineItems": [{"id": "item-one", "description": "Phase two service", "quantity": 2, "unitPrice": 19.95}], "taxRate": 10, "paymentMethod": "Cash", "subject": "Phase two project"}
                if kind == "receipt": fields.pop("dueDate", None)
                patch = request("PATCH", "gateway", path, tokens[0], payload={"slots": fields, "expectedRevision": state["revision"]})
                state = patch["state"]
                # Actual multi-turn SSE requests exercise the shipped deterministic parser;
                # they do not substitute for live-provider language intelligence tests.
                for message in ("Change the business name to Nexora Studio", "Change the client name to Phase Two Buyer"):
                    turn = str(uuid.uuid4())
                    stream = request("POST", "gateway", path + "/message", tokens[0], payload={"message": message, "turnId": turn})
                    events = [json.loads(line[6:]) for line in stream.text.splitlines() if line.startswith("data: ")]
                    done = next((event for event in events if event.get("type") == "done"), {})
                    record(kind + " multi-turn committed SSE update", done.get("outcome") == "success", {"turnId": turn, "provider": "deterministic parser; live AI not exercised"}, "Chat")
                    replay = request("POST", "gateway", path + "/message", tokens[0], payload={"message": message, "turnId": turn})
                    replay_events = [json.loads(line[6:]) for line in replay.text.splitlines() if line.startswith("data: ")]
                    record(kind + " duplicate turn replay", any(event.get("replayed") for event in replay_events), category="Chat")
                saved = request("GET", "gateway", path + "/messages", tokens[0])
                state = saved["state"]
                inspected = request("GET", "admin", "/api/v1/admin/support/sessions/" + session_id, admin_token)
                record(kind + " admin MCP resource read", inspected.get("found") is True and inspected["state"]["sessionId"] == session_id, "MCP initialize → initialized notification → resources/read over actual private HTTP", "Admin synchronization")
                record(kind + " chat fields persist after reload", state["slots"].get("businessName") == "Nexora Studio" and state["slots"].get("clientName") == "Phase Two Buyer", category="Chat")
                state = request("POST", "gateway", path + "/confirm", tokens[0], payload={"fingerprint": state["finalization"]["fingerprint"], "expectedRevision": state["revision"]})["state"]
                operation = str(uuid.uuid4())
                generation = request("POST", "gateway", "/v1/documents/generate", tokens[0], expected=202, payload={"documentType": kind, "templateId": template, "sessionId": session_id, "operationId": operation, "expectedRevision": state["revision"]})
                document_id = generation["documentId"]
                for _ in range(100):
                    status = request("GET", "gateway", "/v1/documents/job/" + generation["jobId"], tokens[0])
                    if status.get("status") in ("completed", "failed"):
                        break
                    time.sleep(0.5)
                record(kind + " real Redis queue → worker → Chromium → persisted PDF", status.get("status") == "completed", status, "PDF")
                details = request("GET", "gateway", "/v1/documents/" + document_id, tokens[0])
                pdf = client.get(details["downloadUrl"])
                (OUT / ("workflow-" + kind + ".pdf")).write_bytes(pdf.content)
                import fitz
                extracted = "\n".join(page.get_text() for page in fitz.open(stream=pdf.content, filetype="pdf"))
                record(kind + " exported PDF contains persisted chat edits", pdf.status_code == 200 and "nexora studio" in " ".join(extracted.lower().split()) and "phase two buyer" in " ".join(extracted.lower().split()), {"sha256": hashlib.sha256(pdf.content).hexdigest()}, "PDF")
                if kind != "proposal":
                    record(kind + " PDF preserves calculated tax-inclusive total", "43.89" in extracted,
                           {"expected_total": "43.89", "quantity": 2, "unit_price": "19.95", "tax_percent": 10}, "PDF")
                request("GET", "gateway", "/v1/documents/" + document_id, tokens[1], expected=404)
                record(kind + " cross-user document access denied", True, category="Security")
                request("DELETE", "gateway", "/v1/documents/" + document_id, tokens[0])
                request("GET", "gateway", "/v1/documents/" + document_id, tokens[0], expected=404)
                request("DELETE", "gateway", path, tokens[0])
                record(kind + " document and session deletion persist", True)

            # Real Lua concurrency and idempotent refund behavior through the API.
            def reserve(index):
                return request("POST", "quota", "/v1/quota/check", payload={"userId": users[1], "plan": "free", "reservationId": "phase2-race-" + str(index)}, headers=internal)
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                reservations = list(pool.map(lambda _: reserve(1), range(12)))
            record("Real Redis duplicate reservations consume one unit", all(result["used"] == 1 for result in reservations), category="Quota")
            reserve(2)
            def refund(_):
                return request("POST", "quota", "/v1/quota/refund", payload={"userId": users[1], "plan": "free", "reservationId": "phase2-race-1"}, headers=internal)
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                refunds = list(pool.map(refund, range(12)))
            record("Real Redis concurrent duplicate refunds preserve other reservation", all(result["used"] == 1 for result in refunds), category="Quota")

            pro = next(plan for plan in plans if plan["code"] == "pro")
            request("PATCH", "admin", "/api/v1/admin/plans/" + pro["id"], admin_token,
                    payload={"billing_currency": "LKR", "price_lkr_monthly": 990.25, "price_lkr_yearly": 9900.50, "monthly_quota": 30}, headers=action_headers())
            catalog = request("GET", "gateway", "/v1/payment/plans")
            advertised = next(plan for plan in catalog["plans"] if plan["name"] == "pro")
            record("Admin currency and prices reach public pricing", advertised["currency"] == "LKR" and advertised["priceMonthly"] == 990.25 and advertised["priceYearly"] == 9900.50, category="Admin synchronization")
            checkout = request("POST", "gateway", "/v1/payment/subscribe", tokens[0], payload={"plan": "pro", "billingCycle": "yearly"})
            form = checkout["form_data"]
            record("Annual hosted checkout uses configured LKR price and annual cadence", form["amount"] == "9900.50" and form["currency"] == "LKR" and form["recurrence"] == "1 Year", "Local sandbox form construction; no provider request/charge", "Billing")
            ipn = {"merchant_id": env["PAYHERE_MERCHANT_ID"], "order_id": form["order_id"], "payment_id": "fixture-payment-1", "payhere_amount": form["amount"], "payhere_currency": "LKR", "status_code": "2", "custom_1": users[1], "custom_2": "untrusted-max-plan"}
            secret_hash = hashlib.md5(env["PAYHERE_MERCHANT_SECRET"].encode()).hexdigest().upper()
            ipn["md5sig"] = hashlib.md5((ipn["merchant_id"] + ipn["order_id"] + ipn["payhere_amount"] + ipn["payhere_currency"] + secret_hash + ipn["status_code"]).encode()).hexdigest().upper()
            webhook_url = urls["gateway"] + "/v1/payment/webhook/payhere"
            response = client.post(webhook_url, data=ipn)
            record("Signed PayHere fixture is durably accepted by real Redis queue", response.status_code == 200, {"http_status": response.status_code}, "Billing")
            for _ in range(40):
                with psycopg2.connect(database_url) as connection:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT status,"currentPeriodStart","currentPeriodEnd" FROM subscriptions WHERE "userId"=%s', (users[0],))
                        subscription = cursor.fetchone()
                        cursor.execute('SELECT plan FROM users WHERE id=%s', (users[0],))
                        plan_name = cursor.fetchone()[0]
                if subscription and plan_name == "pro": break
                time.sleep(0.25)
            record("Signed callback activates server-bound owner and annual subscription", bool(subscription) and plan_name == "pro" and (subscription[2] - subscription[1]).days >= 365, "Unbound custom_1/custom_2 intentionally point to a different fixture user/plan", "Billing")
            other_profile = request("GET", "gateway", "/v1/auth/me", tokens[1])
            record("Tampered PayHere custom fields cannot grant another user paid access", other_profile["user"]["plan"] == "free", category="Security")
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                deliveries = list(pool.map(lambda _: client.post(webhook_url, data=ipn).status_code, range(8)))
            record("Concurrent duplicate signed callbacks are acknowledged", all(code == 200 for code in deliveries), category="Billing")
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT COUNT(*) FROM billing_invoices WHERE "gatewayInvoiceId"=%s', (ipn["payment_id"],))
                    invoice_count = cursor.fetchone()[0]
            record("Duplicate signed callback deliveries produce one persisted invoice", invoice_count == 1, {"invoices": invoice_count}, "Billing")
            request("PATCH", "admin", "/api/v1/admin/plans/" + pro["id"], admin_token, payload={"monthly_quota": 44}, headers=action_headers())
            current = request("GET", "gateway", "/v1/quota/me", tokens[0])
            record("Admin plan change reaches an already-active paid subscriber", current["plan"] == "pro" and current["limit"] == 44, {"limit": current["limit"]}, "Admin synchronization")
            request("PATCH", "admin", "/api/v1/users/" + users[0] + "/status", admin_token, payload={"status": "suspended"}, headers=action_headers())
            request("GET", "gateway", "/v1/auth/me", tokens[0], expected=403)
            record("Admin suspension invalidates an existing user access token", True, category="Admin synchronization")
            request("PATCH", "admin", "/api/v1/users/" + users[0] + "/status", admin_token, payload={"status": "active"}, headers=action_headers())
            request("GET", "gateway", "/v1/auth/me", tokens[0])
            record("Admin reactivation restores permitted access", True, category="Admin synchronization")
            # Render the actual applications against the same persisted services.
            for name, directory in (("user-ui", "user-frontend"), ("admin-ui", "admin")):
                ports[name] = browser_ports[name]
                launch(name, [ROOT / directory / "node_modules/.bin/vite", "--host", "127.0.0.1", "--port", ports[name], "--strictPort"], ROOT / directory)
                deadline = time.monotonic() + 25
                while time.monotonic() < deadline:
                    try:
                        if client.get(browser_urls[name]).status_code == 200: break
                    except httpx.HTTPError: pass
                    time.sleep(0.2)
            inspection_session = request("POST", "gateway", "/v1/chat/api/chat/session", tokens[0], expected=201, payload={"documentTypeId": "invoice", "templateId": "tmpl_invoice_2023_01", "title": "Browser support inspection"})["sessionId"]
            browser_input = {"databaseUrl": database_url, "adminToken": admin_token, "adminId": admin_login["admin_id"], "userToken": tokens[0], "adminUrl": browser_urls["admin-ui"], "userUrl": browser_urls["user-ui"], "adminApiUrl": urls["admin"], "inspectionSession": inspection_session}
            browser = subprocess.run(["node", str(ROOT / "scripts/system_audit_phase2_browser.cjs")], input=json.dumps(browser_input), text=True, capture_output=True, timeout=100)
            record("Live user/admin browser integration", browser.returncode == 0, browser.stderr[-500:] or "See browser-integration.json", "Browser")
        except Exception as error:
            checks.append({"workflow": "Stack execution stopped", "status": "UNRESOLVED", "evidence": str(error)[:700]})
            print(str(error), flush=True)
        finally:
            client.close()
            for name, process in reversed(processes):
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            for name, stream, path in logs:
                stream.close()
                # Only synthetic fixtures are used; do not copy token/OTP/session dumps.
                errors = [line[:500] for line in path.read_text(errors="replace").splitlines() if "error" in line.lower() or "traceback" in line.lower()]
                (OUT / f"stack-{name}-errors.log").write_text("\n".join(errors[-20:]))
            result = {"seconds": round(time.monotonic() - started, 2), "database": database, "checks": checks, "external_providers": "NOT TESTED; synthetic credentials, no real communications or charges", "cleanup": [{"service": name, "exit_code": process.returncode} for name, process in processes]}
            (OUT / "stack-integration.json").write_text(json.dumps(result, indent=2))
            control.close()
    return int(any(check["status"] == "UNRESOLVED" for check in checks))


if __name__ == "__main__":
    raise SystemExit(main())

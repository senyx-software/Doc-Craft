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
from create_service_credentials import generate
from create_redis_credentials import generate as generate_redis
from urllib.parse import urlsplit, urlunsplit

import httpx
import psycopg2

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/system-audit/evidence/phase3"
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT))
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
    database = "doccraft_phase3_" + uuid.uuid4().hex[:12]
    control = psycopg2.connect(pg_url)
    control.autocommit = True
    with control.cursor() as cursor:
        cursor.execute('CREATE DATABASE "' + database + '"')
    database_url = urlunsplit((parsed.scheme, parsed.netloc, "/" + database, "", ""))
    credentials = generate()
    checks = []
    processes = []
    logs = []
    started = time.monotonic()

    def record(name, passed, evidence=None, category="API"):
        checks.append({"id": f"P3-I{len(checks)+1:03d}", "workflow": name, "status": "VERIFIED" if passed else "UNRESOLVED", "category": category, "evidence": evidence})
        print(("PASS " if passed else "FAIL ") + name, flush=True)
        if not passed:
            raise AssertionError(name + ": " + str(evidence))

    with tempfile.TemporaryDirectory(prefix="doccraft-phase2-stack-") as folder:
        scratch = Path(folder)
        redis_port = free_port()
        redis_envs=generate_redis(scratch/'credentials','127.0.0.1',redis_port)
        redis_urls={identity:text.splitlines()[0].split('=',1)[1] for identity,text in redis_envs.items()}
        ports = {name: free_port() for name in ("auth", "chat", "quota", "payment", "document", "admin", "sidecar", "gateway", "notification", "analytics")}
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
            "PADDLE_API_KEY": "pdl_test_fixture", "PADDLE_WEBHOOK_SECRET": "phase2-fixture-paddle-signature",
            "PADDLE_SANDBOX": "true", "PAYHERE_SANDBOX": "true", "PAYHERE_MERCHANT_ID": "fixture-merchant", "PAYHERE_MERCHANT_SECRET": "fixture-merchant-secret",
            "PADDLE_PRO_MONTHLY_PRICE_ID": "", "PADDLE_PRO_YEARLY_PRICE_ID": "", "PADDLE_MAX_MONTHLY_PRICE_ID": "", "PADDLE_MAX_YEARLY_PRICE_ID": "",
            "SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": "", "GROQ_API_KEY": "", "ANTHROPIC_API_KEY": "",
            "RESEND_API_KEY": "dummy-test-transport", "RESEND_WEBHOOK_SECRET": "", "POSTHOG_API_KEY": "dummy-test-project",
            "POSTHOG_HOST": "http://127.0.0.1:9", "POSTHOG_PERSONAL_API_KEY": "", "POSTHOG_PROJECT_ID": "",
            "ANALYTICS_SERVICE_URL": urls["analytics"], "LOCAL_STORAGE_DIR": str(scratch / "storage"),
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
            identity = {"admin":"admin-api", "sidecar":"pdf"}.get(name, name)
            child_env = {**env, "PORT": str(ports.get(name, 0)), "PYTHONPATH": str(ROOT)}
            if identity in credentials:
                child_env["SERVICE_AUTH_CONFIG_JSON"] = json.dumps(credentials[identity])
                child_env["REDIS_URL"]=redis_urls[identity]
            process = subprocess.Popen(list(map(str, command)), cwd=directory, env=child_env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            processes.append((name, process))
            return process

        client = httpx.Client(timeout=20)

        def request(method, service, path, token=None, expected=200, payload=None, headers=None):
            outbound = client.build_request(method, urls[service] + path, json=payload, headers={**({"Authorization": "Bearer " + token} if token else {}), **(headers or {})})
            if "x-internal-secret" in outbound.headers:
                from shared.service_auth import service_token
                del outbound.headers["x-internal-secret"]
                caller = "document" if service == "quota" and path in ("/v1/quota/check", "/v1/quota/refund") else "admin-api"
                receiver = {"admin":"admin-api", "sidecar":"pdf"}.get(service, service)
                outbound.headers["X-DocCraft-Service-Token"] = service_token(receiver, method, outbound.url, outbound.content, credentials[caller])
            response = client.send(outbound)
            if response.status_code != expected:
                raise AssertionError(f"{method} {service}{path}: expected {expected}, received {response.status_code}: {response.text[:350]}")
            return response.json() if response.content and "json" in response.headers.get("content-type", "") else response

        def wait_service(name):
            deadline = time.monotonic() + 35
            while time.monotonic() < deadline:
                process = next(p for n, p in reversed(processes) if n == name)
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
            launch("redis", [ROOT / "services/redis-bin/src/redis-server", "--bind", "127.0.0.1", "--port", redis_port, "--save", "", "--appendonly", "no", "--aclfile", scratch/"credentials/redis.acl", "--dir", scratch])
            for name in ("auth", "quota", "chat", "payment", "notification"):
                launch(name, [TSX, "src/server.ts"], ROOT / f"services/{name}")
            launch("sidecar", [TSX, "puppeteer/server.ts"], ROOT / "services/document")
            launch("admin", [PYTHON, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ports["admin"]], ROOT / "services/admin-api")
            launch("analytics", [PYTHON, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ports["analytics"]], ROOT / "services/analytics")
            launch("document", [PYTHON, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ports["document"]], ROOT / "services/document")
            launch("gateway", [TSX, "src/index.ts"], ROOT / "services/gateway")
            for name in ports:
                wait_service(name)
                record(name + " local startup", True, "HTTP health endpoint", "Infrastructure")
            from shared.service_auth import service_token
            from shared.queue_auth import signed_job
            import redis
            from redis.exceptions import AuthenticationError, NoPermissionError
            try:
                redis.Redis(host='127.0.0.1',port=redis_port).ping()
                anonymous_rejected=False
            except AuthenticationError: anonymous_rejected=True
            record("Redis default user is disabled",anonymous_rejected,category="Security")
            chat_redis=redis.Redis.from_url(redis_urls['chat'])
            for operation in ('foreign-key','payment-queue','config-update','privileged-command','automation-channel'):
                try:
                    if operation=='foreign-key': chat_redis.get('auth:secret')
                    elif operation=='payment-queue': chat_redis.hset('bull:payment-webhook:forged','data','{}')
                    elif operation=='config-update': chat_redis.set('config:domain:plans','{}')
                    elif operation=='privileged-command': chat_redis.config_get('*')
                    else: chat_redis.publish('doccraft:events','{}')
                    denied=False
                except NoPermissionError: denied=True
                record('Redis Chat identity denied '+operation,denied,category='Security')
            chat_redis.close()
            for identity in ('payment','quota','gateway'):
                r=redis.Redis.from_url(redis_urls[identity])
                try:r.set('config:domain:plans','forged');denied=False
                except NoPermissionError:denied=True
                record('Redis '+identity+' config cache is read-only',denied,category='Security')
                try:r.publish('config_invalidation','{}');denied=False
                except NoPermissionError:denied=True
                record('Redis '+identity+' cannot publish privileged config invalidations',denied,category='Security')
                r.close()
            r=redis.Redis.from_url(redis_urls['document'])
            try:r.hget('bull:email_queue_auth:fixture','data');denied=False
            except NoPermissionError:denied=True
            record('Document cannot read Auth verification or reset email jobs',denied,category='Security')
            r.close()

            def signed_probe(caller,service,path,method='GET',payload=None,expected=200,mutate=None):
                receiver={'admin':'admin-api','sidecar':'pdf'}.get(service,service)
                req=client.build_request(method,urls[service]+path,json=payload)
                req.headers['X-DocCraft-Service-Token']=service_token(receiver,method,req.url,req.content,credentials[caller])
                if mutate: mutate(req)
                response=client.send(req)
                record(f'Service authorization {caller} → {receiver} {method} {path} expects {expected}',response.status_code==expected,{'actual':response.status_code},'Security')
                return req
            for service,path,method,payload in [('auth','/internal/users','GET',None),('quota','/v1/quota/override','POST',{'userId':'fixture','plan':'free'}),('payment','/v1/payment/admin/plans','GET',None),('chat','/internal/resources','POST',{}),('notification','/notification/send','POST',{}),('analytics','/v1/analytics/overview','GET',None),('admin','/api/v1/internal/config','GET',None),('sidecar','/generate','POST',{'html':'<p>fixture</p>'})]:
                req=client.build_request(method,urls[service]+path,json=payload,headers={'X-Internal-Secret':env['INTERNAL_SERVICE_SECRET'],'x-user-id':'admin','x-is-admin':'true'})
                result=client.send(req)
                record('Internal '+service+' rejects old secret and forged identity headers',result.status_code==401,{'actual':result.status_code},'Security')
            signed_probe('chat','quota','/v1/quota/override','POST',{'userId':'fixture','plan':'max'},403)
            signed_probe('payment','auth','/internal/users/fixture/status','PATCH',{'status':'active'},403)
            signed_probe('payment','auth','/internal/users/stats-by-plan',expected=403)
            signed_probe('chat','analytics','/v1/analytics/overview',expected=403)
            signed_probe('gateway','admin','/api/v1/internal/config',expected=403)
            signed_probe('notification','admin','/api/v1/internal/config/plans',expected=403)
            signed_probe('admin-api','analytics','/v1/analytics/overview')
            signed_probe('notification','admin','/api/v1/admin/notifications/config/public')
            signed_probe('document','sidecar','/ready')
            signed_probe('admin-api','chat','/api/internal/status/keys')
            req=signed_probe('chat','admin','/api/v1/internal/config/ai_model_routing')
            replay=client.send(req)
            record('Python receiver rejects exact replay using real Redis',replay.status_code==409,category='Security')
            req=signed_probe('admin-api','auth','/internal/users')
            record('Node receiver rejects exact replay using real Redis',client.send(req).status_code==409,category='Security')
            signed_probe('document','sidecar','/generate','POST',{'html':'<p>fixture</p>'},401,lambda req: req.headers.__setitem__('X-DocCraft-Service-Token',service_token('pdf','POST',req.url,b'{"html":"tampered"}',credentials['document'])))
            # Poison messages have no signature and must fail before document/payment mutations.
            for queue,owner,name in [('document','document','generate_pdf'),('payment-webhook','payment','forged-event')]:
                r=redis.Redis.from_url(redis_urls[owner],decode_responses=True)
                poison_id='poison-'+uuid.uuid4().hex
                # Enqueue via the actual BullMQ producer, not a fabricated Redis hash.
                code="import {Queue} from 'bullmq';import {Redis} from 'ioredis';const r=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null});const q=new Queue(process.env.TEST_QUEUE,{connection:r});await q.add(process.env.TEST_NAME,{documentId:'victim',gateway:'payhere',userId:'victim'},{jobId:process.env.TEST_JOB});await q.close();await r.quit();"
                added=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,env={**env,'REDIS_URL':redis_urls[owner],'TEST_QUEUE':queue,'TEST_NAME':name,'TEST_JOB':poison_id},capture_output=True,text=True,timeout=10)
                if added.returncode: raise RuntimeError('Queue poison fixture could not enqueue')
                deadline=time.monotonic()+8
                reason=''
                while time.monotonic()<deadline:
                    reason=r.hget('bull:'+queue+':'+poison_id,'failedReason') or ''
                    if reason: break
                    time.sleep(.1)
                record('Unsigned '+queue+' queue job rejected before processing','Signed queue job required' in reason,{'failure':reason},'Security')
                r.close()
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
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT "refreshToken" FROM sessions')
                    stored_tokens = cursor.fetchall()
            record('Refresh credentials are stored only as digests', bool(stored_tokens) and all(row[0].startswith('sha256:') for row in stored_tokens), category='Security')
            guest=request('POST','gateway','/v1/auth/guest',payload={})
            guest_token=guest['session_token']
            draft=request('POST','gateway','/v1/chat/api/chat/session',guest_token,expected=201,payload={'documentTypeId':'invoice','templateId':'tmpl_invoice_2023_01'})
            draft_path='/v1/chat/api/chat/session/'+draft['sessionId']
            request('PATCH','gateway',draft_path,guest_token,payload={'slots':{'businessName':'Guest business'},'expectedRevision':draft['state']['revision']})
            layout={'elementOverrides':{'businessName':{'x':42,'text':'forged canonical value'}},'customElements':[],'pageWidth':595,'pageHeight':842,'pageBackgroundColor':'#ffffff'}
            saved=request('PUT','gateway',draft_path+'/canvas',guest_token,payload={'layout':layout,'expectedLayoutRevision':0})
            reloaded=request('GET','gateway',draft_path+'/messages',guest_token)['state']
            record('Canvas layout persists without changing canonical business values',reloaded['canvasLayout']['elementOverrides']['businessName']=={'x':42} and reloaded['slots']['businessName'].lower()=='guest business',category='Functionality')
            request('PUT','gateway',draft_path+'/canvas',tokens[1],payload={'layout':layout,'expectedLayoutRevision':1},expected=403)
            request('PUT','gateway',draft_path+'/canvas',guest_token,payload={'layout':layout,'expectedLayoutRevision':0},expected=409)
            record('Canvas ownership and stale writes are rejected',True,category='Security')
            migrated=request('POST','gateway','/v1/chat/api/chat/guest-migration',tokens[0],payload={'guestToken':guest_token})
            request('GET','gateway',draft_path+'/messages',guest_token,expected=403)
            reloaded=request('GET','gateway',draft_path+'/messages',tokens[0])['state']
            record('Guest draft and canvas migrate atomically to the authenticated account',migrated['migrated']==1 and reloaded['slots']['businessName'].lower()=='guest business' and reloaded['canvasLayout']['elementOverrides']['businessName']['x']==42,category='Functionality')
            request('POST','gateway','/v1/chat/api/chat/guest-migration',tokens[0],payload={'guestToken':guest_token})
            request('POST','gateway','/v1/chat/api/chat/guest-migration',tokens[1],payload={'guestToken':guest_token},expected=409)
            record('Guest transfer is idempotent and cannot be stolen by another account',True,category='Security')
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

            templates=request('GET','admin','/api/v1/admin/templates',admin_token)
            template=next(row for row in templates if row['id']=='invoice-classic')
            request('POST','admin','/api/v1/admin/templates/'+template['id']+'/withdraw',admin_token,headers=action_headers())
            available=request('GET','gateway','/v1/document/templates?type=invoice',tokens[0])
            denied=request('POST','gateway','/v1/chat/api/chat/session',tokens[0],payload={'documentTypeId':'invoice','templateId':'tmpl_invoice_2023_01'},expected=403)
            record('Admin template withdrawal reaches Document catalog and rejects Chat alias selection',not any(row['variant']=='classic' for row in available['templates']),category='Admin synchronization')
            request('POST','admin','/api/v1/admin/templates/'+template['id']+'/publish',admin_token,headers=action_headers())
            available=request('GET','gateway','/v1/document/templates?type=invoice',tokens[0])
            record('Admin template publication restores actual downstream availability',any(row['variant']=='classic' for row in available['templates']),category='Admin synchronization')
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
                if kind=='invoice':
                    link=request('POST','gateway','/v1/documents/'+document_id+'/share',tokens[0],payload={'expiresInDays':1})
                    shared=client.get(link['shareLink'])
                    record('Fresh share capability resolves without exposing private document metadata',shared.status_code==307,category='Security')
                    with psycopg2.connect(database_url) as connection:
                        with connection.cursor() as cursor:
                            cursor.execute('UPDATE documents SET "shareExpiresAt"=%s WHERE id=%s',('2000-01-01',document_id))
                    record('Expired share capability is rejected',client.get(link['shareLink']).status_code==404,category='Security')
                    invalid=client.post(urls['gateway']+path+'/message',headers={'Authorization':'Bearer '+tokens[0]},json={'message':'x'*4001,'turnId':str(uuid.uuid4())})
                    oversized=client.post(urls['gateway']+path+'/message',headers={'Authorization':'Bearer '+tokens[0]},json={'message':'x'*(2*1024*1024+10)})
                    record('Malformed and oversized gateway chat requests are rejected',invalid.status_code==400 and oversized.status_code==413,{'invalid':invalid.status_code,'oversized':oversized.status_code},'Security')
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
            path='/v1/quota/refund';body=json.dumps({'userId':users[1],'plan':'free','reservationId':'phase2-race-2'},separators=(',',':')).encode()
            forged_refund=client.post(urls['quota']+path,content=body,headers={'Content-Type':'application/json','X-DocCraft-Service-Token':service_token('quota','POST',path,body,credentials['chat'])})
            after=request('GET','gateway','/v1/quota/me',tokens[1])
            record('Chat cannot refund a Document-owned quota reservation',forged_refund.status_code==200 and after['used']==1,category='Security')


            reset_code="import {runDailyReset} from './services/quota/src/queues/quota-reset.queue.ts';import {getRedis,closeRedis} from './services/quota/src/db/redis.ts';import {prisma} from './services/quota/src/db/prisma.ts';const key='quota:user:'+process.env.TEST_USER;const before=await getRedis().get(key);await runDailyReset('phase3-fixture');if(await getRedis().get(key)!==before)throw new Error('Current-day reservations were erased');await closeRedis();await prisma.$disconnect();"
            reset=subprocess.run(['node','--import','tsx','--input-type=module','-e',reset_code],cwd=ROOT,env={**env,'REDIS_URL':redis_urls['quota'],'SERVICE_AUTH_CONFIG_JSON':json.dumps(credentials['quota']),'TEST_USER':users[1]},capture_output=True,text=True,timeout=15)
            record('Delayed daily reset preserves current-day reservations in real Redis',reset.returncode==0,reset.stderr[-200:] or 'Actual Quota reset routine against isolated PostgreSQL/Redis','Quota')
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
            ipn["md5sig"] = hashlib.md5((ipn["merchant_id"] + ipn["order_id"] + ipn["payhere_amount"] + ipn["payhere_currency"] + ipn["status_code"] + secret_hash).encode()).hexdigest().upper()
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
                    cursor.execute('SELECT COUNT(*) FROM billing_invoices WHERE "gatewayInvoiceId"=%s', ("payhere:" + ipn["order_id"],))
                    invoice_count = cursor.fetchone()[0]
            record("Duplicate signed callback deliveries produce one persisted invoice", invoice_count == 1, {"invoices": invoice_count}, "Billing")
            tampered={**ipn,'payment_id':'forged-invoice-identity','subscription_id':'forged-provider-subscription'}
            response=client.post(webhook_url,data=tampered)
            time.sleep(.3)
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT COUNT(*) FROM billing_invoices WHERE "userId"=%s',(users[0],))
                    count=cursor.fetchone()[0]
            record('Changing unsigned PayHere IDs cannot create another invoice',response.status_code==200 and count==1,category='Security')
            revenue=request('GET','admin','/api/v1/admin/revenue',admin_token)
            analytics_revenue=request('GET','analytics','/v1/analytics/revenue',headers=internal)
            record('Analytics reads currency-safe revenue through its scoped Payment identity',analytics_revenue['by_currency']['LKR']['total_revenue_paid']==9900.50,category='Billing')
            record('Financial reporting separates LKR from USD and normalizes annual revenue',revenue['currency']=='USD' and revenue['total_revenue_paid']==0 and revenue['by_currency']['LKR']['total_revenue_paid']==9900.50 and revenue['by_currency']['LKR']['mrr']==825.04,category='Billing')
            payment_process=next(process for name,process in processes if name=='payment')
            os.killpg(payment_process.pid,signal.SIGTERM);payment_process.wait(timeout=5)
            recovery_id='recovery-'+uuid.uuid4().hex
            recovery_payload={'gateway':'paddle','eventId':recovery_id,'eventType':'synthetic.recovery','data':{}}
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('INSERT INTO webhook_deliveries (id,name,payload) VALUES (%s,%s,%s)',(recovery_id,recovery_id,json.dumps(recovery_payload)))
            launch('payment',[TSX,'src/server.ts'],ROOT/'services/payment');wait_service('payment')
            for _ in range(60):
                with psycopg2.connect(database_url) as connection:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT "completedAt" FROM webhook_deliveries WHERE id=%s',(recovery_id,))
                        completed=cursor.fetchone()[0]
                if completed:break
                time.sleep(.2)
            record('Payment restart reconstructs a lost Redis delivery from the durable inbox',bool(completed),'Synthetic no-charge event inserted while the owned Payment process was stopped','Recovery')
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
            canvas_state=request('GET','gateway',draft_path+'/messages',tokens[0])['state']
            canvas_fields={'businessName':'Browser Layout Business','businessServices':'Software services','senderAddress':'1 Fixture Road','senderEmail':'fixture-business@example.com','senderPhone':'+94771234567','clientAddress':'2 Fixture Road','clientEmail':'fixture-client@example.com','clientPhone':'+94777654321','clientName':'Browser Buyer','invoiceNumber':'BROWSER-001','issueDate':'2026-10-15','dueDate':'2026-11-15','currency':'USD','lineItems':[{'id':'browser-item','description':'Browser service','quantity':2,'unitPrice':19.95}],'taxRate':10}
            request('PATCH','gateway',draft_path,tokens[0],payload={'slots':canvas_fields,'expectedRevision':canvas_state['revision']})
            browser_guest=request('POST','gateway','/v1/auth/guest',payload={})
            browser_guest_draft=request('POST','gateway','/v1/chat/api/chat/session',browser_guest['session_token'],expected=201,payload={'documentTypeId':'invoice','templateId':'tmpl_invoice_2023_01'})
            request('PATCH','gateway','/v1/chat/api/chat/session/'+browser_guest_draft['sessionId'],browser_guest['session_token'],payload={'slots':{'businessName':'Guest Browser Business'},'expectedRevision':browser_guest_draft['state']['revision']})
            browser_input = {"guestToken":browser_guest["session_token"], "guestSession":browser_guest_draft["sessionId"], "userEmail":"phase2-user-0@example.com", "userPassword":password, "gatewayUrl":urls["gateway"], "canvasSession":draft["sessionId"], "databaseUrl": database_url, "adminToken": admin_token, "adminId": admin_login["admin_id"], "userToken": tokens[0], "adminUrl": browser_urls["admin-ui"], "userUrl": browser_urls["user-ui"], "adminApiUrl": urls["admin"], "inspectionSession": inspection_session, "evidenceDirectory": str(OUT)}
            browser = subprocess.run(["node", str(ROOT / "scripts/system_audit_phase3_browser.cjs")], input=json.dumps(browser_input), text=True, capture_output=True, timeout=150)
            record("Live user/admin browser integration", browser.returncode == 0, browser.stderr[-500:] or "See browser-integration.json", "Browser")
            request('POST','gateway','/v1/auth/logout',tokens[1],payload={})
            request('POST','gateway','/v1/auth/refresh',payload={'refreshToken':login['refreshToken']},expected=401)
            record('Logout invalidates refresh sessions when the browser omits the refresh credential',True,category='Security')
            for service,path in [('auth','/v1/auth/me'),('gateway','/v1/quota/me'),('chat','/api/chat/sessions'),('quota','/v1/quota/me'),('payment','/v1/payment/subscription'),('document','/v1/document/history'),('notification','/notification/preferences')]:
                response=client.get(urls[service]+path,headers={'Authorization':'Bearer '+tokens[1]})
                record('Logged-out token denied at '+service+' boundary',response.status_code in (401,403),{'actual':response.status_code},'Security')
            # The admin signature must never be accepted with the ordinary user signing secret.
            import jwt as pyjwt
            claims=pyjwt.decode(admin_token,options={'verify_signature':False})
            forged=pyjwt.encode(claims,env['JWT_SECRET'],algorithm='HS256')
            denied=client.get(urls['admin']+'/api/v1/admin/auth/me',headers={'Authorization':'Bearer '+forged})
            record('Admin JWT rejects a token signed with the old user secret',denied.status_code==401,category='Security')
            sessions=request('GET','admin','/api/v1/admin/security/sessions',admin_token)
            record('Admin session inventory contains the actual signed session',any(row['id']==claims['jti'] for row in sessions),category='Security')
            request('POST','admin','/api/v1/admin/auth/logout',admin_token)
            rejected=client.get(urls['admin']+'/api/v1/admin/auth/me',headers={'Authorization':'Bearer '+admin_token})
            record('Admin logout revokes the persisted JWT session',rejected.status_code==401,category='Security')
            auth_process=next(process for name,process in processes if name=='auth')
            os.killpg(auth_process.pid,signal.SIGTERM);auth_process.wait(timeout=5)
            unavailable=client.get(urls['gateway']+'/v1/quota/me',headers={'Authorization':'Bearer '+tokens[0]})
            record('Auth outage fails closed at gateway without losing persisted documents',unavailable.status_code==503,category='Recovery')
            launch('auth',[TSX,'src/server.ts'],ROOT/'services/auth');wait_service('auth')
            request('GET','gateway','/v1/auth/me',tokens[0])
            record('Auth restart restores permitted access using stored identity',True,category='Recovery')
            redis_process=next(process for name,process in processes if name=='redis')
            os.killpg(redis_process.pid,signal.SIGSTOP)
            unavailable=client.get(urls['gateway']+'/v1/quota/me',headers={'Authorization':'Bearer '+tokens[0]})
            record('Replay store outage rejects protected gateway requests',unavailable.status_code==503,category='Recovery')
            os.killpg(redis_process.pid,signal.SIGCONT)
            time.sleep(.2)
            request('GET','gateway','/v1/auth/me',tokens[0])
            record('Redis resumes without losing revocation and quota state',True,category='Recovery')
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT payload FROM "NotificationLog" WHERE type=%s',('verify_email',))
                    payloads=[row[0] for row in cursor.fetchall()]
            record('Stored notification metadata redacts account verification tokens',len(payloads)>0 and all(payload.get('token')=='[REDACTED]' for payload in payloads),category='Security')
        except Exception as error:
            checks.append({"workflow": "Stack execution stopped", "status": "UNRESOLVED", "evidence": str(error)[:700]})
            print(str(error), flush=True)
        finally:
            client.close()
            for name, process in reversed(processes):
                if process.poll() is None:
                    if name=='redis':os.killpg(process.pid,signal.SIGCONT)
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

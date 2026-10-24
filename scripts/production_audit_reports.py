"""Render the audit from current source inventories and executed evidence.
No application changes or runtime requests. Run after the isolated probes.
"""
from pathlib import Path
import json,collections,re,sys,hashlib,os
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'docs/production-audit';E=BASE/'evidence'
def load(name):return json.loads((E/name).read_text())
def put(name,text):(BASE/name).write_text(text.strip()+'\n')
def table(headers,rows):
 def cell(v):return str(v).replace('|','/').replace('\n',' ')[:1000]
 return '| '+' | '.join(headers)+' |\n| '+' | '.join('---' for _ in headers)+' |\n'+''.join('| '+' | '.join(cell(v) for v in row)+' |\n' for row in rows)
def ref(path):
 if path.startswith('runtime/') or path.endswith('.json') and not path.startswith(('../','services/','deploy/','terraform/','.github/','user-frontend/','admin/','shared/')):target='evidence/'+path
 elif path.startswith('../devops/'):target=path
 else:target='../../'+path.split(':')[0]
 return '['+path+']('+target+')'
api=load('api-inventory.json');front=load('frontend-api-map.json')['requests'];features=load('feature-inventory.json')['components'];nav=load('admin-navigation.json');findings=load('findings.json');summary=load('validation-summary.json');resources=load('runtime/resource-summary.json');runtime=load('runtime/integrated-tests.json');browser=load('runtime/browser-tests.json');work=load('runtime/http-workload.json');restore=load('runtime/backup-restore.json');catalog=load('runtime/database-catalog.json')
# Live config source defines the actual scoped inventory. No credentials are read.
sys.path.insert(0,str(ROOT/'deploy/scripts'));from configure import PORTS,USES,REQUIRED_SECRETS
compose=json.loads((ROOT/'deploy/docker/compose.production.yml').read_text());inventory=[]
for name,s in compose['services'].items():
 py=name in ['document','analytics','admin-api','migrate-python','grant-roles','verify'];ui=name in ['user-ui','admin-ui'];node=name in PORTS and not py or name=='migrate-node'
 directory='admin' if name=='admin-ui' else 'user-frontend' if name=='user-ui' else 'services/document/puppeteer' if name=='pdf' else 'services/'+name if name in PORTS else 'deploy'
 package=ROOT/('services/document/package.json' if name=='pdf' else directory+'/package.json');package=json.loads(package.read_text()) if package.is_file() else {}
 framework='FastAPI' if name in ['document','analytics','admin-api'] else 'Fastify' if name in ['auth','chat','notification','pdf'] else 'Express' if name in ['gateway','payment','quota'] else 'React/Vite→nginx' if ui else 'one-shot control job' if s.get('profiles')==['tools'] else 'upstream infrastructure'
 build='npm run build --workspace='+package['name'] if node and package.get('name') else 'npm ci && npm run build' if ui else 'pip install -c deploy/staging/python.constraints.txt -r '+directory+'/requirements.txt' if py and name in PORTS else 'Pull pinned image / deploy Dockerfile target'
 inventory.append(dict(name=name,source_directory=directory,runtime='Python3.13' if py else 'Node24' if node else 'nginx' if ui else name,framework=framework,build_command=build,startup=s.get('command') or 'image Dockerfile default',port=PORTS.get(name,{'user-ui':8080,'admin-ui':8080,'postgres':5432,'redis':6379,'ollama':11434,'edge':'80/443'}.get(name)),exposure='public80/443' if name=='edge' else 'private/edge-routed or tools-profile job',database='PostgreSQL scoped role' if name in REQUIRED_SECRETS and 'DATABASE_URL' in REQUIRED_SECRETS[name] else 'owner/migration only' if name in ['migrate-node','migrate-python','grant-roles','backup'] else 'none',redis='per-service ACL/replay/queue' if name in PORTS else 'persistent Redis service' if name=='redis' else 'none',internal_dependencies=s.get('depends_on',{}),external_dependencies='Resend' if name=='notification' else 'Paddle/PayHere' if name=='payment' else 'PostHog' if name=='analytics' else 'approved inference providers' if name=='admin-api' else 'Firebase/Google' if name=='auth' else 'optional existing Supabase storage' if name=='document' else 'ACME' if name=='edge' else 'see source edge inventory',health=s.get('healthcheck',{}).get('test','Dockerfile /health; release verifier /ready') if not s.get('profiles')==['tools'] else 'bounded process exit + controller gate',authentication='Bearer/JWT + ownership or admin permissions; signed private route policy' if name in PORTS else 'TLS/ACL' if name in ['redis','postgres'] else 'edge HTTPS/backend auth' if ui else 'root controller/operator job' if s.get('profiles')==['tools'] else 'network isolation',required_configuration=USES.get(name,[]),required_secrets=sorted(REQUIRED_SECRETS.get(name,set()))+[x['source'] for x in s.get('secrets',[])],resource_caps={'memory':s.get('mem_limit'),'cpus':s.get('cpus')},volumes=s.get('volumes',[]),profile=s.get('profiles',[])))
(E/'service-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
service_table=table(['Service/source','Framework/runtime','Internal port','Build/start','DB/Redis','Exposure/health'],[(i['name']+' / '+i['source_directory'],i['framework']+' / '+i['runtime'],i['port'],i['build_command']+'; '+str(i['startup']),i['database']+'; '+i['redis'],i['exposure']+'; '+str(i['health'])) for i in inventory])
put('01-SYSTEM-ARCHITECTURE.md',f'''# Current system architecture

Audit date2026-10-21; current dirty working tree is the audit target. Application source was preserved. {len(inventory)} Compose entries are present:12 application containers (10 backend runtimes and2 frontends), PostgreSQL/Redis/Caddy, optional Ollama, and5 one-shot jobs. Counted from current [Compose](../../deploy/docker/compose.production.yml), package manifests and Python startup files, not prior service-count claims. Native test stack has14 processes/services and omits Caddy/Ollama.

```mermaid
flowchart LR
 User[User browser] --> Edge[Caddy HTTPS 80/443]
 Admin[Admin browser] --> Edge
 Edge --> UI[User React/nginx]
 Edge --> AUI[Admin React/nginx]
 Edge --> GW[Express gateway]
 Edge --> API[FastAPI admin API / RBAC / AI control]
 GW --> Auth[Fastify Auth]
 GW --> Chat[Fastify Chat / SSE / MCP]
 GW --> Doc[FastAPI documents]
 GW --> Pay[Express payment]
 GW --> Quota[Express quota]
 GW --> Notify[Fastify notification]
 GW --> Analytics[FastAPI analytics]
 Chat --> API
 Chat --> Auth
 Chat --> Quota
 Doc --> Chat
 Doc --> Quota
 Doc --> PDF[Fastify/Puppeteer renderer]
 API --> Auth
 API --> Pay
 API --> Quota
 API --> Ollama[Optional private Ollama]
 API --> Cloud[Approved external inference]
 Auth --> PG[(PostgreSQL)]
 Chat --> PG
 Doc --> PG
 Pay --> PG
 Quota --> PG
 API --> PG
 Notify --> PG
 Analytics --> PG
 Chat --> Redis[(Redis ACL / nonce / queues)]
 Doc --> Redis
 PDF --> Redis
 API --> Redis
 Pay --> Redis
 Quota --> Redis
 Auth --> Redis
 Notify --> Redis
 Analytics --> Redis
 Notify --> Resend[Resend]
 Pay --> Payments[Paddle/PayHere]
 Analytics --> PostHog[PostHog]
 Auth --> Google[Firebase/Google]
 Doc --> Files[Local volume or configured Supabase]
 GH[GitHub CI / GHCR digests] --> Controller[Restricted root deployment controller]
 Controller --> Edge
 Controller --> Migrate[Backup / migration / scoped grants / readiness]
 Migrate --> PG
```

The diagram is a dependency overview; [service-edges.json](evidence/service-edges.json) enumerates170 source URL/helper references and shared/service-permissions.json defines exact receiver/caller/method/path authorization. A graph edge is not proof of a successful live request. SSE chat/MCP is implemented; no explicit WebSocket route declaration was discovered in current application routing. Signed BullMQ queues and signed Redis events carry background work. Runtime tests independently verify selected signed calls/replay and quota chains.

{service_table}

[Full service-inventory.json](evidence/service-inventory.json) supplies every service's configuration names, required secret names, internal/external dependencies, auth, health, volumes and resource caps. Secret values are omitted. [configure.py](../../deploy/scripts/configure.py) is the scoped production authority; backend-only identities/TLS and the persistent AI keyring remain separate. PostgreSQL is the durable ledger/state store; Redis is coordination/replay/cache, not sole billing/quota truth.

Inventoried areas include shared JS/Python contracts, four Prisma migration systems, Python schema initializers, notification SQL, PDF workers, payment webhook inbox/outbox, notification delivery/receipts, analytics consumer, recovery loops, quota timers, frontend route stores and the deployment monitor timer. Evidence tiers are in [source-snapshot.json](evidence/source-snapshot.json), API/frontend manifests and pattern-reviewed-files.json. Hashing/pattern enumeration is explicitly not equivalent to line-by-line semantic or runtime verification. Generated dependencies, private env values, model binaries and developer state were excluded from source inventory.
''')
apirows=[]
for e in api['endpoints']:
 refs='; '.join(e['evidence']);apirows.append((e['service'],e['method'],e['route'],e['handler'],e['source']+':'+str(e['line']),e['consumer'],e['authentication'],e['authorization'],'Declared schema/handler source; request_response_verified='+str(e['validation'].get('request_response_verified',False)),','.join(e['database'].get('references',[])) or 'transitive trace unverified',','.join(e['external_dependencies'].get('references',[])) or 'none directly extracted',e['status'],e['risk'],refs))
put('02-COMPLETE-API-INVENTORY.md','''# Complete source-declared API inventory

Current AST/mount extraction discovers **351 explicit registered method/route pairs**,12 additional FastAPI framework routes,15 gateway wildcard proxy mounts and plugin-owned surfaces. Both Auth root/prefixed and Chat/api/prefixed registrations count as separate registered paths. The351 number excludes implicit HEAD/CORS OPTIONS, arbitrary Swagger static asset filenames and plugin-generated route internals. It is not a count of351 independently proven business workflows. No unmounted decorated route or duplicate explicit registration was found by this extractor; that is not proof every dynamic/plugin route was enumerated.

All351 explicit paths received actual unauthenticated probes with empty mutation bodies in the fresh stack:282HTTP401,27HTTP200,24HTTP400,12HTTP422,3HTTP503,2HTTP500,1HTTP404. Health/docs/guest creation/public catalog explain successful unauthenticated responses; OAuth-without-config explains500 and unconfigured signed-provider webhooks refuse503. Public shared-token lookup returned404. These results do not prove authorized behavior or represent penetration-test coverage of every argument. Source tests/negative results are linked in each record; full schemas, handler-call hints, ownership/permission descriptions and unresolved transitive DB/dependency traces remain in [api-inventory.json](evidence/api-inventory.json).

Source discovery uses TypeScript/Python AST, actual mounts and handler imports. Table/consumer/dependency fields are direct static hints; transitive service/database behavior is verified only for named integrated tests. Endpoints without that evidence remain untested. Risk is provisional endpoint impact, not a confirmed vulnerability severity. Actual tests cover registration/verification/profile/refresh/logout, chat/editor/state, custom templates, quota, admin config and signed-service rejection. SuccessfulHTTP200 alone never promotes a route to fully functional.

Confirmed route/contract findings: API-001 OAuth public allowlist mismatch; SEC-001 alternate OAuth auth gap; SEC-002 reset race; API-003 analytics200 error objects; API-004 incorrect financial currency/cadence mapping. Payment-method mutation APIs deliberately return501 and are deprecated; current UI uses the provider portal. Four unmatched frontend wrappers are separately identified as unused; same-named store methods must not be confused with those API functions. See report03.

'''+table(['Service','Method','Actual route','Handler','Source:line','Consumer','Authentication','Authorization','Validation','DB hints','Dependencies','Status','Risk','Evidence'],apirows)+'''
## Framework, plugins and wildcard surfaces

'''+table(['Service','Method','Route','Type'],[(r['service'],r.get('method','GET/HEAD'),r['route'],r.get('surface',r.get('kind','plugin'))) for r in [*api['framework_endpoints'],*api['proxy_surfaces'],*api['plugin_surfaces']]])+'''
Auth also registers fastify-metrics GET/metrics at server.ts:51 with signed authorization hook at:37; the OAuth start path is plugin-owned GET/v1/auth/login/google. Swagger UI subroutes and autoHEAD/OPTIONS remain framework surfaces, not omitted application controllers. No explicit WebSocket endpoint was found; Chat POST message and MCP GET/POST use SSE. Unused/deprecated status cannot be inferred from lack of a frontend call: workers, providers and admin services also consume endpoints. Full ownership/negative/payload matrices remain required before calling every endpoint production-ready.
''')
put('03-FRONTEND-API-INTEGRATION.md','''# Frontend to backend integration

228 source transport/wrapper callsites were extracted:158admin and70user.216match a current method/route after actual gateway alias rewrites,8are generic dynamic transports, and4legacy wrappers have no backend declaration. This is declaration coverage, not successful integration coverage. Every extracted callsite has file/line, wrapper, payload expression, auth default, consumers and candidate backend controller in [frontend-api-map.json](evidence/frontend-api-map.json). API schema/database fields are linked to report02 and remain explicit where runtime/transitive validation is incomplete.

Four unmatched wrappers: GET/admin/payment/plans, POST/admin/templates, PATCH/documents/{id}/layout and PATCH/documents/{id}/content. Direct import/call review found these unused. The initial name-only extractor falsely associated a same-named document-store method with updateLayout; the final inventory corrects it. Current canvas persistence uses PUT/chat/api/chat/session/{id}/canvas, not those legacy wrappers. Public GET/templates aliases exist, but fallback query document_type differs from the preferred type filter and should be kept under contract tests.

The actual user trace is React action -> normalized API client -> gateway upstreamPath alias -> Auth/Chat/Document/Quota -> signed policy/context calls -> PostgreSQL/Redis -> typed response -> Zustand -> UI. Current admin trace is React subview -> adminApiClient/apiRequest -> admin API JWT/live permission/one-use action challenge -> repository or signed owning service -> config version/cache invalidation -> UI refresh. Client typed interfaces alone do not validate runtime payloads.

Defects: OAuth callback URL/parser mismatch; profile normalization loses twoFactorEnabled; custom literal canvas disappears after reload; billing deep-link policy state is uninitialized; paid receipt row is fabricated; frontend has no refresh-token recovery despite backend support. Some admin views use catch/allSettled fallbacks that can hide dependency failure as empty/zero data; not every fallback is necessarily wrong, so individual unavailable-state tests remain pending. SSE tests verify supported framing/idempotency/error handling, but broad network-interruption/browser compatibility is not fully executed.

'''+table(['ID/app','Method / frontend path','Callsite','Mapped backend','Status','Consumer count'],[(c['id']+'/'+c['app'],c['method']+' '+c['path'],c['file']+':'+str(c['line']),str(c['resolved_service'])+' '+c['resolved_backend_path'],c['route_mapping_status'],len(c.get('consumers',[]))) for c in front])+'''
The8dynamic wrappers are separately visible rather than counted as wired endpoints. Calls matched to routes are not automatically working; business semantics and every error/pagination/polling variant still need the feature-level matrices. Current production assets passed secret-pattern checks and both frontends lint/build; this does not prove all rendered actions work.
''')
userfeatures=[f for f in features if f['app']=='user'];adminfeatures=[f for f in features if f['app']=='admin']
featuretable=lambda rows:table(['ID','Component','Interaction count/types','API IDs','Classification','Functional status'],[(f['id'],f['component'],str(f['interaction_count'])+' '+str(f['event_types']),','.join(f['api_calls']),f['classification'],f['functional_status']) for f in rows])
put('04-USER-FUNCTIONALITY.md','''# User functionality

User discovery covers actual routes in App.tsx, interactive TSX source and associated stores/API clients: landing/pricing, register/login/MFA/guest, email verification/reset, builder/template/asset/signature/format/layers/export controls, dashboard/profile/history/billing/support and shared error/loading states. No dedicated business-profile CRUD endpoint/screen was found; business/customer data lives in document slots and profile name/timezone settings. Do not invent a completed business-profile module.

812supported event attributes were inventoried across both frontends (352user,460admin). They are input/button handlers, not812independent features. The component table below groups every extracted user interaction file and links its API bindings. Indirect store/hook integration is explicitly unresolved rather than labeled frontend-only without proof. Navigation/rendering is a weaker evidence tier than mutation/persistence testing.

Executed actual user browser: password login; profile save/reload; history/support/billing/builder rendering;390px builder overflow check. Actual TOTP enrollment followed by profile exposed FE-003. Supplemental actual browser probes reproduced paid receipt fabrication, wrong cold billing state and custom-template Apply/reload loss. API tests independently covered invalid credentials/input, profile plan mass assignment, refresh/replay/logout, session ownership/revision, zero-inference tax/calculations/undo/redo/side question, template CRUD/ownership and premature generation refusal. Challenges came from the fresh fixture DB: external email delivery was not tested.

Confirmed incomplete/nonfunctional behaviors are not waived by successful navigation. The receipt Download is only alert(), custom template application loses its literal canvas, and profile MFA state is wrong. Actual provider checkout/refund/portal/webhook delivery, full email/password recovery delivery, broad upload/export/duplication/mobile/browser combinations and long network interruptions remain BLOCKED or UNTESTED as individually recorded in report14. Payment-method management intentionally uses the provider portal; its obsolete501wrappers are not an active card-entry form.

'''+featuretable(userfeatures)+'''
Persistence evidence is in runtime/integrated-tests.json, browser-tests.json and custom-template-reload.json. No claim is made that every listed handler was clicked or that every backend mutation passed: uncovered actions remain UNTESTED, which prevents production acceptance.
''')
put('05-ADMIN-FUNCTIONALITY.md','''# Admin functionality

The current navigation contains **91entries**, discovered directly from adminNavSections.tsx, across dashboard, users/guest/details, subscriptions, revenue, promotions/referrals/trials, packages/flags/routing, nine AI screens, generation/documents/templates, analytics, notifications, security/RBAC/audit, infrastructure/support/settings and other declared sections. These are not assumed to be91independent complete backend modules.

Actual Chromium navigated all91authenticated entries against actual admin API/PostgreSQL, with no response mocks and no uncaught page errors or failed HTTP recorded in those navigation checks. This proves render/read integration for that fixture only. Sensitive writes were separately tested through actual one-use2FA APIs: provider creation/persistence and user quota updates. Admin login used password plus a real persisted one-use code read only from the fixture database; actual email delivery remains unverified. The root/browser token injection for navigation means those91checks are not91browser login workflows.

Real admin→DB→Redis→Quota→user test changed daily quota3to2; exactly2of8signed concurrent reservation requests succeeded and6were denied. Zero limit was rejected422 according to the existing natural-number/-1schema. Regular user JWTs could not access AI config/users. Provider write optimistic version/payload validation is real. Broad paid-plan/AI assignment/cloud connectivity/credential mutation/browser permission variants remain separate test requirements; previous execution reports are not promoted to fresh proof.

Critical findings for admin scope: DB-001staff IDs can collide and overwrite under concurrent create; API-004subscription rows misstate currency/cadence; unavailability can render as empty data in some catch/allSettled views. Role/permission tests pass within the unit suite; a complete least-privilege staff/browser mutation matrix is still untested. Source sensitive configuration updates generally use live permissions and one-use2FA, while selected low-impact resolution actions use permission checks without MFA; this is a policy review item, not a universal assertion that every write requires MFA.

'''+table(['Navigation ID','Label','Source'],[(n['id'],n['label'],'admin/src/config/adminNavSections.tsx:'+str(n['line'])) for n in nav])+'\n## Interactive admin components\n\n'+featuretable(adminfeatures)+'''
[Feature inventory](evidence/feature-inventory.json) and [all interaction attributes](evidence/frontend-interactions.json) preserve review scope. Unexecuted CRUD, invalid-value, audit-log, cache propagation and dependent-user assertions remain explicit rather than inferred from screen existence.
''')
put('06-HARDCODED-DATA-AND-CONFIG.md','''# Hardcoded data and configuration

A new source scan recorded1572candidate occurrences by file/line/type without copying values. [hardcoded-inventory.json](evidence/hardcoded-inventory.json) distinguishes test-only fixtures, environment defaults, configurable model settings, intentional documentation constants and production defects; all candidates carry one of the requested categories plus an explicit provisional/manual verification status. This is not1572vulnerabilities. Every legitimate constant was preserved.

Confirmed defects include fixed2026-08-15/LKR990paid billing data and client-only demo tokens/identities/quota branches shipped in ordinary frontend code. Demo store functions have no discovered visible callsite and do not produce a valid backend JWT; no backend authorization bypass is claimed. Explicit routing/port constants in service registration and schemas are legitimate protocol definitions. localhost/default ports in os.getenv/process.env fallbacks and Swagger examples are deployment-sensitive defaults; scoped production configure.py overrides the actual service URLs. Supplied production frontend builds use relative/vetted API bases; dev preview builds point only to the owned native stack.

Legacy hardcoded Claude routing defaults still exist in services/admin-api/app/services/entitlements.py and shared legacy routing while enabled hybrid registry policies are admin-owned. They should be classified as compatibility fallback settings and tested when hybrid mode is disabled; not every model literal is a frontend selector or leaked provider identifier. Root development Compose still exposes loopback development ports and lacks full production caps. Use the dedicated production Compose and validate all actual external endpoints/CORS at staging.

The central template, config schema/runtime map and source loader names are authoritative documented deployment controls, not a place for production passwords. API/provider/DB/Redis/JWT material belongs in scoped restricted files; AI_CREDENTIAL_KEYRING_FILE stays separate and stable. New source/tree/history scans and compiled-asset checks found no confirmed committed backend secret after classifying hash/prose/synthetic/public-client matches; six private historical fixture/public identifier matches remained with the configured scan and273with default rules. No discovered values are copied into reports and no credential validity/revocation/rotation was attempted.

Actionable remediation is in CFG-001/FE-001/FE-005/API-001/API-002. Environment switching/domain/model/plan behavior requires actual staged tests, not blanket string replacement. Avoid replacing currency digits, signature TTLs, allowed MIME types, typed enums or security limits merely because they are constants.
''')
put('07-SECURITY-AUDIT.md','''# Security audit

Aligned with [OWASP ASVS5.0](https://asvs.owasp.org/downloads/) and [OWASP API Security2023](https://api-security.owasp.org/editions/2023/en/0x00-header/). This is a scoped engineering audit, not an ASVS certification, complete penetration test or legal determination. Essential unexecuted controls remain deployment blockers.

| Boundary | Verified evidence | Limits / findings |
|---|---|---|
| Password/access/refresh/logout | Actual registration/verification/profile/rotation/replay/logout plus auth unit tests | SEC-002same reset token succeeded twice; external email recovery untested |
| MFA/OAuth | Actual TOTP enrollment and profile UI check; four-state alternate callback handler probe | SEC-001alternate OAuth bypass is stubbed external transport, no live Google flow; FE-003UI state wrong |
| Admin RBAC | Regular JWT rejected401; live admin challenge/permissions;195admin tests | Staff create overwriteDB-001; full low-privilege mutation matrix untested |
| Ownership/BOLA | Actual other-user session403/custom-template404; stale revision409 | Not every object endpoint/mutation tested; no blanket cross-tenant safety claim |
| Service identity/replay | Real signed request200,replay409,body tamper401; Redis pause refusal503/recovery200 | Private-TLS/Docker/firewall enforcement remains blocked |
| Quotas | Actual3→2admin propagation;2/8durable reservations; user private increment denied | Positive real payment/webhook/refund chain blocked by approved credentials |
| AI keys/tools | AES-GCM purpose-bound encryption source; typed/evidenced MCP/SSRF allowlists; tests | No fresh local/cloud dispatch; real-model proposal failures remain |
| Files/rendering | Document ownership tests, upload/storage/contract unit suites;16actualdiagnostic PDFs | Production sandbox readiness503/render500; signed public URL/asset variants not exhausted |
| Secrets/dependencies | Fresh source scan0; default history273classified; production npm/Python audits clean | Pinned image scanner findings remain; final application layers not built |
| CI/SSH/Terraform | SHA-pinned actions, minimal permissions, digest allowlist, forced command, reviewed apply boundary | Hosted settings, GHCR/SSH/firewall/state controls not executed |

Receiver/caller/method/path/body/nonce checks live in shared/service-auth.mjs and shared/service_auth.py, not legacy X-Internal-Secret comments. Gateway strips untrusted identity headers; owning services verify live account/ownership. Signed queue envelopes bind producer/queue/job name/ID/data. Redis replay failures fail closed in tested cases. Typed tool proposals and document transactions prevent unrestricted arbitrary LLM database/code operations. SSRF inference transport validates/pins DNS addresses, HTTPS cloud allowlists and restricted local origins; this is source/test evidence, not a full external SSRF pentest.

Confirmed security/data-integrity blockers: alternate OAuth MFA path, reset-token race, concurrent staff overwrite, misleading financial records and canvas persistence loss. Browser bearer storage lacks Secure/HttpOnly protection (client-readable storage); this is an XSS/session architecture risk, not proof of an exploitable XSS or CSRF vulnerability. Data purge/export needs a complete retention inventory. SQL parameterization, path handling, upload types/sizes and output escaping have tests/source controls, but all variants were not fuzzed.

[Secret findings](evidence/secret-findings-redacted.json) omit raw values. Default full-history scan covered both available commits;258hashes,9framework prose,5synthetic fixture values and1public Firebase web identifier explain273matches. Private ignored credentials were not externally validated and cannot be assumed safe or active. No production keys were used or rotated. Current source secret scan, Git boundary and compiled-asset checks pass; these controls do not prove absence of every possible leak.

See [findings register](15-FINDINGS-REGISTER.md) for severity, root causes, reproduction and remediation. Security is FAIL for production because confirmed high risks and essential blocked verification remain.
''')
put('08-DATABASE-INTEGRITY.md',f'''# Database integrity and migrations

Actual fresh PostgreSQL18.4 has **{catalog['table_count']}public tables and {catalog['foreign_key_count']}declared foreign keys**. All declared constraints in the sampled fixture are validated. Current schema/index/column/ownership metadata is retained in [database-catalog.json](evidence/runtime/database-catalog.json). Four Prisma systems own auth/chat/payment/quota models; admin uses namespaced admin_* control tables plus version/AI ledgers; document SQLAlchemy owns documents/custom_templates; notification uses its own initializer. No conflicting namespace surfaced in fresh migration/startup/tests. This does not prove compatibility with an unsupplied legacy production database.

Real logical ownership joins found zero orphans for documents,custom_templates,chat_sessions,sessions,subscriptions against users. Eleven FKs across73tables do not prove every logical cross-service relationship is enforced: review deliberate soft-delete/retention semantics, shared-table read grants and failure recovery before adding constraints. Current test data is synthetic and small. Unique indexes cover email, refresh/reset tokens, webhook/invoice identities and durable operation keys. Chat session/user/archive/date indexes, tool execution ledger and quota-window primary keys are visible in schema evidence.

**DB-001is reproduced:** concurrent real admin repository creates choose one adm_001 and upsert over one account. **SEC-002is reproduced against real PostgreSQL:** two reset requests consume one logical token twice because the conditional check is outside the mutation transaction. Quota reservations fared better:2of8succeeded at a configured2limit using signed real service calls. Chat stale revisions and cross-user reads were rejected;96tax edits preserved totals/customer with0inference.

A verified official PostgreSQL18.4 source archive was built locally for pg_dump/pg_restore (no root installation). A real snapshot-consistent custom-format dump restored to a new disposable DB and matched **{restore['tables']}table content hashes, {restore['rows']}rows and {restore['constraints']}constraint definitions**. Dump{restore['dump_ms']}ms; restore{restore['restore_ms']}ms;{restore['dump_bytes']}bytes. The target DB was closed/dropped after comparison. Clients lacked TLS/compression features and used loopback only; this is not a productionPG17/TLS/PITR/off-server or full-host recovery drill. Initial cleanup-connection mistake was corrected and separately retained; no production database was accessed.

Pooling exists (admin ThreadedConnectionPool10 plus bounded semaphore; SQLAlchemy/Prisma/pg service pools). The sum of all pool settings must be budgeted against actual PG max_connections and container resources; no sustained pool-exhaustion test ran. List queries and broad admin repository scans are visible; not every query has a bounded/pagination/N+1 performance proof. Query plans on this small fixture cannot justify production index conclusions.

Production migration controller uses a non-superuser schema owner, separate administrative grant job, host flock, backups and durable schema epochs. Failed migrations block retries and no automatic schema reversal/DB restore occurs. Immutable/destructive SQL checks are safeguards, not semantic rollback proof. Actual container migration/backup/rollback/legacy migration remains BLOCKED; fresh native schema initialization and scoped-runtime tests do not substitute for that gate.
''')
put('09-MICROSERVICES-COMMUNICATION.md','''# Microservice communication

The current source edge inventory contains170URL/helper references; [shared service-permissions.json](../../shared/service-permissions.json) is the exact receiver/caller/method/path authorization policy. References are not170independent runtime connections. Public gateway aliases are normalized by upstreamPath, not blindly forwarded to guessed ports. Scoped configuration maps actual names/URLs; only edge publishes application ports in production. Native audit uses loopback HTTP and signed identities/ACLs, so private production TLS/network enforcement remains unverified.

Current helper serviceFetch/service_request signs receiver-bound60-second JWTs with independent pair keys and body/method/query/target bindings. Receivers validate keys/caller policy then claim a Redis nonce. Actual gateway→Auth internal token verification returned200; replay409; tampered body401. Freezing owned Redis produced503 rather than granting access; after resume200. Pausing all48known owned PostgreSQL descendants held the request until recovery (~3016ms) and then returned200; no result completed before resume. An initial postmaster-only pause did not suspend existing backend groups and is explicitly INCONCLUSIVE, not a claimed fail-open defect.

Signed BullMQ jobs bind queue/name/ID/data and delivery inboxes/idempotency keys support retries; payment and notification/provider tests use explicit mocks for many external branches. Actual quota admin→DB→cache→owning-service propagation and concurrent signed reservations were exercised. Background mail/provider delivery, real payment reconciliation, every queue retry/dead-letter path and long outages remain BLOCKED/UNTESTED.

HTTP helpers/proxies have bounded timeouts; gateway regular proxy budget is30seconds and SSE relay135seconds, so liveness may remain healthy while user requests wait. Not every integration has a circuit breaker. Synchronous policy/account/billing fan-out and global AI-admission transactions deserve measured contention/cascade testing, not removal of mandatory checks. The dependency graph includes control-plane cycles, but a graph cycle alone does not prove recursive HTTP calls; route-level traces determine that.

Actor/receiver/source references, authorization metadata and endpoint records are retained even where no runtime trace exists. Do not claim every internal request succeeds: Google callback routing already fails publicly, normal PDF readiness fails in this environment, and external credentials/private Docker TLS are missing. Service liveness, request identity, ownership, ledger idempotency and recovery are separate gates.
''')
put('10-AI-AND-DOCUMENT-WORKFLOWS.md','''# AI and document workflows

Current Chat routes run auth/entitlements/context/deterministic resolution before configured inference. MCP tools use typed schemas, literal evidence, ownership, revisions and constrained editor commands. Business arithmetic is backend logic shared with document validation. Real deterministic tax and side-question turns changed/preserved the expected fields with zero inference ledger delta; undo/redo, stale editor revision and custom-template CRUD were actually exercised.96edits at concurrency8preserved customer and totals. Current document suite104cases plus shared275cases cover taxes/discounts/line items/currency/date/schema behavior; these are source/unit/integration cases, not104live-model conversations.

The seven current exported tool schemas were compared structurally with the retained actual-inference schemas:all7match. Raw earlier actual provider outputs were independently regraded with Ajv:1.7B23/112passes,4B6/16passes. This evidence comes from actual retained model responses, not earlier narrative reports or mocked provider outputs. It is **historical real inference, revalidated now**, not fresh inference in this audit. The4Bsample is smaller and used different context/thread settings, so it is not a controlled ranking. Nested arguments/evidence/extra mutations/timeouts explain failures; safe rejection still fails the promised assistant capability.

Fresh model dispatch was deliberately BLOCKED: this shared host reached1691MiBavailable during testing and heavy swap use; conservative4GiBtest headroom was unavailable. Models/runtime exist from the earlier task, but file existence is not fresh inference evidence. No approved cloud credentials were supplied, so positive permitted fallback, actual cloud billing/cost and fresh free/paid inference remain blocked. Do not activate an unvalidated model or weaken schemas merely to improve a benchmark.

Document contracts calculate amounts server-side, validate required fields/types/dates/currencies/tax/discount consistency and require explicit finalization before PDF generation. Actual premature generation returned422; other-user template access404; session access403. Full async generate/worker/storage/share/download/retention recovery on production Docker remains unverified. Normal signed renderer readiness returned503and generation500;16diagnostic signed renders passed only using the explicit test-only unsandboxed launcher and correct PDF Redis ACL.

Actual UI defects are material: applied literal custom canvas vanishes after reload (FE-004), and profile/billing state can drift. Generic navigation success does not prove all visual edits/tools synchronize. Natural-language applied document creation/editing across every template and long reload histories needs a capable approved model and complete real-service/browser acceptance before production.

Evidence: [tool comparison](evidence/current-tool-schema-comparison.json), [prior1.7B regrade](evidence/prior-1.7b-revalidated.json), [prior4B regrade](evidence/prior-4b-revalidated.json), [integrated tests](evidence/runtime/integrated-tests.json), [custom reload](evidence/runtime/custom-template-reload.json), [renderer](evidence/runtime/normal-pdf-readiness.json).
''')
rt=resources['hardware'];p=work['nearest_rank_ms']
put('11-PERFORMANCE-AND-SCALABILITY.md',f'''# Performance and scalability

Tested hardware: {rt['cpu']}, {rt['logical_cpus']}logical CPUs, {rt['ram_mib']}MiB usable RAM, Linux{x if False else ''}. Shared desktop workload is present; this is not a dedicated VPS. Fresh14-service native stack (10backends,2Vite preview frontends,PostgreSQL18.4,Redis) was sampled{resources['samples']}times every2seconds. Simultaneous application-tree peak PSS was{resources['simultaneous_peak_pss_mib']}MiB; minimum host available memory{resources['minimum_host_available_mib']}MiB; minimum workspace disk{resources['minimum_workspace_disk_gib']}GiB. Browser clients/build/test processes and diagnostic PDF child are outside those application roots. Do not sum per-process RSS/shared PostgreSQL pages or claim this covers local inference/cgroups/production nginx/Caddy.

Actual gateway workload:8users,96deterministic tax updates at concurrency8;96/96pass;0inference calls;4.614seconds total burst. Nearest-rank p50={p['p50']}ms,p95={p['p95']}ms,p99={p['p99']}ms. Original helper upper-median/truncated-percentile fields345/568remain in raw evidence; nearest-rank fields are the explicit comparable definition. Burst throughput is~20.8requests/sec for this workload, **not sustainable mixed production capacity**. Quota admission8requests yielded2success/6denials at limit2. Two-client diagnostic PDF16/16passed; no production sandbox/container latency claim is made.

Earlier actual model latency/accuracy outputs are separately revalidated in report10:1.7Bp9540477ms and4Bbounded samplep9590092ms. Fresh model/mixed inference benchmarks are blocked by safe headroom. Observed source risks include repeated synchronous policy/account calls, global AI advisory-lock serialization/queue polling, unbudgeted aggregate DB pools, and large frontend bundles. Actual build outputs/assets and [bundle inventory](evidence/bundles.json) record sizes; no Lighthouse/WebVitals/mobile device or cross-browser loading performance certification exists.

Disk-free and process I/O counters are sampled, not a disk latency/network throughput benchmark. Sustained logins+generation+LLM+admin updates, backend/Redis/DB contention, container startup timing and hard-limit/OOM enforcement were not measured on a VPS. A4vCPU/16GiBamd64host is only a staging candidate; no lowest-cost plan or8GBsufficiency is proven. Choose a provider/region and agreed p95/p99/error/quality/recovery targets, then benchmark full containers and compare pricing before purchase.

'''+table(['Process group','Peak PSS MiB','Peak sampled CPU% (100=one core)'],[(n,v['max_pss_mib'],v['max_cpu_percent']) for n,v in resources['group_peaks'].items()]))
put('12-DEVOPS-AND-DEPLOYMENT.md','''# Docker, Terraform and CI/CD

Current production files were inspected directly: three Dockerfiles, a Compose configuration with 21 entries, Caddy with internal TLS verification, scoped configuration generation, restricted deployment/backup/migration/grant/readiness jobs, four GitHub workflows and provider-neutral Terraform. Application runtimes are non-root. Infrastructure users and narrowly granted edge capabilities still need container acceptance. Only edge publishes ports 80/443; database, Redis, Ollama and metrics ports remain private in the configuration. Selected identity/TLS/key mounts and scoped environment files avoid mounting master credentials. Existing environment-only loaders still expose scoped credentials to their owning process and Docker administrators. The AI keyring is separate, persistent and never rotated automatically.

Fresh actionlint, Terraform formatting/validation, Compose syntax, Git boundaries, compiled-asset checks and 29 deployment-policy tests passed. Application builds and both frontend lint checks passed. No Docker daemon is available: final image builds/layers, network isolation, resource limits, volume ownership, startup/restarts, secure Chromium sandbox and real migration/rollback remain BLOCKED. Fake-executor rollback tests are not a deployment recovery drill. The native PostgreSQL 18.4 restore does not validate the production PostgreSQL 17 container backup pipeline.

PR/manual workflows validate without production deployment credentials. Master pushes and approved reachable vX.Y.Z tags run validation, build, scanning and publication of 13 named immutable GHCR images with SBOM/provenance and a complete digest manifest. The protected deployment job requires both a repository enable variable and a root-owned VPS marker. Actions are pinned to immutable SHAs; default permissions are read-only, with package write restricted to publication. Verified SSH host keys, a non-root forced-command identity, manifest/digest allowlists, a host flock and non-cancelling deployment concurrency protect rollout. Routine application deployment never runs Terraform.

Pre-migration dumps, archive checks, a non-superuser schema owner, a separate grant identity, durable schema epochs and a failed-migration marker prevent unsafe automatic retries/downgrades. Application rollback requires the same schema epoch and identical configuration, avoiding restoration of revoked credentials or endpoint allowlists. No automatic database reversal/restore or zero-downtime claim is made.

Actual branch/tag/environment protection, GHCR authorization, SSH host keys, firewall enforcement, remote-state encryption/locking and host monitoring installation are not verified. Terraform currently defines a contract, not an actual server or state backend. Earlier same-day remote scanner artifacts were independently matched to unchanged image digests: six upstream images report HIGH/CRITICAL advisories; the Ollama scan was blocked by its bound. Final application layers remain unbuilt. Keep the security gates enabled.

See [scan crosscheck](evidence/upstream-scan-crosscheck.json), [validation](evidence/validation-summary.json) and the [operator setup guide](../devops/10-PRODUCTION-SETUP-GUIDE.md). No production infrastructure or GitHub settings were modified.
''')
put('13-OPERATIONS-AND-RECOVERY.md',f'''# Operations, monitoring and disaster recovery

Current source implements structured request IDs, log sanitizers, private health/readiness/AI usage/audit APIs and bounded Docker logs. The gateway logs paths rather than query strings; shared safe logging strips queries and redacts credentials/bodies. Caddy omits request headers and URI. A root-owned timer writes CPU, RAM, disk, container and version snapshots once per minute. These controls do not establish external alert delivery, distributed tracing, SLO ownership or host-failure detection. Exhaustive provider-error and PII log testing remains incomplete.

A real non-destructive database restore was executed. Clients built from a checksum-verified official PostgreSQL 18.4 source archive dumped a consistent snapshot and restored a new owned database. All {restore['tables']} table-content hashes, {restore['rows']} rows and {restore['constraints']} constraint definitions matched. Dump time was {restore['dump_ms']} ms; restore time was {restore['restore_ms']} ms; archive size was {restore['dump_bytes']} bytes. The restored database was closed and dropped. This synthetic loopback test does not verify production PostgreSQL 17/TLS containers, legacy data, encryption-key recovery, off-server storage, PITR or complete VPS recovery. An initial test connection-cleanup error was corrected and retained separately.

OPS-001 remains a confirmed gap: backups are local deployment-time archives, with no implemented scheduled encrypted off-server export or backup retention. Model/assets/configuration/service identities and the AI keyring also need coordinated backup and recovery. Loss of the VPS can destroy both data and local backups. OPS-002 records that local JSON alerts cannot notify an operator when the host is unavailable.

**Proposed objectives, pending operator acceptance:** database and document assets RPO at most one hour; complete VPS/application RTO at most four hours; configuration/key backup immediately after authorized changes. These are not achieved or measured operating commitments. Hourly consistent encrypted database/assets backups plus separate restricted secret/configuration backups are a low-cost candidate. Tighter RPO requires reviewed WAL/PITR or equivalent infrastructure.

Recovery ordering should be: approved host/firewall/runtime; original keyrings and identities; consistent database/assets restore; compatible image digests/configuration; scoped grants and readiness; authorized traffic. Never generate a replacement AI keyring for existing ciphertext or restore a database automatically because application health fails. Actual container rollback and complete host recovery remain blocked.

The incident runbook must cover deployment hold, diagnostic preservation, schema-epoch/pending-migration review, credential exposure assessment, approved compatible image restoration, ownership/billing/quota/PDF/AI checks and explicit operator authorization to resume. Disk monitoring must cover Docker, models and backup filesystems, not only the deployment-state mount. Only owned synthetic fixtures were paused, resumed and stopped in this audit; production credentials were not rotated or revoked.
''')
# Test matrix includes executed checks and every interaction-component's unexecuted variants.
matrix=[]
for row in runtime:matrix.append({**row,'evidence':'runtime/integrated-tests.json'})
for row in browser['checks']:matrix.append({**row,'evidence':'runtime/browser-tests.json'})
for id,file,feature in [('BROWSER-SUP-01','runtime/billing-receipt.json','Paid receipt and cold billing state'),('BROWSER-SUP-02','runtime/custom-template-reload.json','Applied custom canvas reload')]:
 row=load(file);matrix.append({'id':id,'feature':feature,'preconditions':row.get('scope'),'steps':row.get('expected',feature),'expected':'Authoritative persisted financial/document state renders correctly','actual':row,'status':'FAIL' if row['status']=='DEFECT_REPRODUCED' else row['status'],'evidence':file,'source_files':['user-frontend/src/pages/dashboard/DashboardBillingPage.tsx' if 'billing' in file else 'user-frontend/src/store/documentStore.ts']})
for f in features:
 matrix.append({'id':f['id']+'-ALL-VARIANTS','feature':f['component'],'preconditions':'Need dedicated isolated fixtures/permissions/data for every action','steps':f['required_test_variants'],'expected':'All listed action variants validated against real backend/persistence/UI','actual':'Not fully executed; source bindings and navigation are weaker evidence','status':'UNTESTED','evidence':'feature-inventory.json','source_files':[f['component']]})
for id,feature,why in [('BLOCK-01','Real provider checkout/webhook/refund/portal','Approved payment testcredentials unavailable'),('BLOCK-02','External email/reset/2FA delivery','Approved verified sender/providercredential unavailable'),('BLOCK-03','Fresh local/cloud inference and mixed workload','Conservative local memory headroom /approvedcloudcredentials unavailable'),('BLOCK-04','Full Docker deployment,rollback,limits/sandbox','Dockerdaemon unavailable'),('BLOCK-05','Actual Terraform/VPS/SSH/GHCR/branchsettings','Operatorprovider/infrastructureauthorization/setup unavailable'),('BLOCK-06','Full-host off-server encrypted restore/PITR','Backupinfrastructure/keyarchive/restorehost unavailable'),('UNTESTED-01','Firefox/WebKit/realdevicecompatibility','Not executed; Chromium390px check is insufficient'),('UNTESTED-02','Every upload/export/share/delete/duplicate/support failure path','Not executed; requires complete action-level fixtures/assertions')]:matrix.append({'id':id,'feature':feature,'preconditions':why,'steps':'Provision isolated prerequisites;execute named workflow','expected':'Real integration verified','actual':why,'status':'BLOCKED' if id.startswith('BLOCK') else 'UNTESTED','evidence':'validation-summary.json','source_files':[]})
(E/'end-to-end-matrix.json').write_text(json.dumps(matrix,indent=2)+'\n')
put('14-END-TO-END-TEST-RESULTS.md','''# End-to-end test results

The matrix distinguishes actual runtime/browser/database probes from unit fixtures, mocked transports and source-only inventory. Fresh regression execution passed 1,073 unique test cases: 1,084 executions minus 11 overlapping gateway cases. These tests retain their original mock/fixture scope. The 26 integrated HTTP checks produced 24 passes and two reproduced OAuth routing failures. The 99 main Chromium checks produced 98 navigation/basic-flow passes and one profile MFA failure. Supplementary browser probes independently reproduced billing and custom-template persistence defects. Navigation success is not complete action coverage.

Actual standalone probes covered reset-token double use, the isolated SQLite staff-ID collision, the four-state OAuth handler with stubbed Google/database transport, quota propagation and concurrency, signed replay/body tampering, controlled Redis/PostgreSQL pause and recovery, 96 document updates, 16 diagnostic PDFs and a real database snapshot restore. Each has JSON evidence.

Initial rate-limit, assertion, cleanup and Redis-ACL test-configuration trials are retained separately. They are not silently promoted to passes or misclassified as application defects. In particular, the first PDF diagnostic used the Document Redis identity for a PDF receiver; the receiver correctly denied incompatible nonce permissions. A rerun with the PDF identity passed without changing application code.

Each interactive component has an additional UNTESTED all-variants row even if its page rendered. Not all 812 extracted handlers were clicked. Missing infrastructure or approved credentials are BLOCKED; simply unexecuted action/browser variants remain UNTESTED. Passing unit cases cannot establish complete email/payment/cloud/Docker/recovery coverage.

'''+table(['Test ID','Feature','Preconditions','Steps','Expected','Actual','Status','Evidence / sources'],[(r['id'],r['feature'],r.get('preconditions',''),r.get('steps',''),r.get('expected',''),json.dumps(r.get('actual'),ensure_ascii=False)[:400],r['status'],r.get('evidence','')+'; '+','.join(r.get('source_files',r.get('related_source_files',[])))) for r in matrix])+'''
Full untruncated fields are in [end-to-end-matrix.json](evidence/end-to-end-matrix.json). Chromium used actual isolated APIs and synthetic accounts with a test-only sandbox exception; production renderer settings were preserved. No production deployment, real charge, external credential test or key rotation occurred.
''')
register='''# Central findings register

Severity describes impact; classification distinguishes confirmed defects,potential risks and blocked verification. Scanner CRITICAL ratings are retained in raw scan metadata,not represented as proven compromise. No confirmed external compromise is claimed. No application remediation was performed during this audit.

'''+table(['ID','Severity','Component','Classification','Description','Verification'],[(f['id'],f['severity'],f['component'],f['classification'],f['description'],f['verification_status']) for f in findings])
for f in findings:
 register+='\n## '+f['id']+' — '+f['description']+'\n\n'+f"**{f['severity']} / {f['classification']}** — {f['component']}\n\nRoot cause: {f['root_cause']}\n\nEvidence: "+', '.join(ref(x) for x in f['evidence'])+'\n\nReproduction: '+' → '.join(f['reproduction_steps'])+f"\n\nBusiness impact: {f['business_impact']}\n\nSecurity impact: {f['security_impact']}\n\nRecommended fix: {f['recommended_fix']}\n\nEstimated effort: {f['estimated_effort']} (engineering estimate; excludes operator/provider lead time).\n\nVerification status: {f['verification_status']}\n"
register+='''
## Prioritized remediation plan

1. **Authentication and account integrity:** fix SEC-001 and SEC-002; replace DB-001 ID allocation/upsert creation. Do not expose the corrected OAuth paths until the shared MFA/account checks pass. Then repair API-001 and FE-002 as one end-to-end OAuth change.
2. **Customer data and financial correctness:** persist literal custom canvases; preserve profile MFA state; replace fabricated receipts with authoritative billing data; fetch billing policy on entry; correct subscription currency/cadence and implement secure refresh recovery.
3. **Deployment and recovery gates:** triage/fix base images, build and scan final targets, verify secure PDF/TLS/network/resource enforcement, run real migrations and rollback, and implement encrypted off-server backups with a full-host restore drill.
4. **AI capability:** approve a capable model, rerun the unchanged real corpus and applied browser conversations, and verify permitted cloud fallback and budgets using approved test credentials.
5. **Remaining coverage and operations:** execute all feature mutation/negative/permission variants, resolve privacy retention/export requirements, verify external alerts and perform full mixed VPS benchmarks plus provider-specific infrastructure and CI/CD acceptance.

Each remediation needs a reproducer that fails before and passes after, focused regression and actual owning-service/browser verification. Infrastructure and credential changes require operator authorization. Keep deployment disabled until the scorecard gates pass.
'''
put('15-FINDINGS-REGISTER.md',register)
score=[
('System architecture','BLOCKED','Source and native topology inventoried; private TLS/VPS enforcement unverified'),
('API endpoint integrity','FAIL','OAuth/security/error/financial contract defects; authorized coverage incomplete'),
('Frontend integration','FAIL','MFA/canvas/billing/OAuth defects; four unused undeclared wrappers'),
('User functionality','FAIL','Actual persistence, security-state and financial-display defects'),
('Admin functionality','FAIL','Staff creation overwrite and financial mapping; mutation coverage incomplete'),
('Security','FAIL','Confirmed alternate MFA path, reset-token reuse and account-integrity risks'),
('Database integrity','FAIL','Staff-ID collision and reset race; selected constraints/quotas/restore pass'),
('Microservices communication','BLOCKED','Selected signing/replay/outage chains pass; all TLS/queue/provider paths unverified'),
('AI chatbot','FAIL','Retained actual proposal accuracy 23/112 and 6/16; fresh inference blocked'),
('Document generation','FAIL','Custom canvas reload loss; normal production sandbox not verified'),
('Performance','BLOCKED','Short native burst; no sustained mixed VPS/cgroup measurement'),
('Docker deployment','BLOCKED','No daemon; image/runtime/network/limits/restart/rollback unverified'),
('Terraform infrastructure','BLOCKED','Validated provider-neutral contract only; no provider/state acceptance'),
('CI/CD','BLOCKED','Syntax and policies pass; hosted Actions/GHCR/SSH/protections unverified'),
('Monitoring','FAIL','Local snapshots/logs exist; external failure alerts not implemented/verified'),
('Backup and recovery','FAIL','Native database restore passes; scheduled encrypted off-server/full-host recovery missing')]
(E/'scorecard.json').write_text(json.dumps({'recommendation':'NO-GO','categories':[{'category':c,'status':s,'reason':r} for c,s,r in score]},indent=2)+'\n')
put('16-PRODUCTION-READINESS-SCORECARD.md','''# Production readiness scorecard — NO-GO

**NO-GO.** Confirmed high-impact authentication, account/document integrity and financial-display defects remain. Essential Docker, provider, recovery and complete feature-variant verification is blocked or untested. No production infrastructure or credentials were changed.

'''+table(['Category','Status','Evidence / reason'],score)+'''
A category does not receive PASS because one unit test, liveness request or navigation check passed. Real quota concurrency, signing/replay/body binding, selected ownership checks, deterministic editing, profile persistence and the native database restore work in the tested scope. Those observations do not clear independent defects or unexecuted branches.

Launch requires the prioritized plan in report 15, actual final-image/deployment/recovery evidence, capable approved AI, complete action-level coverage and accepted operating SLOs. No 8 GB minimum, zero-downtime, high-availability or complete OWASP-compliance claim is supported. Operator authorization remains required before production activation.
''')
links='\n'.join(f'- [{name}](docs/production-audit/{name})' for name in [p.name for p in sorted(BASE.glob('[0-9][0-9]-*.md'))])
master=f'''# DocCraft AI production readiness audit

**Decision: NO-GO — 2026-10-21.** The audit inspected the current working tree and exercised a fresh isolated native stack, real browser/API/database flows and regression tests. Application and deployment source remained unchanged from the audit snapshot. Only audit tools, reports and owned synthetic fixtures were created. No production deployment, infrastructure change, real payment, credential rotation or history rewrite occurred.

## Executive summary and coverage

The current production Compose contains 21 entries: 12 application containers (10 backend runtimes and two frontends), PostgreSQL/Redis/Caddy, optional Ollama and five one-shot jobs. The [architecture report](docs/production-audit/01-SYSTEM-ARCHITECTURE.md) includes the diagram and per-service source, startup/build commands, ports, configuration/secrets, health, authentication, dependencies, storage and resource caps. Counts were recomputed from current files.

AST and mount discovery found **351 explicit method/route pairs**, 12 FastAPI framework routes, 15 gateway wildcard proxy groups and separately identified plugin surfaces. This is not 351 proven business workflows. All 351 explicit paths received actual unauthenticated probes. Auth metrics/OAuth initiation and Swagger-generated surfaces are identified separately; implicit HEAD/OPTIONS and arbitrary static-asset filenames are not counted as independent business APIs. The [API inventory](docs/production-audit/02-COMPLETE-API-INVENTORY.md) links handlers, sources, authentication/authorization, validation, dependencies and exact verification limits.

Frontend discovery recorded **228 transport/wrapper callsites**: 216 declaration matches, eight dynamic transports and four unused legacy paths without matching endpoints. The inventory contains 812 interaction attributes grouped into 74 interactive components and 91 current admin navigation entries. These are distinct counting units. The [mapping report](docs/production-audit/03-FRONTEND-API-INTEGRATION.md) does not equate a declaration match with functional integration. Every uncovered action variant remains UNTESTED.

Fresh regression passed **1,073 unique cases**: 1,084 executions minus 11 overlapping gateway cases. These retain their original mock/fixture scope. Actual integrated HTTP checks yielded 24 passes and two OAuth routing failures out of 26. The main Chromium suite yielded 98 navigation/basic-flow passes and one MFA display failure out of 99 checks. Supplemental real browser probes reproduced custom-template reload loss, fabricated paid receipts and incorrect cold billing state. [Report 14](docs/production-audit/14-END-TO-END-TEST-RESULTS.md) distinguishes navigation, mutation/persistence, mocked unit tests, negative checks, blocked tests and unexecuted variants.

## Confirmed production blockers

- **Alternate OAuth authentication policy:** the callback signs sessions without the main MFA/account-state checks. The actual handler reproduced four states using explicitly stubbed Google/database transport. Correct the policy before exposing the currently mismatched gateway callback paths. SEC-001, API-001 and FE-002 are one dependent remediation sequence.
- **Password-reset race:** two simultaneous requests using the same reset token both returned success and changed the password through the actual gateway, Auth Service and PostgreSQL. See SEC-002 and [runtime evidence](docs/production-audit/evidence/runtime/password-reset-race.json).
- **Concurrent staff overwrite:** two actual repository creates selected one staff ID and retained one account in a fresh SQLite fixture. The PostgreSQL upsert path also requires acceptance testing. See DB-001 and [race evidence](docs/production-audit/evidence/admin-create-race.json).
- **Document and security UI integrity:** a saved literal canvas appeared after Apply and disappeared after same-session reload; profile normalization hid an enabled MFA state. See FE-004/FE-003 and their real browser evidence.
- **Financial correctness:** a synthetic pro account with zero billing invoices displayed a fixed paid receipt after in-app navigation; its cold billing view initially showed FREE. The receipt Download only invokes an alert. Subscription rows also hardcode USD/monthly amounts rather than actual currency/cadence. See FE-001/FE-005/API-004.
- **AI accuracy:** retained actual model responses independently regraded against current unchanged tool schemas passed only 23/112 cases for 1.7B and 6/16 for the bounded 4B sample. Fresh inference was blocked by conservative shared-host memory headroom and missing approved cloud credentials. Historical real inference is not presented as new inference.
- **Deployment and recovery:** upstream image advisories, unbuilt final images, unverified secure PDF/Docker/TLS/resource/rollback behavior, and missing scheduled encrypted off-server backups/full-host recovery remain launch blockers.

The [27-finding register](docs/production-audit/15-FINDINGS-REGISTER.md) distinguishes 17 confirmed defects, four potential risks and six blocked verification areas. Each entry has severity, root cause, evidence, reproduction, impact, recommended fix, estimated effort and verification status. Scanner CRITICAL ratings are not represented as proof of a compromise. The register includes untested failure branches rather than labeling them functional.

## Verified positive controls

An actual admin quota update propagated from three to two through database/cache/Quota Service. Exactly two of eight concurrent signed reservations succeeded; six were denied. Selected other-user conversation/template reads returned 403/404; a stale editor revision returned 409. A real signed internal call succeeded, replay returned 409 and body tampering returned 401. Redis pause produced 503 followed by 200 after recovery. A PostgreSQL pause held the request until recovery rather than returning data during the pause. See [control and failure evidence](docs/production-audit/evidence/runtime).

The eight-user deterministic edit burst completed 96/96 updates with correct totals/customer preservation and zero inference calls. Nearest-rank p50/p95/p99 were **{p['p50']}/{p['p95']}/{p['p99']} ms**. This short native burst is not sustainable mixed VPS throughput. Sixteen diagnostic signed PDFs passed only with an explicit test-only unsandboxed launcher; normal signed readiness/rendering failed in this environment. Production sandbox acceptance remains required.

A real snapshot dump restored {restore['tables']} tables, {restore['rows']} rows and {restore['constraints']} constraint definitions with matching content/schema hashes. Dump took {restore['dump_ms']} ms and restore {restore['restore_ms']} ms for this small synthetic dataset. The restored database was dropped after verification. This is native PostgreSQL 18.4 over loopback, not production PostgreSQL 17/TLS, off-server/PITR, legacy-data or complete VPS recovery. All five checked logical-owner joins had zero orphans; this does not establish integrity of unsupplied production data.

Both frontends lint/build and all backend builds passed. Actionlint, Terraform formatting/validation, Compose syntax and 29 deployment-policy tests passed. Source/compiled-secret checks and current production npm/Python audits passed. Default available Git-history scanning produced 273 classified hash/prose/synthetic/public-client matches; no committed backend credential was confirmed. External credential validity was not checked. Final application container layers remain unbuilt/unscanned. [Validation summary](docs/production-audit/evidence/validation-summary.json) records scope and execution-log hashes.

## Explicit readiness answers

| Question | Evidence-based answer |
|---|---|
| Are all frontend API calls connected? | No blanket pass: 216 source matches, eight dynamic transports and four unused undeclared wrappers; payload/state/OAuth defects remain. |
| Which endpoints are missing, broken, insecure or unused? | OAuth public routing and alternate callback/reset policy are defective; four legacy wrappers have no declared endpoint; payment-method mutations intentionally return 501; analytics error and financial-response contracts need repair. Report 02 retains verification status for every declared path. |
| Are user/admin features complete? | No. Actual canvas, MFA and billing defects exist, alongside the staff race and unexecuted action/provider variants. |
| Are hardcoded values, credentials or mocks present? | Fixed paid receipts and client demo branches are production code. The redacted configuration inventory distinguishes constants/defaults/test data; 1,572 candidates are not 1,572 vulnerabilities. No committed backend credential was confirmed in the available history. |
| Can users access another user's data? | Tested conversation/template cases were denied. All object/mutation paths were not exhausted; no observed leak is not a universal isolation guarantee. No separate organization-tenant model was identified; tested ownership is user-based. |
| Can regular users access admin functionality? | Tested regular JWTs were rejected and live RBAC/source controls were reviewed; every permission combination remains untested. |
| Are subscription quotas and billing secure against bypass? | Actual quota concurrency/propagation held. Real provider checkout/webhook/refund/reconciliation is blocked and financial display defects remain. |
| Can the chatbot reliably create/edit documents? | No. Candidate real-model proposal accuracy fails. Deterministic edits work but do not establish the full conversational capability. |
| Can microservices communicate securely? | Selected actual signing/replay/ACL chains work. All private TLS, network, queue and provider failure paths are not verified. |
| Can one VPS handle concurrent users? | The short native eight-client burst works. Full mixed sustained VPS/cgroup capacity was not measured; no 8 GB certification or lowest-cost plan is proven. |
| Are Docker, Terraform and Actions ready? | Source safeguards/syntax pass. Actual builds/runtime, provider/state, GHCR/SSH/protected settings and rollback remain essential unverified gates. |
| Are backups, monitoring and recovery sufficient? | No. A native DB restore passes, but scheduled encrypted off-server/key/asset recovery, external failure alerts and full-host restoration remain missing/unverified. |
| What must be fixed before launch? | Authentication/races; customer document/security/financial correctness; fixed images and secure deployment/rollback/recovery; capable AI; full action/provider coverage and measured operating SLOs. |

## Remediation order, capacity and operations

The [prioritized remediation plan](docs/production-audit/15-FINDINGS-REGISTER.md) starts with authentication/account integrity. Do not repair the public OAuth route in isolation before the callback's weaker policy is fixed. Then address document persistence and financial/security state, close Docker/image/recovery gates, approve capable AI and complete action-level/provider verification. Each fix needs its failing reproducer, regression and actual owning-service/browser acceptance.

Keep both production enable gates disabled. Proposed RPO at most one hour and RTO at most four hours are not achieved commitments; operator acceptance and complete recovery drills are required. A four-vCPU/16-GiB amd64 machine is only a staging benchmark candidate. Shared-host measurements do not establish a production minimum, provider price, zero-downtime deployment or high availability.

## Detailed reports

{links}

Provenance and coverage: [source snapshot](docs/production-audit/evidence/source-snapshot.json), [API records](docs/production-audit/evidence/api-inventory.json), [frontend mapping](docs/production-audit/evidence/frontend-api-map.json), [feature matrix](docs/production-audit/evidence/end-to-end-matrix.json), [scorecard](docs/production-audit/16-PRODUCTION-READINESS-SCORECARD.md). AST/pattern enumeration is not line-by-line semantic or runtime proof. Unexecuted tests remain UNTESTED; only genuine missing prerequisites are BLOCKED. The overall production recommendation is NO-GO.
'''
(ROOT/'DOC_CRAFT_PRODUCTION_READINESS_AUDIT.md').write_text(master.strip()+'\n')
print('Rendered16detailedreports,master,serviceinventory,testmatrixandscorecard')

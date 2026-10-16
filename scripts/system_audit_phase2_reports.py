"""Append evidence-based Phase 2 documentation while preserving Phase 1 verbatim."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/system-audit'
OUT = DOC / 'evidence/phase2'


def read(name, default=None):
    path = OUT / name
    return json.loads(path.read_text()) if path.exists() else default


def cell(value):
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False)
    return value.replace('|', '\\|').replace('\n', ' ').replace('\r', '')


def table(headers, rows):
    return '\n'.join(['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join('---' for _ in headers) + ' |', *['| ' + ' | '.join(cell(c) for c in row) + ' |' for row in rows]]) + '\n'


# Dispositions are scoped to source defects and the observed isolated environment.
FINDINGS = [
 ('U-R01','High','Admin / Payment / Quota databases','Incompatible physical plans, coupons and audit_logs ownership','Namespaced admin tables and quota audit table; additive legacy-copy compatibility; reconciled checked-in migrations','Fresh PostgreSQL migrate deploy for four Prisma services; 97 admin tests include legacy-copy cases','FIXED'),
 ('U-R02','High','Pricing / checkout / billing','Static prices and USD values treated as LKR; benefits and actual limits diverged','Admin chooses USD/LKR and explicit amounts; canonical catalog and currency-compatible provider; annual checkout intent and live quota updates','Real admin price UI → PostgreSQL → user pricing reload; signed local annual PayHere lifecycle. Provider sandbox and mixed-currency financial reporting remain open','UNRESOLVED — partial correction'),
 ('U-R03','High','Active Groq model routing','Unused Claude ceiling did not constrain active Groq fallback','Intersect deployment Groq models with per-plan administrator allowlist; fail closed on policy outage; five-second refresh','Three policy units, provider-loop regressions and builds; actual external model behavior remains BLOCKED','FIXED'),
 ('U-R04','High','Entitlements / user gates','Plan features and separate feature_flags domain do not consistently control logo, templates, priority, retention or Max behavior','Canonical displayed benefits improved; implement an authoritative entitlement response and connect each remaining consumer','Source traces only for unresolved gates; complete toggle matrix NOT TESTED','UNRESOLVED'),
 ('U-R05','High','Payment method management','Process-memory metadata imitated payment method persistence','Remove raw card CRUD UI/store; provider-hosted billing portal; unsupported raw-card mutations return 501','Payment unit regressions, frontend contracts/build; provider-hosted portal remains externally BLOCKED','FIXED — unsafe local flow removed'),
 ('U-R06','High','Templates / announcements','Placeholder publication modules; no user announcement consumer','Authenticated announcements now reach user banner; empty/error states replace fake template publishing success. Publication pipeline still absent','Actual create/read/disable/delete announcement APIs and user feed verified; template publication NOT IMPLEMENTED','UNRESOLVED — partial correction'),
 ('U-R07','High','Payment webhook worker','Check/effect/mark spans services; no atomic claim/outbox or ordered reconciliation','Fix callback ownership, recurring IDs, BullMQ IDs and invoice retry behavior; design transactional outbox/order reconciliation separately','Eight concurrent signed local duplicates yield one invoice; worker crash windows, reordered callbacks and real sandbox remain unverified','UNRESOLVED — partial correction'),
 ('U-R08','High','Quota / document worker','Mixed metering wording, unowned/non-idempotent refunds and incomplete crash recovery','User chose AI requests plus server generations; explicit wording; owned reservation/refund receipts; preserve successful PDF jobs and refund terminal failure once','Real Redis 12-way duplicate reserve/refund tests; quota units; five actual worker exports. Cross-store crash/day-reset reconciliation and browser export metering remain open','UNRESOLVED — partial correction'),
 ('U-R09','Medium','Both frontends','Unsafe any contracts, invalid effects/ref reads, unused code and purity violations','Explicit API/domain types; committed event callbacks, effect dependencies, ref/state ownership and keyed forms; no rule suppression or exclusion changes','Both npm run lint commands and both frontend builds PASS','FIXED'),
 ('U-R10','High','Deployment credentials','Formerly embedded defaults may remain active in history/deployments','Owner must revoke/rotate any affected database/provider/signing/internal/bootstrap credentials and verify consistent secret delivery','No production credential validity or revocation attempted; proof is unavailable locally','BLOCKED'),
 ('U-R11','Medium','Guest / canvas / history','Guest identity transition resets builder; server state, canvas layout and browser PDF/history have distinct persistence contracts','Wire actual chat-session history open/delete and display accurate state/currency; persistent canvas layout and guest migration still require implementation','Actual authenticated session save/reload/delete and server PDF verified; guest-to-account transfer and browser layout/export reload NOT TESTED / NOT IMPLEMENTED','UNRESOLVED — partial correction'),
 ('U-R12','High','Analytics / admin authentication / abuse','Direct analytics authorization gaps; OTP attempts and submission abuse insufficiently controlled','Protect direct reporting/events with internal secret or Auth verification; atomically limit/consume admin email challenges; secure private notification config feed','Analytics authorization units, admin challenge/concurrency tests and 123 API denial probes. Public support abuse, action-TOTP budgets and full session revocation remain open','UNRESOLVED — partial correction'),
 ('U-R13','Medium','Readiness / capacity / recovery','Liveness-only checks; repeated Chromium startup and unknown dependency capacity','Shared bounded Chromium process, page/launch timeouts, readiness and explicit overload response; measure narrow local burst/restart behavior','Five queued PDFs plus renderer capacity/recovery probe when recorded; service-wide dependency readiness, capacity and queue-drain benchmarks NOT TESTED','UNRESOLVED — partial correction'),
 ('U-R14','Medium','Configuration / migrations / test tooling','Chat port drift, missing Prisma migrations and unsafe stale document test entry point','Correct chat fallback port; add schema-compatible checked-in migrations; isolated local harness; legacy document entry point now launches isolated pytest','Four actual Prisma migrate deploy runs, all local services start, document legacy entry point 69 tests PASS. Existing deployment baselines still require review','FIXED — local tooling/schema scope'),
 ('U-R15','Medium','Admin MCP inspection','Wrong auth/transport lifecycle and no live resource inspection consumer','Private credential-gated read-only Streamable HTTP MCP, initialize/initialized/resources-read lifecycle, audited support RBAC endpoint and actual admin inspection UI','Five real resource reads, two private transport authorization units and live browser session inspection','FIXED'),
]

NEW = [
 ('P2-N01','Critical','PayHere trusted mutable custom fields rather than a server-bound purchase','CheckoutIntent binds owner/plan/cadence/amount/currency; validate exact amount, merchant and signature','services/payment/src/services/subscription.service.ts','Local forged custom fields cannot grant the second user paid access; checkout-security units'),
 ('P2-N02','High','Annual PayHere purchases recurred/expired monthly','Annual provider recurrence and server-bound yearly entitlement period','services/payment/src/services/payhere.service.ts','Hosted annual form and signed callback period verified locally'),
 ('P2-N03','High','Colon-delimited BullMQ job IDs rejected valid callbacks','Hash gateway plus idempotency key into a valid stable job ID','services/payment/src/queues/payment-webhook.queue.ts','Real Redis webhook acceptance and downstream subscription/invoice verified'),
 ('P2-N04','High','Order/status deduplication discarded later recurring payments','Include provider payment_id in producer and worker event identity','services/payment/src/controllers/payment.controller.ts','Payment regression fixtures; local duplicate deliveries still produce one invoice'),
 ('P2-N05','High','Billing wrote permanent administrator-style quota overrides','Separate plan baseline sync; clear only legacy system-created overrides and retain explicit staff grants','services/quota/src/services/plan-sync.service.ts','Already-active paid subscriber receives new admin quota without a usage reset'),
 ('P2-N06','Medium','Admin fake login role controls and transport errors manufactured account/recovery success','Remove local role switching and fake login path; fail on network errors; default missing permissions closed; validate user identity before storing access tokens','admin/src/store/adminAuthStore.ts','Lint/build and browser API-error regressions; complete live password recovery delivery remains blocked'),
 ('P2-N07','Medium','History controls, row status, amount and field contracts were disconnected','Use typed real sessions, wire reopen/delete and accurate currency/total/draft labels','user-frontend/src/hooks/useUserDocuments.ts','Unit/build checks and actual API session deletion; all history browser controls NOT TESTED'),
 ('P2-N08','High','Notification configuration feed exposed internal operational template/settings data','Require internal secret; publish a separate authenticated announcement feed','services/admin-api/app/api/v1/notifications.py','123 denial probes include protected config feed; actual announcement downstream read'),
 ('P2-N09','High','Analytics URL normalization stripped SSL options and damaged SQLite URLs','Remove only Prisma-specific PostgreSQL parameters and preserve SQLite/SSL semantics','services/analytics/app/services/db.py','Analytics authorization suite runs on actual isolated SQLite; encrypted hosted connection NOT TESTED'),
 ('P2-N10','High','Proxied CORS headers overwrote gateway origin policy','Gateway owns Access-Control response headers; localhost exception disabled in production','services/gateway/src/services/proxyClient.service.ts','Real HTTP upstream/gateway CORS regression and live browser price requests'),
 ('P2-N11','High','Admin screens fabricated telemetry/subscriptions/user/template data and marked failed mutations successful','Show real zero/empty/error states; no local-only publish/toggle success; wire actual announcement delete and quota removal','admin/src/pages/subviews/SubscriptionsView.tsx','Strict types/lint/build and error-state browser probes; each successful CRUD control is not universally verified'),
 ('P2-N12','High','Unified override ignored plan; quota client referenced nonexistent local_url and swallowed failures','Actually update Auth plan, reject invalid quota values before persistence, use base_url, check downstream HTTP status and expose partial-sync failure','services/admin-api/app/api/v1/users.py','Actual admin override reaches Auth and Quota APIs; focused unit asserts plan mutation'),
 ('P2-N13','High','Deleted admin quota override remained in Quota durable mirror and could be resurrected by billing sync','Internal authenticated mirror-removal endpoint; admin removes durable mirror before acknowledging deletion','services/quota/src/routes/quota.routes.ts','Real override removal followed by billing plan sync; failure unit preserves admin record'),
]

GATES = [
 ('EXT01','Original blocked 1/6','PostgreSQL-backed CRUD / browser persistence','VERIFIED in tested scope; incomplete overall','Owned local PostgreSQL + checked-in migrations, real Redis and nine running application endpoints; recorded stack checks and six browser checks. Remaining controls in 81 admin sections are NOT TESTED.'),
 ('EXT02','Original blocked 2/6','Live Groq/Claude intelligence, provider fallback and cost/quota','BLOCKED','Supply an approved provider sandbox/project and bounded test budget. Local deterministic multi-turn tests and mocked provider-loop units are separate evidence.'),
 ('EXT03','Original blocked 3/6','Google/Firebase interactive authentication','BLOCKED','A controlled Firebase project and test identity/browser flow are required; no production identity was used.'),
 ('EXT04','Original blocked 4/6','Real Paddle/PayHere sandbox lifecycle','BLOCKED','Register sandbox products/prices and callback endpoints; exercise checkout, renewals, upgrades/downgrades, cancellation, refunds and out-of-order deliveries. Signed local PayHere callbacks are VERIFIED fixtures, not provider delivery.'),
 ('EXT05','Original blocked 5/6','Resend delivery and provider callbacks','BLOCKED','Approved sandbox sender/recipient and registered callback are required; local worker uses dummy transport and sends no real communication.'),
 ('EXT06','Original blocked 6/6','Supabase bucket lifecycle / signed links','BLOCKED','Approved isolated test bucket and credentials are required. Local-disk signed downloads and PDFs are verified separately.'),
 ('EXT07','Original not-run 1/3','Docker image build/deploy/runtime','BLOCKED / NOT TESTED','Docker/Podman unavailable in the accessible environment; Compose parsing and local process startup are not container/deployment evidence.'),
 ('EXT08','Original not-run 2/3','Broad load / responsive / accessibility / disaster recovery','PARTIALLY VERIFIED; remainder NOT TESTED','One 390px pricing viewport plus a narrow renderer burst/owned-browser restart probe are recorded when successful; no full accessibility audit, load SLO or disaster recovery rehearsal.'),
 ('EXT09','Original not-run 3/3','Unsafe legacy live document test','FIXED / VERIFIED','Replaced with an isolated pytest entry point and executed it: 69 tests passed, no shared data mutation.'),
]


def main():
    stack = read('stack-integration.json', {'checks': []})
    browser = read('browser-integration.json', [])
    error_browser = read('browser-scenarios.json', [])
    pdf = read('pdf-scenarios.json', [])
    probes = read('additional-probes.json', [])
    inventory = read('inventory.json', {'files': [], 'entries': []})
    kinds = Counter(x['kind'] for x in inventory['entries'])
    evidence = DOC / 'evidence'
    commands = []
    for p in sorted(evidence.glob('phase2-*.json')):
        item = json.loads(p.read_text())
        if isinstance(item, dict) and 'command' in item:
            commands.append(item)
    baseline = read('baseline.json', {})
    changed = []
    files = subprocess.check_output(['rg','--files','--hidden','-g','!node_modules','-g','!.git','-g','!.venv*','-g','!dist','-g','!__pycache__','-g','!redis-bin','-g','!storage','-g','!generated','-g','!system-audit','-g','!DOC_CRAFT_FULL_PROJECT_REPORT.md'], cwd=ROOT, text=True).splitlines()
    for name in files:
        path = ROOT / name
        if path.suffix not in ('.ts','.tsx','.js','.cjs','.mjs','.mts','.py','.prisma','.sql','.json','.md') or '.env' in name or name.endswith('package-lock.json'):
            continue
        raw = path.read_bytes()
        if baseline.get(name) != hashlib.sha256(raw).hexdigest():
            changed.append({'source': name, 'change': 'modified' if name in baseline else 'added', 'sha256': hashlib.sha256(raw).hexdigest()})
    (OUT / 'phase2-changed-files.json').write_text(json.dumps(changed, indent=2) + '\n')
    fixed = sum(row[-1].startswith('FIXED') for row in FINDINGS)
    summary = {
        'original_findings': 15, 'original_fully_fixed_source_groups': fixed, 'original_remaining': 15-fixed,
        'new_defect_groups_corrected': len(NEW), 'source_config_tooling_files_changed_since_phase2_baseline': len(changed),
        'current_inventory_files': len(inventory['files']), 'current_inventory_entries': len(inventory['entries']),
        'inventory_kinds': kinds, 'stack_checks': len(stack['checks']), 'stack_verified': sum(x['status']=='VERIFIED' for x in stack['checks']),
        'live_browser_checks': len(browser), 'live_browser_verified': sum(x['status']=='VERIFIED' for x in browser),
        'browser_error_scenarios': len(error_browser), 'browser_error_passed': sum(x['status']=='PASS' for x in error_browser),
        'pdf_renderer_security_scenarios': len(pdf), 'pdf_renderer_security_passed': sum(x['status']=='PASS' for x in pdf),
        'admin_inventory_sections': 81, 'production_readiness': 'NOT READY',
        'limitations': 'Counts are scoped checks or source definitions, not percent functional. External provider and full CRUD release gates remain open.'}
    (OUT / 'phase2-summary.json').write_text(json.dumps(summary, indent=2) + '\n')

    def link(target, root=False):
        return target if root else '../../'+target
    def source(path, root=False):
        return f'[{path}]({link(path, root)})'
    def artifact(name, root=False):
        return f'[{name}]({"docs/system-audit/" if root else ""}evidence/phase2/{name})'
    def detailed(name, root=False):
        return f'[{name}]({"docs/system-audit/" if root else ""}{name})'
    def evidence_link(name, root=False):
        return f'[{name}]({"docs/system-audit/" if root else ""}evidence/{name}.json)'

    findings = table(['ID','Severity','Component','Root cause','Fix plan / implemented correction','Verification / remaining dependency','Status'], FINDINGS)
    new_bugs = table(['Bug ID','Severity','Root cause / before','Fix / after','Affected source','Regression status'], [(i,severity,cause,fix,source(path), 'FIXED — '+proof) for i,severity,cause,fix,path,proof in NEW])
    gates = table(['Gate','Previous category','Workflow','Current status','Evidence / exact prerequisite'], GATES)
    latest = [
        ('Backend workspaces build','phase2-build-after-quota-fix','PASS'),
        ('User frontend lint','phase2-last-user-lint','PASS'),
        ('Admin frontend lint','phase2-last-admin-lint','PASS'),
        ('User frontend build','phase2-last-user-build','PASS'),
        ('Admin frontend build','phase2-last-admin-build','PASS'),
        ('Shared + chat/frontend contract regressions','phase2-final-valid-account-regression','223 Node tests + 216 Vitest tests passed'),
        ('Auth units/contracts','phase2-final-auth','35 passed'),
        ('Payment units/contracts','phase2-final-payment','62 passed'),
        ('Quota units/contracts','phase2-final-quota-route-regression','25 passed; later durable-removal route verified in actual stack'),
        ('Gateway / notification security / real CORS','phase2-final-gateway-notification','37 passed; some root-suite overlap'),
        ('Admin API units/in-process contracts','phase2-final-admin-validation','97 passed'),
        ('Analytics authorization','phase2-final-analytics-tests','3 passed'),
        ('Legacy document entry point / isolated pytest','phase2-final-document-tests','69 passed'),
        ('Mounted admin API denial probes','phase2-final-api-auth','123 denied as expected; 133 mounted method/path operations'),
        ('Real migrated stack / admin / billing / chat / worker','phase2-final-tax-crud-stack',f"{summary['stack_verified']}/{summary['stack_checks']} VERIFIED"),
        ('Renderer PDF/security, capacity/recovery, browser error states','phase2-probes-recovery-retest',f"{len(pdf)} PDF probes; {len(error_browser)} browser scenarios; see exact command result"),
    ]
    check_rows=[]
    for label,name,description in latest:
        p=evidence/(name+'.json');result=json.loads(p.read_text()) if p.exists() else {'result':'NOT TESTED'}
        check_rows.append((label,result['result'],description,evidence_link(name)))
    tests = table(['Check','Latest result','Scope / observed count','Evidence'],check_rows)
    tests += '\nEnvironment prerequisites: '+artifact('environment.json')+'. Exploratory quality diagnostics are retained under `evidence/phase2/manual-quality-diagnostics/`; final wrapped checks above are authoritative. The owned PostgreSQL fixture was stopped after verification; application processes were cleaned up and isolated data files retained.\n'
    workflow_rows=[]
    for row in stack['checks']:
        workflow_rows.append((row.get('id','P2-I'),row['workflow'],'Specified assertion in isolated fixture',cell(row.get('evidence') or row['status'])[:420],row['status'],artifact('stack-integration.json')))
    for index,row in enumerate(browser,1):
        workflow_rows.append((f'P2-B{index:03}',row['workflow'],'Browser shows persisted values / enforces boundary',cell(row.get('evidence') or row['status'])[:300],row['status'],artifact('browser-integration.json')))
    workflows=table(['Test ID','Workflow','Expected','Actual','Status','Evidence'],workflow_rows)
    admin_rows=[]
    for row in stack['checks']:
        if row.get('category')=='Admin synchronization':
            admin_rows.append((row['workflow'],'Admin API → Auth / Quota / Payment / Notification / Chat as applicable','Own local PostgreSQL / Redis fixture','Fresh consuming API / MCP state; browser proof only where separately listed',row['status']))
    admin_sync=table(['Admin change','Backend service','Stored state','User effect','Test result'],admin_rows)

    policy = '''The user decided that administrators select billing currency and explicit prices. Implemented supported choices are **USD and LKR**, with separate monthly/yearly amounts; there is no guessed exchange-rate conversion. Checkout validates the selected currency against the chosen provider. This does not add arbitrary-currency support.

The user also chose **AI chat requests plus generated documents** as the daily quota unit. The UI now says “AI chat requests + server PDF generations per day.” Provider-requiring AI turns and server generations reserve units; deterministic field edits do not call a provider. Browser-side canvas export remains a separate path and does not currently enforce the same server generation meter; that gap remains U-R08/U-R11. The legacy `monthly_quota` field name stores the daily allowance for wire compatibility.
'''
    overview = f'''**Current decision: NOT READY.** Phase 2 resolved **{fixed} of the original 15 source finding groups**; **{15-fixed} remain partially corrected, unresolved or blocked**. The work corrected **{len(NEW)} additional defect groups**. Original findings are not all code bugs: product gaps, provider access and credential/deployment evidence remain separate.

Both frontend lint checks and all three build commands pass. The latest real local stack run has **{summary['stack_verified']}/{summary['stack_checks']} verified assertions**, with **{summary['live_browser_verified']}/{summary['live_browser_checks']} actual browser assertions**. These overlap by design: the stack includes a browser-harness completion assertion. Mocked tests are not counted as live provider verification.

Current discovery: **{len(inventory['files'])} scanned text files, {len(inventory['entries'])} source inventory entries, 81 admin navigation IDs**. Phase 1's 666/1369 counts are historical; source deletions/additions change the inventory. Entries are definitions, not independent completed business features. All current entries are listed in the updated coverage appendix; no overall functionality percentage is justified.

Phase 2 changed **{len(changed)} source/configuration/documentation-tooling files relative to the saved Phase 2 baseline**, plus all 13 requested reports and generated evidence. This is not the count of the entire dirty Git tree; pre-existing Phase 1/unrelated changes were preserved. See {artifact('phase2-changed-files.json')} and {artifact('phase2-summary.json')}.
'''
    environment = '''Execution used an owned PostgreSQL 18.4 instance on loopback, independent uniquely named databases per run, an isolated Redis process and synthetic credentials. Four services ran their actual checked-in Prisma migrations; SQLAlchemy/custom SQL components initialized against that isolated database. Node services, two FastAPI apps, the PDF worker, Chromium and both Vite frontends ran as real local processes. The Analytics service's standalone authorization suite used disposable SQLite; it was not part of the live nine-process harness. No configured hosted database, real charge, real email, Firebase account or Supabase bucket was mutated.

The binaries and temporary cluster were outside Git. The database harness accepts only a loopback `PG_AUDIT_URL`, creates a unique database and never resets an existing database. Its local migration/browser/PDF artifacts are reviewable. Fresh-schema success does not validate an upgrade against a deployed legacy database.
'''
    readiness = table(['Area','Evidence','Gate status'],[
        ('Builds / types / lint','Backend and both frontends build; both configured lint commands pass','VERIFIED locally'),
        ('Authentication / authorization','Real registration/verification/login/profile/status checks; role and ownership regressions; 123 denial probes','PARTIAL — interactive Google and complete session revocation not verified'),
        ('Database','Checked-in fresh migrations + shared-service CRUD; legacy-copy unit cases','PARTIAL — deployed upgrade/baseline/rollback review required'),
        ('AI chat','Deterministic multi-turn persisted edits; provider/tool mocks and active model policy tests','BLOCKED — live provider intelligence/fallback not tested'),
        ('Documents','Five real worker exports; template PDF/security suite; authenticated persistence/deletion','PARTIAL — browser canvas layout/guest migration/sharing matrix'),
        ('Billing / quotas','Signed local PayHere annual lifecycle, duplicate callbacks, actual entitlements, concurrent Lua receipts','PARTIAL — real provider lifecycle, event order/crash reconciliation and mixed-currency revenue'),
        ('Admin','Real plan UI, MCP inspection, overrides, announcements, status/config propagation','PARTIAL — not every CRUD/control across all 81 sections'),
        ('Infrastructure / recovery','Local startup; bounded renderer readiness/burst/restart where evidenced','PARTIAL — containers, full load, dependency readiness and recovery drills'),
        ('Security / observability','Confirmed local boundary fixes and tests; durable audit/error evidence','BLOCKED — owner credential rotation evidence; abuse/session/outbox gaps'),
    ])
    deployment = '''1. Back up and inspect the actual deployment schema read-only. **Do not run the new Payment/Quota initial migrations blindly against populated databases**: establish a reviewed Prisma baseline. Validate legacy plan/coupon/audit-table ownership and compatible copy predicates. Retain old audit history; moving historical quota events to `quota_audit_logs` needs an explicit reviewed copy, not a reset.
2. Preflight Chat status/role values before enum conversion; unexpected legacy text must fail the migration. Rehearse locks, startup order and data preservation on an isolated copy. Auth verification fields and Chat persistence tables must exist before new code starts. Admin namespace copies preserve old tables and do not overwrite current namespaced rows.
3. Deploy the CheckoutIntent schema before enabling new checkouts. Reconcile in-flight legacy PayHere orders without intents from trusted provider/account records; the new worker rejects unbound callbacks. Configure explicit USD/LKR amounts and real sandbox product/price identifiers first. No currency conversion or price-identifier fabrication is provided.
4. Supply rotated stable signing/internal/bootstrap secrets and correct service URLs privately. Keep the read-only MCP endpoint on the private service network; admin RBAC/auditing is enforced at its consuming endpoint. Back up configuration versions and verify Redis invalidation/override recovery.
5. Preserve database backups and queue/event evidence. Roll back compatible application/configuration versions only after checking namespace/ledger compatibility; do not drop the new tables or undo enum conversion against live writers. A blind return to old admin table names can read incompatible/stale rows. Prefer a reviewed forward correction; rehearse recovery before release.
6. Release remains blocked until the original high-risk gaps and mandatory provider/CRUD/operational gates pass or a narrower release scope is explicitly approved. No such narrower approval was supplied in this task.
'''
    next_actions = '''- Implement and test ordered transactional payment event claims/outbox/reconciliation, quota crash/day-boundary accounting and durable override expiry/recovery; include out-of-order and restart fault injection.
- Finish one authoritative entitlement contract for every feature consumer; complete template publication and the guest/canvas/browser-export persistence contract. Verify successful user/admin CRUD for the remaining inventory entries.
- Repair currency-aware financial aggregation; LKR and USD must not be summed or labeled as USD without an explicit approved conversion policy. Verify real sandbox upgrade/downgrade/cancel/refund/trial/coupon rules and advertised benefits.
- Provide controlled sandbox resources for Groq/Claude, Firebase, Paddle/PayHere, Resend and Supabase, then run their actual workflows. Provider mocks and signed local callbacks cannot clear those gates.
- Obtain credential-rotation proof and a read-only deployed-schema/configuration review; rehearse baseline migrations and rollback. Run container builds, service-wide dependency-readiness checks, load/accessibility/responsive and disaster-recovery tests in a capable environment.
'''
    diagrams = '''### Current overall services

```mermaid
flowchart LR
  U[User React / Vite] --> G[Express gateway]
  A[Admin React / Vite] --> ADM[FastAPI Admin API]
  G --> AU[Auth Fastify]
  G --> C[Chat Fastify / SSE / MCP]
  G --> D[Document FastAPI]
  G --> P[Payment Express]
  G --> Q[Quota Express]
  G --> N[Notification Fastify]
  G --> AN[Analytics FastAPI]
  ADM --> AU
  ADM --> C
  ADM --> P
  ADM --> Q
  ADM --> N
  ADM --> AN
  C --> AI[Groq active provider]
  C --> Q
  D --> Q
  D --> W[BullMQ PDF worker]
  W --> PDF[Bounded shared Chromium sidecar]
  W --> S[Local disk or Supabase]
  P --> PP[PayHere / Paddle]
  N --> E[Resend]
  AN --> PH[PostHog]
  ADM <--> R[(Redis cache / invalidation / queues)]
  Q <--> R
  C <--> R
  W <--> R
```

### User request lifecycle

```mermaid
sequenceDiagram
  participant U as User UI
  participant G as Gateway
  participant AU as Auth
  participant S as Target service
  participant DB as Owned tables
  U->>G: Bearer request
  G->>AU: Current account verification
  AU-->>G: Status / role / plan
  G->>S: Canonical route and original authorization
  S->>AU: Independently verify where implemented
  S->>DB: Owner-scoped operation
  DB-->>S: Persisted result
  S-->>U: Response / SSE / error via gateway
```

### Admin request lifecycle

```mermaid
sequenceDiagram
  participant A as Admin UI
  participant API as Admin API
  participant DB as Admin database
  participant S as Dependent service
  A->>API: Admin JWT + mutation
  API->>DB: Reload active admin / role permissions
  API-->>A: TOTP_REQUIRED for sensitive actions
  A->>API: Same mutation + fresh second factor
  API->>DB: Validate / persist / audit
  API->>S: Internal credential or Redis invalidation
  S-->>API: Consuming result
  API-->>A: Result or explicit failure
```

### Account authentication

```mermaid
flowchart LR
  Register[Register] --> Persist[Persist user and verification challenge]
  Persist --> Email[Queued email / provider delivery]
  Email --> Verify[Verify matching unexpired code]
  Verify --> Login[Password login]
  Login --> Tokens[Access token and persisted refresh session]
  Tokens --> Current[Current account rechecked on protected calls]
  AdminPassword[Admin password] --> Challenge[Purpose-bound challenge / attempt budget]
  Challenge --> Factor[Atomic email-code consume or TOTP verification]
  Factor --> AdminJWT[Admin JWT + current RBAC checks]
```

### Chat state and model routing

```mermaid
flowchart LR
  Message[Owner message / turn ID] --> Replay[Replay / revision checks]
  Replay --> Parser[Deterministic extraction and ambiguity handling]
  Parser -->|AI required| Policy[Cached admin Groq allowlist]
  Policy --> Reserve[Quota reservation]
  Reserve --> Groq[Allowed provider / fallback models]
  Groq --> Tools[Validated owner-scoped MCP tools]
  Parser -->|Known explicit correction| Commit[Revisioned persisted slots]
  Tools --> Commit
  Commit --> SSE[SSE snapshot / commit outcome]
  SSE --> Store[Frontend chat/document state]
  Store --> Preview[Builder preview]
```

### Document generation and export

```mermaid
flowchart LR
  Saved[Persisted chat fields] --> Confirm[Fingerprint / revision confirmation]
  Confirm --> Generate[Authenticated server generation]
  Generate --> Receipt[Owned generation quota reservation]
  Receipt --> Row[Pending document + Redis job]
  Row --> Worker[PDF worker]
  Worker --> Template[Validated canonical data / Jinja template]
  Template --> Chrome[Bounded shared Chromium]
  Chrome --> Storage[Stored PDF]
  Storage --> Success[Durable success / owner download]
  Worker -->|Terminal failure| Refund[Idempotent receipt refund]
  Preview[Editable browser canvas] --> BrowserPDF[Browser raster PDF export]
  BrowserPDF -. separate persistence and metering gap .-> Gap[U-R08 / U-R11]
```

### Payment and subscription lifecycle

```mermaid
flowchart LR
  Plan[Admin currency / explicit amounts] --> Catalog[Canonical active catalog]
  Catalog --> Checkout[Validate provider / currency / cadence]
  Checkout --> Intent[(CheckoutIntent owner / plan / minor amount)]
  Checkout --> Provider[Hosted provider checkout]
  Provider --> Callback[Raw callback signature / merchant validation]
  Callback --> Queue[Durable BullMQ enqueue / hashed job ID]
  Queue --> Worker[Webhook worker / payment ID dedup]
  Intent --> Worker
  Worker --> State[(Subscription / invoice)]
  Worker --> Auth[Auth plan]
  Auth --> Quota[Quota plan baseline sync]
  Quota --> User[User quota / access]
  Worker -. crash or reordered event gap .-> Pending[U-R07 reconciliation]
```

### Admin configuration propagation

```mermaid
flowchart LR
  Admin[Admin edit] --> RBAC[Admin RBAC / fresh factor]
  RBAC --> Config[(admin_plans / config versions)]
  Config --> Keys[Redis plan keys / config snapshot]
  Keys --> Pub[config_invalidation pub-sub]
  Pub --> Consumers[Payment / Quota cached consumers]
  Config --> AI[Chat policy HTTP refresh <= 5 seconds]
  Consumers --> User[User catalog / quota APIs]
  User --> UI[Pricing refresh / reload]
  Announce[(Announcements)] --> Feed[Private config + authenticated notification feed]
  Feed --> Banner[User banner polls]
```

### Database ownership and dependencies

```mermaid
flowchart TD
  AU[Auth Prisma] --> Users[(users / sessions / verification fields)]
  Chat[Chat Prisma] --> Conv[(chat_sessions / chat_messages / conversation state tables)]
  Doc[Document SQLAlchemy] --> Docs[(documents / sharing / custom templates)]
  Pay[Payment Prisma] --> Billing[(plans / coupons / subscriptions / invoices / checkout_intents)]
  Quota[Quota Prisma] --> Limits[(quotas / quota_audit_logs)]
  Admin[Admin custom SQL] --> AdminTables[(admin_plans / admin_coupons / admin_audit_logs / config / RBAC)]
  Notify[Notification pg] --> Logs[(NotificationLog / preferences)]
  Analytics[Analytics SQLAlchemy] --> Reads[Shared-table reporting reads]
  Admin --> Reads
  Reads --> Users
  Reads --> Docs
  Reads --> Billing
```
'''

    previous_bugs = (OUT / 'previous-08-BUGS_AND_FIXES.md').read_text()
    regression_rows = []
    boundaries = {
        'B01': 'Gateway route/SSE regressions and actual gateway stack requests',
        'B02': 'Raw callback regressions and actual signed local PayHere callback',
        'B03': 'Build/parser bounds regressions; full upload/storage journey remains BLOCKED',
        'B04': 'Auth suite and actual registration/login/current-account/ownership checks',
        'B05': 'Quota authorization units and actual secret-authenticated reserve/refund',
        'B06': 'Payment protected-namespace regressions',
        'B07': 'Admin password/challenge/purpose/attempt/concurrent-consumption regressions',
        'B08': 'Admin persisted role/status/permission tests',
        'B09': 'Admin trusted-proxy and IPv6 regression tests',
        'B10': 'Source-default cleanup retained; real secret rotation remains BLOCKED U-R10',
        'B11': 'Notification security units and authenticated announcement feed; live email BLOCKED',
        'B12': 'Resend signature/freshness regressions; actual registered callback BLOCKED',
        'B13': 'Document authentication/job tests and actual cross-user document denial',
        'B14': 'Chat/Document quota-outage regressions and real quota-mediated server generation',
        'B15': 'Document path/signature/guest/share units; full hosted bucket workflow BLOCKED',
        'B16': 'Document worker contract/retry regressions and five persisted queue exports',
        'B17': 'Real admin-driven pricing and checkout form; no local fake paid-plan mutation',
        'B18': 'Frontend payment API contract regressions and actual checkout request',
        'B19': 'Real durable callback queue plus Auth/quota sync; ordering/crash window remains U-R07',
        'B20': 'Actual profile timezone save and fresh authenticated reload',
        'B21': 'Auth persistent-only/error-path units and actual stored verification challenge',
        'B22': 'Both configured lint commands and frontend builds PASS',
        'B23': 'Build and all admin error-state renders; positive audit-filter UI data still NOT TESTED',
        'B24': 'Admin RBAC/permission units and protected API denial probes',
        'B25': 'Auth suite/build pass; exact 30-day persisted refresh-expiry assertion not separately added',
        'B26': 'Payment/quota/document paid-tier regressions; all Max UI gates remain U-R04',
        'B27': 'Actual existing-token suspension/reactivation and paid-plan/quota propagation',
        'B28': 'Admin error regression plus real private MCP reads and actual inspection browser UI',
    }
    for line in previous_bugs.splitlines():
        if not re.match(r'\| B\d{2} \|', line):
            continue
        columns = [value.strip() for value in line.split('|')[1:-1]]
        regression_rows.append((columns[0], columns[2], boundaries[columns[0]]))
    old_regressions = table(['Original group','Original root cause','Phase 2 regression scope / limit'], regression_rows)
    proposed_design = """### Reviewable proposals for the remaining architectural work

These proposals are not implemented and require architecture/product authorization before changing the release contract:

- Persist a unique gateway/event ledger and version/order checks per subscription. Commit invoice/subscription changes and an outbox together; idempotent consumers apply Auth, Quota and Notification effects. Reconcile incomplete delivery after process restart. Decide provider-specific effective dates and grandfathered prices before mapping superseded price IDs.
- Give quota reservations a durable lifecycle tied to a user, operation and UTC accounting day. Reconcile reserved/committed/refunded state across SQL, Redis and workers, including midnight, crash and retry exhaustion. Select one durable authority for staff overrides and expiry, then test cache-loss restoration and billing precedence.
- Publish one versioned entitlement response for logo/template access, priority, retention and every supported tier. Map every existing feature gate to that response and verify each admin toggle reaches a real user control after reload.
- Specify a versioned template publication artifact consumed by both selection and rendering, and an explicit guest-to-account ownership transfer for saved fields/assets/layout. Agree confirmation, conflict and retention rules before implementing either workflow.

"""
    contents={
      '00-OVERALL_SYSTEM_REPORT.md': overview+'\n### Product decisions\n\n'+policy+'\n### Local environment and evidence boundaries\n\n'+environment+'\n### Original findings tracker\n\n'+findings+'\n### Verification results\n\n'+tests+'\n### Report validation\n\nAll 13 requested Markdown reports retain Phase 1 evidence and current Phase 2 coverage. Link/fence/Python/Compose checks are retained as wrapped artifact-validation commands.\n\n### Readiness\n\n'+readiness+'\n### Remaining work\n\n'+next_actions,
      '01-SYSTEM_ARCHITECTURE.md': environment+'\n'+diagrams+'\nThe current diagrams describe source behavior; a provider node does not mean its live integration passed. U-R04/U-R07/U-R08/U-R11 remain explicit incomplete contracts.\n',
      '02-USER_WORKFLOWS.md': policy+'\n'+table(['Workflow','Final evidence','Status / limitation'],[
          ('Register → verify → login → profile reload','Real gateway/Auth/PostgreSQL with stored challenge read only by test fixture','VERIFIED locally; email delivery and Google BLOCKED'),
          ('Five document sessions / corrections / replay / reload / delete','Real SSE engine, owner-scoped Prisma and API reads','VERIFIED deterministic path; external AI intelligence BLOCKED'),
          ('Server export / download / deletion','Actual Redis worker, Chromium, persisted document and extracted PDF text','VERIFIED for five fixtures; complete sharing/custom canvas path NOT TESTED'),
          ('Pricing / annual checkout / active subscriber allowance','Actual admin-to-user UI and signed local webhook pipeline','VERIFIED fixture path; provider sandbox lifecycle BLOCKED'),
          ('History / billing settings','Typed real sessions, reopen/delete handlers and provider portal UI; builds/regressions','FIXED source; every browser CRUD action NOT TESTED'),
          ('Guest identity / layout restore / browser PDF accounting','Existing split persistence paths','UNRESOLVED U-R08/U-R11'),
      ])+'\nFull assertion list: '+detailed('07-TEST_RESULTS.md')+'.\n',
      '03-ADMIN_WORKFLOWS.md': 'All **81 navigation IDs remain in the inventory**. Six live browser assertions and selected real admin API mutations do not prove all 81 sections have complete CRUD. Protected-route denial and error-state rendering are separate from successful operations.\n\n'+admin_sync+'\n### Confirmed UI repairs\n\nAdmin currency/price controls persist real values and require the existing second factor. Inspection now calls an audited support endpoint and reads the private MCP resource. Fake user/subscription/template/dashboard fallback records, local-only template publishing and failed automation success were removed. Announcement deletion and quota-override removal call actual backend operations. Strong frontend API types expose contract mismatches instead of masking them with `any`.\n\nTemplate publication is NOT IMPLEMENTED; all remaining RBAC/staff, support, promotions, notification templates and configuration CRUD controls need positive browser/persistence/downstream tests. Public submission abuse, full revocation and durable expiry/recovery are not cleared by this audit.\n',
      '04-CHAT_AND_DOCUMENT_LIFECYCLE.md': 'For **invoice, quotation, proposal, receipt and purchase_order**, the real harness creates an authenticated session, saves required fixture fields, submits two actual SSE correction turns, replays each turn, reads persisted fields, confirms the current fingerprint/revision, queues a server generation and downloads the actual PDF. Extracted PDF text contains both corrected business/client values; the four financial document types also retain the expected 43.89 tax-inclusive total for 2 × 19.95 plus 10%. Proposal output intentionally has no financial total. Job ownership and document/session deletion are checked.\n\nThese turns intentionally use the shipped deterministic parser. External model keys are disabled; multi-field natural-language intelligence, ambiguous semantic repair and live provider fallbacks remain BLOCKED. Shared/provider regression suites cover broader parsing/calculation behavior using deterministic and mocked inputs. Browser preview/layout export is a different route from the verified server PDF pipeline and remains a persistence/metering limitation.\n\n'+table(['Artifact','What it proves','Limit'],[(artifact('workflow-'+kind+'.pdf'),'Real queued export contains persisted corrected values','One fixture/template, not every user scenario')for kind in ['invoice','quotation','proposal','receipt','purchase_order']])+'\n### Resilience\n\nOwned quota receipts deny replay after refund; refunds decrement once. Worker retries do not refund until terminal failure and already-successful records avoid duplicate rendering. This is not a transactional SQL/Redis outbox: crash-after-reserve, queue/database commit windows, day changes and refund retry exhaustion still require reconciliation. The renderer shares one Chromium process, bounds active pages, times out work and exposes readiness; local burst/recovery is scoped in the test report.\n',
      '05-API_DATABASE_INTEGRATIONS.md': 'Admin-owned physical names are now `admin_plans`, `admin_coupons`, `admin_audit_logs`; Quota events use `quota_audit_logs`. Payment retains its own `plans`/`coupons` and adds `CheckoutIntent`. Compatible old admin rows can be copied idempotently without modifying the original tables; incompatible Payment-shaped tables are left untouched.\n\nActual fresh PostgreSQL migration runs covered Auth, Chat, Payment and Quota. Added Auth verification columns, Chat conversation persistence tables and enum reconciliation close observed start/create failures. SQLAlchemy Analytics strips only Prisma URL options and retains SSL/SQLite semantics. Existing populated deployment upgrades are still a separate mandatory rehearsal.\n\nNew contracts include `POST /v1/quota/plan/sync`, `DELETE /v1/quota/override/:userId`, `POST /internal/resources` on Chat, `GET /api/v1/admin/support/sessions/{session_id}`, and the authenticated user announcement feed. Notification internal configuration now requires the service secret. Raw payment-method mutations return 501 and the UI uses the provider portal.\n\n'+policy+'\n### Migration and rollback\n\n'+deployment,
      '06-FUNCTIONALITY_COVERAGE.md': f'Current static discovery: **{len(inventory["files"])} text files; {len(inventory["entries"])} entries**. Kinds: '+', '.join(f'{k}={v}'for k,v in sorted(kinds.items()))+'. The Phase 1 table below is retained as historical evidence. The Phase 2 inventory uses a P2- prefix to prevent accidental identity claims when source line/order changes.\n\n'+table(['Feature ID','Actor','Feature','Source','API','Status','Verification','Issue'],[(f'P2-{x["id"]}', 'Admin' if x['source'].startswith('admin/') or x['kind']=='admin-section' else 'User/service', x['name'],source(x['source'])+f":{x['line']}",x.get('endpoint','Trace required'),'INFERRED','NOT TESTED per definition; scoped workflows in test report','Source presence is not functionality proof')for x in inventory['entries']])+'\nCurrent inventory JSON: '+artifact('inventory.json')+'.\n',
      '07-TEST_RESULTS.md': environment+'\n### Latest authoritative checks\n\n'+tests+'\nSuite counts overlap where root test:chat includes gateway/frontend files also run in focused commands; do not add them as unique tests. An earlier PASS is not used to hide a later failure. Intermediate failures and fixture corrections remain in the command history.\n\n### Real workflow assertions\n\n'+workflows+'\n### Six original blocked and three not-run categories\n\n'+gates+'\n### All Phase 2 recorded commands / working directories\n\n'+table(['ID','Working directory','Exact command argv','Outcome','Seconds','Evidence'],[(x['id'],x['cwd'],json.dumps(x['command']),x['result'],x['seconds'],f"[{x['id']}.log](evidence/{x['id']}.log)")for x in commands])+'\nEarlier failed probes include outdated contract expectations, SQLite URL stripping, migration omissions, Vitest mock hoisting, upstream CORS, test-owned Chromium process lookup, overlapping fixture ports, premature renderer-slot observation and an outer probe timeout. They are retained; only rerun assertions are used for final verification.\n',
      '08-BUGS_AND_FIXES.md': '### Original 15 findings — final disposition\n\n'+findings+'\n### New confirmed defects\n\n'+new_bugs+'\n### The 28 original corrected groups — regression scope\n\n'+old_regressions+'\n### Reproduction and verification map\n\n'+table(['Finding / defect','Reproduction / dependency','Source / test'],[
          ('U-R01 / U-R14','Run actual four-service migrations into one fresh local PostgreSQL DB, then register/create session/render','scripts/system_audit_phase2_stack.py; test_schema_namespace.py'),
          ('U-R02 / N01–N05','Configure LKR monthly/yearly, checkout annual, sign fixture callback with forged custom fields, replay concurrently, change paid quota','stack harness + checkout-security.test.ts'),
          ('U-R03','Restrict free Groq allowlist, try fallback model, expire policy cache and fail config lookup','plan-policy.test.ts; groq.service.ts'),
          ('U-R05 / N06–N11','Provider portal replaces metadata UI; inspect API error and zero-data screens without fake success','frontend contracts/builds; system_audit_browser.cjs'),
          ('U-R06','Create/disable/delete announcement and read authenticated feed; template route has no complete publishing implementation','stack harness; templates.py placeholder'),
          ('U-R07 / U-R08','Concurrent duplicate callback, duplicate reservation/refund and terminal PDF failure; crash ordering still unverified','real stack + quota/payment/document regressions'),
          ('U-R09','Run configured npm lint/build commands for both frontends without config relaxation','latest lint/build evidence'),
          ('U-R10','Cannot prove remote key revocation from local source; owner rotation evidence required','Deployment owner action'),
          ('U-R11','Save/reload server session and export versus separate browser canvas/guest identity transition','real stack; App.tsx/documentStore.ts; remaining workflow gate'),
          ('U-R12','Direct analytics without secret, forged client identity, five wrong admin codes and concurrent consume','analytics/tests/test_authorization.py; test_audit_regressions.py'),
          ('U-R13','Burst eight local renderer requests; kill only owned Chromium, then readiness and next PDF','system_audit_phase2_probes.py; broad load not measured'),
          ('U-R15','Private MCP wrong/no credential, tools/call deny, actual resource read and browser Inspect Record','internal-resources.test.ts; real stack/browser'),
          ('N12 / N13','Unified admin plan/quota override, remove override then run billing plan sync; simulate downstream removal failure','real stack; test_phase2_mutations.py'),
      ])+'\nNo speculative transactional/outbox rewrite or new template/guest product design was imposed. Remaining fixes require the concrete designs and external resources in the roadmap, rather than guessed semantics.\n',
      '09-SECURITY_PERFORMANCE.md': 'Confirmed high-impact corrections bind payment ownership to a durable server intent, protect direct Analytics and private notification configuration, restrict MCP to read-only resources, bound admin email-code attempts and atomically consume challenges. The gateway preserves its own CORS origin policy even if an upstream returns permissive/stale headers.\n\nNo locally reproduced Critical boundary failure remains in the tested auth/payment paths. This is not a complete security certification: **U-R10 credential validity/rotation is BLOCKED**, and U-R04/U-R07/U-R08/U-R12 retain High release risks. Public submission abuse, full session revocation, action-TOTP budgets, all feature gates and ordered crash reconciliation still require work.\n\n'+table(['Severity','Remaining issue','Evidence / action'],[
          ('High','Former credentials / deployed secret delivery','Owner revocation/configuration proof unavailable; do not infer from source cleanup'),
          ('High','Payment event ordering / distributed atomicity','Concurrent queue duplicate fixture passes; crash/out-of-order sandbox not tested'),
          ('High','Feature/usage enforcement and client export split','Source paths still differ; entitlement and persistence design/tests required'),
          ('High','Public submissions / complete session revocation','Positive/negative full workflow gates remain open'),
          ('Medium','Legacy upgrade / operational readiness','Fresh local migration/startup verified; deployed baseline, all dependencies and rollback not rehearsed'),
      ])+'\n### Renderer probe evidence\n\n'+table(['Probe','Status','Evidence'],[(x['id'],x['status'],cell(x.get('scope') or x.get('health') or x.get('command')))for x in probes])+'\nPDF sidecar capacity defaults to two pages; overload returns 503. Readiness launches/checks Chromium, but most service health endpoints still represent liveness rather than complete dependency readiness. The single mobile pricing check is not an application-wide responsive/a11y benchmark. No throughput/SLO or production capacity claim is made.\n',
      '10-IMPROVEMENT_ROADMAP.md': '### Current release decision\n\n**NOT READY**. Both lint failures and the isolated database blocker were materially resolved; provider, product completeness and recovery gates remain.\n\n'+next_actions+'\n### Deployment and rollback prerequisites\n\n'+deployment+'\n'+proposed_design+'\n### Blocked / unrun reconciliation\n\n'+gates,
      '11-CHANGE_LOG.md': overview+'\n### Exact Phase 2 source/configuration/tooling delta\n\nThe baseline was captured before Phase 2 changes; this list does not assign pre-existing dirty changes to Phase 2. SHA-256 values are retained in '+artifact('phase2-changed-files.json')+'. Report/evidence outputs are additional generated artifacts.\n\n'+table(['File','Change relative to Phase 2 baseline'],[(source(x['source']),x['change'])for x in changed])+'\n### Original finding disposition\n\n'+findings+'\n### Validation and deployment\n\n'+tests+'\n'+deployment,
    }
    # Always regenerate from archived original evidence, so reruns do not duplicate sections.
    for name,content in contents.items():
        old = (OUT / ('previous-'+name)).read_text()
        title,_,body = old.partition('\n')
        (DOC / name).write_text(title+'\n\n> Current status: Phase 2 evidence below supersedes historical Phase 1 dispositions. Release decision: **NOT READY**.\n\n## Phase 2 — Remediation and Production Readiness Verification\n\n'+content+'\n## Phase 1 — Historical audit evidence (preserved)\n\n'+body.lstrip())
    # Root report remains comprehensive; detailed source/API/diagram history is retained.
    def root_links(text):
        return text.replace('](../../', '](').replace('](evidence/', '](docs/system-audit/evidence/')
    master = '''# DocCraft — Full Project Report

## Phase 2 — Remediation and Production Readiness Verification

'''+root_links(overview)+'\n### Product decisions and final behavior\n\n'+policy+'\n### Actual architecture and execution boundaries\n\n'+environment+diagrams.split('### User request lifecycle')[0]+'\nAll nine current workflow/dependency diagrams: '+detailed('01-SYSTEM_ARCHITECTURE.md',True)+'.\n\n### Original 15 findings and final disposition\n\n'+findings+'\n### New defects and exact corrections\n\n'+root_links(new_bugs)+'\n### Lint, builds, automated tests and integration evidence\n\n'+root_links(tests)+'\n### User workflow verification\n\nFive document types completed actual deterministic multi-turn chat → persisted slots → confirmation → Redis job → PDF worker → Chromium → local stored PDF → authenticated download, with corrected values extracted from the PDF. Session/document deletion and cross-user access checks passed; four financial exports also contained the expected tax-inclusive total of 43.89. This does not verify external AI intelligence or the separate browser-canvas layout persistence/export path. Actual provider keys were disabled.\n\n### Admin workflow and downstream results\n\n'+admin_sync+'\nSix live browser checks cover admin price/currency mutation and reload, private MCP inspection and user pricing persistence/mobile rendering. All 81 navigation entries are inventoried, but positive CRUD/downstream verification for every control is still incomplete. Announcement persistence/feed, account status, override grant/removal and existing-subscriber allowance propagation have real local API/database evidence. Template publication remains absent.\n\n### Billing and entitlement consistency\n\nExplicit admin currency/prices reach hosted checkout forms, signed local callbacks bind the server-owned account/plan/amount/cadence, duplicate callbacks create one invoice and the actual paid account receives current quota values. Manual plan overrides now mutate Auth and durable quota removal survives later plan sync. Hosted provider method management replaces fake local raw-card storage. Real sandbox lifecycle and cross-currency revenue normalization are not verified; ordered transactional event recovery remains incomplete.\n\n### Six blocked and three unrun categories\n\n'+gates+'\n### Production-readiness decision\n\n'+readiness+'\n**NOT READY.** Missing mandatory live provider, full workflow and recovery/security evidence prevents a release-ready or conditionally-ready claim. Passing builds, lint and scoped local tests do not remove these gates.\n\n### Required deployment and rollback considerations\n\n'+deployment+'\n### Remaining blockers and exact next actions\n\n'+next_actions+'\n### Detailed reports\n\n'+'\n'.join('- '+detailed(name,True)for name in contents)+'\n'
    previous = (OUT/'previous-DOC_CRAFT_FULL_PROJECT_REPORT.md').read_text()
    master+='\n## Phase 1 — Historical comprehensive report (preserved)\n\nThe following contains earlier results and unresolved dispositions. The current Phase 2 sections above take precedence. Historical source line references may have moved.\n\n'+previous.partition('\n')[2].lstrip()
    (ROOT/'DOC_CRAFT_FULL_PROJECT_REPORT.md').write_text(master)
    print(json.dumps(summary))


if __name__ == '__main__':
    main()

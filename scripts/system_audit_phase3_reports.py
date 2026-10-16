"""Publish Phase 3 conclusions from retained evidence; preserve Phase 2 history."""
import datetime
import hashlib
import json
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/system-audit'
OUT=DOC/'evidence/phase3'
def read(name,default=None):
 p=OUT/name
 return json.loads(p.read_text()) if p.exists() else default

def table(headers,rows):
 def cell(value):return str(value).replace('|','/').replace('\n',' ')
 return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |',*['| '+' | '.join(map(cell,row))+' |' for row in rows]])+'\n'

def write(name,text): (DOC/name).write_text(text.rstrip()+'\n')

stack=read('stack-integration.json',{'checks':[]})
checks=stack['checks']; passed=sum(row['status']=='VERIFIED' for row in checks)
browser=read('browser-integration.json',[])
browser_passed=sum(row['status']=='VERIFIED' for row in browser)
security=[row for row in checks if row.get('category')=='Security']
security_passed=sum(row['status']=='VERIFIED' for row in security)
policy=json.loads((ROOT/'shared/service-permissions.json').read_text())
calls=read('connection-callsites.json',[]); routes=read('api-inventory.json',[])
commands=[]
for name in ['backend-build','user-build','admin-build','user-lint','admin-lint','chat-tests','auth-tests','payment-tests','quota-tests','gateway-notification-tests','admin-tests','document-tests','analytics-tests','shared-python-tests','configuration','api-denials','renderer-browser-probes','stack','dependency-audit','python-dependency-audit','diff-check']:
 p=DOC/'evidence'/('phase3-'+name+'.json')
 if not p.exists():continue
 data=json.loads(p.read_text());log=DOC/'evidence'/('phase3-'+name+'.log');text=log.read_text() if log.exists() else ''
 counts=[]
 for label,pattern in [('Node',r'(?m)^ℹ tests (\d+)$'),('Vitest',r'(?m)^\s*Tests\s+(\d+) passed'),('pytest',r'(?m)^(\d+) passed(?:, \d+ skipped)?(?:, \d+ warnings?)? in ')]:
  match=re.search(pattern,text)
  if match:counts.append(label+': '+match[1]+' passed')
 counts='; '.join(counts)
 commands.append([name,data['result'],counts or 'See exact command log',f"[log](evidence/phase3-{name}.log)",data.get('seconds','')])

original=[
 ['U-R02','PARTIAL; software pricing/reporting corrected','Cent-precision USD/LKR create/update; annual billing snapshots; separate collected revenue and monthly/annual run rates by currency; unknown legacy amounts identified','Actual admin UI price → user UI; signed local annual callback and currency totals. Provider sandbox, adjustments/refunds and historical reconciliation remain unverified.'],
 ['U-R04','UNRESOLVED','Plan benefits still lack one enforced entitlement contract across every consumer','Logo/premium templates/watermark/priority/retention/Max toggles are not fully verified or consistently enforced; separate feature_flags domain remains.'],
 ['U-R06','PARTIAL; bundled publication corrected','RBAC + second-factor publish/withdraw persists catalog policy; Document listing and Chat aliases enforce it; announcements already persisted','Actual downstream availability tested. Arbitrary uploaded HTML/template authoring/version approval pipeline is not implemented.'],
 ['U-R07','PARTIAL; durable intake corrected','PostgreSQL webhook inbox; signed Redis delivery; startup/periodic reconstruction; bounded retry/DLQ; immutable server-bound PayHere identity','Restart reconstruction and duplicate/tampered-ID fixtures pass. Cross-service atomicity and arbitrary event ordering remain open. PayHere recurring installment identity requires Retrieval API reconciliation; it is deliberately not inferred from unsigned fields.'],
 ['U-R08','PARTIAL','Service-owned reservation/refund namespaces, idempotent Lua, delayed reset cannot erase new-day Redis usage; plan transitions preserve usage','Actual concurrent reserve/refund and delayed-reset checks. Crash between reservation/document commit, refund outage repair, full Redis data loss, override expiry, and browser-export metering remain open.'],
 ['U-R10','BLOCKED externally','Pairwise keys, Auth-only signing authority, separate admin/download keys and private generation/injection tooling','No production/provider credential revocation, KMS/secret-store rollout, backup or deployed rotation proof was available.'],
 ['U-R11','FIXED for tested draft/layout/export paths','Dual-credential atomic guest claim; one target account; retained session pointers; actual guest login/register access; server-persisted canvas presentation; browser reload/export','Real browser guest login retains draft ownership and values; actual canvas keyboard edit persists and reloads; actual browser PDF downloads. Browser exports are still local artifacts and do not create server PDF history or enforce server generation quota.'],
 ['U-R12','PARTIAL; major controls corrected','Current-account/revocation checks, persisted admin sessions, stable-role authorization, shared abuse budgets, protected reporting/configuration, TOTP replacement protection','Direct-boundary logout and role/abuse tests pass. Authenticator codes can still be reused within the accepted time window; encrypted TOTP storage and exhaustive abuse/load testing remain open.'],
 ['U-R13','PARTIAL','Renderer credential/process isolation; bounded rendering/readiness/recovery; service auth/replay-store failures reject requests; payment outbox recovery','Actual Auth restart, Redis pause/resume, Chromium child restart and local overload tests. Fleet readiness, failover, full queue drain/capacity and production SLOs remain unverified.'],
]
findings=[
 ['P3-S01','Critical','All internal APIs','One universal credential granted unrelated service operations','Pairwise source/destination keys; receiving-service method/path ACL; old secret rejected','Service JWT units and live unauthorized-caller/replay probes'],
 ['P3-S02','Critical','Auth / consumers','Shared user signing authority could let a backend forge user tokens','Ed25519 user tokens; Auth alone has private key; issuer/audience/type/expiry validation','User-token profile and algorithm negatives; configuration checks; actual boundary calls'],
 ['P3-S03','High','Queues / Redis','Unsigned jobs and broad Redis access allowed privileged payload injection','Signed producer/queue/name/job-ID envelopes; per-service key/channel ACLs; private queues','Actual unsigned document/payment jobs fail before effects; foreign queue/key/config/command denials'],
 ['P3-S04','High','Sessions / Admin','Access tokens outlived logout; admin authority depended on stale token fields','Auth current-account + revoked-JTI lookup at boundaries; durable admin sessions and fresh role/status lookup','Actual logout denial at seven boundaries; admin session logout/termination tests'],
 ['P3-S05','High','Admin JWT','User/admin credential profiles were insufficiently separated','Independent ADMIN_JWT_SECRET; admin-only audience, issuer, type and persisted session','Actual user-key forged admin JWT denied'],
 ['P3-S06','High','PDF sidecar','Renderer inherited document/database/provider credentials and broad network exposure','Dedicated PDF identity/Redis ACL; filtered child environment; renderer has no outgoing service keys; no published port','Actual renderer child environment assertion; private render authentication; resource/network probes'],
 ['P3-S07','High','Network / PostgreSQL client','Public backend/Redis ports; legacy standalone stacks; certificate-validation risk','Root private backend topology, loopback edge bindings; standalone manifests include secure topology; node-postgres verifies certificates','Configuration parsing only; Docker runtime, TLS/mTLS and production topology NOT VERIFIED'],
 ['P3-S08','Critical','Payment / PayHere','Unsigned payment_id identified events/invoices; replay could manufacture billing effects or address another invoice','Event identity uses authenticated order/status; invoice ID is server-bound order; unsigned subscription IDs never set provider ownership','Actual altered-ID callbacks leave one invoice; checkout ownership regressions. Recurring reconciliation remains BLOCKED.'],
 ['P3-S09','High','Payment / PayHere','Checksum and fixtures placed status_code after the secret hash','Match official documented callback checksum order; independent fixed-vector regression','Local signature/HTTP callback tests; real provider sandbox NOT TESTED'],
 ['P3-S10','High','Payment worker','Redis acknowledgement was sole durable intake; downstream failure could lose handoff','PostgreSQL inbox before acknowledgement; asynchronous signed dispatch; startup reconstruction; bounded retries','Actual stopped Payment → inserted synthetic pending inbox → restart → persisted completion; inbox units'],
 ['P3-S11','Medium','Billing / Quota','Billing cancellation/renewal called an admin-only reset and erased daily usage','Remove billing resets; update only plan baseline','Payment regression; receiver denies Payment admin operations'],
 ['P3-S12','High','Quota','Delayed reset deleted current-day counters; namespace could drop maximum-length receipts','TTL owns Redis day rollover; only expired reporting rows reset; preserve namespaced receipt length','Quota units and actual Redis/PostgreSQL delayed reset'],
 ['P3-S13','High','PDF worker','Signed but mismatched owner/payload could reach failure mutation/refund logic for a different record','Permit failure writes/refunds only after persisted ownership/data match','Signed mismatched-owner regression; unsigned poison-job integration'],
 ['P3-S14','High','Admin automations','Payment/Quota shared event channel lacked producer-specific event authority','Signed short-lived events; per-producer allowed types; receiving Admin replay store','Valid/replayed/wrong-type/unsigned event regressions; Redis channel negatives'],
 ['P3-S15','Medium','Auth / Chat metrics','Operational metrics available directly without credentials','Metrics require scoped Admin service identity','Scoped policy and negative probes; monitoring scraper needs a separately provisioned permitted identity'],
 ['P3-S16','High','Auth / storage','Refresh credentials stored as reusable bearer tokens; local download key reused user/shared secrets','Store refresh digests; invalidate legacy plaintext sessions in migration; Document-only download signing key','Actual session digest/refresh/logout fixtures and download signature/expiry regressions'],
 ['P3-S17','High','Admin abuse / 2FA','Unbounded direct submissions/action guesses; authenticator replaced with a session alone','Atomic shared database budgets; protect enabled authenticator replacement; consume email challenges','Concurrent budget test; spoofed-IP budget test; TOTP guess/replacement regressions'],
 ['P3-S18','High','Admin RBAC','Role display name could imply unrestricted authority','Only stable system role ID resolves wildcard rights; sensitive role management uses fresh is_super_admin','Role-name no-permission denial and existing RBAC suites'],
 ['P3-S19','Medium','Gateway / Admin proxy','Forwarded IP supplied by a browser could affect trusted proxy attribution','Strip forwarded headers; gateway writes verified socket/proxy IP; Admin walks trusted chain from the right; bound correlation ID','Forwarded-chain/unit security tests; configured proxy network remains a deployment responsibility'],
 ['P3-S20','Medium','Notification callback relay','Unbounded arbitrary status callback destination and redirect behavior','Operator host allowlist; HTTPS only; reject URL credentials/nonstandard port; no redirects; five-second timeout','Destination-validation negatives; actual external callback NOT TESTED'],
 ['P3-S21','Medium','Python APIs','Direct chunked request bodies were not independently bounded','Bound raw ASGI bytes before parsing, preserving signed bytes: Admin 1 MiB, Document 2 MiB, Analytics 100 KiB','Chunked body tests; actual gateway invalid/oversized request tests'],
 ['P3-S22','High','Admin downstream mutations','Payment PATCH helper still sent only the retired shared secret','Use the same scoped signing transport for PATCH as GET/POST','Client regression and receiver method/path authorization; provider trial workflows still unverified'],
 ['P3-S23','High','Supply chain','Registry reported vulnerable runtime/tooling dependency chains','Upgrade Fastify/plugins, MCP SDK/transitives, Puppeteer, UUID, Vite/react plugins, gRPC override and compatible transitives','Exact final registry results below; residual build-tool advisories remain release work, not silently waived'],
]

connections=[
 ['User browser','Gateway','GET/POST/PATCH/PUT/DELETE','/v1/auth|users|chat|ai|document|documents|templates|payment|billing|quota|notifications|analytics|support','User bearer, provider signatures, or explicit public capability','JWT + current account; body limits; fixed destination registry; downstream validates ownership','30s REST; 135s SSE; 15s heartbeat','No automatic operation replay; client disconnect aborts','401/403/413/429/503; request ID'],
 ['Admin browser','Admin API','GET/POST/PATCH/PUT/DELETE','/api/v1/admin/**; /api/v1/users/**','Independent admin JWT + stored session; X-Admin-2FA for sensitive routes','Fresh account/role/permission lookup; one-time email code; shared attempt budget','Browser request lifetime; downstream clients bounded','No generic automatic financial retry','403 permission/TOTP; 429 abuse; failure states persisted/visible'],
 ['Gateway','Auth','POST','/internal/verify-token','S: gateway→auth + original user bearer in body','Token subject match + current account, revocation, plan','3s','None','Fail closed 401/403/503'],
 ['Chat / Payment / Quota','Auth','POST','/internal/verify-token','S: caller→auth + original user token','Only introspection; cannot list/administer users','3s','None','Fail closed'],
 ['Document / Notification / Analytics / Chat profile','Auth','GET','/v1/auth/me','Original user bearer','Auth validates current status, token profile and revocation; profile subject matched','Document/Notification 3s; Analytics 5s; profile 2s','None','Reject unavailable/invalid account'],
 ['Gateway','Backend APIs','Corresponding user method','Alias translation in upstreamPath.ts; fixed target per serviceRegistry','Original bearer; browser identity/internal/service headers stripped','Every sensitive receiver reauthenticates; user headers alone have no authority','30s / 135s SSE','None','Upstream status retained; gateway owns CORS; cancellation propagated'],
 ['Gateway','Admin API','GET / POST','/api/v1/internal/config/settings; /api/v1/admin/security/rate-limit-violation','S: gateway→admin-api','Settings read and rate-limit report only','5s default','Config cache; reporting best effort','Policy/cache failure behavior documented in rate limiter'],
 ['Chat','Admin API','GET','/api/v1/internal/config/ai_model_routing; /plans; /template_catalog','S: chat→admin-api','Model/plan/template policy only','Model 2s; default 5s','5s model cache; template no stale allow','Provider/template policy unavailable rejects'],
 ['Chat','Quota','POST','/v1/quota/check','S: chat→quota','User-scoped reservation namespaced to Chat; AI calls metered','Client bounded HTTP; see quotaClient source','Owned stable reservation ID','Quota denied/outage stops provider'],
 ['Document API','Chat','GET','/api/chat/session/:id/messages','Original user bearer','Chat checks session owner; Document rechecks state owner, revision, confirmation','10s','Same generation operation ID for recovery','401/403/404/409/422/503'],
 ['Document API / worker','Quota','POST','/v1/quota/check; /refund','S: document→quota','Reservation/refund receipt owned by Document; stable generation ID','5s','Owned/idempotent receipt; terminal failure refund','No unrestricted increment/reset permission; refund outage not durably repaired'],
 ['Document','Admin API','GET','/api/v1/internal/config/template_catalog','S: document→admin-api','Published variant availability; alias-aware','3s','No stale allow','503 on policy outage; 403 withdrawn'],
 ['Document worker','PDF','POST / GET','/generate; /ready','S: document→pdf','Only Document can render; schema/raw-body binding; no remote resources/scripts','30s client; 15s renderer page/launch limits','Bounded document queue attempts','503 overload; bounded concurrency; typed failure'],
 ['Payment','Auth','GET / PATCH','/internal/users/:uuid; /internal/users/:id/plan','S: payment→auth','Single recipient profile or plan sync; status/list/stats denied','5s','Webhook-owned retry through inbox/queue','Non-2xx throws to worker'],
 ['Payment','Quota','POST','/v1/quota/plan/sync','S: payment→quota','Plan baseline only; overrides/resets denied','5s','Idempotent baseline sync','Non-2xx throws to worker'],
 ['Payment / Auth / Document / Admin','Notification','POST','/notification/send','S: caller→notification','Allowed notification types per caller; Admin approved control-plane messages','5s default','Auth queue fallback; queue retry policies','Provider success not inferred from queue acceptance'],
 ['Auth / Chat / Document / Payment / Quota / Admin','Analytics','POST','/v1/analytics/event; /generation-event','S: caller→analytics','Backend event ingestion only; reports require Admin identity','5s default; explicit caller overrides in inventory','Usually best effort; Analytics queue bounded','Telemetry failure does not invent workflow success'],
 ['Analytics','Payment','GET','/v1/payment/admin/revenue','S: analytics→payment','Currency-safe revenue read only','5s','None','503 on unavailable reporting'],
 ['Quota','Admin API','POST','/api/v1/admin/security/bot-detection-event; /auto-suspend','S: quota→admin-api','Quota security reporting only','5s default','Abuse/cooldown keys; best effort','Failure logged; no general admin authority'],
 ['Admin API','Auth','GET / POST / PATCH','/internal/users/**; /internal/referrals/**','S: admin-api→auth','Admin endpoint first enforces current RBAC and sensitive-action verification','10s','No generic mutation retry','HTTP error propagated'],
 ['Admin API','Payment','GET / POST / PATCH','/v1/payment/admin/**','S: admin-api→payment','Billing reports, coupons/trials/configured mutations; receiving method/path ACL','10s','No generic mutation retry','503/502 on dependency failure; provider workflow not claimed'],
 ['Admin API','Quota','GET / POST / DELETE','/v1/quota/admin/stats; /override; /override/:id; /reset; /plan/sync','S: admin-api→quota','Admin-only operations; receiving quota validation/audit','HTTP clients 5–10s','Explicit retries only; durable mirror deletion before acknowledgement','Partial sync failures exposed'],
 ['Admin API','Chat MCP','POST','/internal/resources','S: admin-api→chat','Read-only initialize/initialized/resources/read; support RBAC and audit; no tool mutation','10s','Separate fresh credential per HTTP request','503 unavailable; no synthetic session data'],
 ['Admin API','Chat','GET','/api/internal/status/keys; /api/metrics','S: admin-api→chat','Status/metrics only; no model key value','Status 5s','None','Receiver denies other caller identities'],
 ['Admin API','Analytics','GET / POST','/v1/analytics/* reports; /event','S: admin-api→analytics','Read reporting; ingest approved events','5s; traffic 15s','None','Unavailable values are not proof of actual provider telemetry'],
 ['Notification','Admin API','GET','/api/v1/admin/notifications/config/public; /api/v1/internal/config/branding','S: notification→admin-api','Private delivery templates/settings/branding only; full config/plan read denied','5s default','Config caching','No admin JWT/database/provider signing key returned'],
 ['Admin API','Configured services','GET','/health','Public minimal liveness','No user secrets; health is not readiness proof','4s','Periodic dashboard polling','Unavailable service shown offline/degraded'],
 ['Auth / Document / Notification','Redis → Notification worker','Queue add / consume','email_queue_auth; email_queue_document; email_queue_notification','Q: scoped Redis account + signed job','Producer, email type, queue, name, immutable job ID verified','Redis reconnect / worker lifetime','Configured attempts/delay; email send crash window remains','Poison jobs fail; delivery deduplication is not globally exactly once'],
 ['Document API','Redis → PDF worker','Queue add / consume','document','Q: document account + signed job','Persisted document owner/type/template/plan/facts must match','Redis queue / 30s renderer HTTP','Stable document job ID; bounded queue attempts','Completed PDF never undone by notification failure'],
 ['Payment','PostgreSQL → Redis → Payment worker','Inbox insert / queue add / consume','webhook_deliveries; payment-webhook','Q: payment account + signed job','Signature verified before durable intake; queue identity and stable DB event','30s reconciliation schedule; HTTP side effects 5s','3 immediate attempts/backoff; failed jobs retried to bounded 10 attempts; manual DLQ repair','ACK after DB commit, independent of Redis delivery; ordering still open'],
 ['Quota','Redis → Quota worker','Scheduled queue','quota-reset','Quota-only Redis key ACL','Worker owns reporting reset; Redis TTL owns day rollover','Midnight UTC schedule','One scheduled attempt','Late cron preserves current Redis usage; poison scope limited by Redis ACL'],
 ['Payment / Quota','Redis → Admin event subscriber','PUBLISH/SUBSCRIBE','doccraft:events','E: per-producer signed event + Redis channel ACL','Payment only payment.failed/subscription.cancelled; Quota only quota.warning; Admin nonce check','60s event token; reconnect 5s','Ephemeral pub/sub; no durable redelivery guarantee','Wrong type/unsigned/replayed events rejected'],
 ['Admin API','Redis → Admin worker','LPUSH / BRPOP / retry / DLQ','automation:queue; automation:dedup:*; automation:dlq','Admin-only key ACL','Rules loaded from Admin DB; no foreign producer access','Worker lifetime','Bounded exponential retry; BRPOP crash-loss window remains','Not an acknowledged durable queue; production recovery gate'],
 ['Analytics API','Redis → Analytics worker','Queue add / consume','analytics','Q: analytics producer/consumer key','Signed queue payload; PII redaction/anonymization option','Worker lifetime','3 attempts','External PostHog delivery NOT TESTED'],
 ['Auth / Chat / Payment / Quota / Document / Notification / Analytics / Admin','PostgreSQL','Parameterized Prisma/SQLAlchemy/pg/SQL','Owned tables plus existing reporting cross-table reads','Database credentials from environment','Ownership checks in APIs; least-privilege runtime DB roles NOT proven','Pool/client-specific; not universally bounded','Pool pre-ping and client reconnection','Local fixture uses migration owner; production account separation/TLS remain gates'],
 ['All services except stateless PDF','Redis','GET/SET/Lua/queues/cache/pubsub','Per-service key/channel patterns','Per-service Redis ACL user/password','Read-only configuration consumer keys; dangerous commands denied; default user off','Replay store 2s; other client reconnect bounds vary','Client-specific; AOF configured in Compose','Dev transport plaintext; rediss supported; TLS/failover not exercised'],
 ['Chat','Groq / Anthropic','HTTPS POST','Provider chat APIs','Provider API keys held server-side','Deployment/plan model allowlist; strict tool arguments; owner-scoped tool context','Groq configured deadline + overall turn timeout','Bounded model fallback within allowlist','Mock/deterministic tests only; external AI NOT TESTED'],
 ['Auth','Google / Firebase','HTTPS JWK / OAuth calls','Google JWKS/userinfo/OAuth','Google RS256 token; project issuer/audience/provider verification','Verified email and Google provider; account status enforced','SDK/client-specific','JWKS cache','Live Google sign-in NOT TESTED'],
 ['Payment','Paddle / PayHere','HTTPS API / hosted form','Checkout/portal/cancel; provider callbacks through public gateway','Provider API credentials; Paddle signature or PayHere checksum','Server checkout ownership, amount/currency/cadence','SDK/provider-specific; not all direct SDK deadlines proven','No real charges; synthetic callbacks only','Recurring reconciliation and approved sandbox lifecycle remain BLOCKED'],
 ['Notification / Admin','Resend','HTTPS SDK / callback','Email API; /notification/webhooks/resend-status','Resend key / age-bound Svix signature','Approved notification type; recipient/preference; redacted stored metadata','SDK-specific; outbound relay 5s','Delivery queue retries; callback replay/idempotency not fully proven','No real delivery tested; optional status relay HTTPS operator allowlist, no redirects'],
 ['Document worker','Storage','Local disk or HTTPS Supabase','PDF upload/download/delete','Document storage credential; expiring capability links','Owner-scoped metadata; safe storage paths; dedicated signing key','Provider-specific','Stable PDF filename; no global transactional storage guarantee','Local disk verified; Supabase sandbox/retention/backup NOT TESTED'],
 ['Admin API','PostHog','HTTPS API','Project analytics/query APIs','Server project/personal key','Admin analytics RBAC','10s/client-specific','No claim of actual remote data','NOT TESTED externally'],
]
transport='''**Transport notation.** `S` is a pairwise HS256 service JWT (`doccraft-service+jwt`, issuer `doccraft-services`, destination audience, source subject, kid, 60-second expiry, UUID nonce, exact HTTP method/path/query and SHA-256 raw-body binding). Receiver verifies its method/path/caller policy and atomically claims the nonce in its own Redis namespace; missing credentials → 401, forbidden identity → 403, replay → 409, replay-store failure → 503. No receiver accepts the former universal secret as authorization. HTTP clients strip it before signing. `Q` is a seven-day signed producer/queue/name/job-ID envelope; it authenticates a job, not encryption or exactly-once delivery. `E` is a 60-second, producer/type-scoped automation event with receiver replay protection.

All local HTTP is plaintext over owned loopback sockets. Compose declares a private backend network and no backend host ports; several services need egress for providers/hosted PostgreSQL. This is configuration evidence only. Public HTTPS termination, private encrypted networking/mTLS, Redis TLS, firewall/egress policy and deployed certificates have **not** been exercised. No test disabled certificate validation.
'''

communication='''# Phase 3 — Inter-service communication

Date: 2026-10-15. Inventory follows the Phase 2 architecture; it does not restart the original audit.

'''+f"Source evidence: **{len(calls)} communication call sites** and **{len(routes)} route declarations** in [connection-callsites.json](evidence/phase3/connection-callsites.json) and [api-inventory.json](evidence/phase3/api-inventory.json). Declarations include aliases/dormant helpers and are not successful workflow counts. The method/path/caller policy below is authoritative for private HTTP operations.\n\n"+transport+'''
**mTLS deployment decision:** application service JWTs authenticate operations but do not encrypt traffic. A single private Compose bridge reduces exposure but does not establish a production confidentiality guarantee. Require verified TLS for public ingress, PostgreSQL and Redis; use mTLS through a managed proxy/mesh or a demonstrated encrypted workload network for cross-host service traffic, prioritizing Admin, Payment, Auth and Quota. A mesh also requires workload certificate issuance, CA trust, renewal, revocation and failure monitoring. No such production control plane was accessible, so mTLS is a deployment requirement/evaluation, not an implemented or tested claim. Keep receiver operation ACLs after enabling transport identity.
## Complete discovered communication matrix

Responses are validated to different depths: schemas, ownership/revision/confirmation checks on document/AI operations; status checks and selected shape checks on generic HTTP clients. Generic configuration/provider responses do not all have strict runtime schemas. Logs use gateway request IDs and service-local/queue IDs; there is no verified fleet-wide trace exporter. Sensitive notification fields are redacted, but universal log/PII/URL scrubbing is not claimed.

'''+table(['Source','Destination','Method / operation','Endpoint / channel','Authentication / identity headers','Authorization / validation','Timeout','Retry / recovery','Error / monitoring'],connections)+'''
## Service authorization / internal API inventory

This is generated directly from `shared/service-permissions.json`. A valid key for another source/destination pair is insufficient. No PDF identity has an outgoing HTTP grant. A user bearer does not grant these internal operations. Gateway strips browser internal credentials before proxying.

'''+table(['Receiving service','HTTP methods','Path matcher (anchored)','Authorized service identities'],[[receiver,','.join(rule['methods']),f"`{rule['path']}`",', '.join(rule['callers'])] for receiver,rules in policy.items() for rule in rules])+'''
## Service communication diagram

```mermaid
flowchart LR
  U[User browser] --> G[Gateway]
  A[Admin browser] --> ADM[Admin API]
  G --> AU[Auth]
  G --> C[Chat / MCP / SSE]
  G --> D[Document API]
  G --> P[Payment]
  G --> Q[Quota]
  G --> N[Notification]
  G --> AN[Analytics]
  G --> ADM
  C --> AU
  C --> Q
  C --> ADM
  D --> AU
  D --> C
  D --> Q
  D --> ADM
  D --> W[Document queue worker]
  W --> PDF[PDF renderer]
  W --> S[Local disk / Supabase]
  P --> AU
  P --> Q
  P --> N
  P --> ADM
  N --> AU
  N --> ADM
  Q --> AU
  Q --> ADM
  AN --> AU
  AN --> P
  ADM --> AU
  ADM --> C
  ADM --> P
  ADM --> Q
  ADM --> N
  ADM --> AN
  C --> AI[Groq / Anthropic]
  P --> PP[Paddle / PayHere]
  N --> E[Resend / approved status callback]
  AN --> PH[PostHog]
  ADM --> PH
  ADM --> E
  AU & C & D & P & Q & N & AN & ADM --> DB[(PostgreSQL)]
  AU & C & D & P & Q & N & AN & ADM & PDF --> R[(Redis ACL namespaces)]
```

## Trust boundaries

```mermaid
flowchart TB
  subgraph untrusted[Untrusted client / provider output]
    Browser[Browser headers and payloads]
    Model[AI tool proposals]
  end
  subgraph edge[Public identity boundary]
    Gateway[Gateway sanitizes headers and verifies credentials]
    Admin[Admin JWT / persisted session / RBAC / second factor]
    Callback[Provider signature verification]
  end
  subgraph private[Private application boundaries — each receiver verifies authority]
    Auth[Auth owns user signing private key]
    Services[Scoped service JWTs + receiving operation ACL]
    Tools[Owner-bound in-process MCP + strict proposal schema]
    Workers[Signed queue jobs + record ownership comparison]
    Renderer[Separate PDF process / no DB or provider secrets / blocked remote resources]
  end
  Browser --> Gateway
  Browser --> Admin
  Browser --> Callback
  Model --> Tools
  Gateway --> Auth
  Gateway --> Services
  Admin --> Services
  Callback --> Workers
  Services --> Tools
  Services --> Workers
  Workers --> Renderer
```

## User and service authentication flow

```mermaid
sequenceDiagram
  participant B as Browser
  participant G as Gateway
  participant A as Auth
  participant S as Receiving service
  participant R as Redis
  B->>A: Verify account / password or Google / MFA
  A-->>B: Ed25519 access JWT (Auth private key only)
  B->>G: Bearer JWT + untrusted identity headers
  G->>G: Remove identity, service and forwarded headers
  G->>A: Request-bound gateway service JWT + original bearer
  A->>R: Check access revocation
  A-->>G: Current active user and plan
  G->>S: Original bearer / fixed upstream path
  S->>S: Verify bearer independently
  S->>A: Scoped introspection or original bearer /me
  A-->>S: Current account and revocation state
  S->>S: Check ownership / permission / operation schema
  S-->>B: Authorized result or denial
  Note over S,R: Private calls also verify destination, source, method, raw body and one-use nonce.
```

## Exposure and credential ownership

'''+table(['Component','Host exposure in root Compose','Credential / storage authority','Deployment limitation'],[
 ['Gateway','Loopback published','Gateway→Auth/config/report keys; user public verification keys; rate-limit namespace','TLS reverse proxy required; native dev listens on all interfaces'],
 ['Admin API','Loopback published','Own admin JWT key, RBAC/session/config DB, scoped service clients; automation Redis','Restrict operator network; stable secret and shared DB required'],
 ['Auth','No published port','Only user signing private key; Auth DB; Auth email queue producer','Do not distribute its private key to consumers; revoke affected historical keys'],
 ['Chat / Payment / Quota / Document / Notification / Analytics','No published port','Individual HTTP/queue/event keys and Redis ACL account; service environment DB/provider credentials','Database credentials are still deployment-managed and not proven least privilege'],
 ['PDF','No published port; private backend only','Dedicated PDF identity and replay Redis namespace; no DB, storage, provider or user signing key','Chromium sandbox/OS image, seccomp and production egress controls unverified'],
 ['Redis','No published port; backend internal','Default user disabled; hashed ACL passwords; health account PING only; AOF/noeviction configured','ACLs do not encrypt traffic; rediss, failover, encrypted backups unverified'],
 ['PostgreSQL','External deployment, absent from root Compose','Per-service environment connections; migrations/schema initialization currently need broader owner rights','Separate migration/runtime roles, column/view grants, TLS verification and encrypted backups are release gates'],
 ['Legacy per-service Compose files','Include root topology; do not publish old standalone ports','Same generated identities/ACLs as root topology','Requires Compose include support; container runtime not available for execution'],
 ['Native development','Node APIs bind 0.0.0.0 unless launcher override; owned test fixtures use loopback/random ports','Private identity files via scripts/with-service-identity.cjs','Do not treat developer ports as production network isolation'],
 ])+'''
Service credential generator writes per-service JSON with mode 0600 and refuses overwrites. Browser bundles receive no internal key. Redis credential generator creates separate users, key/channel patterns, read-only config consumers and a health account. Download signing belongs only to Document. Queue tokens contain data in readable JWT payloads: network/storage encryption is still required.

The local download-signing implementation currently has one active key; rotating it invalidates existing local signed download URLs. Plan reissuance or implement a verification-key overlap before a production rotation. No transparent download-key rotation is claimed.

**Rotation order:** provision a new kid in receiving keyrings; distribute receiver config and verification public keys; switch only the corresponding sender; wait out token/queue lifetimes or reconcile old jobs; remove old key IDs. Test old/new overlap and then revocation. Source rotation support is tested; no deployed rotation or revocation is asserted. User signing key rotation requires public-key rollout before Auth switches signing key. Admin key rotation invalidates existing admin signatures; legacy refresh-token migration deliberately signs users out.

## Database and queues

Prisma/SQLAlchemy/pg queries use parameter binding for normal values; identifiers in audit fixtures are generated and constrained. Admin namespaces separate plan/coupon/audit ownership. Document and admin schema initialization still run DDL, and reporting services read other domains' tables. The local integration account is an owned fixture migration account. No service-specific production grants/RLS/column views were tested; signing HTTP does not restrict SQL authority.

Redis ACL execution rejects anonymous access, foreign queues/keys, dangerous CONFIG access, unauthorized config writes/publication, and Document reading Auth verification jobs. Producer scope and record comparison reject forged jobs before effects. Redis Lua reserves/refunds atomically; signed HTTP replay protection is shared across process restarts while Redis state survives. Compose AOF everysec can lose recent writes during power failure; only pause/resume was tested. Pub/sub is ephemeral. Admin automation uses BRPOP and can lose an in-flight job on crash. Notification may resend after a provider-send/database-log crash. These are explicit recovery gaps.

The durable payment inbox improves intake and queue reconstruction; it does not create a distributed atomic transaction with Auth and Quota. General reordered callbacks and concurrent distinct lifecycle events remain a release blocker. PayHere renewal identification cannot depend on unsigned payment_id/message_type/subscription_id. See [official recurring verification](https://support.payhere.lk/api-%26-mobile-sdk/recurring-api) and [Retrieval API](https://support.payhere.lk/api-%26-mobile-sdk/retrieval-api). No Retrieval workflow was exercised.

## Dormant or incomplete connections

`DocumentServiceClient.validate_template_html` targets an absent authoring endpoint and now returns invalid/unavailable instead of fabricated validation success. It is not the implemented bundled-template publication pipeline. The alternate notification invitation helper now uses the real signed dispatch contract; actual provider delivery remains unverified. Generic gateway admin aliases forward user credentials; the supported Admin UI uses Admin API directly. AI MCP mutation is in-process and requires a current turn lease; external user MCP is owner-scoped, and support MCP is separately read-only. The complete source declaration inventory includes these distinctions.
'''
write('13-INTER_SERVICE_COMMUNICATION.md',communication)

impacts = [
 'Compromised service could invoke unrelated privileged operations.',
 'A consumer holding a shared signing key could impersonate arbitrary users.',
 'Foreign producers could inject privileged jobs or alter configuration.',
 'Logged-out, suspended or demoted identities could retain access.',
 'User signing authority could be confused with administrative authority.',
 'Renderer compromise could expose database and provider credentials.',
 'Direct network access and unverifiable transport could bypass intended isolation.',
 'Tampered unsigned identifiers could manufacture duplicate billing effects.',
 'Authentic provider callbacks could fail verification while faulty fixtures appeared valid.',
 'Callbacks acknowledged before durable intake could be lost during outages.',
 'Billing transitions could fail authorization or erase legitimate daily usage.',
 'Delayed resets could erase current-day usage; truncated receipts could prevent correct refunds.',
 'Malicious job metadata could mutate or refund another owner record.',
 'Unsigned automation events could trigger privileged rules.',
 'Unauthenticated callers could inspect operational metrics.',
 'Database disclosure could expose refresh bearers; shared signing authority could forge downloads.',
 'Unbounded guessing or authenticator replacement could compromise sensitive actions.',
 'A forged role display name could imply unrestricted administrative rights.',
 'Forged forwarding headers could bypass IP restrictions or misattribute audit events.',
 'Configured status delivery could disclose data to an unintended destination.',
 'Unbounded direct requests could exhaust Python service memory.',
 'Admin downstream updates could fail authentication or bypass consistent transport.',
 'Vulnerable dependency chains increase runtime or build-environment exposure.',
]
vuln=table(['ID','Severity','Service','Vulnerability','Impact','Fix','Verification'],[
 [row[0],row[1],row[2],row[3],impacts[index],row[4],row[5]] for index,row in enumerate(findings)
])
write('12-MICROSERVICES_SECURITY_AUDIT.md','''# Phase 3 — Microservices security audit

**Production readiness: NOT READY.** Local trust boundaries were materially strengthened and tested. Deployment, entitlement and distributed recovery requirements below remain mandatory. This is an engineering remediation report, not a security certification.

The Phase 2 report and numbered reports were used as the baseline. Source communication call sites, receiving middleware, gateway aliases, private APIs, worker payloads, Redis ACLs, database clients and every checked-in Compose manifest were traced. See the complete [communication matrix and trust diagrams](13-INTER_SERVICE_COMMUNICATION.md).

## Findings and corrections

'''+vuln+'''
## AI, MCP and user isolation

Model output is untrusted. The exposed mutation tool is limited to schema-validated slot proposals supported by current user evidence, an authorized owner/session and current turn lease. The read tool accepts no arbitrary arguments. Cross-session IDs, reserved state fields, invalid item identities, unsupported tools and forged proposals are rejected by shared validation/repository checks. Private support MCP uses initialize/initialized/resources/read and has no mutation tool permission. Prompt-injection flags are an additional signal; they are not the authorization boundary.

Tests cover malicious/malformed provider proposals, unauthorized resource calls, session ownership, duplicate turns and committed state. The actual stack uses deterministic field edits with provider keys disabled. External prompt-injection behavior, provider routing/limits and language quality were not verified against live AI providers. Plan benefits are not uniformly enforced; U-R04 remains open.

## Gateway and backend boundaries

The gateway verifies credentials before protected routing, removes browser identity/internal/service/forwarded headers, uses a fixed registry and alias mapping, preserves CORS ownership and upstream error statuses, bounds JSON/raw webhooks, rate limits, aborts disconnected streams and imposes upstream deadlines. Backends revalidate credentials/current account rather than trusting x-user-id, x-user-plan, x-user-email, x-user-role or x-is-admin. Protected direct-port probes and owner checks are tested. Public provider hooks verify provider signatures. Public downloads/shares require valid expiring capability links. Health endpoints intentionally expose limited liveness.

Direct native processes can still listen on all interfaces; secure Compose configuration does not prove deployed firewall rules. Root Compose publishes only loopback edges, and deprecated standalone stacks include that topology. Browser applications receive user/admin credentials only. Internal credentials are not browser configuration.

## Sensitive data and encryption

Auth-only Ed25519 user signing, independent admin key, Document-only download signing, pairwise service credentials, queue/event keys and private credential files separate authority. Refresh bearer tokens are stored as SHA-256 digests, and the security migration invalidates legacy plaintext sessions. Stored notification metadata redacts verification/reset/invitation/download credentials. Passwords are hashed by existing password services. Queued JWT payloads are signed but readable; TOTP secrets and some email/reset challenges still require an encrypted-at-rest storage/backup design. No production KMS, database/Redis disk encryption, backup restore, secret revocation or log-retention assessment was available.

Local transport is loopback HTTP/plain Redis. node-postgres certificate verification is enabled for remote endpoints and Python SSL parameters are preserved; this does not verify Prisma/libpq production URLs or deployed CA chains. Production HTTPS, mTLS or equivalent encrypted private transport, Redis TLS and network policy remain unverified. No TLS certificate checks were disabled for tests.

## Remaining release requirements

- Complete the authoritative feature/entitlement matrix and enforce every consumer (logo, premium templates, priority, watermark, retention and custom/Max behavior).
- Complete ordered payment reconciliation/atomic claims across services; validate PayHere Retrieval and recurring callbacks plus Paddle lifecycle/refund/coupon/trial workflows in approved sandboxes. Current PayHere processing intentionally cannot grant another installment from altered unsigned fields.
- Make quota reservation/document commit/refund reconciliation durable across process/database/Redis failures. Test actual day rollover, lost Redis state, override expiry and post-crash repair. Decide and enforce the normal browser-export metering contract; a browser can independently rasterize data it already owns.
- Provision separate least-privilege PostgreSQL runtime accounts/column views and migration authority. Validate deployed upgrades and rollback/backup restore against an isolated legacy snapshot.
- Verify credential revocation/rotation, public HTTPS, private TLS/encrypted networking, Redis TLS/auth/AOF recovery, Docker network/firewall policy and hardened current Chromium/container sandbox controls.
- Close residual build-tool dependency advisories; signed jobs do not provide confidentiality or exactly-once email/automation processing. Add durable automation acknowledgements and notification send/log reconciliation.
- Establish shared production readiness, dependency/capacity SLOs, correlated traces, log/PII redaction and queue-drain/restart/failover evidence. Action TOTP time-window replay remains open.

Actual tests and failed exploratory attempts are separated in [security test results](14-SECURITY_TEST_RESULTS.md). Remaining original findings are assessed individually in [remediation report](15-PHASE3_REMEDIATION_REPORT.md).
''')

now=datetime.datetime.now(datetime.timezone.utc).isoformat()
summary={'generated_utc':now,'production_readiness':'NOT READY','stack':{'passed':passed,'total':len(checks)},'security':{'passed':security_passed,'total':len(security)},'browser':{'passed':browser_passed,'total':len([r for r in browser if r['status']!='DIAGNOSTIC'])},'original_remaining_nine':original,'new_finding_groups':len(findings),'external_providers':'NOT TESTED; no real charges/email/provider mutations'}
(OUT/'phase3-summary.json').write_text(json.dumps(summary,indent=2)+'\n')

testtext=f'''# Phase 3 — Security test results

Generated UTC: {now}. **Production readiness: NOT READY.**

Latest actual isolated stack: **{passed}/{len(checks)} assertions verified**. Security-category assertions: **{security_passed}/{len(security)}**. Actual browser assertions: **{browser_passed} verified**. These overlap: the stack includes browser-harness completion. Unit tests are not independent provider verification and are not added to a claimed feature-completion percentage.

## Automated commands

'''+table(['Check','Result','Observed test count / scope','Evidence','Seconds'],commands)+'''
Logs retain exact commands, exit codes and UTC start times through `scripts/system_audit_check.py`. Root chat tests include shared Node contracts plus Vitest Chat/frontend/gateway contracts; the separate gateway suite overlaps. Python services are tested separately to avoid collisions among packages named `app`.

Frontend lint and build/type checks passed. Backend TypeScript builds passed; the backend workspaces do not define a separate lint command, so no independent backend lint result is claimed. Build logs retain existing bundle-size/deprecation/tool-configuration warnings. The dependency collection command succeeding means advisory JSON was collected; consult the counts below rather than interpreting collection PASS as zero advisories.

## Actual isolated resources

The harness requires loopback `PG_AUDIT_URL`, creates a uniquely named database and never resets/migrates an existing shared database. PostgreSQL was compiled from the official 18.4 source into an audit-owned temporary location. Auth, Chat, Payment and Quota ran checked-in migrations. Admin/Document/Analytics/Notification used real PostgreSQL clients and actual schema initialization. Redis runs on a random loopback port with generated per-service ACLs. All nine services plus the PDF renderer run as actual processes; the PDF worker, both Vite frontends and Chromium run as actual dependencies. Every provider credential is empty/synthetic; PostHog uses a closed loopback destination; Resend is a dummy local transport. No hosted data, real charges, real emails or production penetration testing were performed.

The checked-in runner stops its child process groups, retains evidence and reports failures instead of manufacturing success. Previous stack attempts remain under `stack-attempt-*.json`; the latest `stack-integration.json` is authoritative. Fresh-schema success does not prove a deployed legacy upgrade. No Docker/Podman executable was available, so container startup/network/TLS checks are configuration-only. Actual runtime/browser versions are recorded in [environment-phase3.json](evidence/phase3/environment-phase3.json); no production current-browser patch attestation is implied by a local render. Native tests use an explicitly selected browser and `--no-sandbox` in this container; production Chromium sandboxing/OS hardening is unverified.

## Required negative scenarios and evidence scope

'''+table(['Scenario','Evidence / outcome','Limit'],[
 ['Unauthenticated internal / forged identity headers','Live Auth, Quota, Payment, Chat MCP, Notification, Analytics, Admin config and PDF reject retired secret/forged headers','Health, explicit provider callbacks and expiring capability endpoints are intentionally public'],
 ['Invalid/expired JWT, wrong issuer/audience/type/algorithm','Shared Node security regressions; direct backend authentication tests','Not every claim permutation is repeated over every live route'],
 ['Unauthorized service identities','Actual Chat→Quota override, Payment→Auth status/stats, Gateway→full config, Notification→plans and Chat→Analytics reports denied','Method/path policy plus independent pairwise keys'],
 ['Replay/body tampering','Real Redis replay rejection at Node and Python receivers; PDF body-binding mismatch denied','Redis pause/resume tested; full Redis data loss/failover not tested'],
 ['Unauthorized admin / stale session / privilege escalation','Mounted-route denial inventory; restricted-role tests; persisted session revocation; wrong user signing secret rejected; role-name alone gives no rights','Authenticator step replay and encrypted TOTP storage remain open'],
 ['Cross-user documents / sessions / canvas','Actual stack denies other user at session/document/canvas boundary; stale layout revision rejected','One representative fixture per document type'],
 ['Unauthorized MCP / malicious tool output','Private transport denies unknown caller; in-memory MCP/repository tests reject cross-session/reserved/malformed proposals','Actual external model prompt-injection evaluation NOT TESTED'],
 ['Webhook replay / altered unsigned IDs','Concurrent signed local duplicates yield one invoice; altered payment_id/subscription_id cannot create another charge record','Real provider sandbox and installment Retrieval verification NOT TESTED'],
 ['Duplicate/poison queue messages','Actual Redis unsigned document/payment jobs fail before effects; signed-envelope wrong-ID/name/queue tests; persisted PDF replay and owner mismatch tests','Email/automation send/ack crash windows remain open'],
 ['Invalid / oversized payloads','Zod/Pydantic/schema regressions; live gateway 400/413; ASGI chunked raw-body limit tests','Fleet load/slow-client resource exhaustion not benchmarked'],
 ['Service outage / timeout / restart','Actual Auth stop/restart; Redis SIGSTOP/SIGCONT; renderer child kill/relaunch; Payment inbox reconstruction after process restart','No production DB failover, cluster outage or chaos test'],
 ['Unauthorized configuration update / TOTP abuse','RBAC and negative service config grants; shared concurrent budget; protected authenticator setup','Real admin roles/toggle matrix not universally exercised through browser'],
 ['Expired share capability','Actual owned document share URL expires in isolated PostgreSQL and becomes 404; storage signature tamper/expiry regressions','Supabase signed URLs NOT TESTED'],
 ['Database / Redis security','Real migrations, CRUD, unique claims/inbox, Redis ACL/key/channel denials and Lua concurrency','Runtime database roles, TLS, at-rest encryption and backup recovery NOT TESTED'],
 ])+'''
## Actual stack assertions

'''+table(['ID','Category','Workflow','Status'],[[row.get('id',''),row.get('category',''),row['workflow'],row['status']] for row in checks])+'''
## Actual browser assertions

'''+table(['Workflow','Status','Evidence'],[[row['workflow'],row['status'],str(row.get('evidence',''))[:350]] for row in browser])+'''
The browser drives actual price edit/second factor, MCP inspection, user pricing reload, canvas selection/ArrowRight autosave, page reload, Download PDF and guest login. It does not intercept API success responses. Browser-export PDFs are rasterized; PDF text extraction is not a valid semantic test for them. Server worker PDFs are text-extracted and checked for persisted edits and 43.89 totals where applicable. The separate renderer suite covers built-in rendering, remote-resource/script/file attacks, capacity and browser restart. See `pdf-scenarios.json`, `additional-probes.json`, and `browser-scenarios.json` for exact assertions rather than extrapolating universal visual parity.

## Honest failure history

An exploratory root Vitest command skipped service-specific environment fixtures and failed import/setup; it was replaced with each workspace's configured `npm test`. Analytics initially ran without its service import path; it passes from its own directory. Browser fixture numeric input selection was corrected to explicit Select All/Backspace. Browser store inspection from Puppeteer's isolated polling realm was replaced with actual DOM controls. The real canvas regression found an incorrectly registered autosave listener and now tests an existing element without adding one. New dependency API/type differences were corrected and rerun. Earlier failures are not production passes; final command and stack records above are authoritative.
'''

deps=read('dependency-audit.json',{})
if deps:
 testtext+='\n## Dependency advisory evidence\n\n'+table(['Component','Scope','Registry counts','Exit code','Evidence'],[[r['component'],r['scope'],r.get('counts') or r.get('error'),r['exit_code'],f"[JSON](evidence/phase3/{r['evidence']})"] for r in deps['checks']])+'''\nRegistry advisories are dependency findings, not proof of an exploitable deployed endpoint. Build-time Tailwind 3 transitive advisories remain explicitly open; the upgrade needs a deliberate CSS/browser/PDF compatibility migration. Runtime and full-tree scans are reported separately. No force downgrade or global audit suppression was used.\n'''
python_dependencies=read('python-dependencies.json',{})
if python_dependencies:
 vulnerable=[item for item in python_dependencies.get('dependencies',[]) if item.get('vulns')]
 testtext+='\n## Python environment advisory evidence\n\n'+f"The actual isolated Python environment scan reports **{len(vulnerable)} packages with advisories**. See [pip-audit JSON](evidence/phase3/python-dependencies.json) and its command log above. The first scan identified the local pip installer; pip was upgraded and the scan repeated, with [before-upgrade evidence](evidence/phase3/python-dependencies-before-pip-upgrade.json) retained. This checks installed versions, not reproducibility of the currently lower-bounded service requirements or the unexecuted production images. Lock production Python dependencies and scan each final image.\n"
write('14-SECURITY_TEST_RESULTS.md',testtext)

baseline=read('baseline.json',{})
changed=[]
for name,hash_before in baseline.items():
 p=ROOT/name
 if name.startswith('docs/') or p.suffix in ('.md','.pdf','.png'):continue
 if not p.exists():changed.append({'file':name,'change':'removed'})
 elif hashlib.sha256(p.read_bytes()).hexdigest()!=hash_before:changed.append({'file':name,'change':'modified'})
for base in ['services','shared','scripts','user-frontend/src','admin/src']:
 for p in (ROOT/base).rglob('*'):
  if not p.is_file() or (p.suffix not in ('.ts','.tsx','.mts','.py','.mjs','.cjs','.json','.sql','.prisma','.yml') and p.name!='Dockerfile'):continue
  if any(part in ('node_modules','dist','generated','.venv','redis-bin','__pycache__') for part in p.parts):continue
  name=str(p.relative_to(ROOT))
  if name not in baseline and not any(row['file']==name for row in changed):changed.append({'file':name,'change':'added'})
changed.sort(key=lambda row:row['file'])
(OUT/'phase3-changed-files.json').write_text(json.dumps(changed,indent=2)+'\n')

remediation=f'''# Phase 3 — Remediation and production-readiness report

**Decision: NOT READY.** Latest isolated stack: **{passed}/{len(checks)} verified**, including **{security_passed}/{len(security)} Security-category assertions** and **{browser_passed} actual browser assertions**. This assessment distinguishes implemented corrections from external/deployment proof. The six original finding groups marked fixed in Phase 2 remain historical baseline dispositions; the nine carried findings are checked individually below.

## Nine remaining original findings

'''+table(['Original ID','Current disposition','Implemented behavior','Verification / outstanding work'],original)+'''
U-R11 is fixed only for its tested guest draft, editable-layout and browser-export behavior. Server artifact history and quota semantics for local browser exports remain explicitly under U-R08. U-R06 bundled publication is real persistence and downstream enforcement, while arbitrary HTML authoring remains absent. No original issue is closed solely because a build passes.

## Security and functional changes

'''+vuln+'''
Guest transfer independently verifies both account and guest credentials, checks current guest status/revocation, claims each guest to one account in a PostgreSQL transaction, retains session IDs for refresh/retry and removes guest expiry only from transferable drafts. Layout writes are owner-scoped, separately versioned, size/type limited and cannot overwrite canonical semantic text. Presentation updates are persisted per session rather than leaking through one global localStorage layout. Failed writes report an unsaved state. Guest routes now permit guests to sign in/register, and the fresh account token is used explicitly for migration.

Bundled template publish/withdraw requires template approval permission and second factor, persists versioned catalog policy, treats aliases as one variant and affects new Chat selection and server generation/catalog reads. Frontends refresh from real API availability. No arbitrary template upload/validation success is fabricated.

Financial reporting uses recorded currency/cadence/amount snapshots, separates USD/LKR, normalizes annual revenue and identifies missing historical amounts. A default USD summary excludes LKR; the Admin revenue screen includes separate currency totals. Fractional-cent/non-finite plan prices are rejected, and plan creation retains selected LKR/Paddle-yearly configuration. Auth plaintext refresh credentials are invalidated by a checked-in security migration; new credentials are digested. Payment PATCH operations now use the scoped transport.

## Validation and limitations

'''+table(['Check','Result','Observed count / scope','Evidence','Seconds'],commands)+'''
The communication matrix inventories HTTP, delegated user calls, in-process/user/private MCP, signed queues/events, configuration/cache, database/Redis/storage and external providers. Positive/negative receiving-service tests use actual isolated processes where recorded. Read [security test results](14-SECURITY_TEST_RESULTS.md) for exact scenarios and [service connections](13-INTER_SERVICE_COMMUNICATION.md) for timeout/retry/error behavior. There is no evidence-based overall feature-completion percentage.

Remaining provider dependencies: approved Groq/Anthropic, Firebase/Google, Paddle and PayHere checkout/renewal/portal/refund/reconciliation, Resend delivery/status callbacks, Supabase bucket access/retention and PostHog ingestion/query. None passed an actual external sandbox workflow in this phase. Signed local callback fixtures do not clear those gates.

Remaining deployment dependencies: revocation/rotation of historical credentials; separate PostgreSQL runtime and migration accounts; verified public/private TLS or encrypted network; Redis TLS/AOF/restore/failover; firewall/egress policy; container image/runtime and current sandboxed Chromium; encrypted secrets/backups; legacy upgrade/rollback; operational monitoring/SLOs. Root Compose is a development topology, not a completed production deployment.

Remaining code work: unified entitlements, ordered cross-service payment reconciliation (including provider-verified PayHere installments), crash-safe quota/refund repair and override expiry, local browser export metering/history policy, uploaded-template authoring, durable automation acknowledgements/email reconciliation, strict runtime schemas for all generic dependency responses and TOTP step replay protection. These are concrete release blockers, not external successes inferred from mocks.

## Files and evidence

Full source/config/tooling change manifest relative to the saved Phase 3 baseline: [phase3-changed-files.json](evidence/phase3/phase3-changed-files.json). It preserves the pre-existing dirty tree and is separate from Git's entire working-tree diff. Important groups: shared authentication/permissions/queue/event/body-limit modules; credential/Redis/native launch tooling; all service receiving middleware and HTTP clients; gateway proxy; Auth sessions; Payment inbox/migrations/reporting; Quota reset; Document worker/storage/renderer; Admin sessions/RBAC/abuse/templates; frontend guest/canvas/template/revenue flows; regression/integration/browser tooling; deployment files.

New reports: [12 security audit](12-MICROSERVICES_SECURITY_AUDIT.md), [13 communication](13-INTER_SERVICE_COMMUNICATION.md), [14 security test results](14-SECURITY_TEST_RESULTS.md), and this report. Existing reports 00–11 and the root master contain a Phase 3 preface and retain historical evidence underneath. Generated summary: [phase3-summary.json](evidence/phase3/phase3-summary.json).

## Production decision

**NOT READY.** The tested boundaries reject unauthorized identities and the local product/recovery paths pass where recorded. Open entitlement, financial ordering, quota crash-repair, deployment encryption/database privilege, credential rotation, dependency and provider verification requirements prevent READY or CONDITIONALLY READY.
'''
write('15-PHASE3_REMEDIATION_REPORT.md',remediation)

preface=f'''## Phase 3 — Current status (2026-10-15)

**Production readiness: NOT READY.** Latest actual isolated stack: **{passed}/{len(checks)} assertions verified**; Security-category assertions: **{security_passed}/{len(security)}**; actual browser assertions: **{browser_passed} verified** (overlap with the stack, not additive). Pairwise service identities, receiving-service authorization/replay checks, signed jobs/events, Redis ACLs, current-account/session revocation, renderer isolation and request limits have implementation and regression evidence. Guest transfer, session canvas persistence/browser export, bundled template availability and currency-separated reporting were implemented and tested to the scope in the Phase 3 report.

The nine carried original findings are assessed individually in [15-PHASE3_REMEDIATION_REPORT.md](15-PHASE3_REMEDIATION_REPORT.md). U-R11 is fixed for tested draft/layout/export paths; the others remain partial, unresolved or externally blocked. Unified entitlements, ordered billing and quota crash repair, uploaded template authoring, deployment TLS/database privilege/rotation proof, residual build-tool advisories and actual provider sandboxes remain release requirements. Phase 2 numbers and architecture statements below are historical and superseded where Phase 3 changes them.

Current evidence: [security audit](12-MICROSERVICES_SECURITY_AUDIT.md), [communication matrix / trust diagrams](13-INTER_SERVICE_COMMUNICATION.md), [security tests](14-SECURITY_TEST_RESULTS.md), [remediation](15-PHASE3_REMEDIATION_REPORT.md).

'''
for p in sorted(DOC.glob('*.md')):
 if not re.match(r'^(?:0[0-9]|1[01])-',p.name):continue
 backup=OUT/('previous-'+p.name)
 if backup.exists():old=backup.read_text()
 else:
  old=p.read_text();backup.write_text(old)
 first,rest=old.split('\n',1)
 p.write_text(first+'\n\n'+preface+'## Historical Phase 2 / Phase 1 evidence\n'+rest)
master=ROOT/'DOC_CRAFT_FULL_PROJECT_REPORT.md'
backup=OUT/'previous-DOC_CRAFT_FULL_PROJECT_REPORT.md'
old=backup.read_text() if backup.exists() else master.read_text()
if not backup.exists():backup.write_text(old)
master_preface=preface
for name in ['12-MICROSERVICES_SECURITY_AUDIT.md','13-INTER_SERVICE_COMMUNICATION.md','14-SECURITY_TEST_RESULTS.md','15-PHASE3_REMEDIATION_REPORT.md']:
 master_preface=master_preface.replace(']('+name+')','](docs/system-audit/'+name+')')
master.write_text('# DocCraft — Full Project Report\n\n'+master_preface+'\n'+table(['Original ID','Current disposition','Implementation','Verification / remaining dependency'],original)+'\n'+table(['Check','Result','Observed count / scope','Evidence','Seconds'],[[a,b,c,d.replace('](evidence/','](docs/system-audit/evidence/'),e] for a,b,c,d,e in commands])+'\nSee the complete Phase 3 reports for the connection/authorization/network matrices, vulnerabilities, file manifest, test evidence and production release requirements. No external provider integration is claimed to have passed.\n\n## Historical Phase 2 report (preserved)\n\n'+old)
print(json.dumps(summary,indent=2))

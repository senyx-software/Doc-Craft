# Staging verification and evidence

**Staging deployment is BLOCKED by A1 host capacity and pending execution approvals.** After migration planning, the operator approved retiring paid E5 and obtaining A1. E5 is TERMINATED with its boot disk retained; the A1 launch was rejected for host capacity. No replacement host exists. Real signed OCI API discovery succeeded and the operator SSH key matches launch metadata. No guest SSH session, remote Docker container or real staging application integration was executed. The checks below must be executed on the approved target and recorded with commit/image digests, timestamps and non-sensitive evidence.

| Required check | Acceptance evidence | This run |
| --- | --- | --- |
| OCI target and host | Correct instance OCID/name, region, private IP, independently verified SSH host key | API identity and launch-key match PASS; E5 retired; new A1 identity, host key and route still required |
| OS, CPU and capacity | Real OS/architecture; RAM/disk/swap and compatible images | AMD/12 GiB/1 OCPU and Ubuntu image from API; guest checks BLOCKED |
| PostgreSQL / Redis | TLS connections, scoped role/ACL access, readiness, runtime DDL denial | BLOCKED |
| Service communication | Real signed calls; private TLS; bad signatures/replayed nonce rejected | BLOCKED |
| User registration/login | Approved synthetic account, persistence, email behavior and invalid login rejection | BLOCKED |
| Refresh / logout | Actual HttpOnly/Secure cookies, rotation, Origin check, revocation/reload | BLOCKED |
| Admin auth / permissions | MFA as configured, role restrictions, source allowlist, user token rejection | BLOCKED |
| Document creation/edit | Invoice and quotation through real API/browser; save/reload/ownership | BLOCKED |
| Chat collection / corrections | Real approved model/provider; multi-turn fields, corrections, update persistence; no fabricated success | BLOCKED; managed AI intentionally disabled |
| Totals | Discounts, tax, rounding, inclusive/exclusive cases verified against persisted document and exported PDF | BLOCKED |
| PDF render/download | Normal Chromium sandbox, signed renderer, correct PDF bytes/pages, authenticated download | BLOCKED; prior normal sandbox failed |
| Admin config synchronization | Versioned change observed in correct services with replay/authorization checks | BLOCKED |
| Billing | Sandbox checkout/webhook/reconciliation, quotas and duplicate-event rejection; no real charge | BLOCKED |
| Restart/recovery | Approved container restart, persisted data/sessions, dependency outage/recovery | BLOCKED |
| Public security | Only approved edge ports reachable; internal ports denied; HTTPS/CORS/cookie checks | BLOCKED |
| Rollback / restore | Compatible image rollback plus separate isolated DB/storage/keyring restore | BLOCKED |

The existing `verify` Compose tool performs actual dependency readiness, signed service traffic, frontend HTTP, unauthorized admin rejection and signed PDF rendering. It makes no model inference or payment. The staging override additionally refuses enabled managed AI routing. Even a successful verifier is a subset of this table; it cannot establish registration, full document behavior, real-model accuracy, real billing or disaster recovery.

## Local work actually executed

Local deployment safety tests, shell/Python syntax checks, Actionlint, migration immutability policy, redacted environment extraction and real standalone Compose parsing were run. Registry manifests for six pinned base images were fetched and their digests/platform lists checked. Subsequent actual OCI requests verified identity, topology, limits/available quota, IAM policy and reported usage cost; they are real cloud API checks, not mocks. Exact current outcomes are in [deployment results](08-DEPLOYMENT-RESULTS.md) and [verification evidence](evidence/local-verification.json). Filesystem tests use temporary synthetic files, subprocess mocks and injected failures where declared. They establish local guard behavior, not VPS application integrations.

No local test suite was counted as successful staging end-to-end testing. No historical browser/native-stack counts were relabeled as new execution. Container restart, resource enforcement, network/firewall, scoped secret mount permissions and production Chromium sandbox acceptance remain unverified.

## Existing production blockers remain

The current remediation report records real-model failures (23/112 local 1.7B, 4/16 bounded 4B, 0/8 business supplement), normal signed PDF readiness/render failures (503/500), unaccepted image findings, and incomplete Docker/cloud/off-host recovery verification. These are **historical results from the referenced audit**, not rerun by this deployment preparation. [Current remediation verification](../production-remediation/05-VERIFICATION-RESULTS.md), [production-readiness gates](../hybrid-ai/16-PRODUCTION-READINESS.md).

Keep production NO-GO until each applicable finding is resolved and independently verified. A private staging smoke pass or disabled-AI health response does not resolve the model failures or authorize production.

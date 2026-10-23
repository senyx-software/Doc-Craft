# Remaining risks and launch gates

**Production remains NO-GO.** Twelve findings have fixed code with scoped regression evidence; seven are partial, four blocked and four not fixed. See the per-finding ledger for exact limits.

1. **AI quality:** actual candidates pass23/112 and4/16; the business supplement passes0/8. Select a capable approved model/configuration and repeat applied conversations, corrections, field mapping, dates, calculations, undo, reload and real PDF generation. Do not infer capability from connectivity.
2. **Authentication/session acceptance:** execute real Google consent/state/PKCE/nonce/replay/MFA/account-linking/redirect/TLS acceptance. Access-token JavaScript storage remains a risk; agree and verify the complete session/XSS/CSRF design. Keep live credentials out of tests.
3. **Database rollout:** inspect normalized-email collisions and test the additive index on a legacy clone. Do not auto-merge staff or roll back to images with the fixed authentication/account-integrity defects.
4. **Infrastructure/images:** resolve pinned-base advisories, build/scan final target images, validate private TLS/ports/cgroups/secrets/startup/failures/secure Chromium and actual migrations/rollback. Supply the chosen provider/state/SSH/registry/protected GitHub environment. No Terraform apply or production deploy is authorized by this work.
5. **Recovery/monitoring:** install/configure approved encrypted off-host backup and external alerts in staging, protect recovery passwords separately, accept maintenance/retention/RPO/RTO, and complete a whole-host/key/asset restore and alert drill. Source and stubbed controller tests are insufficient.
6. **Privacy:** DATA-001 remains open pending explicit retention/export/deletion policy and complete resumable cross-store implementation. Existing partial purge must not be described as complete erasure.
7. **Provider and feature coverage:** actual paid billing lifecycle/cloud fallback/spend, remaining mutation/permission/mobile/browser/network variants and long histories still require acceptance. The91 admin checks establish navigation only.
8. **Capacity/contention:** native short workloads and measured model memory do not prove sustainable full-VPS throughput or an8GB minimum. Benchmark the approved complete deployment with target CPU/disk/network and PDF+LLM concurrency; measure admission/DB lock waits before optimizing PERF-002.

Next operator inputs: approved staging CPU/provider/domain/state, temporary test-provider accounts/credentials through the secure configuration channel, external backup/heartbeat destinations and operational ownership, legacy migration clone, retention requirements and accepted quality/latency/recovery targets. Do not put credentials into reports or chat.

# Verification results and provenance

Decision: **NO-GO**. All counts refer to new remediation executions and retain each test's scope.

| Check | Result | Scope |
|---|---|---|
| Shared Node tests |276 passed| Contracts/resolvers/security helpers; fixtures where declared |
| Chat/gateway/frontend Vitest |275 passed| Includes explicit provider/database mocks and actual browser rasterization via test-only launcher |
| Auth Vitest |71 passed| Actual crypto with local ephemeral keys; explicit Google/DB handler stubs |
| Admin pytest |200 passed| Disposable SQLite/API fixtures; nonce/transport overrides where declared |
| Payment Vitest |95 passed| Includes synthetic provider and financial inputs; no real payment acceptance |
| Document pytest |104 passed| Existing disposable tests; not production renderer acceptance |
| Analytics pytest |4 passed| Authorization and explicit query-failure injection |
| Deployment unittest |33 passed| Configuration/policy/controller/send stubs; not a real deployment |
| Actual integrated HTTP |26/26 passed| Gateway, signed native services, PostgreSQL/Redis |
| Actual security acceptance |11/11 passed| Reset race, revoked sessions, refresh Origin/rotation, OAuth disabled routing and PostgreSQL staff creation |
| Main browser |99/99 passed| Eight user checks and91 admin navigation checks; no response mocks; navigation is not full mutation coverage |
| Custom canvas reload |PASS| Actual Apply/save/backend/reload |
| Billing/refresh/logout browser |4/4 passed| Zero real invoice rows; real HttpOnly cookie rotation/removal/reload |
| Local1.7B proposal corpus |23/112 passed| Actual fresh inference, current schemas;89 failures |
| Local4B bounded corpus |4/16 passed| Actual fresh inference;12 failures |
| Business supplement |0/8 passed| Actual fresh inference;8 failures |
| Signed normal PDF |ready503/render500| Environment acceptance blocked; sandbox unchanged |
| Native snapshot restore |PASS|73 tables/499 rows/568 constraints; not off-host/full-VPS recovery |
| Native restart |PASS| Owned service SIGTERM/restart and retained session access; not Docker |
| Builds/lint |PASS| Backend and production frontend builds; normal chunk-size warnings remain |
| Actionlint/Terraform/policies |PASS| Static validation only |
| Docker/hosted deployment/cloud/Google/payment/off-host DR |BLOCKED| Missing real prerequisites; no simulated production success |

Commands are recorded per finding in the [register](../production-audit/15-FINDINGS-REGISTER.md) and machine-readable [verification](evidence/verification.json). Private execution-log SHA256 hashes preserve provenance without publishing credentials. The [runtime26](evidence/runtime/integrated-tests.json), [security11](evidence/runtime/security-acceptance.json), [browser99](evidence/runtime/browser-tests.json), [billing4](evidence/runtime/billing-browser.json), [custom reload](evidence/runtime/custom-template-reload.json) and raw model records retain actual outcomes. Suite totals are not a claim of complete end-to-end coverage.

Failures during development were retained and corrected: Puppeteer initially looked in an empty cache; the installed test-only launcher then passed. A literal-mode transition regression was caught and fixed. Two admin fixtures previously expected empty200 during an unavailable dependency; they now assert the intentional503 contract. A browser pass overlapped Vite output replacement and observed404; the final suite ran only after builds finished. Earlier helpers used a wrong import/path or expected401 where a403 also correctly denied revoked access; corrected real checks pass. Those are not concealed successful production deployments. Model failures and PDF acceptance remain unresolved, and unexecuted feature variants are not passing by implication.

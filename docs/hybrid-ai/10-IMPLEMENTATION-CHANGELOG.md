# Implementation changelog

## Existing working-tree extension preserved

The continuation began with uncommitted implementation files and the initial architecture audit. Those were retained. The implementation extends the admin configuration engine and permissions, adds registry/credential/health/queue/ledger tables, admin API and React management screens, provider protocol adapters, managed inference routing, shared editor/language tools, durable selection/history and frontend synchronization. Legacy provider routing remains the disabled-managed-policy compatibility path.

## Continuation changes

- Fixed explicit quantity/price item commands, natural singular additions and the supplied multi-field creation example with word-number quantities, while preserving numeric role validation and missing-field integrity.
- Made current AI authorization/configuration reads database authoritative and rechecked queued calls before dispatch.
- Hid the registry from generic configuration snapshots and internal model metadata from regular-user entitlement responses.
- Added model-specific concurrency in addition to provider/global limits, mounted encryption keyrings and visible health expiry.
- Sanitized malformed upstream JSON, invalid endpoint URLs and case-variant provider/model reply identifiers.
- Closed deterministic item/clear feature-policy bypasses and undo paths that could restore visual state after visual permission revocation.
- Added durable currency clarification before foreign-currency item prices can relabel a document; existing prices are never converted implicitly.
- Preserved known business names during spelling suggestions and required clarification for ambiguous singular references with multiple selections.
- Updated isolated staging role grants for the new tables; added an optional private Ollama compose overlay.
- Added targeted security/conversation regressions, an offline resolver benchmark and actual React/Chromium workflow checks.
- Completed all eleven requested reports with measured results and explicit live-validation limits.

## Verification

Recorded verification: 275 shared Node tests, 265 Chat/Gateway/frontend tests, 193 admin tests (including 37 hybrid tests), 25 quota tests, 73 document-service tests and six browser workflows passed. All Node service builds and both frontend builds passed. See [validation-results.json](evidence/validation-results.json) and [browser-validation.json](evidence/browser-validation.json). Test databases are disposable SQLite/fixture stores; no production migrations, deployment, key changes or model downloads were performed. Browser HTTP fixtures are explicitly identified and do not replace live full-stack acceptance.

# Remediation changelog

- Preserved pre-existing dirty working-tree changes; original audit evidence and baseline conclusions remain available.
- Made recovery-token claim/password/session/access-revocation changes atomic; digested new recovery credentials.
- Hardened Google OAuth state, PKCE, signed identity, redirect and account/MFA handling; aligned gateway routes and added a callback page.
- Replaced concurrent staff numeric allocation/upsert creation with UUID insert-only creation, update-only saves and normalized-email uniqueness.
- Added HttpOnly refresh rotation, bounded browser recovery, explicit logout JSON/cookie cleanup and visible logout failure handling.
- Persisted literal canvas mode/elements; protected reset/undo/redo/generation transitions and scoped save-before-undo behavior.
- Preserved backend MFA state on profile reads and saves.
- Replaced fabricated receipts with persisted invoice history and proper empty/unavailable states; initialized cold billing policy.
- Corrected persisted financial amount/currency/cadence mapping and removed misleading currency labels.
- Removed unused missing-route wrappers, sanitized reporting failures and propagated unavailable breakdown errors.
- Excluded demo sentinels from production bundles.
- Added optional restricted encrypted off-host backup and heartbeat/alert jobs; neither was installed or configured against production.
- Added regression/acceptance tools and fresh actual local-model, API/browser, load, resource, native restart and snapshot-restore evidence.
- Left unresolved model quality, privacy/session decisions, vulnerable-base triage and essential external/container/recovery acceptance explicitly open.

Complete source/harness inventory: [files changed](evidence/files-changed.json). Private fixture credentials remain ignored and are not part of that inventory.

Migration: the additive normalized-email unique index runs through the existing schema-owner Python initializer. Legacy duplicate addresses require manual review before rollout. No automatic account merge, schema reversal, credential rotation or database restore was performed. No production provisioning or deployment occurred.

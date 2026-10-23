# Admin AI management

AI Management is integrated into the existing sidebar, cards, dialogs, dark theme, API client and second-factor workflow. Pages: Providers, Model Registry, Plan Assignments, Routing Policies, API Credentials, Local Inference, Usage & Costs, Health & Monitoring, Audit Logs. Model choices come from the registry; no vendor model catalog is hardcoded into this interface.

| Backend scope | Purpose |
| --- | --- |
| `ai_settings:view` | Registry, health, version history and AI audit reads |
| `ai_models:edit` | Provider/model mutations and connectivity tests |
| `ai_assignments:edit` | Plan model, feature and budget assignments |
| `ai_credentials:manage` | Add/replace/rotate/revoke credentials |
| `ai_routing:edit` | Global routing activation, budget and rollback |
| `ai_usage:view` | Usage/cost/resource reports |
| `ai_deployments:manage` | Local provider/model mutations and local resource configuration |

All writes require the existing sensitive-action second factor. Local operations also require deployment permission. Rollback requires routing, model, assignment and deployment scopes because it can affect all four. Mandatory ownership, argument validation, financial validation and service authentication have no disabling policy setting.

API base: `/api/v1/admin/ai`. GET returns a sanitized registry snapshot and effective UI permissions. POST `/providers` and `/models` upsert typed records; DELETE checks dependencies. PUT `/assignments` and `/routing` validate complete effective configuration. POST `/models/{id}/test` makes a small, billable-when-cloud tool-compatibility request. GET `/history`, POST `/rollback`, GET `/usage` and GET `/audit` use separate scope checks. All registry writes carry `expected_version`; stale writes receive 409.

Workflow: save a disabled provider/model, configure credentials where required, enable the provider, run a connectivity/tool test, enable the model, assign plans, configure budgets, then activate routing. Endpoint/protocol/credential changes invalidate health fingerprints. Stale health is visibly distinguished from verified health. Repository-only models cannot be enabled.

Credentials are write-only password inputs. The browser receives a generated masked identifier and credential generation, never key prefixes, suffixes or existing plaintext. Replacements increment generation; revocation erases ciphertext and invalidates health. Audit entries contain IDs, generations, version numbers and outcomes, never secret values. A mounted secret file or injected environment keyring supplies the encryption keys; the deployment guide explains rotation.

Deleting a provider requires deleting its models and revoking any credential. Deleting a model requires removing all plan references. Disabling a provider/model remains available as an emergency stop. Rollback creates a new version and revalidates health; it cannot resurrect revoked credentials.

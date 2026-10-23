# Cost and VPS analysis

The ledger tracks actual attempts, route locality, policy version, input/output tokens, estimated cloud cost, latency, fallback status and outcome. Unknown dispatched usage remains reserved conservatively. `/admin/ai/usage` combines ledger aggregates, Chat outcomes, queue observations and host/cgroup memory availability. Prometheus records deterministic/local/cloud routes, fallback outcomes, inference latency and existing process CPU/RAM metrics.

Estimated monthly cloud cost is `sum(input_tokens × input_price_per_million + output_tokens × output_price_per_million) / 1,000,000`. Prices are admin metadata; this project does not fetch provider price catalogs. Total assistant cost also includes local CPU/RAM, VPS/storage, database, Redis and rendering. A local model call is never treated as free computing.

The inference service serializes different local models and bounds global/provider/model concurrency. The optional Ollama overlay additionally sets one loaded model, one parallel inference and no idle retention by default. Existing-runtime administrators must configure equivalent memory limits separately. Cgroup memory availability and a normalized one-minute CPU-load estimate are admission signals; they are observations of admin-api's host/container and may not describe a remote inference machine.

Available-memory refusal, queue timeout and other approved availability failures may trigger configured fallback. Hard budgets and feature/entitlement refusals do not. Queue capacity is bounded at 64 waiting requests; expiry cleans abandoned permits. One database advisory lock serializes admission and reservations initially; profile lock contention before increasing throughput or moving inference to its own service.

Document-ready turns and acknowledged editor operations are operational counters, not semantic accuracy scores. Completion accuracy requires reviewed benchmark outputs. Inference health is measured on demand and expires; there is no scheduled health polling daemon in this change. Ledger archival/retention and long-term cost reconciliation are operator jobs, not automatic provider billing integration.

No commercial hardware or provider purchase recommendation is made without full deployment measurements. Frontend builds retain existing large-chunk/dynamic-import warnings; these are separate from inference resource usage.

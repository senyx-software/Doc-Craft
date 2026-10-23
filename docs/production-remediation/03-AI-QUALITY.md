# Actual model quality and routing

**AI-001 remains not fixed.** Fresh real CPU inference completed against the same112-case corpus and the current seven MCP parameter schemas, independently compared with the baseline. No provider response mocks are counted as model intelligence. These are proposals; they are not112 committed document edits.

| Run | Passed / total | p50 / p95 ms | Scope |
|---|---:|---:|---|
| Qwen3 1.7B Q4_K_M | 23/112 | 7047 / 56693 | context8192, output768, thinking off |
| Qwen3 4B Q4_K_M | 4/16 | 30319 / 90100 | bounded one-per-category sample, context4096, four threads |
| Extra business details, 1.7B | 0/8 | 15174 / 41583 | addresses, contacts, dates, exact legal-name capitalization, notes/payment terms and tax/discount/currency |

The larger sample has different context/thread settings and shared-host load. It is not a controlled ranking. All failures and raw actual outputs remain in evidence. Schema/evidence/mapping failures and timeouts are functional failures even where safe rejection protects the database. No schema or authorization checks were relaxed to increase a score. The supplement's interrupted preflight trial was stopped and rerun with sufficient measured headroom; no interrupted case is counted as successful.

A separately configured16384-context1.7B candidate passed actual admin connectivity and a full gateway/Chat/signed-admin/Ollama/SSE question in38525ms, with one inference ledger entry and unchanged document slots. An8192 conservative byte-budget attempt was refused with CONTEXT_LIMIT before dispatch; its evidence is retained. This explains a configuration limit, not a quality fix. A zero request budget yielded AI_BUDGET_EXCEEDED with zero dispatch; disabling the provider yielded POLICY_CHANGED with zero dispatch. Actual free/pro model assignments propagated through the signed runtime API without redeployment. A tiny connectivity tool does not certify production extraction. The4B bounded context is not approved for full Chat prompts.

Only downloaded task-owned models and a loopback-only Ollama process were used, one loaded model/parallel inference at a time. No new large model or production service was installed. Models were unloaded between candidates. Shared-host memory guards constrain these tests; complete target-VPS/CPU/container/PDF+LLM queue benchmarks and real approved cloud fallback/cost remain blocked. Users continue to see DocCraft AI Assistant, and provider credentials remain server-side.

Next: evaluate a capable model/constrained-generation configuration on agreed hardware, preserve evidence/ownership schemas, rerun the fixed corpus plus applied browser conversations, and require actual field/math/undo/reload/PDF correctness before activation. Do not approve either current candidate from a health probe.

Evidence: [small actual results](evidence/ai/validated-1.7b.json), [larger actual results](evidence/ai/validated-4b.json), [business cases](evidence/ai/business-supplement/scenarios.json), [business results](evidence/ai/business-supplement/validated.json), [current schema comparison](evidence/ai/current-schema-comparison.json), [actual Chat/budgets](evidence/runtime/live-ai-integration.json), [assignment propagation](evidence/runtime/plan-models.json).

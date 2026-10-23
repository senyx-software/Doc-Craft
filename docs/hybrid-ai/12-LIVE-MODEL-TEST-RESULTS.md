# Live model test results — 2026-10-21

**Executed real CPU inference; production activation NO-GO.** The smallest candidate is downloadable and can complete a tiny structured-tool health probe, but it fails most real document-tool scenarios. A successful connectivity test is not evidence of document accuracy.

## Environment and installation

The development machine is an AMD Ryzen 7 4700U, eight logical CPUs, 15,346 MiB usable RAM, 4,096 MiB swap and approximately 86 GiB remaining workspace disk after tests. This is a shared desktop, not an 8 GB VPS. Ollama was initially unavailable as a running local service. A task-owned official Ollama v0.40.6 runtime was installed under ignored `.local/hybrid-live/tools`, listening only on 127.0.0.1:11434. Its downloaded archive SHA256 was verified: `c164ab8b1b28e2a247c29719b8e404c423c5b83ae64c3ab4e59d50c7ff7fc5e0`. Only CPU libraries were extracted; GPU allocation was zero. One loaded model and one parallel inference were allowed; Ollama cloud was disabled. No system service or production host was changed.

Both Q4_K_M candidates were downloaded through Ollama and checksum-verified. Available memory was checked before requests, and models were loaded sequentially. Neither was chosen as an approved production model.

| Candidate | Downloaded model bytes | Model manifest SHA256 | Observed compatibility |
|---|---:|---|---|
| qwen3:1.7b-q4_K_M | 1,359,293,444 total reported model size | 8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7 | Tiny tool probe passes; production nested arguments frequently invalid |
| qwen3:4b-q4_K_M | 2,620,788,260 total reported model size | 2bfd38a7daaf4b1037efe517ccb73d1a3bbd4822cf89f1a82be1569050a114e0 | Tiny tool probe passes; bounded document sample still fails |

The tag called 1.7B reports 2.0B parameters in Ollama metadata; this discrepancy is retained in [environment.json](evidence/live/environment.json). Both model cards identify Apache-2.0 licensing, allowing commercial use subject to its conditions; this is not a legal review. Sources checked: [Qwen 1.7B card](https://huggingface.co/Qwen/Qwen3-1.7B), [Qwen 4B card](https://huggingface.co/Qwen/Qwen3-4B), [Ollama 1.7B](https://ollama.com/library/qwen3:1.7b-q4_K_M), [Ollama 4B](https://ollama.com/library/qwen3:4b-q4_K_M), [Apache license](https://www.apache.org/licenses/LICENSE-2.0).

## Real inference results

| Execution | Result | Latency |
|---|---|---:|
| Initial 1.7B admin tool probe, context32768 | Passed | 25,049 ms |
| Configured 1.7B probe, thinking off, four threads | Passed | 7,197 ms |
| 4B probe, context4096, four threads | Passed | 14,502 ms |
| Initial full Chat Service natural-language turn | Provider timeout | 90,599 ms |
| Chat Service pure side question after schema pruning | Real local response, preserved editing context | 36,541 ms |
| 112 1.7B real-model proposals, context8192, output768, thinking off | 23 pass / 89 fail | p50 7,762 ms; p95 40,477 ms |
| 16 4B proposals, one per category, context4096, output768, four threads | 6 pass / 10 fail | p50 23,701 ms; p95 90,092 ms |

The two accuracy samples have different size/context/thread settings and are not a controlled model ranking. The first default-thinking baseline timed out and is preserved separately. Requests include production JSON tool schemas and use the existing Python provider adapter. Corpus outputs are proposals, not committed document changes; separate real gateway/admin/database/browser tests establish integrated behavior. See report13 for methodology and all failures.

## Integration and fixes

Actual Chat Service -> signed admin inference -> Ollama -> SSE succeeded for a natural side question. Free and pro plan requests resolve different assigned models through the actual signed runtime API. A disabled provider returns POLICY_CHANGED with zero dispatched ledger entries. A zero-request budget returns AI_BUDGET_EXCEEDED before dispatch. The three-request queue test produced two actual responses and one bounded AI_QUEUE_TIMEOUT. No external cloud credential was available; positive cloud fallback/billing remains blocked.

Added optional administrator thinking/thread controls, preserved unset health fingerprints, separated controller-container memory headroom from host inference capacity, and reduced pure-side-question schemas to authorized read tools. Mutation requests retain their full tool set and validation. Long histories can still exceed conservative context bounds. No invalid proposal was made valid by weakening schemas or bypassing evidence/ownership checks.

Reproduction uses `scripts/hybrid_live_stack.py`, `hybrid_live_client.py`, `hybrid_live_scenarios.py`, `hybrid_live_routing.py`, `hybrid_live_workload.py` and `hybrid_validate_results.mjs`. These create isolated development data. Raw real responses, fixed expected scenarios, probe results and integrated HTTP evidence are in [evidence/live](evidence/live). Do not run these account-creating fixtures against production.

# Local LLM benchmarks

No local inference model was installed or downloaded during this task. There are no measured local tokens/second, cold-start latency, model RAM peaks, full-VPS concurrency results or live-model accuracy scores. Connectivity adapter fixtures do not establish these numbers.

A reproducible offline resolver microbenchmark is provided by `node scripts/benchmark_hybrid_ai.mjs`; raw results are in [offline-resolver-benchmark.json](evidence/offline-resolver-benchmark.json). It runs seven representative requests 100 times each through shared resolution/validation/calculation helpers and records p50/p95 latency, Node process RSS and host CPU description. It makes zero model requests. It excludes HTTP, database, Redis, local inference and all other services. Do not extrapolate its RSS or latency to VPS sizing.

Before selecting hardware, deploy all existing services plus the chosen runtime in an isolated environment. Record runtime/image/model/revision/quantization, configured context/output, actual prompt tokens, physical RAM, CPU limits and swap. Run the complete conversation corpus with concurrency 1, then controlled parallel traffic; simultaneously generate PDFs, reload sessions and process billing/quota fixtures. Record model cold/warm load, full-stack p50/p95 latency, per-process and cgroup memory peaks, CPU, queue depth/time, tokens/sec, fallback rate and document/editor correctness.

Recommended acceptance procedure: compare deterministic-enabled and disabled policies on the same data with fixed model settings; verify equal business results and fewer inference calls. Revoke a credential and disable a model while another call waits in the queue. Stop the local runtime, confirm permitted fallback and exhaust the cloud allowance. Restart Chat, Redis and the runtime separately, then confirm restored session facts and bounded duplicate processing. Model selection follows measured quality and resource results; no 8 GB hosting guarantee is made.

## Recorded offline resolver observations

| Request | p50 ms | p95 ms | Inference requests |
| --- | ---: | ---: | ---: |
| Create an invoice for Nexora. Customer is John, and I sold three laptops for 500 each. | 0.770 | 1.307 | 0 |
| Change the tax to 10%. | 0.701 | 1.138 | 0 |
| Add another item, a mouse for 25 dollars. | 1.330 | 1.874 | 0 |
| Actually change the customer to Alex and make the invoice heading blue. | 1.362 | 1.809 | 0 |
| Make it bigger. | 0.533 | 0.949 | 0 |
| What is the difference between an invoice and a quotation? | 0.234 | 0.341 | 0 |
| Plase delivary the prodcts within seven days. | 0.231 | 0.504 | 0 |

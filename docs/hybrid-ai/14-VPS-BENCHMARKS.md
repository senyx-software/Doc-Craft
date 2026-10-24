# VPS benchmarks — native development measurements

**An 8 GB production VPS has not been certified.** All backend services, PostgreSQL, Redis, both production frontend builds served by Vite preview, Ollama and diagnostic PDF rendering were started as isolated native processes. Docker, production TLS proxy overhead and container limits were not exercised. No provider-specific price/performance selection is supported by these measurements.

## Host and measurement method

Ryzen7 4700U, eight logical CPUs, 15,346 MiB RAM, 4 GiB swap. [environment.json](evidence/live/environment.json) records available disk and exact model metadata. Task processes use separate service identities, scoped PostgreSQL roles, Redis ACLs and loopback development HTTP. PostgreSQL is native18.4; production Compose pins17 and requires container verification.

`hybrid_live_resources.py` samples task-owned process trees every two seconds, using PSS to avoid counting shared PostgreSQL pages repeatedly. CPU100% means one logical core. The corrected sampler version2 contains 1350 samples over 2804.7 seconds. Simultaneous peak task PSS was **4784.37 MiB**. Minimum host available RAM was 2927.15 MiB; minimum free workspace disk 86.31 GiB. Host load includes unrelated desktop/IDE work. Per-group peaks are not simultaneous and must not be summed into an asserted total.

| Native service/process tree | Peak PSS MiB | Peak sampled CPU % |
|---|---:|---:|
| postgres | 91.52 | 4.18 |
| redis | 16.96 | 0.97 |
| auth | 218.46 | 40.07 |
| quota | 66.74 | 5.3 |
| chat | 161.43 | 18.15 |
| payment | 68.73 | 4.29 |
| notification | 60.17 | 2.9 |
| pdf | 31.34 | 0.48 |
| admin-api | 83.1 | 30.45 |
| analytics | 105.08 | 0.97 |
| document | 99.6 | 0.97 |
| gateway | 68.26 | 1.45 |
| admin-ui | 75.94 | 3.85 |
| user-ui | 79.4 | 9.06 |
| pdf-diagnostic | 385.39 | 3.87 |
| ollama | 3205.86 | 395.45 |

Earlier samples incorrectly selected an Ollama pull client in some intervals; that file remains explicitly marked initial. Its inference/total memory/CPU peaks are excluded. The corrected observation window does not cover the complete earlier 112-case run. Short peaks and subprocess exits can escape sampling. Process I/O deltas are in [resource-summary.json](evidence/live/resource-summary.json); they do not constitute a disk-throughput or durable-storage benchmark.

The original 1.7B/context32768 runtime reported 5.30GB allocation through /api/ps and produced visible shared-host memory/swap pressure. Smaller contexts and one loaded model reduce pressure; they also constrain full mutation schemas/history. No simultaneous multi-model loading was attempted. Model file size is not runtime RAM.

## Real concurrent work

| Workload | Result | p50 / p95 |
|---|---|---|
| Eight users, 96 deterministic gateway tax updates, concurrency8 | 96/96, no LLM ledger delta; cross-user403 | 470 / 621ms |
| Signed real PDF render, two clients, 16 requests after cleanup fix | 16/16 with valid PDF bytes | 129 / 491ms |
| Signed local inference, three concurrent requests, concurrency1/queue8sec | Two real responses, one AI_QUEUE_TIMEOUT at8134ms | Success7977/8445ms; observed second queue wait7872ms |
| 112 real 1.7B tool proposals | 23/112 correct | 7762 / 40477ms |

The initial one-user burst reached the existing per-user100requests/minute cap after setup and returned429; the final eight-user workload retains that protection. PDF success uses a test-only unsandboxed Chromium launcher because normal signed readiness failed503 and rendering failed500 in this environment. It cannot establish production sandbox capacity. PDF and inference processes coexisted, but a sustained mixed PDF+LLM+checkout concurrency benchmark remains outstanding.

## Capacity decision

A 4vCPU/16GiB/80GB amd64 VPS is a **staging candidate**, not a measured minimum or production guarantee. Four inference threads consumed almost four cores here; the default production two-CPU inference cap could be slower. A no-local-inference 8GiB candidate can be benchmarked separately using an approved external model; it has not been approved by this run. Keep local inference optional and load only one model. Do not purchase final capacity based on these native figures.

Before selecting the lowest-cost provider, run the complete production container stack at intended limits, a sustained mixed workload and backup/restore, monitor swap/OOM/disk latency/queue wait, agree latency/error/quality targets, and compare actual plans in the chosen region. Model accuracy must be fixed independently of adding RAM. No dollar quote or unsupported 8GB sufficiency claim is made.

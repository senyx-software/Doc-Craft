# Performance and scalability

Tested hardware: AMD Ryzen 7 4700U with Radeon Graphics, 8logical CPUs, 15346.05MiB usable RAM, Linux. Shared desktop workload is present; this is not a dedicated VPS. Fresh14-service native stack (10backends,2Vite preview frontends,PostgreSQL18.4,Redis) was sampled2800times every2seconds. Simultaneous application-tree peak PSS was1190.09MiB; minimum host available memory1691.15MiB; minimum workspace disk84.42GiB. Browser clients/build/test processes and diagnostic PDF child are outside those application roots. Do not sum per-process RSS/shared PostgreSQL pages or claim this covers local inference/cgroups/production nginx/Caddy.

Actual gateway workload:8users,96deterministic tax updates at concurrency8;96/96pass;0inference calls;4.614seconds total burst. Nearest-rank p50=343ms,p95=580ms,p99=661ms. Original helper upper-median/truncated-percentile fields345/568remain in raw evidence; nearest-rank fields are the explicit comparable definition. Burst throughput is~20.8requests/sec for this workload, **not sustainable mixed production capacity**. Quota admission8requests yielded2success/6denials at limit2. Two-client diagnostic PDF16/16passed; no production sandbox/container latency claim is made.

Earlier actual model latency/accuracy outputs are separately revalidated in report10:1.7Bp9540477ms and4Bbounded samplep9590092ms. Fresh model/mixed inference benchmarks are blocked by safe headroom. Observed source risks include repeated synchronous policy/account calls, global AI advisory-lock serialization/queue polling, unbudgeted aggregate DB pools, and large frontend bundles. Actual build outputs/assets and [bundle inventory](evidence/bundles.json) record sizes; no Lighthouse/WebVitals/mobile device or cross-browser loading performance certification exists.

Disk-free and process I/O counters are sampled, not a disk latency/network throughput benchmark. Sustained logins+generation+LLM+admin updates, backend/Redis/DB contention, container startup timing and hard-limit/OOM enforcement were not measured on a VPS. A4vCPU/16GiBamd64host is only a staging candidate; no lowest-cost plan or8GBsufficiency is proven. Choose a provider/region and agreed p95/p99/error/quality/recovery targets, then benchmark full containers and compare pricing before purchase.

| Process group | Peak PSS MiB | Peak sampled CPU% (100=one core) |
| --- | --- | --- |
| postgres | 134.76 | 46.49 |
| redis | 15.83 | 2.92 |
| auth | 206.55 | 96.21 |
| quota | 78.45 | 7.32 |
| chat | 263.39 | 278.96 |
| payment | 78.53 | 7.37 |
| notification | 64.83 | 8.79 |
| pdf | 60.92 | 4.9 |
| admin-api | 91.24 | 38.19 |
| analytics | 121.79 | 7.17 |
| document | 114.97 | 19.53 |
| gateway | 70.81 | 13.14 |
| admin-ui | 83.23 | 7.34 |
| user-ui | 84.04 | 18.56 |

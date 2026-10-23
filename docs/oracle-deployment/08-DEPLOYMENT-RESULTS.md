# Oracle staging deployment results

Latest operator-requested retry at **2026-10-22 05:35 UTC**: refreshed all three fault-domain reports, then submitted one actual A1 2 OCPU / 12 GB / 50 GB launch with OCI selecting the fault domain. OCI again returned `InternalError: Out of host capacity`. There have now been **2 operator-authorized launch attempts**, both rejected. Fresh inventory verifies zero nonterminated instances and only the retained 47 GB boot volume; no paid fallback, extra disk, reservation or networking resource was created. [Execution evidence](evidence/a1-replacement-execution.json).

2026-10-22 — **OCI authentication/discovery complete. Paid E5 terminated on explicit operator request, 47 GB boot disk retained. A1 launch rejected for host capacity. No staging deployment occurred. Production remains NO-GO.**

## Completed locally

- Installed OCI CLI 3.95.1 and securely configured the operator-provided API key/profile under `~/.oci`. Real signed user/tenancy/compute/network/storage/IAM/limits/usage calls succeeded. The first public key differed from the subsequently supplied private key; the matching registered fingerprint was verified without exposing key contents.
- Initial discovery confirmed the instance was RUNNING as **VM.Standard.E5.Flex**, 1 OCPU / 12 GB, with an Ubuntu 20.04 AMD image. Usage reports **SGD 0.581457456666 Compute cost for October 21**; credits/final invoice remain unverified. This is a paid shape.
- Identified the networking state: public-IP assignment is allowed by the existing subnet and an Internet Gateway/default route exists, but the primary private IP has no public-IP resource assigned. No new public subnet/VNIC/recreation is required for public-IP assignment. Existing SSH ingress permits world access; no NSGs, NAT/Service Gateway or Bastion exists.
- Verified the supplied SSH key matches launch metadata, protected its local permissions, and bound deployment identity checks to the actual instance OCID. No SSH authentication or host-key verification occurred.
- Audited existing deployment assets and preserved unrelated working-tree changes and original environment files. Inventoried 19 project environment files; 15 secret-bearing files need permission review. Recorded configured names/states without values; generated local fixtures remain unapproved.
- Extended the existing allowlisted preparation/SSH transfer tooling. Transfer now revalidates root Compose settings and strict PostgreSQL TLS, preserves existing keyrings, backups and checksums, refuses unapproved/private-route/host-key ambiguity and records no secret values.
- Prepared a staging-only rollout controller and disabled manual staging CI workflow using existing hardened Compose and image definitions. No production marker, repository setting, workflow run, cloud resource or remote configuration was changed.
- Verified registry manifests for six pinned base images advertise amd64 and arm64; no image layers/models were downloaded. Application image/runtime compatibility remains unverified.
- Produced the nine requested reports plus an [Always Free migration plan](09-ALWAYS-FREE-MIGRATION-PLAN.md), reviewable JSON plans and reusable non-reserving A1 capacity preflight. The paid-E5 Bastion plan was not applied and is now obsolete.
- On the later explicit request **“remove paid one and get A!”**, gracefully stopped and terminated the exact E5 using `preserve_boot_volume=true` and `preserve_data_volumes_created_at_launch=true`. Verified TERMINATED, original 47 GB disk AVAILABLE/detached, zero nonterminated instances and one remaining boot volume.
- Initially attempted one A1 launch at 2 OCPU / 12 GB / 50 GB Ubuntu 24.04 ARM64, with no public IP, no reservation, no new network resources and no paid fallback. OCI rejected it with `InternalError: Out of host capacity`. A separate 1 OCPU / 12 GB enquiry also found no capacity in all three fault domains. [Actual execution evidence](evidence/a1-replacement-execution.json).

## Verification

**66 local deployment tests passed**, including 33 Oracle-specific cases; previously executed workflow lint, Python/shell syntax and migration policy checks retain their scope. The source inventory records 234 variable/consumer rows. Subsequent actual OCI calls verified resource inventory, policy/quotas, reported cost and all three A1 fault-domain capacity failures. No capacity was reserved or VM launched. See [local verification evidence](evidence/local-verification.json), [OCI discovery](evidence/oci-discovery.json) and [A1 evidence](evidence/always-free-capacity-review.json). Compose tests use synthetic files and helper tests use isolated filesystem/subprocess fixtures; neither establishes successful SSH/application integrations.


Further authenticated search at **2026-10-22 04:58 UTC** checked A1 **1 OCPU / 1 GB**, **1 / 6 GB**, **1 / 12 GB** and **2 / 12 GB** across all three Mumbai fault domains. All **12** capacity checks report OUT_OF_HOST_CAPACITY, including the smallest tested configuration. No resource was created or reserved. Smaller RAM configurations would also need a revised deployment plan because the complete current stack requires more memory. [Any-size search evidence](evidence/a1-any-size-capacity-review.json).

## Phase status

| Phase | Result | Required next input/action |
| --- | --- | --- |
| 1: CLI/authentication | COMPLETE | Existing protected profile and signed API access verified |
| 2: infrastructure | COMPLETE for API inventory scope | Guest state/final invoice require later checks; read-only evidence recorded |
| 3: network recommendation/apply | E5 proposal not selected; Always Free plan ready; nothing applied | A1 capacity must return; existing size-capped creation approval recorded; connectivity design remains unapproved |
| 4: SSH | Key match PASS; no SSH attempt | Independently verified server host key and approved connectivity |
| 5: repository/env audit | Static inventory completed; dynamic/helper scope documented | Confirm staging credential provenance and any requested tuning outside supported allowlists |
| 6: staging env copies | Validators/plan prepared; real bundle NOT created | Approved staging endpoints, secrets, original keyring and DB/Redis/TLS identities |
| 7: secret transfer | Script prepared/tested; NOT transferred | Concrete manifest, verified target and explicit transfer approval |
| 8: Docker/VPS | NOT executed | A1 target unavailable; verified guest facts, UID/mount plan, egress/cost and host-change approval |
| 9: service rollout | NOT executed | Compatible images, provisioned DB/cache, completed prerequisites and deployment approval |
| 10: DB/security | Static process reviewed; remote state unknown | Pending migrations, admin conflicts, restorable backup, schema-owner and migration approval |
| 11: real staging E2E | NOT executed | Actual deployment; approved synthetic users/provider tests; resolve model/PDF failures |
| 12: CI/CD | Workflow prepared and statically linted; disabled/unexecuted | Approved registry, runner/SSH/environment protection, costs and enablement |

## Current blocker and operator handoff

No further authentication/key information is currently required. The operator initially selected planning, then explicitly authorized **“remove paid one and get A!”**. The capped proposal is A1 2 OCPU / 12 GB with a fresh Ubuntu 24.04 ARM64 image and 50 GB boot disk. With the retained 47 GB E5 disk, projected boot/block storage is 97 GB. At 31 days, this new A1 allocation uses 1,488 OCPU-hours / 8,928 GB-hours, within the conservative published free pool if aggregate/account conditions continue to hold.

**All three Mumbai fault domains report OUT_OF_HOST_CAPACITY** for this size. Recheck with `python3 scripts/oracle_always_free_preflight.py`; it makes no reservation/launch or infrastructure changes. Both operator-authorized launch attempts failed; no A1 or new network/storage resources were created. No automatic retry task, paid fallback or region switch was enabled. Internet egress and final A1 network design remain separate reviewed prerequisites. [Full migration/rollback plan](09-ALWAYS-FREE-MIGRATION-PLAN.md), [machine-readable draft](../../deploy/oracle/always-free-plan.staging.json).

The E5 is **TERMINATED**, after a successful graceful OCI stop. Its **47 GB boot volume remains AVAILABLE and detached**; zero nonterminated instances remain. The operator's later removal request superseded the pending stop-only question. Retained storage has its own allowance/billing rules; prior usage/final invoice can still appear. The guest data has not been inspected or migrated, and retention is not a tested backup. Termination cannot be undone with START; recovering its x86 OS would require a separately approved compatible recovery instance and potential paid compute. Do not delete the retained disk or boot it as an ARM OS.

**Approved E5 retirement is complete. A1 creation remains blocked by OCI host capacity. No SSH success, secret transfer, data/schema migration, service deployment, public URL or staging end-to-end success is claimed.** No further authentication or creation reapproval is needed for the same capped A1 request; refresh inventory/allowances before retrying. Secret transfer, host installs, migrations, service deployment and expanded networking retain their separate approval gates.

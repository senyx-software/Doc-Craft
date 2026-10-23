# OCI infrastructure audit

Observed through authenticated OCI API calls on 2026-10-22. **STAGING ONLY. Production remains NO-GO. The paid E5 was subsequently terminated on explicit operator request; its 47 GB boot disk is retained. A1 creation was rejected for lack of host capacity.**

OCI CLI 3.95.1 was installed in `/home/eranda/.local/share/doccraft-oci-cli`, exposed through `/home/eranda/.local/bin/oci`, using Oracle's documented isolated Python/pip installation method. System Python packages were not changed. Arch Linux is not an explicitly listed Oracle-tested CLI OS; the Python 3.13 installation and CLI version command work locally. [Oracle installation instructions](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/climanualinst.htm).

A first authentication attempt was blocked by a missing config. The operator subsequently supplied a tenancy/user configuration snippet and the API private-key path. That private key belongs to a different pair from the first supplied public key; its derived fingerprint matches the operator's later registered-key snippet. Original private-key bytes were preserved, permissions restricted to 0600, and a protected copy placed under `~/.oci` (0700). The matching public key was derived locally. `~/.oci/config` was created mode 0600 and references that local private key; no key material was placed in the repository or uploaded to the VPS.

**Signed OCI user, tenancy, compute, networking, storage, limits and usage API calls succeeded.** The user is ACTIVE, the tenancy name matches `erandasathsara`, and its subscribed home region is `ap-mumbai-1` / `BOM`. Group inspection confirms membership in `Administrators`; the existing Tenant Admin Policy grants that group management of all resources in the tenancy. No IAM policy was changed. Read-only discovery permissions are demonstrated by the successful calls; approved SOFTSTOP and termination have since succeeded. No IAM/network mutation was performed. [Authentication precheck](evidence/oci-authentication-precheck.json), [IAM and resource availability](evidence/oci-connectivity-review.json).

## Authentication status

No additional authentication input is currently required. Reuse the verified profile; do not run setup again or generate another key pair. A separate operator-provided SSH key was also validated and matches the instance's launch metadata; that is not yet successful SSH authentication. [SSH precheck](evidence/ssh-key-precheck.json). Keep all private contents on disk. [Oracle key/configuration guidance](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm).

For a different machine only, the documented manual alternative is:

1. Run `~/.local/bin/oci setup config`. Supply your tenancy OCID, user OCID and `ap-mumbai-1`. Reuse an existing API signing key if one exists; otherwise let the wizard create a dedicated key under `~/.oci`. Keep the config and private key accessible only to your account, with directory mode 0700 and files mode 0600/0400.
2. In OCI Console → your profile → API keys, register **only the public key** produced by the wizard. Never upload the private key, paste it into chat or place it in this repository. Existing valid API-key configuration can instead be selected using `--config-file` and `--profile`.
3. Resume read-only discovery: `python3 scripts/oracle_cloud_audit.py`. It writes filtered evidence and returns status 2 while blocked. Token-based profiles need an explicit authentication-mode extension before this helper can use them; an API-key profile is its current supported path.

Existing credentials are now sufficient to automate further read-only discovery and separately approved changes. No public-key registration was performed by this agent; the operator's registered key was reused. [Oracle API authentication setup](https://docs.oracle.com/en-us/iaas/Content/generative-ai-agents/setup-oci-api-auth.htm).

## Discovery status

The following table records the initial authenticated discovery, before retirement. Exact OCIDs and rule bodies are retained in the linked filtered evidence. Current state: E5 TERMINATED, original boot volume AVAILABLE/detached, zero nonterminated instances, no A1 created. [Retirement and launch evidence](evidence/a1-replacement-execution.json).

| Item | Requested value | Observed status |
| --- | --- | --- |
| Region | `ap-mumbai-1` | Home region BOM, subscribed READY |
| Tenancy/root compartment | `erandasathsara` | Verified; no child compartments returned |
| Instance | `instance-20261021-1441` | RUNNING; sole listed root-compartment instance |
| VCN / subnet | `10.0.0.0/16` / `10.0.0.0/24` | Named resources and primary VNIC attachment verified |
| Private/public IP | `10.0.0.88` / none | Primary private IP exists; no public-IP resources returned in regional or instance-AD scope |
| Shape | **VM.Standard.E5.Flex** | **Paid shape; 1 OCPU / 2 vCPUs / 12 GiB RAM**, AMD EPYC Genoa, maximum 2 VNICs |
| OS / CPU architecture | Image `Canonical-Ubuntu-20.04-2025.07.23-0` | Ubuntu 20.04 image and AMD x86_64 architecture; actual guest OS/kernel/resources require SSH |
| Subnet public-IP prohibition | `false` | Public subnet; lack of assignment is not a private-subnet restriction |
| Gateways | Internet Gateway enabled | No NAT Gateway or Service Gateway returned |
| Routes | `0.0.0.0/0` → existing Internet Gateway | Public-IP mapping still required for this VM's Internet Gateway egress |
| Security | Default security list; no attached NSGs | TCP 22 ingress currently `0.0.0.0/0`; ICMP rules and all-egress present; host firewall unknown |
| Bastion / security zones | None returned | Bastion limit 5; no existing sessions/console connections/history to reuse; Bastion agent desired state DISABLED |
| Boot/block storage | Attached 47 GiB boot volume, 10 VPUs/GB | No block volumes/attachments or boot-volume backups returned; data contents unknown |
| Quotas / availability | No custom quota policies returned | 6 reserved public IPs available; A1 OCPU/RAM quota available; quota is not physical capacity or free entitlement |
| Billing | Usage report in SGD | **0.581457456666 SGD Compute cost for 2026-10-21**; credits/taxes/final invoice not determined |

The inventory helper uses only get/list operations. Supplemental cost discovery uses the Usage API's reporting request, which does not provision infrastructure. Metadata/keys/tags/raw errors are excluded from reports. Two local discovery defects were corrected and retested: successful empty `--all` results can have no CLI JSON output, and the Limits API service name is `oci-bastion`. They were not IAM denials. The inventory is now complete for its API scope; host access and final invoicing remain unverified. Actual A1 launch and capacity reports confirm the current host-capacity blocker; approved E5 retirement succeeded. The VNIC has no security attributes and the root security-zone listing is empty; do not infer arbitrary future ZPR changes are authorized.

Evidence: [OCI discovery](evidence/oci-discovery.json), [cost/backups/console](evidence/oci-additional-discovery.json), [limits/IAM](evidence/oci-connectivity-review.json). No SSH connection, API key rotation or registration occurred. The original discovery evidence is historical; later approved E5 retirement and failed A1 launch are recorded separately in [execution evidence](evidence/a1-replacement-execution.json).

## Cost gate

The actual shape is **VM.Standard.E5.Flex**, not the previously mentioned E2.4. It is outside Oracle's listed Always Free compute shapes and already has nonzero reported compute usage cost. Treat continued use as paid-resource exposure even if trial credits offset a bill. The report covers 2026-10-20 00:00 UTC through 2026-10-22 00:00 UTC; newer usage may lag. After the earlier planning-only choice, the operator explicitly requested **“remove paid one and get A!”**. E5 was gracefully stopped and then terminated using both preserve-volume flags. Its 47 GB boot volume remains AVAILABLE and detached; no paid compute VM remains. The A1 request (2 OCPU / 12 GB, 50 GB boot) failed with `InternalError: Out of host capacity`. No automatic retry or paid fallback was enabled. [Current migration plan](09-ALWAYS-FREE-MIGRATION-PLAN.md).

Oracle lists `VM.Standard.E2.1.Micro` and allowance-limited `VM.Standard.A1.Flex` compute in the home region. A1 quota availability here (41 OCPUs / 277 GiB in the AD, with separate regional limits) is **not an Always Free allowance**. Actual non-reserving reports now show **OUT_OF_HOST_CAPACITY for A1 2 OCPU / 12 GB in all three fault domains**. A compatible Ubuntu 24.04 ARM64 platform image is verified. No A1 instance was created or capacity reserved; both operator-authorized actual launches were rejected for host capacity. A further 1 OCPU / 12 GB enquiry also found no capacity in all three fault domains. E2 micro memory is insufficient for this baseline stack. Storage, performance tiers, backups, licensed images, network transfer, CI minutes and registry storage also need review. [Capacity evidence](evidence/always-free-capacity-review.json), [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Do not apply the repository's generic Terraform contract: it has no OCI provider/resource implementation. Prepare any concrete OCI change plan only after discovery, with exact resource IDs, cost implications and rollback, then obtain operator approval.

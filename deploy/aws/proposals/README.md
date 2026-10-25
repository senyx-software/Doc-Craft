# Controlled exception proposal — not enabled

This is a review artifact. No workflow or deployment scanner imports or invokes
`exception_review.py`. The existing HIGH/CRITICAL gate continues to reject every
finding. The draft catalog is empty. Production has no exception path.

## Required record and approval

Each proposed record must identify one CVE, exact approved-registry OCI image
digest, exact Debian package and installed version, and Debian suite. Wildcard
or tag-based image matching cannot authorize an exception. A CVE reported in
multiple packages/images needs a separately reviewed record for every match.

Each record requires:

| Field | Required evidence |
| --- | --- |
| `id`, `cve`, `image`, `package`, `installed_version`, `suite` | Exact immutable scope |
| `justification` | Why the individual finding is being considered |
| `risk_assessment`, `risk` | Reviewed exposure/impact assessment; only low or moderate residual risk may be considered |
| `mitigation` | Concrete controls and how their presence was verified |
| `upgrade_or_replacement_review` | Evaluated maintained vendor updates, replacement bases and removal of unused features |
| `runtime_profile_sha256` | Hash of the tested effective configuration, not an unverified comment |
| `sources` | Primary vendor, exploitation and runtime evidence links |
| `reviewed_by`, `approval_reference`, `reviewed_at` | Identified human reviewer and traceable approval |
| `expires_at` | Timezone-aware expiration, at most seven days after review |

The complete catalog must also have explicit external approval bound to its
canonical SHA256 hash. An `approved` field or reviewer name inside a JSON file
does not itself grant approval. A later change to the catalog invalidates the
external hash. Before integration, configure a protected human review/approval
channel and trusted storage for that approved hash. No such approval has been
requested or configured for an exception catalog.

## Mandatory checks on each use

The offline prototype requires all of these independently supplied facts:

1. The environment is staging; the image digest, package version and suite match
   exactly; the exact catalog is externally approved and the record is unexpired.
2. The finding is an OS-package CVE on supported Debian. Application packages,
   secrets, unknown statuses and unsupported releases cannot match.
3. Neither the scan nor current vendor evidence supplies an available fix.
   An available fix remains disqualifying even if an upgrade is inconvenient.
   Conservatively flag available fixes in other vendor releases as well;
   explicitly evaluate upgrade/replacement before considering a no-fix record.
4. Fresh CISA KEV data does not list the CVE, and a separate primary-source
   exploitation review establishes no active exploitation or public exploit.
   KEV absence alone cannot supply those review results. Unknown or positive
   exploitation status rejects the record.
5. Independently verified runtime evidence establishes that untrusted inputs
   cannot reach the affected code and that residual exposure is acceptable.
   A changed image/profile, unknown reachability or unacceptable risk rejects it.
6. Vendor, KEV, exploitation-review and runtime evidence was obtained within
   24 hours and includes its source and SHA256. KEV's publication date must be
   within seven days. Stale, future or unavailable evidence rejects the record.

The prototype returns a structured audit decision containing the CVE, package,
image, catalog hash, evidence hashes, decision reasons, evaluation time and expiry.
Its tests cover explicit approval and more than 30 rejection conditions, including
application/secret findings, fixed versions, active exploitation, public exploits,
unacceptable exposure, expiry, stale data, scope drift and changed approval data.

## Integration to review after the report

The prototype is deliberately offline: it consumes evidence from its caller and
does not fetch live feeds or change exit codes. A production-quality integration
still requires trusted network adapters, schema validation of downloaded vendor
and exploitation feeds, runtime attestations, and protected approval storage.
Those adapters must derive facts from authenticated primary sources; exception
authors must not be allowed to assert that their own CVE has no fix or exploit.

The proposed CI integration must preserve full HIGH/CRITICAL vulnerability and
secret scans and always retain redacted scanner reports and audit decisions,
including failures. Evaluate approved records again before every deployment and
in a daily scheduled scan. Rebuild/rescan actual images with current databases;
never reuse a previous pass or an old no-fix flag. A new vendor fix, KEV entry,
public exploit, expired record, changed runtime or unavailable evidence immediately
removes exception eligibility and fails the deployment gate.

Store redacted reports and decision logs for 90 days, including the reviewed
catalog, approval reference, source retrieval times and content hashes. The
currently active strict scanner already retains reports for 14 days; expanding
retention and wiring this proposed decision stage/schedule are review items,
not completed or enabled behavior.

The recommendation in the current report is **zero exceptions**. First remediate
fixable dependencies and evaluate newer/minimal bases; produce new immutable
images and runtime evidence. Only then prepare individual candidate records with
real reviewers and expiration dates. Review both those records and the completed
integration, obtain explicit approval, and only afterward change a staging gate.

# Staging image scan review

Every HIGH/CRITICAL image vulnerability and secret remains blocking. The blanket
unfixed-OS option was rejected and removed. No exception is approved or active;
production retains its existing security gate. Deployment remains disabled.

The [2026-10-25 report](security-review/2026-10-25/report.md) identifies all 43
blocking image CVEs, their severities, exploit prerequisites, affected images,
vendor fixes and recommended mitigations. It also covers eight separate fixable
Python application/tooling advisories and read-only scans of newer base images.

The [machine-readable evidence](security-review/2026-10-25/findings.json) includes
exact versions, image configuration IDs, CVSS/EPSS information, Debian release
status and provenance hashes. Compressed full CI and candidate scan reports are
retained beside it; current CI also uploads redacted scan artifacts for 14 days.

The [controlled per-CVE proposal](proposals/README.md) and its offline prototype
are available for review. The draft exception catalog is empty. They are not
imported or invoked by any scanner or workflow; activating an exception would
require a completed integration and explicit approval of both the exact catalog
and implementation. No repository variable can enable a blanket exception.

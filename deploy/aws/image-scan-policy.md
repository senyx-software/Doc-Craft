# Staging image scan decision

The default remains strict: every HIGH or CRITICAL image vulnerability or secret
blocks deployment. Production CI keeps its existing scan command unchanged.

An optional repository variable, `AWS_STAGING_ALLOW_UNFIXED_OS=true`, allows only
OS-package findings which Trivy marks `affected`, `fix_deferred` or `will_not_fix`
and for which its vendor data supplies no fixed version. Application packages,
findings with a fixed version, unknown statuses, secrets and unsupported OS
versions still block. The setting applies only to the AWS staging pipeline.

The complete vulnerability results are retained as JSON artifacts for 14 days,
with secret matches removed. The job log and summary distinguish blocking
findings from accepted unfixed OS findings. This exception accepts known
unpatched HIGH and CRITICAL vulnerabilities; it does not make the images free of
vulnerabilities. Keep the variable unset or `false` to retain the strict gate.

In [CI run 40181376305](https://github.com/senyx-software/Doc-Craft/actions/runs/40181376305)
on 2026-10-25, the patched images still reported these Debian 12 OS findings:

| Image | HIGH | CRITICAL |
| --- | ---: | ---: |
| Node runtime | 58 | 1 |
| Node migration | 58 | 1 |
| PDF | 98 | 4 |
| Python | 61 | 2 |
| PostgreSQL | 71 | 3 |

All those OS rows had no fixed-version entry. Separate fixable package-manager
findings in the migration and Python images are being addressed in the images;
this setting cannot exempt those findings.

Examples of the vendor information behind the OS findings:

- [Debian CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408):
  the util-linux fix is in unstable; bookworm and trixie remain affected.
- [Debian CVE-2026-6653](https://security-tracker.debian.org/tracker/CVE-2026-6653):
  the libxml2 fix is deferred for bookworm and marked no-DSA in trixie.
- [Debian CVE-2023-45853](https://security-tracker.debian.org/tracker/CVE-2023-45853):
  Debian explains that the vulnerable MiniZip code is not built into the affected
  bookworm source package's binaries, despite the source-level finding.

The enforcement code is [scan-image.py](scan-image.py); its tests verify that the
optional exception cannot admit fixable or application-package findings or
secrets. No repository variable enabling the exception has been set.

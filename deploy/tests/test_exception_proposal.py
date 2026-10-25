"""Offline proposal tests; the deployment scanner never calls this prototype."""
import copy
import datetime as dt
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / "aws/proposals/exception_review.py"
spec = importlib.util.spec_from_file_location("exception_proposal", path)
proposal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proposal)
NOW = dt.datetime(2026, 10, 25, 12, tzinfo=dt.timezone.utc)
IMAGE = "ghcr.io/senyx-software/doccraft-node@sha256:" + "a" * 64


def fixture():
    finding = {"Class": "os-pkgs", "Type": "debian", "OSFamily": "debian", "OSSupported": True,
               "VulnerabilityID": "CVE-2099-12345", "PkgName": "fixture-package", "InstalledVersion": "1.0",
               "Severity": "HIGH", "Status": "affected", "Suite": "bookworm"}
    record = {"id": "fictional-test-only", "cve": finding["VulnerabilityID"], "image": IMAGE,
              "package": finding["PkgName"], "installed_version": "1.0", "suite": "bookworm", "risk": "low",
              "reviewed_at": NOW.isoformat(), "expires_at": (NOW + dt.timedelta(days=1)).isoformat(),
              "sources": ["https://security-tracker.debian.org/tracker/CVE-2099-12345"],
              **{key: "fictional test evidence" for key in ["justification", "risk_assessment", "reviewed_by",
                  "approval_reference", "mitigation", "upgrade_or_replacement_review"]},
              "runtime_profile_sha256": "b" * 64}
    catalog = {"version": 1, "status": "approved", "environment": "staging", "exceptions": [record]}
    evidence = {name: {"retrieved_at": NOW.isoformat(), "sha256": "c" * 64, "source": "fixture evidence"}
                for name in ["debian", "kev", "exploitation", "runtime"]}
    evidence["debian"].update(cve=finding["VulnerabilityID"], package=finding["PkgName"], suite="bookworm", fix_available=False)
    evidence["kev"]["cve_ids"] = []
    evidence["kev"]["published_at"] = NOW.isoformat()
    evidence["exploitation"].update(cve=finding["VulnerabilityID"], actively_exploited=False, public_exploit=False)
    evidence["runtime"].update(image=IMAGE, profile_sha256="b" * 64, unacceptable_risk=False,
                               untrusted_input_reaches_affected_code=False, reachability="privileged_local_only")
    return finding, catalog, evidence


class ExceptionProposal(unittest.TestCase):
    def test_external_approval_is_required_even_for_an_approved_record(self):
        finding, catalog, evidence = fixture()
        self.assertFalse(proposal.decide(finding, IMAGE, catalog, evidence, now=NOW)["accepted"])
        decision = proposal.decide(finding, IMAGE, catalog, evidence,
                                   approved_catalog_sha256=proposal.digest(catalog), now=NOW)
        self.assertTrue(decision["accepted"])
        self.assertEqual(decision["evidence_sha256"]["kev"], "c" * 64)

    def test_every_prohibited_condition_blocks(self):
        changes = ["production", "application", "secret", "non-debian", "unsupported-os", "fix", "unknown-status",
                   "different-image", "different-package-version", "different-cve", "duplicate", "draft", "modified-policy",
                   "missing-justification", "missing-mitigation", "no-upgrade-review", "unacceptable-risk", "expired", "long-expiry",
                   "kev", "active-exploitation", "public-exploit", "unknown-exploitation", "vendor-fix", "vendor-unknown",
                   "vendor-mismatch", "untrusted-input", "runtime-changed", "stale-data", "stale-kev-publication", "missing-provenance"]
        for change in changes:
            finding, catalog, evidence = fixture()
            approved = proposal.digest(catalog)
            record = catalog["exceptions"][0]
            environment, image = "staging", IMAGE
            if change == "production": environment = "production"
            elif change == "application": finding["Class"] = "lang-pkgs"
            elif change == "secret": finding["Class"] = "secret"
            elif change == "non-debian": finding["Type"] = "alpine"
            elif change == "unsupported-os": finding["OSSupported"] = False
            elif change == "fix": finding["FixedVersion"] = "2.0"
            elif change == "unknown-status": finding["Status"] = "unknown"
            elif change == "different-image": image = IMAGE.replace("a" * 64, "d" * 64)
            elif change == "different-package-version": finding["InstalledVersion"] = "1.1"
            elif change == "different-cve": finding["VulnerabilityID"] = "CVE-2099-99999"
            elif change == "duplicate": catalog["exceptions"].append(copy.deepcopy(record))
            elif change == "draft": catalog["status"] = "draft"
            elif change == "modified-policy": record["mitigation"] = "changed after approval"
            elif change == "missing-justification": del record["justification"]
            elif change == "missing-mitigation": del record["mitigation"]
            elif change == "no-upgrade-review": del record["upgrade_or_replacement_review"]
            elif change == "unacceptable-risk": evidence["runtime"]["unacceptable_risk"] = True
            elif change == "expired": record["expires_at"] = NOW.isoformat()
            elif change == "long-expiry": record["expires_at"] = (NOW + dt.timedelta(days=8)).isoformat()
            elif change == "kev": evidence["kev"]["cve_ids"].append(finding["VulnerabilityID"])
            elif change == "active-exploitation": evidence["exploitation"]["actively_exploited"] = True
            elif change == "public-exploit": evidence["exploitation"]["public_exploit"] = True
            elif change == "unknown-exploitation": del evidence["exploitation"]["actively_exploited"]
            elif change == "vendor-fix": evidence["debian"]["fix_available"] = True
            elif change == "vendor-unknown": evidence["debian"]["fix_available"] = None
            elif change == "vendor-mismatch": evidence["debian"]["package"] = "other"
            elif change == "untrusted-input": evidence["runtime"]["untrusted_input_reaches_affected_code"] = True
            elif change == "runtime-changed": evidence["runtime"]["profile_sha256"] = "e" * 64
            elif change == "stale-data": evidence["kev"]["retrieved_at"] = (NOW - dt.timedelta(hours=25)).isoformat()
            elif change == "stale-kev-publication": evidence["kev"]["published_at"] = (NOW - dt.timedelta(days=8)).isoformat()
            elif change == "missing-provenance": del evidence["debian"]["sha256"]
            # Invalid records must fail even if their exact contents were approved.
            if change != "modified-policy": approved = proposal.digest(catalog)
            with self.subTest(change=change):
                decision = proposal.decide(finding, image, catalog, evidence,
                                           approved_catalog_sha256=approved, environment=environment, now=NOW)
                self.assertFalse(decision["accepted"], decision)

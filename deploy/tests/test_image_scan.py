"""Staging scan exceptions must never admit fixable, application or secret findings."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("image_scan", Path(__file__).resolve().parents[1] / "aws/scan-image.py")
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)


def report():
    return {"Results": [{"Target": "fixture Debian image", "Class": "os-pkgs", "Vulnerabilities": [{
        "PkgName": "fixture-package", "VulnerabilityID": "fixture-advisory", "Severity": "HIGH", "Status": "affected"}]}]}


class ImageScan(unittest.TestCase):
    def test_default_blocks_unfixed_os_and_explicit_exception_reports_it(self):
        self.assertEqual(tuple(map(len, scan.evaluate(report()))), (1, 0))
        self.assertEqual(tuple(map(len, scan.evaluate(report(), True))), (0, 1))

    def test_fixable_os_application_unknown_and_eol_findings_stay_blocked(self):
        for change in ("fixed-version", "fixed-status", "application", "unknown-status", "eol"):
            item = report()
            result = item["Results"][0]
            finding = result["Vulnerabilities"][0]
            if change == "fixed-version":
                finding["FixedVersion"] = "2.0"
            elif change == "fixed-status":
                finding["Status"] = "fixed"
            elif change == "application":
                result["Class"] = "lang-pkgs"
            elif change == "unknown-status":
                del finding["Status"]
            else:
                item["Metadata"] = {"OS": {"EOSL": True}}
            with self.subTest(change=change):
                self.assertTrue(scan.evaluate(item, True)[0])

    def test_secrets_are_blocked_and_report_does_not_expose_the_match(self):
        item = report()
        item["Results"][0]["Secrets"] = [{"RuleID": "fixture-secret", "Severity": "CRITICAL",
                                          "Match": "private-fixture", "Code": {"Lines": ["private-fixture"]}}]
        self.assertTrue(scan.evaluate(item, True)[0])
        redacted = scan.redact(copy.deepcopy(item))
        self.assertNotIn("private-fixture", str(redacted))
        self.assertEqual(redacted["Results"][0]["Secrets"][0]["RuleID"], "fixture-secret")

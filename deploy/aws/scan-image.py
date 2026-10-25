#!/usr/bin/env python3
"""Scan staging images; an explicit repository setting controls unfixed OS risk."""
import argparse
import json
import os
from pathlib import Path
import subprocess


def evaluate(report, allow_unfixed_os=False):
    blocked, deferred = [], []
    if report.get("Metadata", {}).get("OS", {}).get("EOSL"):
        blocked.append("The image operating system is past its supported lifetime")
    for result in report["Results"]:
        for finding in result.get("Vulnerabilities") or []:
            if finding["Severity"] not in {"HIGH", "CRITICAL"}:
                continue
            description = f'{result["Target"]}: {finding["PkgName"]} {finding["VulnerabilityID"]}'
            if (allow_unfixed_os and result.get("Class") == "os-pkgs"
                    and not finding.get("FixedVersion")
                    and finding.get("Status") in {"affected", "fix_deferred", "will_not_fix"}):
                deferred.append(description)
            else:
                blocked.append(description)
        for finding in result.get("Secrets") or []:
            if finding["Severity"] in {"HIGH", "CRITICAL"}:
                blocked.append(f'{result["Target"]}: secret scanner rule {finding["RuleID"]}')
    return blocked, deferred


def redact(report):
    for result in report["Results"]:
        if result.get("Secrets"):
            result["Secrets"] = [{key: value for key, value in finding.items()
                                  if key in {"RuleID", "Category", "Severity", "Title", "StartLine", "EndLine"}}
                                 for finding in result["Secrets"]]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--allow-unfixed-os", choices=("true", "false"), default="false")
    args = parser.parse_args()
    result = subprocess.run([".local/ci-tools/trivy", "image", "--quiet", "--scanners", "vuln,secret",
                             "--severity", "HIGH,CRITICAL", "--format", "json", args.image],
                            capture_output=True, text=True, check=True)
    report = json.loads(result.stdout)
    if not isinstance(report.get("Results"), list) or not report["Results"]:
        raise ValueError("Image scan returned no package results")
    blocked, deferred = evaluate(report, args.allow_unfixed_os == "true")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(redact(report), indent=2) + "\n")
    summary = (f"Image `{args.image}`: {len(blocked)} blocking findings; "
               f"{len(deferred)} unfixed OS findings accepted by the staging setting.\n")
    print(summary, end="")
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as stream:
            stream.write(summary)
    for finding in deferred:
        print("UNFIXED OS (reported): " + finding)
    for finding in blocked:
        print("BLOCKED: " + finding)
    raise SystemExit(bool(blocked))


if __name__ == "__main__":
    main()

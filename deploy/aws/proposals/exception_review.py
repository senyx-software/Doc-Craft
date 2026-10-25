"""OFFLINE REVIEW PROTOTYPE. Not imported or invoked by any deployment gate.

The future caller must supply independently fetched, authenticated evidence and
an externally approved catalog hash. Exception records cannot supply those facts.
"""
import datetime as dt
import hashlib
import json
import re


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def instant(value):
    result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timezone required")
    return result.astimezone(dt.timezone.utc)


def decide(finding, image, catalog, evidence, *, approved_catalog_sha256=None,
           environment="staging", now=None):
    """Return an auditable proposal decision. No network, file writes or deployment."""
    now = now or dt.datetime.now(dt.timezone.utc)
    decision = {"accepted": False, "evaluated_at": now.isoformat(), "image": image,
                "cve": finding.get("VulnerabilityID"), "package": finding.get("PkgName"),
                "catalog_sha256": digest(catalog), "reasons": []}

    def deny(reason):
        decision["reasons"].append(reason)
        return decision

    if environment != "staging" or catalog.get("environment") != "staging":
        return deny("Exceptions are staging only")
    if (not approved_catalog_sha256 or catalog.get("status") != "approved"
            or catalog.get("version") != 1 or digest(catalog) != approved_catalog_sha256):
        return deny("The exact exception catalog has not been externally approved")
    if not re.fullmatch(r"ghcr\.io/senyx-software/doccraft-[a-z-]+@sha256:[a-f0-9]{64}", image):
        return deny("An immutable approved-registry image digest is required")
    if (finding.get("Class") != "os-pkgs" or finding.get("Type") != "debian"
            or finding.get("OSFamily") != "debian" or finding.get("OSSupported") is not True):
        return deny("Only supported Debian OS package findings can be considered")
    if not re.fullmatch(r"CVE-[0-9]{4}-[0-9]{4,}", finding.get("VulnerabilityID", "")):
        return deny("An individual CVE ID is required")
    if finding.get("Severity") not in {"HIGH", "CRITICAL"}:
        return deny("The proposal covers only the existing HIGH/CRITICAL image gate")
    if finding.get("FixedVersion") or finding.get("Status") not in {"affected", "fix_deferred", "will_not_fix"}:
        return deny("Fixable or unknown-status findings cannot be exempted")
    matches = [record for record in catalog.get("exceptions", [])
               if record.get("cve") == finding["VulnerabilityID"] and record.get("image") == image
               and record.get("package") == finding.get("PkgName")
               and record.get("installed_version") == finding.get("InstalledVersion")]
    if len(matches) != 1:
        return deny("One individually reviewed CVE/image/package/version record is required")
    record = matches[0]
    decision["exception_id"] = record.get("id")
    for key in ("id", "justification", "risk_assessment", "reviewed_by", "approval_reference",
                "mitigation", "upgrade_or_replacement_review", "runtime_profile_sha256"):
        if not isinstance(record.get(key), str) or not record[key].strip():
            return deny("Missing review field: " + key)
    if record.get("risk") not in {"low", "moderate"} or not record.get("sources"):
        return deny("An acceptable documented risk and primary sources are required")
    if record.get("suite") != finding.get("Suite") or not record.get("suite"):
        return deny("The approved Debian suite must match")
    try:
        reviewed, expires = instant(record["reviewed_at"]), instant(record["expires_at"])
    except (KeyError, ValueError, TypeError):
        return deny("Valid timezone-aware review and expiry dates are required")
    if not reviewed <= now < expires or expires - reviewed > dt.timedelta(days=7):
        return deny("The record is expired, future-dated or exceeds seven days")
    decision["expires_at"] = expires.isoformat()
    required = ("debian", "kev", "exploitation", "runtime")
    for source in required:
        item = evidence.get(source, {})
        try:
            age = now - instant(item["retrieved_at"])
        except (KeyError, ValueError, TypeError):
            return deny("Missing evidence timestamp: " + source)
        if not dt.timedelta(0) <= age <= dt.timedelta(hours=24):
            return deny("Stale or future evidence: " + source)
        if (not re.fullmatch(r"[a-f0-9]{64}", item.get("sha256", ""))
                or not item.get("source")):
            return deny("Missing evidence provenance: " + source)
    decision["evidence_sha256"] = {name: evidence[name]["sha256"] for name in required}
    vendor = evidence["debian"]
    if (vendor.get("cve") != finding["VulnerabilityID"] or vendor.get("package") != finding["PkgName"]
            or vendor.get("suite") != finding["Suite"] or vendor.get("fix_available") is not False):
        return deny("Vendor status is unknown, mismatched or a fix is now available")
    kev = evidence["kev"]
    if not isinstance(kev.get("cve_ids"), list):
        return deny("The KEV catalog is unavailable")
    try:
        catalog_age = now - instant(kev["published_at"])
    except (KeyError, ValueError, TypeError):
        return deny("The KEV publication date is unavailable")
    if not dt.timedelta(0) <= catalog_age <= dt.timedelta(days=7):
        return deny("The KEV catalog publication is stale or future-dated")
    if finding["VulnerabilityID"] in kev["cve_ids"]:
        return deny("CISA lists this CVE as known exploited")
    exploit = evidence["exploitation"]
    if (exploit.get("cve") != finding["VulnerabilityID"]
            or exploit.get("actively_exploited") is not False
            or exploit.get("public_exploit") is not False):
        return deny("Exploitation is known or the review is incomplete")
    runtime = evidence["runtime"]
    if (runtime.get("image") != image or runtime.get("profile_sha256") != record["runtime_profile_sha256"]
            or runtime.get("unacceptable_risk") is not False
            or runtime.get("untrusted_input_reaches_affected_code") is not False
            or runtime.get("reachability") not in {"not_reachable", "privileged_local_only"}):
        return deny("Runtime exposure is unacceptable, unknown or changed")
    decision["accepted"] = True
    decision["reasons"] = ["Exact approved time-limited record; all independent evidence checks passed"]
    return decision

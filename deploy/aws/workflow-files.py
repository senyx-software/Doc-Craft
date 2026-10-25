#!/usr/bin/env python3
"""Build a bounded release manifest and private runner files without logging secrets."""
import json
import ipaddress
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "deploy/scripts"))
sys.path.insert(0, str(ROOT / "deploy/aws"))
from staging import INTEGRATIONS, PUBLIC_SETTINGS, integration_secrets, staging_config, staging_release_manifest


def build(directory, fragments, environment):
    images = {}
    for path in sorted(fragments.glob("*.json")):
        fragment = json.loads(path.read_text())
        if set(images) & set(fragment):
            raise ValueError("Duplicate image fragment")
        images.update(fragment)
    release = {"format": 1, "commit": environment["GITHUB_SHA"],
               "schema_epoch": json.loads((ROOT / "deploy/release-policy.json").read_text())["schema_epoch"],
               "images": images}
    staging_release_manifest(release)
    configuration = environment.get("CONFIGURATION")
    if not configuration:
        if not environment.get("ACME_EMAIL") or not environment.get("RESEND_FROM_EMAIL"):
            raise ValueError("Set the ACME_EMAIL and RESEND_FROM_EMAIL GitHub secrets")
        configuration = (ROOT / "deploy/aws/staging.env.example").read_text()
    public_ip = str(ipaddress.IPv4Address(environment["PUBLIC_IP"]))
    admin_cidrs = json.loads(environment["ADMIN_CIDRS"])
    if not isinstance(admin_cidrs, list) or not admin_cidrs:
        raise ValueError("Explicit administrator source networks are required")
    for cidr in admin_cidrs:
        network = ipaddress.IPv4Network(cidr)
        if network.prefixlen == 0:
            raise ValueError("Unrestricted admin access is prohibited")
    values = {}
    for line in configuration.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        if key in values:
            raise ValueError("Duplicate staging configuration")
        if key in ("APP_DOMAIN", "ADMIN_DOMAIN"):
            value = value.replace("__PUBLIC_IP__", public_ip)
        if key == "ADMIN_ALLOWED_CIDRS" and value == "__ADMIN_CIDRS__":
            value = " ".join(admin_cidrs)
        values[key] = value
    values.update({key: environment[key] for key in PUBLIC_SETTINGS if environment.get(key)})
    staging_config(values)
    if values["APP_DOMAIN"] != public_ip or set(values["ADMIN_ALLOWED_CIDRS"].split()) != set(admin_cidrs):
        raise ValueError("Use the instance's observed Elastic IP and Terraform admin source networks")
    configuration = "".join(key + "=" + value + "\n" for key, value in values.items())
    integrations = integration_secrets(environment.get("APP_SECRETS", ""))
    integrations.update({key: environment[key] for key in INTEGRATIONS if environment.get(key)})
    app_secrets = "".join(key + "=" + value + "\n" for key, value in integrations.items())
    for name in ("SSH_KEY", "KNOWN_HOSTS", "RESEND_API_KEY", "ADMIN_EMAIL", "ADMIN_PASSWORD"):
        if not environment.get(name):
            raise ValueError("Required GitHub setting missing: " + name)
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", environment["SSH_USER"]) or environment["SSH_USER"] == "root":
        raise ValueError("Use a non-root EC2 SSH user with sudo")
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    files = {"key": environment["SSH_KEY"] + "\n", "known_hosts": environment["KNOWN_HOSTS"] + "\n",
             "release.json": json.dumps(release, indent=2) + "\n",
             "settings.json": json.dumps({"configuration": configuration, "resend_api_key": environment["RESEND_API_KEY"],
                                          "admin_email": environment["ADMIN_EMAIL"], "admin_password": environment["ADMIN_PASSWORD"],
                                          "app_secrets": app_secrets})}
    for name, content in files.items():
        with open(directory / name, "x", opener=lambda p, flags: os.open(p, flags, 0o600)) as stream:
            stream.write(content)


if __name__ == "__main__":
    os.umask(0o077)
    try:
        build(Path(os.environ["RUNNER_TEMP"]) / "aws-staging", Path("fragments"), os.environ)
    except Exception as error:
        print("AWS release preparation failed (" + type(error).__name__ + "); check image fragments and GitHub settings. Values are not printed.", file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Initialize fresh EC2 staging credentials once; preserve them on later releases."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

from staging import HOME, IDENTITY, ROOT, INTEGRATIONS, generate, integration_secrets, parse, staging_config, verify_instance


def write(path, value):
    with open(path, "x", opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
        stream.write(value)


def prepare(settings):
    if os.geteuid() != 0:
        raise ValueError("Host preparation requires root")
    verify_instance()
    values = {}
    for line in settings["configuration"].splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        if key in values:
            raise ValueError("Duplicate staging configuration")
        values[key] = value
    values = staging_config(values)
    integrations = integration_secrets(settings.get("app_secrets", ""))
    for key in ("resend_api_key", "admin_email", "admin_password"):
        value = settings.get(key, "")
        if not value or any(char in value for char in ("\r", "\n", "\x00")) or "${" in value:
            raise ValueError("Missing or invalid integration/bootstrap setting")
    if len(settings["resend_api_key"]) < 16 or len(settings["admin_password"]) < 16:
        raise ValueError("Notification credential and initial admin password must be at least 16 characters")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", settings["admin_email"]):
        raise ValueError("Invalid initial administrator email")
    if HOME.exists():
        if json.loads((HOME / "aws-staging.json").read_text()) != IDENTITY or parse(HOME / "production.env") != values:
            raise ValueError("Existing staging configuration requires an operator update")
        expected = {"notification": {"RESEND_API_KEY": settings["resend_api_key"]},
                    "admin-api": {"SUPER_ADMIN_EMAIL": settings["admin_email"], "SUPER_ADMIN_PASSWORD": settings["admin_password"]}}
        for key, services in INTEGRATIONS.items():
            for service in services:
                expected.setdefault(service, {})[key] = integrations.get(key)
        for service, keys in expected.items():
            existing = parse(HOME / "secrets" / (service + ".env"))
            if any(existing.get(key) != value for key, value in keys.items()):
                raise ValueError("Integration or bootstrap credential changes require an operator update")
        generate(HOME / "production.env", HOME, HOME / "runtime" / values["CONFIG_VERSION"], check_only=True)
        print("Existing staging credentials preserved")
        return
    with tempfile.TemporaryDirectory(prefix="doccraft-aws-config-") as temporary:
        config = Path(temporary) / "settings.env"
        write(config, "".join(key + "=" + value + "\n" for key, value in values.items()))
        subprocess.run([sys.executable, str(ROOT / "deploy/scripts/initialize-host.py"), "--new-empty-installation",
                        "--home", str(HOME), "--config", str(config)], check=True)
    with (HOME / "secrets/notification.env").open("a") as stream:
        stream.write("RESEND_API_KEY=" + settings["resend_api_key"] + "\n")
    with (HOME / "secrets/admin-api.env").open("a") as stream:
        stream.write("SUPER_ADMIN_EMAIL=" + settings["admin_email"] + "\nSUPER_ADMIN_PASSWORD=" + settings["admin_password"] + "\n")
    for key, value in integrations.items():
        for service in INTEGRATIONS[key]:
            with (HOME / "secrets" / (service + ".env")).open("a") as stream:
                stream.write(key + "=" + value + "\n")
    # Docker bind-mounted secret files must be readable by their selected
    # container UID. Their enclosing host directory remains root-only (0700).
    for path in (HOME / "secrets").iterdir():
        if path.suffix in (".crt", ".key", ".json", ".acl") or path.name in ("postgres-password", "postgres-migrator-password"):
            if path.is_file() and path.name != "ca.key":
                path.chmod(0o444)
    generate(HOME / "production.env", HOME, HOME / "runtime" / values["CONFIG_VERSION"])
    write(HOME / "aws-staging.json", json.dumps(IDENTITY) + "\n")
    print("Fresh staging configuration prepared; credentials remain on EC2")


if __name__ == "__main__":
    os.umask(0o077)
    try:
        settings_path = Path(sys.argv[1])
        if settings_path.stat().st_mode & 0o077 or settings_path.is_symlink():
            raise ValueError("Settings file must be private")
        prepare(json.loads(settings_path.read_text()))
    except Exception as error:
        print("Staging host preparation failed (" + type(error).__name__ + "); inspect settings and existing installation. Values are not printed.", file=sys.stderr)
        sys.exit(1)

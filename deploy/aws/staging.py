#!/usr/bin/env python3
"""EC2 staging adapter for the existing backup/migration/rollback controller."""
import fcntl
import http.client
import ipaddress
import json
import os
import re
from pathlib import Path
import signal
import socket
import ssl
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "deploy/scripts"))
from configure import generate, parse, validate
from controller import Controller, release_manifest

HOME = Path("/etc/doccraft-aws-staging")
STATE = Path("/var/lib/doccraft-aws-staging")
IDENTITY = {"accountId": "506192652462", "instanceId": "i-098228a0d829d7eb2", "region": "ap-southeast-2"}
PUBLIC_SETTINGS = ("ACME_EMAIL", "RESEND_FROM_EMAIL", "CONFIG_VERSION", "GOOGLE_CLIENT_ID", "FIREBASE_PROJECT_ID",
                   "SUPABASE_URL", "LEGACY_STORAGE_PROVIDER", "PADDLE_PRO_MONTHLY_PRICE_ID", "PADDLE_PRO_YEARLY_PRICE_ID",
                   "PADDLE_MAX_MONTHLY_PRICE_ID", "PADDLE_MAX_YEARLY_PRICE_ID", "PAYHERE_MERCHANT_ID", "POSTHOG_HOST", "POSTHOG_PROJECT_ID")
INTEGRATIONS = {
    "GROQ_API_KEY": ("chat",), "ANTHROPIC_API_KEY": ("chat",),
    "GOOGLE_CLIENT_SECRET": ("auth",), "SUPABASE_SERVICE_ROLE_KEY": ("document",),
    "PADDLE_API_KEY": ("payment",), "PADDLE_WEBHOOK_SECRET": ("payment",),
    "PAYHERE_MERCHANT_SECRET": ("payment",), "POSTHOG_API_KEY": ("analytics", "admin-api"),
    "POSTHOG_PERSONAL_API_KEY": ("admin-api",),
}


def integration_secrets(text):
    values = {}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        if key not in INTEGRATIONS or key in values or any(char in value for char in ("\r", "\x00")) or "${" in value:
            raise ValueError("Unsupported integration credential")
        values[key] = value
    return {key: value for key, value in values.items() if value}


def staging_release_manifest(data):
    if not isinstance(data, dict) or not isinstance(data.get("images"), dict):
        raise ValueError("Invalid AWS release manifest")
    infrastructure = {}
    for name in ("edge", "postgres"):
        image = data["images"].get(name)
        if not isinstance(image, str) or not re.fullmatch(r"ghcr\.io/senyx-software/doccraft-" + name + r"@sha256:[0-9a-f]{64}", image):
            raise ValueError("An immutable staging infrastructure image is required")
        infrastructure[name] = image
    base = {**data, "images": {key: value for key, value in data["images"].items() if key not in infrastructure}}
    release_manifest(base, "ghcr.io/senyx-software/doccraft")
    return {**base, "images": {**base["images"], **infrastructure}}


def verify_instance():
    # Never send metadata requests through an inherited proxy.
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    base = "http://169.254.169.254/latest/"
    request = urllib.request.Request(base + "api/token", method="PUT", headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"})
    with client.open(request, timeout=5) as response:
        token = response.read(4096).decode()
    request = urllib.request.Request(base + "dynamic/instance-identity/document", headers={"X-aws-ec2-metadata-token": token})
    with client.open(request, timeout=5) as response:
        observed = json.loads(response.read(65536))
    if any(observed.get(key) != value for key, value in IDENTITY.items()):
        raise ValueError("EC2 instance identity mismatch")


def staging_config(values):
    values = validate(values)
    if "staging" not in values["POSTGRES_DB"] or values["LOCAL_AI_ENABLED"] != "false":
        raise ValueError("Use an isolated staging database and disable local inference")
    if any(values.get(key) != "true" for key in ("PADDLE_SANDBOX", "PAYHERE_SANDBOX")):
        raise ValueError("Staging payment integrations require sandbox mode")
    if values["REGISTRY_PREFIX"] != "ghcr.io/senyx-software/doccraft":
        raise ValueError("Unexpected staging image registry")
    ipaddress.IPv4Address(values["APP_DOMAIN"])
    if values["ADMIN_DOMAIN"] != values["APP_DOMAIN"] + ":8443":
        raise ValueError("Admin staging must use the same public IP on HTTPS port 8443")
    return values


def capacity(control=ROOT, meminfo=Path("/proc/meminfo")):
    compose = json.loads((control / "deploy/docker/compose.production.yml").read_text())
    overrides = json.loads((control / "deploy/aws/compose.staging.yml").read_text())["services"]
    limits = [int(overrides.get(name, {}).get("mem_limit", service["mem_limit"])[:-1])
              for name, service in compose["services"].items() if not service.get("profiles")]
    # Include the largest one-shot migration/verifier plus 1 GiB for the host.
    required_mib = sum(limits) + 1024 + 1024
    total_kib = int(next(line.split()[1] for line in meminfo.read_text().splitlines() if line.startswith("MemTotal:")))
    if total_kib < required_mib * 1024:
        raise ValueError("Insufficient RAM for the staging stack and migration headroom")
    disk = os.statvfs("/var/lib/docker")
    if disk.f_bavail * disk.f_frsize < 15 * 1024**3:
        raise ValueError("At least 15 GiB free Docker storage is required")


class StagingController(Controller):
    def validate_release(self, incoming):
        return staging_release_manifest(incoming)

    def __init__(self, home=HOME, state=STATE, control=ROOT):
        verify_instance()
        for path in (home, state, control, home / "aws-staging.json", home / "production.env"):
            info = path.lstat()
            if path.is_symlink() or info.st_uid != 0 or info.st_mode & 0o022:
                raise ValueError("Staging paths must be root owned and protected")
        if (home / "production-enabled").exists():
            raise ValueError("Unexpected production marker in staging")
        if json.loads((home / "aws-staging.json").read_text()) != IDENTITY:
            raise ValueError("Staging marker mismatch")
        self.home, self.state, self.control = home, state, control
        self.config = staging_config(parse(home / "production.env"))
        self.log = None

    def compose(self, release, *args, stdout=None, stdin=None):
        command = ["docker", "compose", "--project-name", "doccraft-aws-staging", "--project-directory", str(self.control),
                   "-f", str(self.control / "deploy/docker/compose.production.yml"),
                   "-f", str(self.control / "deploy/aws/compose.staging.yml"), *args]
        critical = "run" in args and any(name in args for name in ("migrate-node", "migrate-python", "grant-roles"))
        subprocess.run(command, env=self.environment(release), stdin=stdin if stdin is not None else subprocess.DEVNULL,
                       stdout=stdout if stdout is not None else self.log, stderr=self.log,
                       timeout=None if critical else 1200, check=True)

    def health(self, release):
        self.compose(release, "run", "--rm", "-T", "--no-deps", "verify")
        configuration = release.get("configuration", self.config)
        for path in ("/", "/health"):
            for attempt in range(12):
                try:
                    with urllib.request.urlopen("https://" + configuration["APP_DOMAIN"] + path, timeout=8) as response:
                        if response.status != 200:
                            raise ValueError("Public application readiness failed")
                    break
                except Exception:
                    if attempt == 11:
                        raise RuntimeError("Public IP HTTPS readiness failed") from None
                    time.sleep(5)
        # Admin 8443 is restricted to operator CIDRs at the AWS firewall. Probe
        # its local listener while still validating the public IP certificate;
        # the private caller may correctly receive Caddy's 403 access denial.
        with socket.create_connection(("127.0.0.1", 8443), timeout=8) as connection:
            with ssl.create_default_context().wrap_socket(connection, server_hostname=configuration["APP_DOMAIN"]) as tls:
                request = "GET / HTTP/1.1\r\nHost: " + configuration["ADMIN_DOMAIN"] + "\r\nConnection: close\r\n\r\n"
                tls.sendall(request.encode("ascii"))
                response = http.client.HTTPResponse(tls)
                response.begin()
                if response.status not in (200, 403):
                    raise ValueError("Admin HTTPS listener readiness failed")


def main():
    if os.geteuid() != 0:
        raise ValueError("Run the staging controller through sudo")
    os.umask(0o077)
    for name in ("SIGHUP", "SIGINT", "SIGTERM"):
        signal.signal(getattr(signal, name), signal.SIG_IGN)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / "deployment.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        controller = StagingController()
        capacity()
        logs = STATE / "diagnostics"
        logs.mkdir(mode=0o700, exist_ok=True)
        for old in sorted(logs.glob("*.log"))[:-19]:
            old.unlink()
        with (logs / (str(time.time_ns()) + ".log")).open("w") as log:
            controller.log = log
            action = sys.argv[1] if len(sys.argv) == 2 else "deploy"
            if action == "deploy":
                data = sys.stdin.buffer.read(65537)
                if len(data) > 65536:
                    raise ValueError("Release manifest too large")
                release = json.loads(data)
                release_commit = (ROOT / ".release-commit").read_text().strip()
                if release.get("commit") != release_commit:
                    raise ValueError("Controller code must match the release commit")
                print(controller.deploy(release))
            elif action == "rollback":
                current = json.loads((STATE / "current.json").read_text())
                previous = json.loads((STATE / "previous.json").read_text())
                controller.restore(previous, current)
                print("Previous compatible staging application restored")
            elif action == "health":
                controller.health(json.loads((STATE / "current.json").read_text()))
                print("Staging readiness verified")
            else:
                raise ValueError("Unknown staging operation")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("AWS staging failed (" + type(error).__name__ + "). Inspect /var/lib/doccraft-aws-staging/diagnostics on EC2.", file=sys.stderr)
        sys.exit(1)

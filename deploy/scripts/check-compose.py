"""Validate Compose using synthetic paths/images without reading runtime secrets."""
import os
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
base = ROOT / "deploy/docker/compose.production.yml"
staging = ROOT / "deploy/aws/compose.staging.yml"
names = set(re.findall(r"\$\{([^}:]+)", base.read_text() + staging.read_text()))
values = {name: "ghcr.io/example/doccraft-" + name.removesuffix("_IMAGE").lower().replace("_", "-")
          + "@sha256:" + "a" * 64 for name in names if name.endswith("_IMAGE")}
values.update(DOCCRAFT_CONTROL=str(ROOT), APP_DOMAIN="app.example.com",
              ADMIN_DOMAIN="admin.example.com", ADMIN_ALLOWED_CIDRS="192.0.2.20/32",
              POSTGRES_DB="doccraft_staging_ci", ACME_EMAIL="ci@example.com", RESEND_FROM_EMAIL="ci@example.com")
environment = {key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG"}}
command = ["docker", "compose"] if shutil.which("docker") else [str(ROOT / ".local/ci-tools/docker-compose")]
with tempfile.TemporaryDirectory(prefix="doccraft-ci-compose-") as temporary:
    work = Path(temporary)
    values.update(DOCCRAFT_HOME=str(work / "config"), DOCCRAFT_RUNTIME=str(work / "runtime"))
    environment.update(values)
    # Compose checks that required paths exist even with --no-env-resolution.
    # Supply empty task-owned fixtures; never resolve actual runtime env files.
    model = json.loads(base.read_text())
    fixtures = [entry["path"] if isinstance(entry, dict) else entry
                for service in model["services"].values() for entry in service.get("env_file", [])]
    fixtures += [entry["file"] for entry in model.get("secrets", {}).values() if "file" in entry]
    for template in fixtures:
        path = Path(re.sub(r"\$\{([^}:]+)[^}]*}", lambda match: values[match[1]], template))
        path.resolve().relative_to(work.resolve())
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch(mode=0o600)
    for files in ([base], [base, staging]):
        if len(files) == 2:
            environment.update(APP_DOMAIN="192.0.2.10", ADMIN_DOMAIN="192.0.2.10:8443")
        subprocess.run([*command, "--project-directory", str(ROOT),
                        *[argument for path in files for argument in ("-f", str(path))],
                        "config", "--no-env-resolution", "--quiet"], env=environment, check=True)
print("Production and AWS staging Compose configurations validated with synthetic inputs")

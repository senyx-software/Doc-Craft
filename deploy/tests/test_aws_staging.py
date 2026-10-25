"""EC2 staging contract tests; no AWS requests, SSH or paid provider calls."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "deploy/aws"))
import staging
from configure import SERVICES


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "deploy/aws" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


prepare_host = load("aws_prepare_host", "prepare-host.py")
workflow = load("aws_workflow_files", "workflow-files.py")


def configuration():
    text = (ROOT / "deploy/aws/staging.env.example").read_text()
    return text.replace("__PUBLIC_IP__", "192.0.2.10").replace("__ADMIN_CIDRS__", "192.0.2.20/32")


class AWSStaging(unittest.TestCase):
    def test_edge_image_requires_an_immutable_digest_from_the_staging_registry(self):
        images = {name: "ghcr.io/senyx-software/doccraft-" + name + "@sha256:" + "a" * 64 for name in [*SERVICES, "migration", "edge"]}
        release = {"format": 1, "commit": "a" * 40, "schema_epoch": 1, "images": images}
        self.assertEqual(staging.staging_release_manifest(release), release)
        for image in ("ghcr.io/senyx-software/doccraft-edge:latest", "ghcr.io/other/doccraft-edge@sha256:" + "a" * 64, None):
            with self.subTest(image=image), self.assertRaises(ValueError):
                staging.staging_release_manifest({**release, "images": {**images, "edge": image}})

    def test_ip_origins_and_ports_preserve_https_sessions(self):
        values = staging.parse(ROOT / "deploy/aws/staging.env.example")
        values.update(APP_DOMAIN="192.0.2.10", ADMIN_DOMAIN="192.0.2.10:8443", ADMIN_ALLOWED_CIDRS="192.0.2.20/32")
        self.assertEqual(staging.staging_config(values)["ADMIN_DOMAIN"], "192.0.2.10:8443")
        for name, value in [("ADMIN_DOMAIN", "192.0.2.11:8443"), ("PADDLE_SANDBOX", "false"),
                            ("LOCAL_AI_ENABLED", "true"), ("POSTGRES_DB", "production")]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                staging.staging_config({**values, name: value})
        for authority in ("192.0.2.10:0", "192.0.2.10:65536", "192.0.2.10/evil", "user@192.0.2.10", "192.0.2.10:8443;id"):
            with self.subTest(authority=authority), self.assertRaises(ValueError):
                staging.validate({**values, "ADMIN_DOMAIN": authority})

    def test_imdsv2_identity_mismatch_stops_deployment(self):
        client = mock.Mock()
        client.open.side_effect = [io.BytesIO(b"fixture-session"), io.BytesIO(json.dumps(staging.IDENTITY).encode())]
        with mock.patch.object(staging.urllib.request, "build_opener", return_value=client):
            staging.verify_instance()
        self.assertEqual(client.open.call_args_list[0].args[0].method, "PUT")
        for changed in ("instanceId", "accountId", "region"):
            client.open.side_effect = [io.BytesIO(b"fixture-session"), io.BytesIO(json.dumps({**staging.IDENTITY, changed: "wrong"}).encode())]
            with mock.patch.object(staging.urllib.request, "build_opener", return_value=client), self.assertRaises(ValueError):
                staging.verify_instance()

    def test_capacity_allows_this_instance_but_rejects_small_hosts_and_full_disks(self):
        with tempfile.TemporaryDirectory() as directory:
            memory = Path(directory) / "meminfo"
            memory.write_text("MemTotal: 7962856 kB\n")
            disk = types.SimpleNamespace(f_bavail=20 * 1024**3, f_frsize=1)
            with mock.patch.object(staging.os, "statvfs", return_value=disk):
                staging.capacity(meminfo=memory)
                memory.write_text("MemTotal: 4194304 kB\n")
                with self.assertRaises(ValueError):
                    staging.capacity(meminfo=memory)
            memory.write_text("MemTotal: 7962856 kB\n")
            with mock.patch.object(staging.os, "statvfs", return_value=types.SimpleNamespace(f_bavail=1, f_frsize=4096)), self.assertRaises(ValueError):
                staging.capacity(meminfo=memory)

    def test_release_files_keep_secrets_private_and_reject_foreign_images(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fragments = root / "fragments"
            fragments.mkdir()
            images = {name: "ghcr.io/senyx-software/doccraft-" + name + "@sha256:" + "a" * 64 for name in [*SERVICES, "migration", "edge"]}
            (fragments / "images.json").write_text(json.dumps(images))
            environment = {"GITHUB_SHA": "a" * 40, "PUBLIC_IP": "192.0.2.10", "ADMIN_CIDRS": '["192.0.2.20/32"]',
                           "CONFIGURATION": (ROOT / "deploy/aws/staging.env.example").read_text(),
                           "SSH_KEY": "private-fixture", "KNOWN_HOSTS": "public-host-fixture", "SSH_USER": "ubuntu",
                           "RESEND_API_KEY": "private-email-fixture", "ADMIN_EMAIL": "admin@example.com", "ADMIN_PASSWORD": "private-admin-fixture"}
            directory = root / "runner"
            workflow.build(directory, fragments, environment)
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            self.assertTrue(all(path.stat().st_mode & 0o777 == 0o600 for path in directory.iterdir()))
            self.assertNotIn("private-", (directory / "release.json").read_text())
            self.assertNotIn("__PUBLIC_IP__", (directory / "settings.json").read_text())
            self.assertIn("192.0.2.10:8443", (directory / "settings.json").read_text())
            flat = {key: value for key, value in environment.items() if key != "CONFIGURATION"}
            flat.update(ACME_EMAIL="ops@example.com", RESEND_FROM_EMAIL="mail@example.com", GROQ_API_KEY="private-groq-fixture",
                        AWS_SECRET_ACCESS_KEY="never-forward-aws-credentials")
            workflow.build(root / "flat-runner", fragments, flat)
            settings = (root / "flat-runner/settings.json").read_text()
            self.assertIn("GROQ_API_KEY=private-groq-fixture", settings)
            self.assertNotIn("never-forward-aws-credentials", settings)
            images["chat"] = "ghcr.io/other/doccraft-chat@sha256:" + "a" * 64
            (fragments / "images.json").write_text(json.dumps(images))
            with self.assertRaises(ValueError):
                workflow.build(root / "rejected", fragments, environment)
            self.assertFalse((root / "rejected").exists())

    def test_fresh_install_preserves_credentials_and_rejects_implicit_rotation(self):
        settings = {"configuration": configuration(), "resend_api_key": "fixture-email-credential-00000000",
                    "admin_email": "admin@example.com", "admin_password": "fixture-admin-password-00000000",
                    "app_secrets": "GROQ_API_KEY=fixture-groq-credential\nPADDLE_API_KEY=fixture-payment-credential\n"}
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary) / "home"
            with mock.patch.object(prepare_host, "HOME", home), mock.patch.object(prepare_host, "verify_instance"), \
                 mock.patch.object(prepare_host.os, "geteuid", return_value=0), contextlib.redirect_stdout(io.StringIO()):
                prepare_host.prepare(settings)
                snapshot = {str(path.relative_to(home)): path.read_bytes() for path in home.rglob("*") if path.is_file()}
                prepare_host.prepare(settings)
                self.assertEqual(snapshot, {str(path.relative_to(home)): path.read_bytes() for path in home.rglob("*") if path.is_file()})
                self.assertFalse((home / "production-enabled").exists())
                self.assertEqual((home / "secrets").stat().st_mode & 0o777, 0o700)
                self.assertEqual((home / "secrets/auth.identity.json").stat().st_mode & 0o777, 0o444)
                runtime = home / "runtime/aws-staging-1"
                self.assertEqual(staging.parse(runtime / "auth.env")["FRONTEND_URL"], "https://192.0.2.10")
                self.assertEqual(json.loads(staging.parse(runtime / "admin-api.env")["ALLOWED_ORIGINS"]), ["https://192.0.2.10:8443"])
                self.assertIn("GROQ_API_KEY", staging.parse(runtime / "chat.env"))
                self.assertNotIn("GROQ_API_KEY", staging.parse(runtime / "payment.env"))
                self.assertNotIn("PADDLE_API_KEY", staging.parse(runtime / "chat.env"))
                with self.assertRaises(ValueError):
                    prepare_host.prepare({**settings, "admin_password": "different-admin-password-00000000"})
                self.assertEqual(snapshot, {str(path.relative_to(home)): path.read_bytes() for path in home.rglob("*") if path.is_file()})
                # Validate actual Compose merge/interpolation without an engine or containers.
                standalone = ROOT / ".local/ci-tools/docker-compose"
                command = [str(standalone)] if standalone.is_file() else ["docker", "compose"] if shutil.which("docker") else None
                if command:
                    release = {"images": {name: "ghcr.io/senyx-software/doccraft-" + name + "@sha256:" + "a" * 64 for name in [*SERVICES, "migration", "edge"]}}
                    controller = object.__new__(staging.StagingController)
                    controller.home, controller.control = home, ROOT
                    controller.config = staging.parse(home / "production.env")
                    result = subprocess.run([*command, "-f", str(ROOT / "deploy/docker/compose.production.yml"), "-f", str(ROOT / "deploy/aws/compose.staging.yml"), "config", "--format", "json"], env=controller.environment(release), capture_output=True, text=True, check=True)
                    composed = json.loads(result.stdout)
                    self.assertEqual({port["published"] for port in composed["services"]["edge"]["ports"]}, {"80", "443", "8443"})
                    self.assertTrue(any(volume.get("source", "").endswith("deploy/aws/Caddyfile") for volume in composed["services"]["edge"]["volumes"]))

    def test_integration_bundle_cannot_replace_internal_credentials(self):
        for text in ("DATABASE_URL=postgresql://foreign/db", "JWT_SECRET=replace", "RESEND_API_KEY=replace", "GROQ_API_KEY=${EXPAND}"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                prepare_host.integration_secrets(text)


if __name__ == "__main__":
    unittest.main()

"""Generate private per-service config files for a new isolated deployment.

Rotate by adding a new kid to receiver keyrings and switching the sender after deployment.
The output contains secrets.
"""
import argparse
import base64
import json
import os
import stat
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write_private(path, text, overwrite=False):
    path = Path(path)
    if path.exists():
        if not overwrite:
            raise FileExistsError(f"{path} already exists. Use --overwrite to replace it.")
        try:
            # On Windows, ensure file is writable before unlinking/writing
            os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
        except OSError:
            pass
        try:
            path.unlink()
        except OSError:
            pass
    def opener(p, flags):
        return os.open(p, flags, 0o600)
    with open(path, "w", opener=opener) as stream:
        stream.write(text)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def generate():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization
    policy = json.loads((ROOT / "shared/service-permissions.json").read_text())
    identities = set(policy) | {caller for rules in policy.values() for rule in rules for caller in rule["callers"]}
    configs = {name: {"version": 1, "identity": name, "send": {}, "receive": {}} for name in identities}
    private = Ed25519PrivateKey.generate()
    public = base64.b64encode(private.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)).decode()
    for entry in configs.values():
        entry["user_jwt"] = {"public_keys": {"v1": public}}
    configs["auth"]["user_jwt"].update({"kid": "v1", "private_key": base64.b64encode(private.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())).decode()})
    configs["document"]["download_signing_key"] = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    for identity in ('auth','admin-api'):
        configs[identity]['totp_encryption']={'active_kid':'v1','keys':{'v1':base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('=')}}
    for caller in ("payment", "quota"):
        secret = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
        configs[caller]["event_send"] = {"kid":"v1", "secret":secret}
        configs["admin-api"].setdefault("event_receive", {})[caller] = {"v1":secret}
    for target, rules in policy.items():
        for caller in {caller for rule in rules for caller in rule["callers"]}:
            secret = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
            configs[caller]["send"][target] = {"kid": "v1", "secret": secret}
            configs[target]["receive"][caller] = {"v1": secret}
    for queue, consumers, producers in [("document",["document"],["document"]),("payment-webhook",["payment"],["payment"]),("email_queue_auth",["notification"],["auth"]),("email_queue_document",["notification"],["document"]),("email_queue_notification",["notification"],["notification"]),("analytics",["analytics"],["analytics"])]:
        for producer in producers:
            key={"kid":"v1","secret":base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")}
            configs[producer].setdefault("queue_send",{})[queue]=key
            for consumer in consumers:
                configs[consumer].setdefault("queue_receive",{}).setdefault(queue,{})[producer]={"v1":key["secret"]}
    return configs


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--overwrite", "--force", "-f", action="store_true", help="Overwrite existing credentials without error")
    args = parser.parse_args()
    args.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    for name, value in generate().items():
        path = args.directory / (name + ".json")
        write_private(path, json.dumps(value, indent=2) + "\n", overwrite=args.overwrite)
    print("Created private service credentials. No key values were printed.")

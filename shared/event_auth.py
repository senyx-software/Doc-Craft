"""Verify scoped ephemeral automation events before entering the admin engine."""
import json
import time
import jwt
from shared.service_auth import config, key_bytes, claim_nonce

ALLOWED = {"payment": {"payment.failed", "subscription.cancelled"}, "quota": {"quota.warning"}}


async def verified_event(raw):
    token = json.loads(raw)["authorization"]
    if not isinstance(token, str) or len(token) > 65536:
        raise ValueError("Invalid event credential")
    header = jwt.get_unverified_header(token)
    hint = jwt.decode(token, options={"verify_signature": False})
    secret = config()["event_receive"][hint["sub"]][header["kid"]]
    payload = jwt.decode(token, key_bytes(secret), algorithms=["HS256"], issuer="doccraft-events", audience="admin-api",
                         options={"require": ["sub", "iat", "exp", "jti", "event", "payload"]})
    if header.get("typ") != "doccraft-event+jwt" or payload["event"] not in ALLOWED.get(payload["sub"], set()) or not isinstance(payload["payload"], dict) or payload["exp"] - payload["iat"] > 65:
        raise ValueError("Event operation is not authorized")
    if not await claim_nonce("admin-api", "event-"+payload["sub"], header["kid"], payload["jti"], max(1, payload["exp"] - int(time.time()) + 1),payload["iat"]):
        raise ValueError("Replayed automation event")
    return payload["event"], payload["payload"]

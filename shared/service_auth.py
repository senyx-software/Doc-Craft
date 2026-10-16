"""Pairwise service JWTs and request binding, interoperable with service-auth.mjs."""
import base64
import hashlib
import json
import os
import re
import time
import uuid
import ssl
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import jwt
import redis.asyncio as redis

POLICY = json.loads((Path(__file__).parent / "service-permissions.json").read_text())


def verify_user_token(token, profile="access", credentials=None):
    from cryptography.hazmat.primitives import serialization
    credentials = credentials or config()
    header = jwt.get_unverified_header(token)
    if header.get("alg") != "EdDSA" or header.get("typ") != f"doccraft-{profile}+jwt":
        raise jwt.InvalidTokenError("Invalid token profile")
    public = credentials["user_jwt"]["public_keys"].get(header.get("kid"))
    if not public:
        raise jwt.InvalidTokenError("Unknown signing key")
    key = serialization.load_der_public_key(base64.b64decode(public))
    payload = jwt.decode(token, key, algorithms=["EdDSA"], issuer="doccraft-auth",
                         audience="doccraft-user" if profile == "access" else f"doccraft-{profile}",
                         options={"require": ["sub", "exp", "iat", "jti"]})
    if payload.get("type") != profile or not isinstance(payload["sub"], str) or not payload["sub"]:
        raise jwt.InvalidTokenError("Invalid identity")
    return payload


def config():
    text = os.getenv("SERVICE_AUTH_CONFIG_JSON")
    if not text and os.getenv("SERVICE_AUTH_CONFIG_FILE"):
        text = Path(os.environ["SERVICE_AUTH_CONFIG_FILE"]).read_text()
    if not text:
        raise ValueError("Service identity is not configured")
    result = json.loads(text)
    if result.get("version") != 1 or not isinstance(result.get("identity"), str):
        raise ValueError("Invalid service identity configuration")
    return result


def key_bytes(encoded):
    value = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    if len(value) < 32:
        raise ValueError("Service credential too short")
    return value


def permitted(receiver, caller, method, pathname):
    return any(method in rule["methods"] and caller in rule["callers"] and re.fullmatch(rule["path"], pathname)
               for rule in POLICY.get(receiver, []))


def service_token(receiver, method, url, body=b"", credentials=None):
    credentials = credentials or config()
    entry = credentials["send"][receiver]
    target = urlsplit(str(url))
    now = int(time.time())
    return jwt.encode({"iss": "doccraft-services", "aud": receiver, "sub": credentials["identity"],
                       "iat": now, "exp": now + 60, "jti": str(uuid.uuid4()), "method": method.upper(),
                       "target": target.path + ("?" + target.query if target.query else ""),
                       "body_sha256": hashlib.sha256(body).hexdigest()},
                      key_bytes(entry["secret"]), algorithm="HS256",
                      headers={"typ": "doccraft-service+jwt", "kid": entry["kid"]})


def sign_request(receiver, request):
    request.headers.pop("x-internal-secret", None)
    request.headers["X-DocCraft-Service-Token"] = service_token(receiver, request.method, request.url, request.content)


@lru_cache(maxsize=4)
def _trust_context(path, modified):
    import certifi
    return ssl.create_default_context(cafile=path or certifi.where())


def trust_context():
    path=os.getenv('SSL_CERT_FILE')
    return _trust_context(path,os.stat(path).st_mtime_ns if path else None)


def service_client(receiver, **kwargs):
    return httpx.Client(**{"verify":trust_context(),**kwargs, "event_hooks": {"request": [lambda request: sign_request(receiver, request)]}, "follow_redirects": False})


def service_request(receiver, method, url, **kwargs):
    timeout = kwargs.pop("timeout", 5)
    with service_client(receiver, timeout=timeout) as client:
        return client.request(method, url, **kwargs)


def async_service_client(receiver, **kwargs):
    async def sign(request):
        sign_request(receiver, request)
    return httpx.AsyncClient(**{"verify":trust_context(),**kwargs, "event_hooks": {"request": [sign]}, "follow_redirects": False})


async def claim_nonce(receiver, caller, kid, nonce, seconds, issued_at=None):
    # Per-request clients avoid event-loop-bound pools leaking between ASGI test loops.
    connection = redis.from_url(os.environ["REDIS_URL"], socket_connect_timeout=2, socket_timeout=2)
    try:
        script=(Path(__file__).parent/'service-nonce.lua').read_text()
        result=await connection.eval(script,1,f"service-auth:{receiver}:{caller}:{kid}:{nonce}",seconds,issued_at if issued_at is not None else -1)
        if result==-1:raise RuntimeError('Service credential predates replay-store recovery')
        return result==1
    finally:
        await connection.aclose()


async def authorize_service(receiver, request):
    from fastapi import HTTPException
    token = request.headers.get("x-doccraft-service-token", "")
    if not token or len(token) > 8192:
        raise HTTPException(status_code=401, detail="Service credential required")
    try:
        credentials = config()
        if credentials["identity"] != receiver:
            raise RuntimeError("Wrong receiving service configuration")
        hint = jwt.decode(token, options={"verify_signature": False})
        header = jwt.get_unverified_header(token)
        secret = credentials["receive"][hint["sub"]][header["kid"]]
        payload = jwt.decode(token, key_bytes(secret), algorithms=["HS256"], audience=receiver, issuer="doccraft-services",
                             leeway=3, options={"require": ["sub", "jti", "iat", "exp", "method", "target", "body_sha256"]})
        if header.get("typ") != "doccraft-service+jwt" or not re.fullmatch(r"[0-9a-f-]{36}", payload["jti"], re.I) or payload["exp"]-payload["iat"] > 65 or payload["iat"] > time.time()+3:
            raise ValueError("Invalid service credential")
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Service authentication unavailable") from error
    except (jwt.PyJWTError, ValueError, KeyError, TypeError) as error:
        raise HTTPException(status_code=401, detail="Invalid service credential") from error
    path = request.scope.get("raw_path", request.url.path.encode()).decode("ascii")
    if request.url.query:
        path += "?" + request.url.query
    body = await request.body()
    if payload["method"] != request.method or payload["target"] != path or payload["body_sha256"] != hashlib.sha256(body).hexdigest():
        raise HTTPException(status_code=401, detail="Service request binding failed")
    if not permitted(receiver, payload["sub"], request.method, request.url.path):
        raise HTTPException(status_code=403, detail="Service operation is not authorized")
    try:
        claimed = await claim_nonce(receiver, payload["sub"], header["kid"], payload["jti"], max(1, payload["exp"]-int(time.time())+4),payload["iat"])
    except Exception as error:
        raise HTTPException(status_code=503, detail="Service replay protection unavailable") from error
    if not claimed:
        raise HTTPException(status_code=409, detail="Service request replayed")
    return payload["sub"]

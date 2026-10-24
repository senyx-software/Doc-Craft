"""Purpose-separated encryption and operator-owned outbound inference boundaries."""
import base64
import hashlib
import ipaddress
import json
import os
import socket
from urllib.parse import urlsplit
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException


def fail(code, status=503):
    raise HTTPException(status, {'code': code, 'message': 'DocCraft AI is temporarily unavailable. Your saved document is preserved.'})


def keyring():
    try:
        from pathlib import Path
        source = os.environ.get('AI_CREDENTIAL_KEYRING_FILE')
        ring = json.loads(Path(source).read_text() if source else os.environ['AI_CREDENTIAL_KEYRING'])
        kid = ring['active_kid']
        keys = {name: base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)) for name, value in ring['keys'].items()}
        if not __import__('re').fullmatch(r'[a-zA-Z0-9_-]{1,40}', kid) or any(len(key) != 32 for key in keys.values()) or kid not in keys:
            raise ValueError()
        return kid, keys
    except Exception:
        raise HTTPException(503, 'Provider credential encryption is not configured') from None


def seal(secret, provider_id):
    kid, keys = keyring()
    nonce = os.urandom(12)
    encrypted = AESGCM(keys[kid]).encrypt(nonce, secret.encode(), ('doccraft-ai-provider:v1:' + provider_id).encode())
    encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip('=')
    return ':'.join(('ai', 'v1', kid, encode(nonce), encode(encrypted)))


def unseal(value, provider_id):
    try:
        _, keys = keyring()
        prefix, version, kid, nonce, encrypted = value.split(':')
        if (prefix, version) != ('ai', 'v1'):
            raise ValueError()
        decode = lambda value: base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
        return AESGCM(keys[kid]).decrypt(decode(nonce), decode(encrypted), ('doccraft-ai-provider:v1:' + provider_id).encode()).decode()
    except Exception:
        fail('PROVIDER_UNCONFIGURED')


def fingerprint(provider, model, generation):
    model_data = model.model_dump(exclude={'enabled', 'name'})
    # Optional adapter settings preserve pre-upgrade health fingerprints when
    # unset. Explicit changes still invalidate the connectivity check.
    for key in ('ollama_think', 'ollama_num_threads'):
        if model_data.get(key) is None:
            model_data.pop(key, None)
    data = {'provider': provider.model_dump(exclude={'enabled', 'name'}), 'model': model_data, 'credential_generation': generation}
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def endpoint_target(provider, resolve=True):
    """Pin validated DNS answers; HTTP transport must use the returned address."""
    try:
        url = urlsplit(provider.endpoint)
    except ValueError:
        raise HTTPException(422, 'Use a valid inference base URL') from None
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.query or url.fragment or '\\' in provider.endpoint:
        raise HTTPException(422, 'Use an inference base URL without credentials, query parameters or fragments')
    try:
        port = url.port or (443 if url.scheme == 'https' else 80)
    except ValueError:
        raise HTTPException(422, 'Invalid inference endpoint port') from None
    host = url.hostname.lower()
    if not __import__('re').fullmatch(r'/[a-zA-Z0-9_/-]*|', url.path) or '..' in url.path:
        raise HTTPException(422, 'Use a canonical inference base URL path')
    if provider.locality == 'local':
        allowed = os.getenv('AI_ALLOWED_LOCAL_ENDPOINTS', 'http://127.0.0.1:11434,http://localhost:11434').split(',')
        origins = {(u.scheme, u.hostname, u.port or (443 if u.scheme == 'https' else 80)) for u in map(urlsplit, allowed) if u.hostname}
        if (url.scheme, host, port) not in origins:
            raise HTTPException(422, 'Local endpoint is not in the operator egress allowlist')
    else:
        allowed = os.getenv('AI_ALLOWED_CLOUD_HOSTS', 'api.openai.com,api.groq.com,api.anthropic.com,router.huggingface.co,*.endpoints.huggingface.cloud').lower().split(',')
        if url.scheme != 'https' or port != 443 or not any(host == name.strip() or name.strip().startswith('*.') and host.endswith(name.strip()[1:]) for name in allowed):
            raise HTTPException(422, 'Cloud endpoint must use HTTPS and an operator-approved hostname')
    if not resolve:
        return url, port, None
    try:
        addresses = sorted({entry[4][0] for entry in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)})
        if not addresses:
            raise ValueError()
        for address in addresses:
            ip = ipaddress.ip_address(address)
            ip = ip.ipv4_mapped if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped else ip
            local = ip.is_loopback or any(ip in ipaddress.ip_network(net) for net in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7') if ip.version == ipaddress.ip_network(net).version)
            if provider.locality == 'cloud' and not ip.is_global or provider.locality == 'local' and not local:
                raise HTTPException(422, 'Inference endpoint resolved to a prohibited address')
        return url, port, addresses[0]
    except HTTPException:
        raise
    except Exception:
        fail('PROVIDER_UNAVAILABLE')

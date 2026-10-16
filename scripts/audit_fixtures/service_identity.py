"""Isolated test identities. Import only in tests; never contacts a provider."""
import base64
import json
import os
import time
import uuid
from cryptography.hazmat.primitives import serialization
from scripts.create_service_credentials import generate
from shared.service_auth import service_token

CONFIGS = generate()


def configure(identity):
    os.environ['SERVICE_AUTH_CONFIG_JSON'] = json.dumps(CONFIGS[identity])


def headers(caller, receiver, method, path, body=b''):
    return {'X-DocCraft-Service-Token': service_token(receiver, method, path, body, CONFIGS[caller])}


def access_token(subject='owner', profile='access'):
    import jwt
    key = serialization.load_der_private_key(base64.b64decode(CONFIGS['auth']['user_jwt']['private_key']), None)
    now = int(time.time())
    return jwt.encode({'sub':subject,'type':profile,'iss':'doccraft-auth', 'aud':'doccraft-user' if profile=='access' else 'doccraft-'+profile,'iat':now,'exp':now+60,'jti':str(uuid.uuid4())},key,algorithm='EdDSA',headers={'typ':f'doccraft-{profile}+jwt','kid':'v1'})

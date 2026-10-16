import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from shared.service_auth import config

def decode(value):return base64.urlsafe_b64decode(value+'='*(-len(value)%4))
def encode(value):return base64.urlsafe_b64encode(value).decode().rstrip('=')

def seal_secret(secret,account_id):
    if not secret:return secret
    settings=config();ring=settings['totp_encryption'];kid=ring['active_kid'];nonce=os.urandom(12)
    body=AESGCM(decode(ring['keys'][kid])).encrypt(nonce,secret.encode(),f"doccraft-totp:{settings['identity']}:{account_id}".encode())
    return ':'.join(('enc','v1',kid,encode(nonce),encode(body)))

def open_secret(value,account_id):
    if not value:return value
    settings=config();prefix,version,kid,nonce,body=value.split(':');ring=settings['totp_encryption']
    if (prefix,version)!=('enc','v1'):raise ValueError('TOTP secret requires encryption migration')
    return AESGCM(decode(ring['keys'][kid])).decrypt(decode(nonce),decode(body),f"doccraft-totp:{settings['identity']}:{account_id}".encode()).decode()

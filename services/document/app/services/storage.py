import os
import uuid
import hashlib
import hmac
import time
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load service-specific environment file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "document.env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage")

if bool(SUPABASE_URL) != bool(SUPABASE_SERVICE_ROLE_KEY):
    raise RuntimeError("Object storage requires both URL and service-role key")

use_supabase = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and "your-project" not in SUPABASE_URL)

supabase_client = None
if use_supabase:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        print("[storage] Initialized Supabase client successfully.")
    except Exception as e:
        raise RuntimeError("Configured object storage could not initialize") from e

if not use_supabase:
    os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)
    print(f"[storage] Using local disk storage at: {LOCAL_STORAGE_DIR}")


def storage_provider():
    from shared.service_auth import service_request
    response=service_request('admin-api','GET',os.getenv('ADMIN_API_SERVICE_URL','http://localhost:3018')+'/api/v1/internal/config/settings',timeout=5)
    response.raise_for_status();body=response.json();settings=body.get('data',body)
    provider=settings.get('document_storage_provider','supabase' if use_supabase else 'local')
    if provider not in ('local','supabase'):raise RuntimeError('Unsupported document storage provider')
    if provider=='supabase' and not supabase_client:raise RuntimeError('Selected Supabase storage is not configured')
    return provider


def storage_key(pdf_key):
    if pdf_key.startswith('sb:'):return 'supabase',pdf_key[3:]
    if pdf_key.startswith('local:'):return 'local',pdf_key[6:]
    # Existing keys retain their deployment's original storage assignment.
    legacy=os.getenv('LEGACY_STORAGE_PROVIDER','supabase' if use_supabase else 'local')
    if legacy not in ('local','supabase'):raise RuntimeError('Invalid legacy storage provider')
    return legacy,pdf_key


def upload_pdf(filename: str, pdf_data: bytes) -> str:
    """
    Uploads PDF binary data to storage.
    Returns the key/path to the file.
    """
    provider=storage_provider()
    if provider=='supabase':
        try:
            # Upload to 'documents' bucket
            bucket = supabase_client.storage.from_("documents")
            # Try to upload file (override if exists)
            bucket.upload(
                path=filename,
                file=pdf_data,
                file_options={"content-type": "application/pdf", "x-upsert": "true"}
            )
            return 'sb:'+filename
        except Exception as e:
            raise RuntimeError("Configured object storage upload failed") from e

    # Local fallback
    local_path = _local_path('local:'+filename)
    with open(local_path, "wb") as f:
        f.write(pdf_data)
    return 'local:'+filename


def get_signed_url(pdf_key: str, ttl_seconds: int = 300) -> str:
    """
    Generates an object capability with a maximum five-minute expiry.
    """
    provider,key=storage_key(pdf_key)
    if provider=='supabase':
        if not supabase_client:raise RuntimeError('Stored object provider is unavailable')
        try:
            res = supabase_client.storage.from_("documents").create_signed_url(key, max(1,min(300,ttl_seconds)))
            signed=res.get("signedURL") or res.get("signed_url")
            if not signed:raise RuntimeError("Missing signed object capability")
            return signed
        except Exception as e:
            raise RuntimeError("Configured object storage signing failed") from e

    # Local fallback URL - points to the download endpoint of our service
    # Gateway port is 3001, document service port is 3013
    gateway_url = os.getenv("GATEWAY_URL", "http://localhost:3001")
    expires = int(time.time()) + max(1,min(300,ttl_seconds))
    signature = _local_signature(pdf_key, expires)
    return f"{gateway_url}/v1/document/download-file/{pdf_key}?expires={expires}&signature={signature}"


def _local_path(pdf_key: str) -> Path:
    root = Path(LOCAL_STORAGE_DIR).resolve()
    provider,key=storage_key(pdf_key)
    if provider!='local':raise ValueError('Not a local storage key')
    target = (root / key).resolve()
    if target.parent != root or target.suffix.lower() != ".pdf":
        raise ValueError("Invalid PDF storage key")
    return target


def _local_signature(pdf_key: str, expires: int) -> str:
    _local_path(pdf_key)
    from shared.service_auth import config, key_bytes
    secret = key_bytes(config()["download_signing_key"])
    return hmac.new(secret, f"{pdf_key}:{expires}".encode(), hashlib.sha256).hexdigest()


def valid_local_download(pdf_key: str, expires: int, signature: str) -> bool:
    try:
        return expires > int(time.time()) and hmac.compare_digest(_local_signature(pdf_key, expires), signature)
    except (ValueError, TypeError):
        return False


def get_local_file_data(pdf_key: str) -> bytes:
    """
    Retrieves file binary data from local storage.
    """
    local_path = _local_path(pdf_key)
    if os.path.exists(local_path):
        with open(local_path, "rb") as f:
            return f.read()
    raise FileNotFoundError("Local file not found")


def delete_pdf(pdf_key: str):
    """
    Deletes the PDF from storage.
    """
    provider,key=storage_key(pdf_key)
    if provider=='supabase':
        if not supabase_client:raise RuntimeError('Stored object provider is unavailable')
        try:
            supabase_client.storage.from_("documents").remove([key])
            return
        except Exception as e:
            raise RuntimeError("Configured object storage deletion failed") from e

    # Local fallback
    local_path = _local_path(pdf_key)
    if os.path.exists(local_path):
        try:
            os.remove(local_path)
        except Exception as e:
            raise RuntimeError("Local object deletion failed") from e

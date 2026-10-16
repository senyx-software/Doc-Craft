import time
from urllib.parse import parse_qs, urlparse
import pytest
from app.services import storage

def test_local_urls_require_an_expiring_authentic_signature(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "audit-local-storage-signing-secret-32-chars")
    monkeypatch.setattr(storage, "use_supabase", False)
    query = parse_qs(urlparse(storage.get_signed_url("fixture.pdf")).query)
    expiry, signature = int(query["expires"][0]), query["signature"][0]
    assert storage.valid_local_download("fixture.pdf", expiry, signature)
    assert not storage.valid_local_download("other.pdf", expiry, signature)
    assert not storage.valid_local_download("fixture.pdf", expiry + 60, signature)
    assert not storage.valid_local_download("fixture.pdf", int(time.time()) - 1, signature)
    assert not storage.valid_local_download("fixture.pdf", expiry, "forged")

def test_storage_keys_cannot_escape_the_document_directory():
    with pytest.raises(ValueError):
        storage.get_local_file_data("../private.pdf")

def test_explicit_storage_keys_preserve_provider_identity_when_admin_switches(monkeypatch,tmp_path):
    from unittest.mock import Mock
    monkeypatch.setattr(storage,'LOCAL_STORAGE_DIR',str(tmp_path))
    remote=Mock();remote.storage.from_.return_value.create_signed_url.return_value={'signedURL':'https://staging.invalid/signed'}
    monkeypatch.setattr(storage,'supabase_client',remote)
    monkeypatch.setattr(storage,'storage_provider',lambda:'local')
    local_key=storage.upload_pdf('one.pdf',b'%PDF-local')
    assert local_key=='local:one.pdf'
    assert storage.get_local_file_data(local_key)==b'%PDF-local'
    monkeypatch.setattr(storage,'storage_provider',lambda:'supabase')
    remote_key=storage.upload_pdf('two.pdf',b'%PDF-remote')
    assert remote_key=='sb:two.pdf'
    assert storage.get_signed_url(remote_key)=='https://staging.invalid/signed'
    assert storage.get_local_file_data(local_key)==b'%PDF-local'
    storage.delete_pdf(remote_key);remote.storage.from_.return_value.remove.assert_called_once_with(['two.pdf'])
    with pytest.raises(ValueError):storage.get_local_file_data(remote_key)


def test_signed_capability_cannot_outlive_retention(monkeypatch):
    from datetime import datetime,timedelta,timezone
    from types import SimpleNamespace
    from unittest.mock import Mock
    from app.services.recovery import signed_document_url
    signed=Mock(return_value='signed');monkeypatch.setattr(storage,'get_signed_url',signed)
    doc=SimpleNamespace(pdfKey='local:one.pdf',slots={'_source':{'retainedUntil':(datetime.now(timezone.utc)+timedelta(seconds=90)).isoformat()}})
    assert signed_document_url(doc)=='signed'
    assert 1<=signed.call_args[0][1]<=90
    doc.slots['_source']['retainedUntil']=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
    with pytest.raises(ValueError):signed_document_url(doc)

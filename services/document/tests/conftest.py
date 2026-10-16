import sys
from pathlib import Path
import os
import tempfile

# Fixtures must never inherit the developer's remote database/bucket/providers.
os.environ["DATABASE_URL"] = "sqlite:///" + str(Path(tempfile.mkdtemp(prefix="doccraft-document-tests-")) / "documents.sqlite")
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["REDIS_URL"] = "redis://127.0.0.1:0"
for _service in ("AUTH", "AI", "QUOTA", "ANALYTICS"):
    os.environ[f"{_service}_SERVICE_URL"] = "http://127.0.0.1:9"
os.environ["JWT_SECRET"] = "isolated-document-tests-secret-at-least-32-characters"
os.environ["INTERNAL_SERVICE_SECRET"] = "isolated-document-tests-internal-secret"

# Make service imports independent of pytest's working directory/order.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Test-only cryptographic identities; production authorization remains unchanged.
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from scripts.audit_fixtures.service_identity import configure, headers as service_headers
configure('document')
import pytest
@pytest.fixture(autouse=True)
def isolated_service_nonces(monkeypatch):
    from shared import service_auth
    seen = set()
    async def claim(*args):
        nonce = args[:4]
        if nonce in seen: return False
        seen.add(nonce)
        return True
    monkeypatch.setattr(service_auth, 'claim_nonce', claim)

@pytest.fixture(autouse=True)
def isolated_template_publication(monkeypatch):
    from app.routers import document
    monkeypatch.setattr(document, 'publication_policy', lambda: {})

@pytest.fixture(autouse=True)
def isolated_entitlements(monkeypatch):
    from app.routers import document
    from app.workers import pdf_worker
    from app.services import template_policy
    def policy(user_id):
        return {'version':1,'user_id':user_id,'plan':'free','account_enabled':True,'daily_quota':3,
            'custom_logo':True,'custom_branding':True,'premium_templates':False,'pdf_watermark':True,'priority_processing':False,'retention_days':None,'ai_enabled':True}
    monkeypatch.setattr(document,'get_entitlements',policy)
    monkeypatch.setattr(pdf_worker,'get_entitlements',policy)
    monkeypatch.setattr(template_policy,'publication_policy',lambda:{})
    monkeypatch.setattr(document,'fetch_uploaded',lambda *args:{'templates':[]})

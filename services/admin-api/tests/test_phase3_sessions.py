from scripts.audit_fixtures.service_identity import headers as service_headers
from tests.conftest import create_test_admin_access_token
from app.main import app
from app.security.authentication import decode_admin_access_token
from app.repositories.security_repository import security_repository
from fastapi.testclient import TestClient

client=TestClient(app)


def test_actual_admin_sessions_can_be_terminated_without_fake_fallback():
    token=create_test_admin_access_token('unused','phase3-sessions@example.com','Super Admin',['*'],is_super_admin=True)
    identity=decode_admin_access_token(token)
    assert client.get('/api/v1/admin/auth/me',headers={'Authorization':'Bearer '+token}).status_code==200
    assert any(row['id']==identity.session_id for row in security_repository.get_sessions())
    assert security_repository.terminate_session(identity.session_id)
    assert client.get('/api/v1/admin/auth/me',headers={'Authorization':'Bearer '+token}).status_code==401
    assert not any(row['id']==identity.session_id for row in security_repository.get_sessions())


def test_admin_logout_invalidates_only_its_own_persisted_session():
    first=create_test_admin_access_token('unused','phase3-logout@example.com','Super Admin',['*'],is_super_admin=True)
    second=create_test_admin_access_token('unused','phase3-logout@example.com','Super Admin',['*'],is_super_admin=True)
    assert client.post('/api/v1/admin/auth/logout',headers={'Authorization':'Bearer '+first}).status_code==200
    assert client.get('/api/v1/admin/auth/me',headers={'Authorization':'Bearer '+first}).status_code==401
    assert client.get('/api/v1/admin/auth/me',headers={'Authorization':'Bearer '+second}).status_code==200

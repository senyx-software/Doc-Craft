from fastapi.testclient import TestClient
import pyotp

from app.main import app
from app.db.admin_db import admin_db
from app.repositories.admin_user_repository import admin_user_repository
from app.security.authentication import hash_password
from shared.sealed_secret import seal_secret


def test_legacy_authenticator_requires_migration_with_a_readable_browser_error():
    account=admin_user_repository.create('legacy-authenticator@example.com',hash_password('FixturePassword123!'),'role_super_admin')
    secret=pyotp.random_base32()
    admin_db.execute('UPDATE admin_users SET totp_secret=?,totp_enabled=1 WHERE id=?',(secret,account.id))
    try:
        response=TestClient(app).post('/api/v1/admin/auth/login',json={'email':account.email,'password':'FixturePassword123!'},headers={'Origin':'http://localhost:5174'})
        assert response.status_code==503
        assert response.json()['code']=='AUTH_CONFIGURATION_UNAVAILABLE'
        assert 'requires repair' in response.json()['message']
        assert response.headers['access-control-allow-origin'] in ('*','http://localhost:5174')
        assert secret not in response.text
    finally:
        admin_db.execute('UPDATE admin_users SET totp_secret=? WHERE id=?',(seal_secret(secret,account.id),account.id))
    assert admin_user_repository.get_by_id(account.id).totp_secret==secret

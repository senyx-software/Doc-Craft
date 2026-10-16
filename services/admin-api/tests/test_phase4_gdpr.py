from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app.api.v1 import gdpr
from tests.conftest import seed_admin_with_totp,action_code


def test_soft_purge_resumes_by_durable_identity_without_cross_service_database_writes(monkeypatch):
    client=TestClient(app);token,secret=seed_admin_with_totp('phase4-purge-admin@example.com','Super Admin',['*'],True)
    email='phase4-purge-'+uuid4().hex+'@example.com';calls=[];state={'fail':True}
    monkeypatch.setattr(gdpr,'_get_user_by_email',lambda address:{'id':'phase4-target','email':address,'status':'active'})
    class Service:
        def __init__(self,identity):self.identity=identity
        async def post(self,url):
            calls.append((self.identity,url))
            if self.identity=='document' and state['fail']:raise httpx.ConnectError('Isolated storage metadata outage')
            return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{'anonymized_email':'deleted-fixture@purged.doccraft.local'})
    @asynccontextmanager
    async def service(identity,**kwargs):yield Service(identity)
    monkeypatch.setattr(gdpr,'async_service_client',service)
    sql=[];execute=gdpr.admin_db.execute
    def observed(query,params=()):sql.append(query);return execute(query,params)
    monkeypatch.setattr(gdpr.admin_db,'execute',observed)
    def purge():return client.post('/api/v1/admin/gdpr/purge',headers={'Authorization':'Bearer '+token,'X-Admin-2FA':action_code(secret)},json={'email':email})
    assert purge().status_code==503
    state['fail']=False
    monkeypatch.setattr(gdpr,'_get_user_by_email',lambda _: (_ for _ in ()).throw(AssertionError('Must resume the saved identity after Auth anonymization')))
    assert purge().status_code==200
    assert purge().status_code==200
    assert [entry[0] for entry in calls]==['auth','document','auth','document']
    assert not any(query.lower().startswith(('update users','delete from sessions','delete from password_resets','update documents')) for query in sql)

import asyncio
from datetime import datetime, timedelta, timezone
from threading import Event
from uuid import uuid4

import httpx
import pytest

from app.main import app
from app.api.v1 import notifications, config
from app.security.dependencies import require_internal_secret
from app.services.entitlements import evaluate, read_policy_snapshot, save_override
from app.db.admin_db import admin_db


def test_admin_session_checks_do_not_block_workspace_requests(monkeypatch):
    from types import SimpleNamespace
    from app.security import dependencies
    started,release=Event(),Event()
    original=admin_db.fetch_one
    def slow_session(query,*args,**kwargs):
        if 'FROM admin_login_sessions' in query:
            started.set();release.wait(timeout=2);return None
        return original(query,*args,**kwargs)
    monkeypatch.setattr(dependencies,'decode_admin_access_token',lambda token:SimpleNamespace(session_id='test',admin_id='test'))
    monkeypatch.setattr(admin_db,'fetch_one',slow_session)
    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://testserver') as client:
            pending=asyncio.create_task(client.get('/api/v1/admin/auth/me',headers={'Authorization':'Bearer fixture'}))
            try:
                assert await asyncio.to_thread(started.wait,1)
                assert not pending.done()
                assert (await asyncio.wait_for(client.get('/health'),.5)).status_code==200
            finally:
                release.set();response=await pending
            assert response.status_code==401
    asyncio.run(exercise())


@pytest.mark.parametrize('source', ['announcements', 'template_catalog'])
def test_slow_configuration_reads_do_not_block_other_requests(monkeypatch, source):
    started, release = Event(), Event()

    def slow_read(*args, **kwargs):
        started.set()
        release.wait(timeout=2)
        if source == 'announcements':
            return {}
        return {
            'domain': 'template_catalog', 'data': {}, 'version': 1,
            'updated_at': '2026-10-20T00:00:00Z',
        }

    monkeypatch.setitem(app.dependency_overrides, require_internal_secret, lambda: 'document')
    if source == 'announcements':
        monkeypatch.setattr(notifications.notification_repository, 'get_settings', slow_read)
        monkeypatch.setattr(notifications.notification_repository, 'list_templates', lambda: [])
        monkeypatch.setattr(notifications.notification_repository, 'list_announcements', lambda **kwargs: [])
        path = '/api/v1/admin/notifications/config/public'
    else:
        monkeypatch.setattr(config.config_engine, 'get_domain_config', slow_read)
        path = '/api/v1/internal/config/template_catalog'

    async def exercise():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://testserver') as client:
            pending = asyncio.create_task(client.get(path))
            try:
                assert await asyncio.to_thread(started.wait, 1)
                assert not pending.done(), 'The database read blocked the event loop until completion'
                health = await asyncio.wait_for(client.get('/health'), timeout=0.5)
                assert health.status_code == 200
                assert not pending.done()
            finally:
                release.set()
                response = await pending
            assert response.status_code == 200

    asyncio.run(exercise())


def test_policy_snapshot_keeps_current_overrides_scoped_to_the_account():
    owner='snapshot_'+uuid4().hex
    expires=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()
    save_override(owner,{'plan':'pro','features':{'customLogo':True},'expires_at':expires,'reason':'Test workspace policy'},'fixture')
    admin_db.execute('''INSERT INTO user_quota_overrides
        (id,user_id,custom_quota,granted_by_admin_id,expires_at,created_at)
        VALUES(?,?,?,?,?,?)''',('quota_'+uuid4().hex,owner,17,'fixture',expires,datetime.now(timezone.utc).isoformat()))

    plans,flags,routing,override,quota=read_policy_snapshot(owner)
    policy=evaluate({'id':owner,'status':'active'},None,plans,flags,routing,override,quota)
    assert policy['plan']=='pro'
    assert policy['daily_quota']==17
    assert policy['custom_logo'] is True

    plans,flags,routing,override,quota=read_policy_snapshot('another-account')
    assert override is None and quota is None
    policy=evaluate({'id':'another-account','status':'active'},None,plans,flags,routing,override,quota)
    assert policy['plan']=='free'

    admin_db.execute('UPDATE entitlement_overrides SET expires_at=? WHERE user_id=?',('2000-01-01T00:00:00Z',owner))
    admin_db.execute('UPDATE user_quota_overrides SET expires_at=? WHERE user_id=?',('2000-01-01T00:00:00Z',owner))
    plans,flags,routing,override,quota=read_policy_snapshot(owner)
    policy=evaluate({'id':owner,'status':'active'},None,plans,flags,routing,override,quota)
    assert policy['plan']=='free'
    assert policy['daily_quota']==plans['free']['monthly_quota']

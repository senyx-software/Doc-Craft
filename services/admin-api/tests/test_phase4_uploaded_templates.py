import json
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app.services import uploaded_templates as store
from shared.safe_template import validate_template,render_uploaded_template
from tests.conftest import seed_admin_with_totp,action_code

@pytest.mark.parametrize('html',[
 '<script>fetch("http://redis:6379")</script>','<iframe src="file:///etc/passwd"></iframe>',
 '<img src="http://169.254.169.254/">','<img src="file:///etc/passwd">',
 '<svg><image href="https://example.com"></image></svg>', '<div style="background:url(http://auth:3011)">x</div>',
 '<div style="color:r\\65 d">x</div>','<style>@import "http://admin-api";</style>',
 '<div onclick="alert(1)">x</div>','<div>{{ self.__init__.__globals__ }}</div>',
 '<div>{% include "/etc/passwd" %}</div>','<div style="font-family:{{businessName}}">x</div>',
 '<!ENTITY x SYSTEM "file:///etc/passwd">', '<div><span></div>',
])
def test_uploaded_content_cannot_execute_or_reference_network_files_or_templates(html):
    with pytest.raises(Exception):validate_template(html)

def test_rendering_substitutes_only_escaped_values():
    html='<div style="color:#123456"><h1>{{businessName}}</h1>{{lineItems}}</div>'
    result=render_uploaded_template(html,{}, {'businessName':'<script>bad()</script>','lineItems':[{'description':'<img src=x>','quantity':1,'unitPrice':3}]})
    assert '&lt;script&gt;' in result and '&lt;img' in result and '<script>' not in result

def test_upload_review_publish_owner_scope_new_version_rollback_and_withdraw():
    from app.api.v1.uploaded_templates import Upload
    client=TestClient(app);token,secret=seed_admin_with_totp('phase4-template-review@example.com','Super Admin',['*'],True)
    def headers():return {'Authorization':'Bearer '+token,'X-Admin-2FA':action_code(secret)}
    data={'name':'Private company layout','owner_id':'company-owner','document_type':'invoice','visibility':'private','html':'<div>{{businessName}}</div>','assets':{}}
    first=client.post('/api/v1/admin/templates/uploads',headers=headers(),json=data)
    assert first.status_code==201,first.text
    item=first.json();identity=item['id']
    assert client.post('/api/v1/admin/templates/'+identity+'/publish',headers=headers()).status_code==409
    assert client.post('/api/v1/admin/templates/uploads/'+identity+'/approve',headers=headers()).status_code==200
    assert client.post('/api/v1/admin/templates/'+identity+'/publish',headers=headers()).status_code==200
    assert identity in [row['id'] for row in store.available('company-owner')]
    assert identity not in [row['id'] for row in store.available('another-account')]
    with pytest.raises(HTTPException):store.content(identity,'another-account')
    second=client.post('/api/v1/admin/templates/uploads',headers=headers(),json={**data,'family_id':item['family_id'],'visibility':'public','html':'<h1>{{businessName}}</h1>'}).json()
    assert second['version']==2
    assert client.post('/api/v1/admin/templates/uploads/'+second['id']+'/approve',headers=headers()).status_code==200
    assert client.post('/api/v1/admin/templates/'+second['id']+'/publish',headers=headers()).status_code==200
    assert second['id'] in [row['id'] for row in store.available('another-account')]
    assert client.post('/api/v1/admin/templates/'+identity+'/publish',headers=headers()).status_code==200
    assert second['id'] not in [row['id'] for row in store.available('another-account')]
    assert client.post('/api/v1/admin/templates/'+identity+'/withdraw',headers=headers()).status_code==200
    assert identity not in [row['id'] for row in store.available('company-owner')]

def test_user_upload_cannot_assign_public_scope_or_another_owners_version_family():
    from app.api.v1.uploaded_templates import user_upload,Upload
    original=store.create(Upload(name='Owned',owner_id='a',document_type='invoice',html='<p>Owned</p>'),'user:a')
    with pytest.raises(HTTPException):user_upload(Upload(name='Stolen',owner_id='b',document_type='invoice',family_id=original['family_id'],html='<p>Changed</p>'))
    with pytest.raises(HTTPException):user_upload(Upload(name='Public',owner_id='a',document_type='invoice',visibility='public',html='<p>Public</p>'))

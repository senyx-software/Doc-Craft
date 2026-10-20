import base64
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
import pytest
from fastapi import HTTPException

from app.main import app
from app.services import uploaded_templates as store
from app.api.v1.uploaded_templates import Upload
from tests.conftest import seed_admin_with_totp,action_code,service_headers
import json


def reviewer(email):
    token,secret=seed_admin_with_totp(email,'Super Admin',['*'],True)
    return lambda:{'Authorization':'Bearer '+token,'X-Admin-2FA':action_code(secret)}


def upload(name='Company layout'):
    return store.create(Upload(name=name,owner_id='company-owner',document_type='invoice',html='<div><h1>Company layout</h1><p>{{clientName}}</p></div>'),'user:company-owner')


def test_uploaded_preview_includes_the_real_embedded_artwork_before_approval():
    raster=BytesIO();Image.new('RGB',(30,20),'red').save(raster,format='PNG')
    source={'html':'<img src="asset:page"><p>{{businessName}}</p>','assets':{'page':'data:image/png;base64,'+base64.b64encode(raster.getvalue()).decode()}}
    item=store.create(Upload(name='PDF page image',owner_id='company-owner',document_type='invoice',**source),'user:company-owner')
    headers=reviewer('preview-review@example.com')
    response=TestClient(app).get('/api/v1/admin/templates/uploads/'+item['id'],headers=headers())
    assert response.status_code==200,response.text
    assert 'data:image/png;base64,' in response.json()['preview_html']
    assert "default-src 'none'" in response.json()['preview_html']
    assert '{{businessName}}' in response.json()['preview_html']
    assert response.json()['owner_id']=='company-owner'
    assert item['id'] not in [row['id'] for row in store.available('company-owner')]


def test_review_owner_public_rejection_and_withdrawal_apply_to_the_actual_catalog():
    client=TestClient(app);headers=reviewer('audience-review@example.com');item=upload();identity=item['id']
    endpoint='/api/v1/admin/templates/uploads/'+identity+'/review'
    def review(decision,visibility='private'):
        response=client.post(endpoint,headers=headers(),json={'decision':decision,'visibility':visibility,'digest':item['digest'],'notes':'Reviewed the uploaded preview'})
        assert response.status_code==200,response.text
        return response.json()
    assert review('approve')['visibility']=='private'
    assert identity in [row['id'] for row in store.available('company-owner')]
    assert identity not in [row['id'] for row in store.available('another-owner')]
    assert review('approve','public')['visibility']=='public'
    assert identity in [row['id'] for row in store.available('another-owner')]
    assert store.content(identity,'another-owner')['owner_id']=='company-owner'
    assert client.post('/api/v1/admin/templates/'+identity+'/withdraw',headers=headers()).status_code==200
    assert identity not in [row['id'] for row in store.available('company-owner')]
    listed=client.get('/api/v1/admin/templates',headers=headers()).json()
    assert next(row for row in listed if row['id']==identity)['status']=='Withdrawn'
    assert client.post('/api/v1/admin/templates/'+identity+'/publish',headers=headers()).status_code==200
    rejected=review('reject')
    assert rejected['review_status']=='rejected' and not rejected['published']
    assert identity not in [row['id'] for row in store.available('another-owner')]
    with pytest.raises(HTTPException):store.content(identity,'company-owner')
    assert client.post('/api/v1/admin/templates/'+identity+'/publish',headers=headers()).status_code==409
    listed=client.get('/api/v1/admin/templates',headers=headers()).json()
    assert next(row for row in listed if row['id']==identity)['status']=='Rejected'
    assert review('approve','private')['owner_id']=='company-owner'
    assert identity not in [row['id'] for row in store.available('another-owner')]
    assert store.version(identity)['digest']==item['digest']


def test_review_rejects_a_stale_preview_digest_without_publishing():
    client=TestClient(app);headers=reviewer('stale-review@example.com');item=upload('Unreviewed')
    response=client.post('/api/v1/admin/templates/uploads/'+item['id']+'/review',headers=headers(),json={'decision':'approve','visibility':'public','digest':'0'*64})
    assert response.status_code==409
    assert store.version(item['id'])['approved_at'] is None
    assert item['id'] not in [row['id'] for row in store.available('company-owner')]


def test_review_requires_admin_approval_permission_and_second_factor():
    client=TestClient(app);headers=reviewer('permission-review@example.com');item=upload('Permission checks')
    endpoint='/api/v1/admin/templates/uploads/'+item['id']+'/review'
    payload={'decision':'approve','visibility':'public','digest':item['digest']}
    assert client.post(endpoint,json=payload).status_code==401
    token=headers()['Authorization']
    assert client.post(endpoint,headers={'Authorization':token},json=payload).status_code==403
    staff,secret=seed_admin_with_totp('viewer-review@example.com','Viewer',['templates:view'])
    assert client.post(endpoint,headers={'Authorization':'Bearer '+staff,'X-Admin-2FA':action_code(secret)},json=payload).status_code==403
    assert store.version(item['id'])['approved_at'] is None


def test_owner_and_admin_can_rename_without_changing_approval_upload_time_or_public_access():
    client=TestClient(app);headers=reviewer('rename-review@example.com');item=upload('Original title')
    store.review(item['id'],'reviewer','approve','public',item['digest'])
    original=store.version(item['id'])
    path='/api/v1/internal/uploaded-templates/'+item['id']
    def owner_rename(owner,name):
        body=json.dumps({'owner_id':owner,'name':name},separators=(',',':')).encode()
        return client.patch(path,content=body,headers={'Content-Type':'application/json',**service_headers('document','admin-api','PATCH',path,body)})
    assert owner_rename('another-owner','Stolen title').status_code==404
    renamed=owner_rename('company-owner','  Owner title  ')
    assert renamed.status_code==200,renamed.text
    assert renamed.json()['name']=='Owner title'
    assert renamed.json()['created_at']==item['created_at']
    endpoint='/api/v1/admin/templates/uploads/'+item['id']
    response=client.patch(endpoint,headers=headers(),json={'name':'Admin title'})
    assert response.status_code==200,response.text
    assert store.content(item['id'],'another-owner')['name']=='Admin title'
    for field in ('source_json','digest','created_at','approved_at','visibility','owner_id'):
        assert store.version(item['id'])[field]==original[field]
    assert client.patch(endpoint,headers=headers(),json={'name':'   '}).status_code==422
    assert client.patch(endpoint,headers=headers(),json={'name':'x'*101}).status_code==422
    viewer,_=seed_admin_with_totp('rename-viewer@example.com','Viewer',['templates:view'])
    assert client.patch(endpoint,headers={'Authorization':'Bearer '+viewer},json={'name':'Forbidden'}).status_code==403

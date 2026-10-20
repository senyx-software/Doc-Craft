import base64
from io import BytesIO

from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from PIL import Image
import pytest

from app.routers import document
from app.services.sidecar import render_template_to_html


def fixture_template():
    image=BytesIO();Image.new('RGB',(30,20),'blue').save(image,format='PNG')
    return {'id':'upl_fixture_v1','type':'invoice','premium':False,'source':{'html':'<h1>{{businessName}}</h1><img src="asset:page">','assets':{'page':'data:image/png;base64,'+base64.b64encode(image.getvalue()).decode()}}}


def test_approved_embedded_pdf_artwork_previews_without_buying_a_new_logo(monkeypatch):
    item=fixture_template();calls=[]
    monkeypatch.setattr(document,'fetch_uploaded',lambda owner,identity:(calls.append((owner,identity)) or item))
    monkeypatch.setattr(document,'get_entitlements',lambda owner:{'account_enabled':True,'premium_templates':False,'custom_branding':False,'custom_logo':False})
    app=FastAPI();app.include_router(document.router)
    response=TestClient(app).post('/template-preview',headers={'x-user-id':'owner'},json={'templateId':item['id'],'slots':{'businessName':'Actual company'}})
    assert response.status_code==200,response.text
    assert 'Actual company' in response.json()['html']
    assert 'data:image/png;base64,' in response.json()['html']
    assert "default-src 'none'" in response.json()['html']
    assert calls==[('owner',item['id'])]


@pytest.mark.parametrize('enabled,premium',[(False,False),(True,True)])
def test_preview_still_enforces_account_and_template_premium_permissions(monkeypatch,enabled,premium):
    item=fixture_template();item['premium']=premium
    monkeypatch.setattr(document,'fetch_uploaded',lambda *args:item)
    monkeypatch.setattr(document,'get_entitlements',lambda owner:{'account_enabled':enabled,'premium_templates':False})
    app=FastAPI();app.include_router(document.router)
    response=TestClient(app).post('/template-preview',headers={'x-user-id':'owner'},json={'templateId':item['id']})
    assert response.status_code==403


def test_preview_cannot_read_an_unpublished_rejected_or_other_owners_private_template(monkeypatch):
    def unavailable(*args):raise HTTPException(404,'Template unavailable')
    monkeypatch.setattr(document,'fetch_uploaded',unavailable)
    app=FastAPI();app.include_router(document.router)
    assert TestClient(app).post('/template-preview',headers={'x-user-id':'another-owner'},json={'templateId':'upl_fixture_v1'}).status_code==404


def test_server_rendering_uses_the_same_reviewed_artwork_permissions(monkeypatch):
    from app.services import uploaded_templates
    from shared import entitlements
    item=fixture_template()
    monkeypatch.setattr(uploaded_templates,'fetch_uploaded',lambda *args:item)
    monkeypatch.setattr(entitlements,'get_entitlements',lambda owner:{'account_enabled':True,'premium_templates':False,'custom_branding':False})
    html=render_template_to_html('invoice',item['id'],{'businessName':'Actual company'},'owner')
    assert 'Actual company' in html and 'data:image/png;base64,' in html

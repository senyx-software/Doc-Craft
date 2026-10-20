from types import SimpleNamespace
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routers import document


def test_uploaded_rename_uses_verified_owner_and_rejects_injected_metadata(monkeypatch):
    requests=[]
    def send(receiver,method,url,**kwargs):
        requests.append((receiver,method,kwargs['json']))
        return SimpleNamespace(status_code=200,raise_for_status=lambda:None,json=lambda:{'id':'upl_owned_v1','name':'New name'})
    monkeypatch.setattr(document,'service_request',send)
    app=FastAPI();app.include_router(document.router);client=TestClient(app)
    response=client.patch('/templates/uploads/upl_owned_v1',headers={'x-user-id':'owner'},json={'name':' New name '})
    assert response.status_code==200
    assert requests==[('admin-api','PATCH',{'name':'New name','owner_id':'owner'})]
    for payload in ({'name':'Stolen','owner_id':'victim'},{'name':'  '},{'name':'x'*101}):
        assert client.patch('/templates/uploads/upl_owned_v1',headers={'x-user-id':'owner'},json=payload).status_code==422
    assert len(requests)==1


def test_public_catalog_exposes_upload_time_and_allows_only_owner_renaming(monkeypatch):
    template={'id':'upl_owned_v1','name':'Public layout','owner_id':'owner','visibility':'public','premium':False,'type':'invoice','created_at':'2026-10-20T09:52:59+00:00'}
    monkeypatch.setattr(document,'fetch_uploaded',lambda user:{'templates':[template]})
    for owner,can_rename in [('owner',True),('another-user',False)]:
        catalog=document.get_templates(type='invoice',x_user_id=owner)['templates']
        uploaded=next(row for row in catalog if row['id']==template['id'])
        assert uploaded['created_at']==template['created_at']
        assert uploaded['can_rename'] is can_rename

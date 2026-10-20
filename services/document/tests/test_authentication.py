from scripts.audit_fixtures.service_identity import access_token
import time
import jwt
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from app.services.authentication import authenticate_document_request
from app.services import authentication
from types import SimpleNamespace
import pytest

app = FastAPI()
app.middleware("http")(authenticate_document_request)

@app.get("/v1/document/history")
def identity(request: Request):
    return {"id": request.headers.get("x-user-id"), "plan": request.headers.get("x-user-plan")}

client = TestClient(app)

def test_identity_headers_alone_never_authorize_documents():
    assert client.get("/v1/document/history", headers={"x-user-id": "victim"}).status_code == 401

def test_document_identity_comes_from_verified_access_claims(monkeypatch):
    secret = "document-audit-test-secret-at-least-32-chars"
    monkeypatch.setenv("JWT_SECRET", secret)
    class ProfileClient:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            assert url.endswith('/internal/verify-token')
            assert kwargs['json']['userId']=='owner'
            return SimpleNamespace(status_code=200, json=lambda: {"valid":True,"user":{"id":"owner", "plan":"max"}})
    monkeypatch.setattr(authentication, "async_service_client", lambda *args,**kwargs:ProfileClient())
    token = access_token()
    response = client.get("/v1/document/history", headers={"Authorization": f"Bearer {token}", "x-user-id": "victim", "x-user-plan": "pro"})
    assert response.json() == {"id": "owner", "plan": "max"}

def test_document_api_rejects_mfa_tokens(monkeypatch):
    secret = "document-audit-test-secret-at-least-32-chars"
    monkeypatch.setenv("JWT_SECRET", secret)
    token = access_token(profile='mfa')
    assert client.get("/v1/document/history", headers={"Authorization": f"Bearer {token}"}).status_code == 401

@pytest.mark.parametrize('status,result,expected',[
    (200,{'valid':False,'user':{'id':'owner'}},403),
    (200,{'valid':True,'user':{'id':'another-owner'}},403),
    (401,{},403),(403,{},403),(503,{},503),
])
def test_document_account_verification_remains_fail_closed(monkeypatch,status,result,expected):
    class Client:
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,*args,**kwargs):return SimpleNamespace(status_code=status,json=lambda:result)
    monkeypatch.setattr(authentication,'async_service_client',lambda *args,**kwargs:Client())
    response=client.get('/v1/document/history',headers={'Authorization':'Bearer '+access_token()})
    assert response.status_code==expected

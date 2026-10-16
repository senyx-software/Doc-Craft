import os
import sys
import json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[3]))
from scripts.audit_fixtures.service_identity import configure, headers as service_headers
configure("analytics")
from unittest.mock import AsyncMock

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["REDIS_URL"] = "redis://127.0.0.1:0"
os.environ["POSTHOG_HOST"] = "http://127.0.0.1:9"
os.environ["POSTHOG_API_KEY"] = "test-project"
os.environ["INTERNAL_SERVICE_SECRET"] = "isolated-analytics-secret"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routers.analytics import router, analytics_queue
from app.security import current_user

app = FastAPI()
app.include_router(router, prefix="/v1/analytics")
client = TestClient(app)


def test_reports_require_internal_auth_even_with_spoofed_identity():
    for path in ("overview", "revenue", "generations", "users", "traffic", "journey"):
        for headers in ({}, {"x-user-id": "admin", "x-user-plan": "max"}, {"X-Internal-Secret": "wrong"}):
            assert client.get(f"/v1/analytics/{path}", headers=headers).status_code == 401


def test_event_ingress_rejects_missing_or_bad_secret():
    payload = {"userId": "fixture", "eventName": "test", "properties": {}}
    for headers in ({}, {"X-Internal-Secret": "wrong"}):
        assert client.post("/v1/analytics/event", json=payload, headers=headers).status_code == 401


def test_internal_event_and_authenticated_client_event(monkeypatch):
    enqueue = AsyncMock()
    monkeypatch.setattr(analytics_queue, "add", enqueue)
    from shared import service_auth
    monkeypatch.setattr(service_auth, "claim_nonce", AsyncMock(return_value=True))
    body=json.dumps({"userId":"fixture","eventName":"test","properties":{}},separators=(",",":")).encode()
    assert client.post("/v1/analytics/event", content=body,headers={"Content-Type":"application/json",**service_headers("chat","analytics","POST","/v1/analytics/event",body)}).status_code == 202
    assert client.post("/v1/analytics/client-event", json={"eventName": "btn_test"}, headers={"x-user-id": "spoof"}).status_code == 401
    app.dependency_overrides[current_user] = lambda: "verified-user"
    try:
        assert client.post("/v1/analytics/client-event", json={"eventName": "btn_test"}, headers={"x-user-id": "spoof"}).status_code == 202
        from shared.queue_auth import verified_job
        from types import SimpleNamespace
        assert verified_job("analytics",SimpleNamespace(name=enqueue.call_args.kwargs["name"],data=enqueue.call_args.kwargs["data"],id=enqueue.call_args.kwargs["opts"]["jobId"]))["userId"] == "verified-user"
        assert client.post("/v1/analytics/client-event", json={"eventName": "payment_success"}).status_code == 400
    finally:
        app.dependency_overrides.clear()

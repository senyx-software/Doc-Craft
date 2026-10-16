from scripts.audit_fixtures.service_identity import headers as service_headers
from app.core.config import settings
import pytest
from fastapi.testclient import TestClient
import pyotp

from app.main import app
from app.core.redis import cache_manager
from app.services.config_engine import config_engine
from app.repositories.config_repository import config_repository
from app.integrations.config_client import shared_config_client
from tests.conftest import create_admin_token_with_totp

client = TestClient(app)


# 1. Config Engine Read & Caching Tests
def test_config_engine_read_and_cache():
    """Verify reading domain config populates Redis cache."""
    entry = config_engine.get_domain_config("plans", force_refresh=True)
    assert entry is not None
    assert entry.domain == "plans"
    assert "pro" in entry.data

    # Inspect Redis cache
    cached = cache_manager.get("config:domain:plans")
    assert cached is not None
    assert cached["domain"] == "plans"


# 2. Config Mutation & Versioning Increment Tests
def test_config_mutation_version_increment():
    """Verify updating domain config increments version counter and records history."""
    initial_entry = config_engine.get_domain_config("branding", force_refresh=True)
    initial_version = initial_entry.version

    new_data = {
        "company_name": "DocCraft AI",
        "logo_url": "https://cdn.doccraft.app/assets/logo_v2.svg",
        "accent_color": "#ff4081",
    }

    updated_entry = config_engine.update_domain_config("branding", new_data, admin_id="adm_001")
    assert updated_entry.version == initial_version + 1
    assert updated_entry.data["accent_color"] == "#ff4081"

    # Verify version history audit log
    history = config_engine.get_version_history("branding")
    assert len(history) >= 2
    assert history[-1].version == updated_entry.version


# 3. Redis Pub/Sub Invalidation Broadcasting Tests
def test_pub_sub_invalidation_broadcasting():
    """Verify config mutation publishes invalidation payload to Redis Pub/Sub channel."""
    import time

    received_events = []

    def on_event(msg):
        received_events.append(msg)

    cache_manager.subscribe("config_invalidation", on_event)
    time.sleep(0.2)  # let the background subscriber thread finish attaching to Redis

    config_engine.update_domain_config("settings", {"default_payment_provider": "paddle"}, admin_id="adm_001")

    # Real Redis pub/sub delivery is asynchronous (a background listener thread) —
    # poll briefly instead of asserting immediately after publish.
    deadline = time.time() + 2.0
    while not received_events and time.time() < deadline:
        time.sleep(0.05)

    assert len(received_events) > 0
    assert "settings" in received_events[-1]


# 4. Internal API Read Endpoints Tests (Microservices on Cache Miss)
def test_internal_config_read_endpoint():
    """Verify internal endpoint GET /api/v1/internal/config/{domain} serves active configuration."""
    res = client.get("/api/v1/internal/config/plans", headers=service_headers("quota", "admin-api", "GET", "/api/v1/internal/config/plans"))
    assert res.status_code == 200
    data = res.json()
    assert data["domain"] == "plans"
    assert "data" in data
    assert "pro" in data["data"]


def test_internal_config_snapshot_endpoint():
    """Verify internal endpoint GET /api/v1/internal/config returns full domain snapshot."""
    res = client.get("/api/v1/internal/config", headers=service_headers("admin-api", "admin-api", "GET", "/api/v1/internal/config"))
    assert res.status_code == 200
    snapshot = res.json()
    assert isinstance(snapshot, list)
    domains = [item["domain"] for item in snapshot]
    assert "plans" in domains
    assert "branding" in domains


# 5. Shared ConfigClient 3-Tier Strategy & Auto-Eviction Tests
@pytest.mark.asyncio
async def test_shared_config_client_3tier_and_auto_eviction():
    """Verify SharedConfigClient reads multi-tier config and flushes local memory on Pub/Sub event."""
    # 1. Fetch branding config via client
    branding_config = await shared_config_client.get_config("branding")
    assert "company_name" in branding_config

    # 2. Mutate branding config via admin endpoint
    token, totp_code = create_admin_token_with_totp("config_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    res = client.put(
        "/api/v1/admin/config/branding",
        json={"company_name": "DocCraft Enterprise", "accent_color": "#00e676"},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": totp_code, "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 200

    # 3. Read again via client - local memory cache was evicted by Pub/Sub listener, so reads new value
    updated_branding = await shared_config_client.get_config("branding")
    assert updated_branding["company_name"] == "DocCraft Enterprise"
    assert updated_branding["accent_color"] == "#00e676"


# 6. Feature Flag & MCP Tool Kill-Switch Tests
@pytest.mark.asyncio
async def test_feature_flag_and_mcp_tool_kill_switch():
    """Verify feature flags and Chat MCP tool kill-switches resolve correctly."""
    watermark_free = await shared_config_client.is_feature_enabled("watermark_removal", plan_key="free")
    watermark_pro = await shared_config_client.is_feature_enabled("watermark_removal", plan_key="pro")
    assert watermark_free is False
    assert watermark_pro is True

    mcp_tool_enabled = await shared_config_client.is_mcp_tool_enabled("start_chat_session")
    assert mcp_tool_enabled is True

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Body, status

from app.core.exceptions import NotFoundException, ValidationException
from app.models.config import ConfigEntry, ConfigVersionHistory
from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_totp_2fa, require_internal_secret
from app.security.permissions import require_permission
from app.services.config_engine import config_engine
from app.repositories.config_repository import config_repository

router = APIRouter(prefix="", tags=["Dynamic Config Engine"])


# ----------------------------------------------------------------------
# 1. Internal Read API (Consuming Microservices - Gateway, Auth, Chat, Quota, Payment, Document)
# ----------------------------------------------------------------------
@router.get("/api/v1/internal/config/{domain}", response_model=ConfigEntry, dependencies=[Depends(require_internal_secret)])
async def get_internal_domain_config(domain: str):
    """
    Internal read endpoint for consuming microservices on cache miss.
    Consuming services use SharedConfigClient to read this fallback without touching Admin's DB.
    """
    entry = config_engine.get_domain_config(domain)
    if not entry:
        raise NotFoundException(f"Configuration domain '{domain}' not found")
    return entry


@router.get("/api/v1/internal/config", response_model=List[ConfigEntry], dependencies=[Depends(require_internal_secret)])
async def get_internal_all_configs():
    """Returns a full snapshot of all active domain configurations and version tags."""
    return config_repository.list_all_domain_configs()


# ----------------------------------------------------------------------
# 2. Admin Management API (Staff Dashboard Mutations)
# ----------------------------------------------------------------------
@router.get("/api/v1/admin/config/{domain}", response_model=ConfigEntry)
async def get_admin_domain_config(
    domain: str,
    admin: AdminUserPayload = Depends(require_permission("settings", "view")),
):
    """Get active domain configuration (Protected: settings:view)."""
    entry = config_engine.get_domain_config(domain)
    if not entry:
        raise NotFoundException(f"Configuration domain '{domain}' not found")
    return entry


from app.services.audit_service import audit_service
from fastapi import APIRouter, Depends, Body, Request, status


@router.put("/api/v1/admin/config/{domain}", response_model=ConfigEntry)
async def update_admin_domain_config(
    domain: str,
    request: Request,
    data: Dict[str, Any] = Body(...),
    admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """
    Update domain configuration payload (Protected: settings:edit + 2FA).
    Increments version, updates Redis, and broadcasts Pub/Sub invalidation event.
    """
    if not data or not isinstance(data, dict):
        raise ValidationException("Configuration payload must be a non-empty JSON object")

    if domain.lower().strip() in ("plans", "template_catalog"):
        raise ValidationException(
            "The 'plans' domain is derived from the Plans & Billing table and is read-only here. "
            "Edit plan pricing, quotas, and features from the Plans & Billing page — those changes "
            "sync to Postgres and Redis, and reach the Quota Service, automatically."
        )

    if domain == "ai_model_routing":
        if data.get("provider", "groq") not in ("groq", "claude"):
            raise ValidationException("AI provider must be groq or claude")
        for tier in ("guest", "free", "pro", "max"):
            route = data.get(tier, {})
            if not isinstance(route, dict) or route.get("max_model", "claude-haiku-4-5") not in ("claude-haiku-4-5", "claude-sonnet-4-5"):
                raise ValidationException("Invalid model ceiling")
    if domain == "settings":
        if data.get("default_payment_provider", "auto") not in ("auto", "paddle", "payhere"):
            raise ValidationException("Invalid payment provider")
        if data.get('document_storage_provider','local') not in ('local','supabase'):
            raise ValidationException('Document storage provider must be local or supabase')
        for key in ("allow_paddle", "allow_payhere", "allow_firebase"):
            if key in data and type(data[key]) is not bool:
                raise ValidationException(f"{key} must be boolean")

    updated_entry = config_engine.update_domain_config(domain, data, admin_id=admin.admin_id)

    audit_service.log_action(
        admin=admin,
        action="config.updated",
        module="settings",
        request=request,
        details={"domain": domain, "version": updated_entry.version},
        totp_verified=True,
    )
    return updated_entry


@router.get("/api/v1/admin/config/{domain}/history", response_model=List[ConfigVersionHistory])
async def get_domain_config_history(
    domain: str,
    admin: AdminUserPayload = Depends(require_permission("settings", "view")),
):
    """Fetch version audit history for a configuration domain (Protected: settings:view)."""
    return config_engine.get_version_history(domain)

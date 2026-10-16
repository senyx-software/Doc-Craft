from typing import List, Optional
from fastapi import APIRouter, Depends, Request, status

from app.core.exceptions import NotFoundException, ValidationException
from app.models.automation import ExecutionStatusEnum
from app.repositories.automation_repository import automation_repository
from app.schemas.automation import (
    AutomationRuleCreateSchema,
    AutomationRuleResponseSchema,
    AutomationRuleUpdateSchema,
    DryRunRequestSchema,
    DryRunResponseSchema,
    EventEmitSchema,
    ExecutionLogResponseSchema,
)
from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_totp_2fa
from app.security.permissions import require_permission
from app.services.audit_service import audit_service
from app.services.automation_engine import automation_engine

router = APIRouter(prefix="/admin/automation", tags=["Automation & Workflow Engine"])


# ----------------------------------------------------------------------
# 1. Automation Rule CRUD APIs
# ----------------------------------------------------------------------
@router.get("/rules", response_model=List[AutomationRuleResponseSchema])
async def list_automation_rules(
    include_disabled: bool = False,
    admin: AdminUserPayload = Depends(require_permission("automation", "view")),
):
    """List automation rules (Protected: automation:view)."""
    rules = automation_repository.list_rules(include_disabled=include_disabled)
    return [AutomationRuleResponseSchema(**r.model_dump()) for r in rules]


@router.post("/rules", response_model=AutomationRuleResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_automation_rule(
    payload: AutomationRuleCreateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("automation", "create")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Create a new automation rule (Protected: automation:create + 2FA)."""
    rule = automation_repository.create_rule(
        name=payload.name,
        description=payload.description,
        trigger_event=payload.trigger_event,
        conditions=payload.conditions,
        actions=payload.actions,
        retry_limit=payload.retry_limit,
    )

    audit_service.log_action(
        admin=admin,
        action="automation.rule_created",
        module="automation",
        request=request,
        details={"rule_id": rule.id, "trigger_event": rule.trigger_event, "name": rule.name},
        totp_verified=True,
    )

    return AutomationRuleResponseSchema(**rule.model_dump())


@router.patch("/rules/{rule_id}", response_model=AutomationRuleResponseSchema)
async def update_automation_rule(
    rule_id: str,
    payload: AutomationRuleUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("automation", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Edit automation rule conditions, actions, or status (Protected: automation:edit + 2FA)."""
    rule = automation_repository.get_rule_by_id(rule_id)
    if not rule:
        raise NotFoundException(f"Automation rule with ID '{rule_id}' not found")

    updated_rule = automation_repository.update_rule(rule_id, payload.model_dump(exclude_unset=True))

    audit_service.log_action(
        admin=admin,
        action="automation.rule_updated",
        module="automation",
        request=request,
        details={"rule_id": rule_id, "updated_fields": payload.model_dump(exclude_unset=True)},
        totp_verified=True,
    )

    return AutomationRuleResponseSchema(**updated_rule.model_dump())


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation_rule(
    rule_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("automation", "delete")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Delete an automation rule (Protected: automation:delete + 2FA)."""
    success = automation_repository.delete_rule(rule_id)
    if not success:
        raise NotFoundException(f"Automation rule with ID '{rule_id}' not found")

    audit_service.log_action(
        admin=admin,
        action="automation.rule_deleted",
        module="automation",
        request=request,
        details={"rule_id": rule_id},
        totp_verified=True,
    )

    return None


# ----------------------------------------------------------------------
# 2. Dry Run Execution API
# ----------------------------------------------------------------------
@router.post("/rules/{rule_id}/dry-run", response_model=DryRunResponseSchema)
async def dry_run_automation_rule(
    rule_id: str,
    payload: DryRunRequestSchema,
    admin: AdminUserPayload = Depends(require_permission("automation", "view")),
):
    """Simulate condition evaluation and preview action execution for a rule (Protected: automation:view)."""
    rule = automation_repository.get_rule_by_id(rule_id)
    if not rule:
        raise NotFoundException(f"Automation rule with ID '{rule_id}' not found")

    result = automation_engine.dry_run_rule(rule, payload.payload)
    return DryRunResponseSchema(**result)


@router.post("/dry-run")
async def dry_run_any_payload(
    payload: DryRunRequestSchema,
    admin: AdminUserPayload = Depends(require_permission("automation", "view")),
):
    """Evaluate sample payload against all active rules and return evaluation results."""
    event_type = payload.payload.get("event") or payload.payload.get("trigger_event") or "quota.warning"
    rules = automation_repository.get_rules_by_event(event_type)
    if not rules:
        rules = automation_repository.list_rules()

    results = []
    for r in rules:
        results.append(automation_engine.dry_run_rule(r, payload.payload))

    return {
        "status": "success",
        "evaluated_rules_count": len(results),
        "results": results,
        "message": f"Evaluated payload against {len(results)} active automation rules"
    }



# ----------------------------------------------------------------------
# 3. Event Ingestion API
# ----------------------------------------------------------------------
@router.post("/events/emit", response_model=List[ExecutionLogResponseSchema])
async def emit_domain_event(
    payload: EventEmitSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("automation", "edit")),
):
    """
    Manually trigger active rules for a domain event (Protected: automation:edit).
    Real cross-service events instead flow through the `doccraft:events` Redis
    pub/sub channel (see app/queues/events.py) — this HTTP endpoint is for an
    admin to force/replay an event, which is why it's permission-gated and
    audited rather than open to any caller.
    """
    execution_logs = automation_engine.process_event(payload.trigger_event, payload.payload)
    audit_service.log_action(
        admin=admin,
        action="automation.event_emitted",
        module="automation",
        request=request,
        details={
            "trigger_event": payload.trigger_event,
            "rules_matched": len(execution_logs),
            "statuses": [l.status.value if hasattr(l.status, "value") else l.status for l in execution_logs],
        },
    )
    return [ExecutionLogResponseSchema(**l.model_dump()) for l in execution_logs]


# ----------------------------------------------------------------------
# 4. Execution Run Logs API
# ----------------------------------------------------------------------
@router.get("/execution-logs", response_model=List[ExecutionLogResponseSchema])
async def list_execution_logs(
    rule_id: Optional[str] = None,
    status: Optional[ExecutionStatusEnum] = None,
    limit: int = 50,
    admin: AdminUserPayload = Depends(require_permission("automation", "view")),
):
    """List execution run logs with status filter (Protected: automation:view)."""
    logs = automation_repository.list_execution_logs(rule_id=rule_id, status=status, limit=limit)
    return [ExecutionLogResponseSchema(**l.model_dump()) for l in logs]

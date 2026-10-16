from shared.service_auth import service_client
"""
automation_engine.py — Core Automation Engine with real action dispatchers.

Pipeline:
  Trigger Event → evaluate_all_conditions → execute_action (real httpx calls)
                     → retry with exponential back-off → dead-letter on exhaustion

Action dispatchers:
  - send_email          → POST http://notification:3016/notification/send
  - grant_quota_override → POST http://quota:3015/internal/override
  - block_ip            → PATCH http://localhost:3018/api/v1/admin/security/block-ip  (internal)
  - webhook             → POST action.target (arbitrary URL)

Retry policy:
  - Configurable retry_limit (default from rule, min 1 attempt regardless)
  - Delay = min(2^attempt × 500 ms, 30 s)  — capped to avoid runaway waits
  - On exhaustion → ExecutionStatusEnum.DEAD_LETTER
"""

import time
import uuid
import hashlib,json,os,ipaddress,socket
from urllib.parse import urlsplit
from typing import Any, Dict, List, Tuple

import httpx

from app.core.config import settings
from app.models.automation import (
    ActionRule,
    ActionTypeEnum,
    AutomationExecutionLogModel,
    AutomationRuleModel,
    ConditionRule,
    ExecutionStatusEnum,
    OperatorEnum,
)
from app.repositories.automation_repository import automation_repository

# ─── Retry policy ────────────────────────────────────────────────────────────

_MAX_RETRY_DELAY_S = 30
_RETRY_BASE_DELAY_S = 0.5  # 0.5s → 1s → 2s … (2^attempt × 0.5)


def _retry_delay(attempt: int) -> float:
    return min((2 ** attempt) * _RETRY_BASE_DELAY_S, _MAX_RETRY_DELAY_S)


# ─── Engine ──────────────────────────────────────────────────────────────────

class AutomationEngine:
    """Core Automation Engine: condition evaluation, action execution, dry run, and retry pipeline."""

    # ── Condition Evaluator ──────────────────────────────────────────────────

    def evaluate_condition(self, condition: ConditionRule, payload: Dict[str, Any]) -> Tuple[bool, Any]:
        val = payload.get(condition.field)
        op = condition.operator
        target_val = condition.value

        if val is None:
            return False, f"Field '{condition.field}' missing from payload"

        try:
            if op == OperatorEnum.EQUALS:
                res = val == target_val
            elif op == OperatorEnum.NOT_EQUALS:
                res = val != target_val
            elif op == OperatorEnum.GREATER_THAN:
                res = float(val) > float(target_val)
            elif op == OperatorEnum.LESS_THAN:
                res = float(val) < float(target_val)
            elif op == OperatorEnum.GREATER_THAN_OR_EQUAL:
                res = float(val) >= float(target_val)
            elif op == OperatorEnum.LESS_THAN_OR_EQUAL:
                res = float(val) <= float(target_val)
            elif op == OperatorEnum.CONTAINS:
                res = str(target_val).lower() in str(val).lower()
            elif op == OperatorEnum.IN:
                res = val in (target_val if isinstance(target_val, list) else [target_val])
            else:
                res = False
        except (TypeError, ValueError):
            return False, f"Type mismatch evaluating field '{condition.field}'"

        return res, val

    def evaluate_all_conditions(
        self, conditions: List[ConditionRule], payload: Dict[str, Any]
    ) -> Tuple[bool, List[Dict[str, Any]]]:
        if not conditions:
            return True, []

        details = []
        all_passed = True
        for cond in conditions:
            passed, actual_val = self.evaluate_condition(cond, payload)
            if not passed:
                all_passed = False
            details.append(
                {
                    "field": cond.field,
                    "operator": cond.operator.value,
                    "expected": cond.value,
                    "actual": actual_val,
                    "passed": passed,
                }
            )

        return all_passed, details

    # ── Real Action Dispatchers ───────────────────────────────────────────────

    def _dispatch_send_email(self, action: ActionRule, payload: Dict[str, Any]) -> Dict[str, Any]:
        """POST to notification microservice to queue a transactional email."""
        url = f"{settings.NOTIFICATION_SERVICE_URL}/notification/send"
        body = {
            "userId": payload.get("user_id", "system"),
            "type": action.payload.get("template", "generic"),
            "email": payload.get("email", ""),
            "payload": {**payload, **action.payload},
            "idempotencyKey": payload.get('_action_delivery_id'),
        }
        try:
            if not body['email'] and body['userId']!='system':
                from urllib.parse import quote
                with service_client('auth',timeout=5.0) as account_client:
                    account=account_client.get(settings.AUTH_SERVICE_URL+'/internal/users/'+quote(str(body['userId']),safe=''))
                    account.raise_for_status();body['email']=account.json().get('email','')
            with service_client("notification", timeout=10.0) as client:
                resp = client.post(url, json=body, headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET})
                resp.raise_for_status()
                return {"status": "success", "details": f"Email queued via notification service: {resp.status_code}", "response": resp.text[:200]}
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"Notification service HTTP {exc.response.status_code}: {exc.response.text[:200]}") from exc
        except httpx.RequestError as exc:
            raise RuntimeError(f"Notification service unreachable: {exc}") from exc

    def _dispatch_quota_override(self, action: ActionRule, payload: Dict[str, Any]) -> Dict[str, Any]:
        """POST to quota microservice to grant a custom quota override."""
        user_id = payload.get("user_id")
        if not user_id:
            raise RuntimeError("grant_quota_override requires 'user_id' in payload")

        url = f"{settings.QUOTA_SERVICE_URL}/v1/quota/override"
        body = {
            "userId": user_id,
            "overrideLimit": action.payload.get("quota", 5),
            "reason": action.payload.get("reason", "Automation engine override"),
            "adminId": "system:automation_engine",
        }
        try:
            with service_client("quota", timeout=10.0, headers={"x-internal-secret": settings.INTERNAL_SERVICE_SECRET}) as client:
                resp = client.post(url, json=body, headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET})
                resp.raise_for_status()
                return {"status": "success", "details": f"Quota override applied for user {user_id}"}
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"Quota service HTTP {exc.response.status_code}: {exc.response.text[:200]}") from exc
        except httpx.RequestError as exc:
            raise RuntimeError(f"Quota service unreachable: {exc}") from exc

    def _dispatch_block_ip(self, action: ActionRule, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Block an IP address via the admin security endpoint (internal call)."""
        ip = payload.get("ip_address")
        if not ip:
            raise RuntimeError("block_ip requires 'ip_address' in payload")
        return {
            "status": "manual_review",
            "details": "No automatic network block integration is configured; operator action required",
        }

    def _dispatch_webhook(self, action: ActionRule, payload: Dict[str, Any]) -> Dict[str, Any]:
        """POST arbitrary webhook to the configured target URL."""
        url = action.target
        parsed=urlsplit(url or '')
        hosts={host.strip().lower() for host in os.getenv('AUTOMATION_WEBHOOK_ALLOWED_HOSTS','').split(',') if host.strip()}
        if parsed.scheme!='https' or not parsed.hostname or parsed.hostname.lower() not in hosts or parsed.username or parsed.password or parsed.port not in (None,443):
            raise RuntimeError('Webhook destination requires an operator-approved HTTPS hostname')
        addresses=socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
            raise RuntimeError('Webhook destination must resolve only to public addresses')
        try:
            with httpx.Client(timeout=15.0,follow_redirects=False) as client:
                headers={'Idempotency-Key':payload['_action_delivery_id']} if payload.get('_action_delivery_id') else {}
                resp = client.post(url, json={"event_payload": payload, "action_payload": action.payload},headers=headers)
                resp.raise_for_status()
                return {"status": "success", "details": f"Webhook POST to {url} → {resp.status_code}"}
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"Webhook returned HTTP {exc.response.status_code}") from exc
        except httpx.RequestError as exc:
            raise RuntimeError('Webhook destination unavailable') from exc

    # ── Action Executor (dry-run + real) ─────────────────────────────────────

    def execute_action(self, action: ActionRule, payload: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "action_type": action.action_type.value,
            "target": action.target,
            "status": "success",
            "dry_run": dry_run,
        }

        if dry_run:
            result["preview"] = (
                f"[DRY-RUN] Would dispatch {action.action_type.value} to '{action.target}' "
                f"with payload: {action.payload}"
            )
            return result

        try:
            if action.action_type == ActionTypeEnum.SEND_EMAIL:
                result.update(self._dispatch_send_email(action, payload))
            elif action.action_type == ActionTypeEnum.GRANT_QUOTA_OVERRIDE:
                result.update(self._dispatch_quota_override(action, payload))
            elif action.action_type == ActionTypeEnum.BLOCK_IP:
                result.update(self._dispatch_block_ip(action, payload))
            elif action.action_type == ActionTypeEnum.WEBHOOK:
                result.update(self._dispatch_webhook(action, payload))
            else:
                result["details"] = f"Unrecognised action type: {action.action_type.value}"
        except Exception as exc:
            result["status"] = "failed"
            result["error"] = str(exc)

        return result

    # ── Dry Run Engine ───────────────────────────────────────────────────────

    def dry_run_rule(self, rule: AutomationRuleModel, payload: Dict[str, Any]) -> Dict[str, Any]:
        all_passed, condition_details = self.evaluate_all_conditions(rule.conditions, payload)
        action_previews = []
        if all_passed:
            action_previews = [self.execute_action(a, payload, dry_run=True) for a in rule.actions]

        return {
            "rule_id": rule.id,
            "rule_name": rule.name,
            "trigger_event": rule.trigger_event,
            "payload": payload,
            "conditions_evaluated": len(rule.conditions),
            "conditions_passed": all_passed,
            "condition_details": condition_details,
            "action_previews": action_previews,
        }

    # ── Event Ingestion + Retry / Dead-Letter Pipeline ────────────────────────

    def process_event(self, trigger_event: str, payload: Dict[str, Any]) -> List[AutomationExecutionLogModel]:
        """
        Process a domain event against all matching active rules.

        For each rule:
          1. Evaluate conditions — if failed, log and skip.
          2. Execute each action with retry (exponential back-off up to rule.retry_limit).
          3. If all retries exhausted → status = dead_letter.
          4. Persist execution log to DB.
        """
        matching_rules = automation_repository.get_rules_by_event(trigger_event)
        execution_logs: List[AutomationExecutionLogModel] = []

        for rule in matching_rules:
            all_passed, _ = self.evaluate_all_conditions(rule.conditions, payload)
            log_id = f"exec_{uuid.uuid4().hex[:12]}"

            # Conditions failed — log as skipped (success, no actions run)
            if not all_passed:
                log = AutomationExecutionLogModel(
                    id=log_id,
                    rule_id=rule.id,
                    rule_name=rule.name,
                    trigger_event=trigger_event,
                    payload=payload,
                    conditions_evaluated=len(rule.conditions),
                    conditions_passed=False,
                    status=ExecutionStatusEnum.SUCCESS,  # skipped, not a failure
                )
                automation_repository.add_execution_log(log)
                execution_logs.append(log)
                continue

            # Execute actions with retry + dead-letter
            action_results: List[Dict[str, Any]] = []
            final_status = ExecutionStatusEnum.SUCCESS
            total_retry_count = 0
            error_msg: str | None = None

            for action_index,action in enumerate(rule.actions):
                action_payload=payload
                if payload.get('_delivery_id'):
                    action_payload={**payload,'_action_delivery_id':hashlib.sha256(json.dumps([payload['_delivery_id'],rule.id,action_index]).encode()).hexdigest()}
                success = False
                attempt = 0
                max_attempts = rule.retry_limit + 1  # retry_limit=3 means 4 total attempts

                while attempt < max_attempts and not success:
                    res = self.execute_action(action, action_payload, dry_run=False)
                    action_results.append({**res, "attempt": attempt + 1})

                    if res["status"] == "success":
                        success = True
                    else:
                        attempt += 1
                        total_retry_count += 1
                        error_msg = res.get("error", "Action execution failed")

                        if attempt < max_attempts:
                            delay = _retry_delay(attempt)
                            print(
                                f"[AutomationEngine] Rule '{rule.id}' action '{action.action_type.value}' "
                                f"failed (attempt {attempt}/{max_attempts}). Retrying in {delay:.1f}s…"
                            )
                            time.sleep(delay)

                if not success:
                    final_status = ExecutionStatusEnum.DEAD_LETTER
                    print(
                        f"[AutomationEngine] Rule '{rule.id}' action '{action.action_type.value}' "
                        f"exhausted all retries → DEAD_LETTER"
                    )

            log = AutomationExecutionLogModel(
                id=log_id,
                rule_id=rule.id,
                rule_name=rule.name,
                trigger_event=trigger_event,
                payload=payload,
                conditions_evaluated=len(rule.conditions),
                conditions_passed=True,
                action_results=action_results,
                status=final_status,
                retry_count=total_retry_count,
                error_message=error_msg,
            )
            automation_repository.add_execution_log(log)
            execution_logs.append(log)

        return execution_logs


automation_engine = AutomationEngine()

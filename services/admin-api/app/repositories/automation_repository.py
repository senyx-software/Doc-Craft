"""
automation_repository.py — DB-backed repository for automation rules and execution logs.

Replaces the previous in-memory dict/list implementation with PostgreSQL (or SQLite)
persistence via admin_db. The repository interface is identical to the previous version
so the engine and API layers are unaffected.

Seed rules are inserted once at startup if the table is empty.
"""

import json
import uuid
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.admin_db import admin_db
from app.models.automation import (
    ActionRule,
    ActionTypeEnum,
    AutomationExecutionLogModel,
    AutomationRuleModel,
    ConditionRule,
    ExecutionStatusEnum,
    OperatorEnum,
    RuleStatusEnum,
)

# ─── Seed rules ──────────────────────────────────────────────────────────────

SEED_RULES: List[AutomationRuleModel] = [
    AutomationRuleModel(
        id="rule_quota_warning",
        name="Quota Warning Email Alert",
        description="Trigger warning email when user approaches monthly document quota limit",
        trigger_event="quota.warning",
        conditions=[
            ConditionRule(field="used_quota", operator=OperatorEnum.GREATER_THAN_OR_EQUAL, value=4)
        ],
        actions=[
            ActionRule(
                action_type=ActionTypeEnum.SEND_EMAIL,
                target="notification_service",
                payload={"template": "quota_warning_email", "priority": "high"},
            )
        ],
        status=RuleStatusEnum.ACTIVE,
        retry_limit=3,
    ),
    AutomationRuleModel(
        id="rule_payment_failed_alert",
        name="Payment Failed Notification",
        description="Send payment failure alert email when a subscription payment fails",
        trigger_event="payment.failed",
        conditions=[],
        actions=[
            ActionRule(
                action_type=ActionTypeEnum.SEND_EMAIL,
                target="notification_service",
                payload={"template": "payment_failed", "priority": "high"},
            )
        ],
        status=RuleStatusEnum.ACTIVE,
        retry_limit=3,
    ),
    AutomationRuleModel(
        id="rule_subscription_cancelled",
        name="Subscription Cancellation Notification",
        description="Send cancellation email; current access and quota come from authoritative entitlements",
        trigger_event="subscription.cancelled",
        conditions=[],
        actions=[
            ActionRule(
                action_type=ActionTypeEnum.SEND_EMAIL,
                target="notification_service",
                payload={"template": "cancellation", "priority": "medium"},
            ),
        ],
        status=RuleStatusEnum.ACTIVE,
        retry_limit=3,
    ),
]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rule_from_row(row: Dict[str, Any]) -> AutomationRuleModel:
    """Deserialise a DB row back into a typed AutomationRuleModel."""
    conditions_raw = json.loads(row.get("conditions_json") or "[]")
    actions_raw    = json.loads(row.get("actions_json") or "[]")

    conditions = [ConditionRule(**c) for c in conditions_raw]
    actions    = [ActionRule(**a) for a in actions_raw]

    return AutomationRuleModel(
        id=row["id"],
        name=row["name"],
        description=row.get("description"),
        trigger_event=row["trigger_event"],
        conditions=conditions,
        actions=actions,
        status=RuleStatusEnum(row.get("status", "active")),
        retry_limit=int(row.get("retry_limit", 3)),
        created_at=datetime.fromisoformat(row["created_at"]) if row.get("created_at") else datetime.now(timezone.utc),
        updated_at=datetime.fromisoformat(row["updated_at"]) if row.get("updated_at") else datetime.now(timezone.utc),
    )


def _log_from_row(row: Dict[str, Any]) -> AutomationExecutionLogModel:
    """Deserialise a DB row back into a typed AutomationExecutionLogModel."""
    return AutomationExecutionLogModel(
        id=row["id"],
        rule_id=row["rule_id"],
        rule_name=row["rule_name"],
        trigger_event=row["trigger_event"],
        payload=json.loads(row.get("payload_json") or "{}"),
        conditions_evaluated=int(row.get("conditions_evaluated", 0)),
        conditions_passed=bool(row.get("conditions_passed", False)),
        action_results=json.loads(row.get("action_results_json") or "[]"),
        status=ExecutionStatusEnum(row.get("status", "success")),
        retry_count=int(row.get("retry_count", 0)),
        error_message=row.get("error_message"),
        created_at=datetime.fromisoformat(row["created_at"]) if row.get("created_at") else datetime.now(timezone.utc),
    )


# ─── Repository ──────────────────────────────────────────────────────────────

class AutomationRepository:
    """PostgreSQL/SQLite-backed repository for automation rules and execution logs."""

    def __init__(self) -> None:
        self._seed_if_empty()
        if os.getenv('ADMIN_RUN_MIGRATIONS','true')=='true':self.migrate_legacy_cancel_seed()

    def migrate_legacy_cancel_seed(self):
        row=admin_db.fetch_one('SELECT name,actions_json FROM automation_rules WHERE id=?',('rule_subscription_cancelled',))
        legacy=[{'action_type':'grant_quota_override','target':'quota_service','payload':{'quota':5,'reason':'Subscription cancelled — reverted to free tier'}},{'action_type':'send_email','target':'notification_service','payload':{'template':'cancellation','priority':'medium'}}]
        if row and row['name']=='Subscription Cancellation Downgrade' and json.loads(row['actions_json'])==legacy:
            admin_db.execute('UPDATE automation_rules SET name=?,description=?,actions_json=?,updated_at=? WHERE id=?',('Subscription Cancellation Notification','Current access and quota come from authoritative entitlements',json.dumps(legacy[1:]),_now_iso(),'rule_subscription_cancelled'))

    # ── Seeding ──────────────────────────────────────────────────────────────

    def _seed_if_empty(self) -> None:
        """Insert seed rules once if the table is empty (idempotent by primary key)."""
        try:
            rows = admin_db.fetch_all("SELECT id FROM automation_rules LIMIT 1")
            if rows:
                return  # Already seeded
            for rule in SEED_RULES:
                self._insert_rule(rule)
        except Exception as exc:
            print(f"[AutomationRepository] Seed warning: {exc}")

    def _insert_rule(self, rule: AutomationRuleModel) -> None:
        now = _now_iso()
        admin_db.execute(
            """INSERT INTO automation_rules
               (id, name, description, trigger_event, conditions_json, actions_json, status, retry_limit, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                rule.id,
                rule.name,
                rule.description,
                rule.trigger_event,
                json.dumps([c.model_dump() for c in rule.conditions]),
                json.dumps([a.model_dump() for a in rule.actions]),
                rule.status.value,
                rule.retry_limit,
                now,
                now,
            ),
        )

    # ── Rule CRUD ────────────────────────────────────────────────────────────

    def list_rules(self, include_disabled: bool = False) -> List[AutomationRuleModel]:
        if include_disabled:
            rows = admin_db.fetch_all(
                "SELECT * FROM automation_rules ORDER BY created_at DESC"
            )
        else:
            rows = admin_db.fetch_all(
                "SELECT * FROM automation_rules WHERE status = ? ORDER BY created_at DESC",
                ("active",),
            )
        return [_rule_from_row(r) for r in rows]

    def get_rule_by_id(self, rule_id: str) -> Optional[AutomationRuleModel]:
        row = admin_db.fetch_one(
            "SELECT * FROM automation_rules WHERE id = ?", (rule_id,)
        )
        return _rule_from_row(row) if row else None

    def get_rules_by_event(self, trigger_event: str) -> List[AutomationRuleModel]:
        rows = admin_db.fetch_all(
            "SELECT * FROM automation_rules WHERE LOWER(trigger_event) = LOWER(?) AND status = ?",
            (trigger_event.strip(), "active"),
        )
        return [_rule_from_row(r) for r in rows]

    def create_rule(
        self,
        name: str,
        trigger_event: str,
        conditions: List[ConditionRule],
        actions: List[ActionRule],
        description: Optional[str] = None,
        retry_limit: int = 3,
    ) -> AutomationRuleModel:
        rule_id = f"rule_{uuid.uuid4().hex[:12]}"
        now = _now_iso()
        admin_db.execute(
            """INSERT INTO automation_rules
               (id, name, description, trigger_event, conditions_json, actions_json, status, retry_limit, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                rule_id,
                name,
                description,
                trigger_event,
                json.dumps([c.model_dump() for c in conditions]),
                json.dumps([a.model_dump() for a in actions]),
                RuleStatusEnum.ACTIVE.value,
                retry_limit,
                now,
                now,
            ),
        )
        return self.get_rule_by_id(rule_id)  # type: ignore[return-value]

    def update_rule(self, rule_id: str, updates: Dict[str, Any]) -> Optional[AutomationRuleModel]:
        """Apply partial updates to a rule. Serialises conditions/actions to JSON if provided."""
        if not updates:
            return self.get_rule_by_id(rule_id)

        set_clauses = []
        params: list = []

        for key, val in updates.items():
            if val is None:
                continue
            if key == "conditions":
                set_clauses.append("conditions_json = ?")
                cond_list = [c.model_dump() if hasattr(c, "model_dump") else c for c in val]
                params.append(json.dumps(cond_list))
            elif key == "actions":
                set_clauses.append("actions_json = ?")
                act_list = [a.model_dump() if hasattr(a, "model_dump") else a for a in val]
                params.append(json.dumps(act_list))
            elif key == "status":
                set_clauses.append("status = ?")
                params.append(val.value if hasattr(val, "value") else str(val))
            elif key in ("name", "description", "trigger_event", "retry_limit"):
                set_clauses.append(f"{key} = ?")
                params.append(val)

        if not set_clauses:
            return self.get_rule_by_id(rule_id)

        set_clauses.append("updated_at = ?")
        params.append(_now_iso())
        params.append(rule_id)

        admin_db.execute(
            f"UPDATE automation_rules SET {', '.join(set_clauses)} WHERE id = ?",
            tuple(params),
        )
        return self.get_rule_by_id(rule_id)

    def delete_rule(self, rule_id: str) -> bool:
        affected = admin_db.execute(
            "DELETE FROM automation_rules WHERE id = ?", (rule_id,)
        )
        return affected > 0

    # ── Execution Logs ───────────────────────────────────────────────────────

    def add_execution_log(self, log: AutomationExecutionLogModel) -> AutomationExecutionLogModel:
        now = log.created_at.isoformat() if log.created_at else _now_iso()
        admin_db.execute(
            """INSERT INTO automation_execution_logs
               (id, rule_id, rule_name, trigger_event, payload_json, conditions_evaluated,
                conditions_passed, action_results_json, status, retry_count, error_message, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                log.id,
                log.rule_id,
                log.rule_name,
                log.trigger_event,
                json.dumps(log.payload),
                log.conditions_evaluated,
                1 if log.conditions_passed else 0,
                json.dumps(log.action_results),
                log.status.value,
                log.retry_count,
                log.error_message,
                now,
            ),
        )
        return log

    def list_execution_logs(
        self,
        rule_id: Optional[str] = None,
        status: Optional[ExecutionStatusEnum] = None,
        limit: int = 50,
    ) -> List[AutomationExecutionLogModel]:
        where_clauses = []
        params: list = []

        if rule_id:
            where_clauses.append("rule_id = ?")
            params.append(rule_id)
        if status:
            where_clauses.append("status = ?")
            params.append(status.value)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        params.append(limit)

        rows = admin_db.fetch_all(
            f"SELECT * FROM automation_execution_logs {where_sql} ORDER BY created_at DESC LIMIT ?",
            tuple(params),
        )
        return [_log_from_row(r) for r in rows]


automation_repository = AutomationRepository()

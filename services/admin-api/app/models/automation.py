from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class RuleStatusEnum(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


class ExecutionStatusEnum(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"
    DEAD_LETTER = "dead_letter"


class OperatorEnum(str, Enum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    GREATER_THAN_OR_EQUAL = "greater_than_or_equal"
    LESS_THAN_OR_EQUAL = "less_than_or_equal"
    CONTAINS = "contains"
    IN = "in"


class ActionTypeEnum(str, Enum):
    SEND_EMAIL = "send_email"
    GRANT_QUOTA_OVERRIDE = "grant_quota_override"
    BLOCK_IP = "block_ip"
    WEBHOOK = "webhook"


class ConditionRule(BaseModel):
    field: str
    operator: OperatorEnum
    value: Any


class ActionRule(BaseModel):
    action_type: ActionTypeEnum
    target: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class AutomationRuleModel(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    trigger_event: str
    conditions: List[ConditionRule] = Field(default_factory=list)
    actions: List[ActionRule] = Field(default_factory=list)
    status: RuleStatusEnum = RuleStatusEnum.ACTIVE
    retry_limit: int = 3
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AutomationExecutionLogModel(BaseModel):
    id: str
    rule_id: str
    rule_name: str
    trigger_event: str
    payload: Dict[str, Any]
    conditions_evaluated: int = 0
    conditions_passed: bool = False
    action_results: List[Dict[str, Any]] = Field(default_factory=list)
    status: ExecutionStatusEnum = ExecutionStatusEnum.SUCCESS
    retry_count: int = 0
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

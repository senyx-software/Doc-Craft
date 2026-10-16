from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.models.automation import (
    ActionRule,
    ConditionRule,
    ExecutionStatusEnum,
    RuleStatusEnum,
)


class AutomationRuleCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, description="Automation rule name")
    description: Optional[str] = None
    trigger_event: str = Field(..., description="Domain event trigger (e.g. quota.warning, user.registered)")
    conditions: List[ConditionRule] = Field(default_factory=list)
    actions: List[ActionRule] = Field(default_factory=list)
    retry_limit: int = Field(3, ge=0, le=10)


class AutomationRuleUpdateSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_event: Optional[str] = None
    conditions: Optional[List[ConditionRule]] = None
    actions: Optional[List[ActionRule]] = None
    status: Optional[RuleStatusEnum] = None
    retry_limit: Optional[int] = Field(None, ge=0, le=10)


class AutomationRuleResponseSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    trigger_event: str
    conditions: List[ConditionRule]
    actions: List[ActionRule]
    status: RuleStatusEnum
    retry_limit: int
    created_at: datetime
    updated_at: datetime


class DryRunRequestSchema(BaseModel):
    payload: Dict[str, Any] = Field(..., description="Sample payload for condition evaluation")


class DryRunResponseSchema(BaseModel):
    rule_id: str
    rule_name: str
    trigger_event: str
    payload: Dict[str, Any]
    conditions_evaluated: int
    conditions_passed: bool
    condition_details: List[Dict[str, Any]]
    action_previews: List[Dict[str, Any]]


class EventEmitSchema(BaseModel):
    trigger_event: str = Field(..., description="Domain event trigger (e.g. quota.warning)")
    payload: Dict[str, Any] = Field(..., description="Domain event payload")


class ExecutionLogResponseSchema(BaseModel):
    id: str
    rule_id: str
    rule_name: str
    trigger_event: str
    payload: Dict[str, Any]
    conditions_evaluated: int
    conditions_passed: bool
    action_results: List[Dict[str, Any]]
    status: ExecutionStatusEnum
    retry_count: int
    error_message: Optional[str] = None
    created_at: datetime

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ConfigDomainEnum(str, Enum):
    PLANS = "plans"
    FEATURE_FLAGS = "feature_flags"
    TEMPLATES = "templates"
    BRANDING = "branding"
    SETTINGS = "settings"
    CHAT_MCP_TOOLS = "chat_mcp_tools"


class ConfigEntry(BaseModel):
    domain: str = Field(..., description="Configuration domain (e.g. plans, feature_flags, branding)")
    data: Dict[str, Any] = Field(default_factory=dict, description="Domain configuration payload")
    version: int = Field(default=1, description="Monotonically increasing version number")
    updated_by_admin_id: Optional[str] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConfigVersionHistory(BaseModel):
    id: str
    domain: str
    version: int
    data_snapshot: Dict[str, Any]
    changed_by_admin_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConfigInvalidationEvent(BaseModel):
    domain: str
    version: int
    timestamp: float = Field(default_factory=lambda: datetime.now(timezone.utc).timestamp())

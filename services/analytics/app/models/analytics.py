import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional


class AnalyticsEvent(BaseModel):
    # `id`/`createdAt` used to be required with no default — every caller
    # (including admin-api's own track_event()) omitted them, so this model
    # rejected every real request with a 422 and the whole pipeline never
    # actually worked. Auto-generated here instead.
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: Optional[str] = None
    eventName: str
    properties: Dict[str, Any] = Field(default_factory=dict)
    anonymized: bool = False
    createdAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

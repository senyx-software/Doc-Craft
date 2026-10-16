import asyncio
from typing import Any,Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field,ConfigDict
from app.security.dependencies import require_internal_secret
from app.services.automation_inbox import accept
router=APIRouter()
class BillingEvent(BaseModel):
    model_config=ConfigDict(extra='forbid')
    delivery_id:str=Field(min_length=1,max_length=200)
    event:Literal['payment.failed','subscription.cancelled']
    payload:dict[str,Any]
@router.post('/api/v1/internal/automation/events',dependencies=[Depends(require_internal_secret)])
async def intake(body:BillingEvent):
    try:return await asyncio.to_thread(accept,body.delivery_id,body.event,body.payload)
    except ValueError:raise HTTPException(409,'Conflicting event delivery identity')

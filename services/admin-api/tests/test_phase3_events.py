import json
import time
import uuid
import pytest
import jwt
from scripts.audit_fixtures.service_identity import CONFIGS
from shared.service_auth import key_bytes
from shared.event_auth import verified_event


def message(caller="quota", event="quota.warning"):
    key=CONFIGS[caller]["event_send"]
    now=int(time.time())
    token=jwt.encode({"iss":"doccraft-events","aud":"admin-api","sub":caller,"iat":now,"exp":now+60,"jti":str(uuid.uuid4()),"event":event,"payload":{"user_id":"synthetic"}},key_bytes(key["secret"]),algorithm="HS256",headers={"typ":"doccraft-event+jwt","kid":key["kid"]})
    return json.dumps({"authorization":token})


@pytest.mark.asyncio
async def test_automation_events_are_scoped_and_replay_protected():
    raw=message()
    assert (await verified_event(raw))[0]=="quota.warning"
    with pytest.raises(ValueError,match="Replayed"):
        await verified_event(raw)
    with pytest.raises(ValueError,match="not authorized"):
        await verified_event(message("quota","subscription.cancelled"))
    with pytest.raises(KeyError):
        await verified_event(json.dumps({"event":"subscription.cancelled","payload":{"user_id":"synthetic"}}))

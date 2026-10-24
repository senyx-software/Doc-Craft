from unittest.mock import AsyncMock
import pytest
from app.integrations.services.analytics_client import AnalyticsServiceClient
from app.core.exceptions import AppException

@pytest.mark.asyncio
async def test_broken_reporting_is_not_an_empty_success(monkeypatch):
    import app.integrations.services.analytics_client as module
    class Context:
        async def __aenter__(self):
            self.get=AsyncMock(side_effect=RuntimeError('private-diagnostic'))
            return self
        async def __aexit__(self,*args):pass
    monkeypatch.setattr(module,'async_service_client',lambda *a,**k:Context())
    client=AnalyticsServiceClient()
    for operation in (client.get_generations,client.get_users_breakdown):
        with pytest.raises(AppException) as error:
            await operation()
        assert error.value.status_code==503
        assert 'private' not in error.value.message

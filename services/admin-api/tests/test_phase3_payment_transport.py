from unittest.mock import Mock

from app.integrations.services import payment_client


def test_payment_patch_uses_scoped_transport(monkeypatch):
    response = Mock()
    response.json.return_value = {"id": "synthetic", "status": "paused"}
    send = Mock(return_value=response)
    monkeypatch.setattr(payment_client, "service_request", send)
    client = payment_client.PaymentServiceClient("http://payment.test")

    assert client._patch("/v1/payment/admin/subscriptions/synthetic/pause", {"reason": "fixture"})["status"] == "paused"
    args, kwargs = send.call_args
    assert args == ("payment", "PATCH", "http://payment.test/v1/payment/admin/subscriptions/synthetic/pause")
    assert kwargs["json"] == {"reason": "fixture"}
    assert kwargs["timeout"] == 10.0
    response.raise_for_status.assert_called_once()

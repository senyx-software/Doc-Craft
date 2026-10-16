import importlib.util
from pathlib import Path
import pytest
path=Path(__file__).parents[1]/"app"/"services"/"document_contract.py"
spec=importlib.util.spec_from_file_location("isolated_document_contract",path)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
BASE={"businessName":"Nexora","clientName":"Acme","invoiceNumber":"INV-1","issueDate":"2026-10-12","dueDate":"2026-11-12","currency":"USD","lineItems":[{"description":"Design","quantity":2,"unitPrice":100}],"taxRate":0}
@pytest.mark.parametrize("kind",list(module.CONTRACT["documents"]))
def test_type_contract(kind):
    result=module.validated_document(kind,{**BASE,"paymentMethod":"Cash","subject":"Software project"})
    assert result["subtotal"]==200
    assert result["taxAmount"]==0
    assert result["totalDue"]==200
    assert result["currency"]=="USD"
    assert result["currencySymbol"]=="$"
@pytest.mark.parametrize("items",[[],[{"description":"Design"}],[{"description":"Design","quantity":1}],[{"description":"Design","quantity":True,"unitPrice":2}]])
def test_missing_numeric_values_are_not_invented(items):
    with pytest.raises(ValueError):module.validated_document("invoice",{**BASE,"lineItems":items})
def test_alias_and_currency_agree():
    result=module.validated_document("invoice",{**BASE,"companyName":"Nexora","currencySymbol":"$"})
    assert result["businessName"]=="Nexora"
    assert result["currency"]=="USD"
def test_conflicting_alias_fails():
    with pytest.raises(ValueError):module.validated_document("invoice",{**BASE,"companyName":"Other"})
def test_invalid_date_fails():
    with pytest.raises(ValueError):module.validated_document("invoice",{**BASE,"issueDate":"2026-02-30"})
def test_conditional_receipt_reference():
    with pytest.raises(ValueError):module.validated_document("receipt",{**BASE,"paymentMethod":"Bank Transfer"})

def test_exact_half_cent_rounding_agrees_with_shared_javascript_contract():
    result=module.validated_document("invoice",{**BASE,"lineItems":[{"description":"Design","quantity":3,"unitPrice":2.675}],"taxRate":7.5})
    assert result["subtotal"]==8.03
    assert result["taxAmount"]==0.60
    assert result["totalDue"]==8.63

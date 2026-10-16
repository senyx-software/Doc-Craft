from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from shared import entitlements

POLICY={'version':1,'user_id':'owner','plan':'free','account_enabled':True,'daily_quota':3,'custom_logo':False,'custom_branding':False,'premium_templates':False,'pdf_watermark':True,'priority_processing':False,'ai_enabled':True,'ai_provider':'groq','claude_models':['claude-haiku-4-5'],'groq_models':None,'retention_days':None,'quota_policy':{'unit':'ai_provider_requests_plus_server_pdf_generations','reset':'first_metered_request','window_hours':20,'browser_exports':'local_unmetered_artifacts'}}
@pytest.mark.parametrize('change',[{}, {'user_id':'other'}, {'quota_policy':{}},{'daily_quota':True},{'custom_logo':'true'},{'retention_days':0},{'ai_provider':'unknown'},{'claude_models':[1]}])
def test_python_consumer_validates_the_same_contract_and_fails_closed(monkeypatch,change):
    policy={**POLICY,**change};monkeypatch.setattr(entitlements,'service_request',lambda *args,**kwargs:SimpleNamespace(raise_for_status=lambda:None,json=lambda:policy))
    if not change:assert entitlements.get_entitlements('owner')==POLICY
    else:
        with pytest.raises(HTTPException) as error:entitlements.get_entitlements('owner')
        assert error.value.status_code==503

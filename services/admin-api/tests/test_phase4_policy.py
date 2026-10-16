from datetime import datetime,timedelta,timezone
import concurrent.futures
import json
import uuid
import pytest
import pyotp
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app.services.entitlements import evaluate
from app.repositories.plan_repository import SEED_PLANS
from app.repositories.config_repository import SEED_DOMAIN_CONFIGS
from app.db.admin_db import admin_db
from app.security.totp import verify_totp_code
from app.repositories.admin_user_repository import admin_user_repository
from shared.sealed_secret import seal_secret,open_secret
from tests.conftest import seed_admin_with_totp,action_code

NOW=datetime(2026,10,16,tzinfo=timezone.utc)
PLANS={plan.code:plan.model_dump(mode='json') for plan in SEED_PLANS}
FLAGS=SEED_DOMAIN_CONFIGS['feature_flags'];ROUTING=SEED_DOMAIN_CONFIGS['ai_model_routing']

def policy(plan='free',status='active',expires=NOW+timedelta(days=1),override=None,flags=None,account_status='active'):
    return evaluate({'id':'owner','status':account_status,'plan':'max'}, {'plan':plan,'status':status,'currentPeriodEnd':expires.isoformat()},PLANS,FLAGS if flags is None else flags,ROUTING,override=override,now=NOW)

@pytest.mark.parametrize('plan,limit,premium,model',[('free',3,False,'claude-haiku-4-5'),('pro',10,True,'claude-sonnet-4-5'),('max',25,True,'claude-sonnet-4-5')])
def test_one_contract_drives_plan_benefits(plan,limit,premium,model):
    result=policy(plan)
    assert result['daily_quota']==limit
    assert result['custom_logo']==result['custom_branding']==result['premium_templates']==premium
    assert result['pdf_watermark'] is not premium
    assert result['max_model']==model
    assert result['priority_processing'] is (plan=='max')
    assert result['quota_policy']=={'unit':'ai_provider_requests_plus_server_pdf_generations','reset':'first_metered_request','window_hours':20,'browser_exports':'local_unmetered_artifacts'}

@pytest.mark.parametrize('status',['past_due','expired','cancelled','canceled','paused'])
def test_non_entitled_subscription_cannot_use_stale_paid_display_plan(status):
    assert policy('max',status=status)['plan']=='free'

def test_expiry_upgrade_downgrade_override_and_global_disable():
    assert policy('max',expires=NOW)['plan']=='free'
    assert policy('max')['plan']=='max'
    assert policy('pro')['daily_quota']==10
    override={'plan':'max','features':{'daily_quota':41,'retention_days':7},'expires_at':(NOW+timedelta(seconds=1)).isoformat()}
    assert policy('free',override=override)['daily_quota']==41
    assert policy('free',override=override)['retention_days']==7
    override['expires_at']=NOW.isoformat()
    assert policy('free',override=override)['daily_quota']==3
    disabled={**FLAGS,'customLogo':{'enabled':False,'plan_matrix':{'max':True}}}
    assert not policy('max',override={'features':{'customLogo':True}},flags=disabled)['custom_logo']
    assert not policy('max',flags={**FLAGS,'priority_pdf_rendering':{'plan_matrix':{'max':False}}})['priority_processing']

def test_suspension_dominates_every_grant_and_model_access():
    result=policy('max',account_status='suspended',override={'plan':'max','features':{'ai_enabled':True,'customLogo':True,'daily_quota':-1}})
    assert not result['account_enabled'] and result['daily_quota']==0
    assert not result['custom_logo'] and result['claude_models']==[] and not result['ai_enabled']

def test_encrypted_authenticator_storage_and_atomic_cross_action_replay():
    token,secret=seed_admin_with_totp('phase4-replay@example.com','Super Admin',['*'],True)
    account=admin_user_repository.get_by_email('phase4-replay@example.com')
    stored=admin_db.fetch_one('SELECT totp_secret FROM admin_users WHERE id=?',(account.id,))['totp_secret']
    assert stored.startswith('enc:v1:') and secret not in stored
    assert open_secret(stored,account.id)==secret
    with pytest.raises(Exception):open_secret(stored,'different-account')
    code=pyotp.TOTP(secret).now()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        outcomes=list(pool.map(lambda _:verify_totp_code(secret,code,account.id),range(16)))
    assert outcomes.count(True)==1
    assert not verify_totp_code(secret,code,account.id)
    future=pyotp.TOTP(secret).at(datetime.now(timezone.utc)+timedelta(seconds=30))
    assert verify_totp_code(secret,future,account.id)
    assert not verify_totp_code(secret,code,account.id)

def test_keyring_rotation_retains_read_support_and_rejects_removed_keys(monkeypatch):
    import os,base64
    from shared.service_auth import config
    identity=config();secret='SYNTHETIC-TOTP-KEY';sealed=seal_secret(secret,'owner')
    identity['totp_encryption']['keys']['v2']=base64.urlsafe_b64encode(b'v'*32).decode().rstrip('=')
    identity['totp_encryption']['active_kid']='v2';monkeypatch.setenv('SERVICE_AUTH_CONFIG_JSON',json.dumps(identity))
    assert open_secret(sealed,'owner')==secret
    assert seal_secret(secret,'owner').startswith('enc:v1:v2:')
    del identity['totp_encryption']['keys']['v1'];monkeypatch.setenv('SERVICE_AUTH_CONFIG_JSON',json.dumps(identity))
    with pytest.raises(Exception):open_secret(sealed,'owner')

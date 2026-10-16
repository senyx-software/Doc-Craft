"""Authoritative effective policy. Callers may not supply account/plan claims."""
from datetime import datetime, timezone
import json
import os
from fastapi import HTTPException
from shared.service_auth import service_request
from app.db.admin_db import admin_db
from app.repositories.plan_repository import plan_repository
from app.repositories.config_repository import config_repository

FEATURES = {'customLogo','allTemplates','watermark_removal','priority_pdf_rendering','retention_days','ai_enabled','max_model','groq_models','daily_quota','quota_window_hours'}
MODELS = {'claude-haiku-4-5','claude-sonnet-4-5'}


def instant(value):
    if not value: return None
    parsed = datetime.fromisoformat(str(value).replace('Z','+00:00')) if not isinstance(value,datetime) else value
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def initialize():
    admin_db.execute('''CREATE TABLE IF NOT EXISTS entitlement_overrides (
        user_id TEXT PRIMARY KEY, plan TEXT, features_json TEXT NOT NULL,
        expires_at TEXT, reason TEXT NOT NULL, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL)''')


def get_override(user_id, now=None):
    row=admin_db.fetch_one('SELECT * FROM entitlement_overrides WHERE user_id=?',(user_id,))
    if not row or (instant(row['expires_at']) and instant(row['expires_at']) <= (now or datetime.now(timezone.utc))): return None
    return {**row,'features':json.loads(row['features_json'])}


def save_override(user_id, data, actor_id):
    admin_db.execute('''INSERT INTO entitlement_overrides(user_id,plan,features_json,expires_at,reason,actor_id,updated_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,
        features_json=excluded.features_json,expires_at=excluded.expires_at,reason=excluded.reason,
        actor_id=excluded.actor_id,updated_at=excluded.updated_at''',
        (user_id,data.get('plan'),json.dumps(data.get('features',{})),data.get('expires_at'),data['reason'],actor_id,datetime.now(timezone.utc).isoformat()))


def evaluate(account, subscription, plans, flags, routing, override=None, quota_override=None, now=None):
    now=now or datetime.now(timezone.utc)
    enabled=account.get('status')=='active' and not account.get('deletedAt')
    guest=bool(account.get('isGuest')) or str(account['id']).startswith('guest_')
    subscription=subscription or {}
    valid_subscription=subscription.get('status') in ('active','trialing','cancelled','canceled') and instant(subscription.get('currentPeriodEnd')) and instant(subscription['currentPeriodEnd']) > now
    # Immediate cancellation is not paid access. Scheduled cancellation retains
    # the already-paid period; the provider reconciliation owns that decision.
    if subscription.get('status') in ('cancelled','canceled') and not subscription.get('cancelAtPeriodEnd'): valid_subscription=False
    override=override if override and (not instant(override.get('expires_at')) or instant(override['expires_at']) > now) else None
    plan='guest' if guest else (subscription.get('plan') if valid_subscription else 'free')
    if override and not guest and override.get('plan'): plan=override['plan']
    config=plans.get(plan)
    if not config or config.get('status','active')!='active':
        plan='guest' if guest else 'free';config=plans.get(plan)
    if not config: raise HTTPException(503,'Entitlement plan configuration unavailable')
    defaults = {'customLogo': {'pro':True,'max':True}, 'allTemplates': {'pro':True,'max':True}}
    values={key: matrix.get(plan,False) for key,matrix in defaults.items()}
    configured=dict(config.get('feature_flags') or {})
    values.update(configured)
    # Plan flags are the configured baseline; global enabled=false is a kill
    # switch. A global matrix supplies values absent from that baseline.
    for key,flag in flags.items():
        if isinstance(flag,dict):
            if flag.get('enabled') is False: values[key]=False
            else: values[key]=flag.get('plan_matrix',{}).get(plan,values.get(key,flag.get('default')))
    values.update((override or {}).get('features',{}))
    for key,flag in flags.items():
        if isinstance(flag,dict) and flag.get('enabled') is False: values[key]=False
    def boolean(key,default=False): return values.get(key,default) is True
    limit=values.get('daily_quota',config.get('monthly_quota',0))
    if quota_override and (not instant(quota_override.get('expires_at')) or instant(quota_override['expires_at'])>now):limit=quota_override['custom_quota']
    if type(limit) is not int or (limit != -1 and limit < 0): raise HTTPException(503,'Invalid daily quota policy')
    model=values.get('max_model',routing.get(plan,{}).get('max_model','claude-haiku-4-5'))
    if model not in MODELS: raise HTTPException(503,'Invalid model policy')
    models=['claude-haiku-4-5'] if model=='claude-haiku-4-5' else (['claude-haiku-4-5','claude-sonnet-4-5'] if model=='claude-sonnet-4-5' else [])
    groq=values.get('groq_models',routing.get(plan,{}).get('groq_models'))
    if groq is not None and (not isinstance(groq,list) or any(not isinstance(item,str) for item in groq)):raise HTTPException(503,'Invalid model policy')
    retention=values.get('retention_days')
    if retention is not None and (type(retention) is not int or not 1<=retention<=3650):raise HTTPException(503,'Invalid retention policy')
    hours=values.get('quota_window_hours',20)
    if type(hours) is not int or not 1<=hours<=720:raise HTTPException(503,'Invalid quota window policy')
    ai=enabled and boolean('ai_enabled',True)
    return {'version':1,'user_id':account['id'],'account_enabled':enabled,'plan':plan,
        'subscription_status':subscription.get('status','none'),'subscription_expires_at':subscription.get('currentPeriodEnd'),
        'source':'admin_override' if override else ('subscription' if valid_subscription else 'baseline'),
        'override_expires_at':(override or {}).get('expires_at'),'daily_quota':limit if enabled else 0,
        'custom_logo':enabled and boolean('customLogo'),'custom_branding':enabled and boolean('customLogo'),
        'premium_templates':enabled and boolean('allTemplates'),'pdf_watermark':not(enabled and boolean('watermark_removal')),
        'priority_processing':enabled and boolean('priority_pdf_rendering'),'retention_days':retention,
        'ai_enabled':ai,'ai_provider':routing.get('provider','groq'),'claude_models':models if ai else [],'max_model':model if ai and model in MODELS else None,
        'groq_models':groq if ai else [],'feature_flags':values,
        'quota_policy':{'unit':'ai_provider_requests_plus_server_pdf_generations','reset':'first_metered_request','window_hours':hours,'browser_exports':'local_unmetered_artifacts'}}


def effective_entitlements(user_id):
    try:
        response=service_request('auth','GET',os.getenv('AUTH_SERVICE_URL','http://localhost:3011')+'/internal/users/'+__import__('urllib.parse',fromlist=['quote']).quote(user_id,safe=''),timeout=3)
        response.raise_for_status();account=response.json()
        subscription=None
        if not account.get('isGuest') and not user_id.startswith('guest_'):
            response=service_request('payment','GET',os.getenv('PAYMENT_SERVICE_URL','http://localhost:3014')+'/v1/payment/admin/entitlements/'+__import__('urllib.parse',fromlist=['quote']).quote(user_id,safe=''),timeout=3)
            response.raise_for_status();subscription=response.json().get('subscription')
        plans={p.code:p.model_dump(mode='json') for p in plan_repository.list_active_plans()}
        # Read persisted policy, not a potentially stale cached allow decision.
        def domain(name):
            entry=config_repository.get_domain_config(name)
            return entry.data if entry else {}
        quota=plan_repository.get_user_quota_override(user_id)
        return evaluate(account,subscription,plans,domain('feature_flags'),domain('ai_model_routing'),get_override(user_id),quota.model_dump(mode='json') if quota else None)
    except HTTPException:raise
    except Exception as error:raise HTTPException(503,'Current entitlements cannot be verified') from error

if os.getenv("ADMIN_RUN_MIGRATIONS","true")=="true":initialize()

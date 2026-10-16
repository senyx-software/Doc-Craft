"""Read the authoritative control-plane contract; never trust caller plan headers."""
import os
from fastapi import HTTPException
from shared.service_auth import service_request


def get_entitlements(user_id):
    from urllib.parse import quote
    try:
        response = service_request('admin-api', 'GET', os.getenv('ADMIN_API_SERVICE_URL', 'http://localhost:3018') + '/api/v1/internal/entitlements/' + quote(user_id, safe=''), timeout=5)
        response.raise_for_status()
        policy = response.json()
        bools = ('account_enabled','custom_logo','custom_branding','premium_templates','pdf_watermark','priority_processing','ai_enabled')
        if policy.get('version') != 1 or policy.get('user_id') != user_id or any(type(policy.get(key)) is not bool for key in bools):
            raise ValueError('Invalid entitlement contract')
        if type(policy.get('daily_quota')) is not int or policy['daily_quota'] < -1:
            raise ValueError('Invalid daily quota')
        window=policy.get('quota_policy',{})
        if window.get('unit')!='ai_provider_requests_plus_server_pdf_generations' or window.get('reset')!='first_metered_request' or window.get('browser_exports')!='local_unmetered_artifacts' or type(window.get('window_hours')) is not int or not 1<=window['window_hours']<=720:
            raise ValueError('Invalid quota policy')
        if policy.get('ai_provider','groq') not in ('groq','claude'):raise ValueError('Invalid provider')
        if policy.get('retention_days') is not None and (type(policy['retention_days']) is not int or not 1<=policy['retention_days']<=3650):raise ValueError('Invalid retention')
        for field in ('claude_models','groq_models'):
            value=policy.get(field)
            if field=='groq_models' and value is None:continue
            if not isinstance(value,list) or any(not isinstance(item,str) for item in value):raise ValueError('Invalid models')
        return policy
    except Exception as error:
        raise HTTPException(503, 'Current entitlements cannot be verified') from error


def require_entitlement(policy, feature):
    if not policy['account_enabled'] or policy.get(feature) is not True:
        raise HTTPException(403, 'This account is not permitted to use this feature')

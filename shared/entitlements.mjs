import { serviceFetch } from './service-auth.mjs';

/** No cached allow decisions: expiry, suspension and overrides apply on each operation. */
export async function getEntitlements(userId) {
  // The control plane verifies Auth/Billing and reads current policy from the database.
  const response = await serviceFetch('admin-api', `${process.env.ADMIN_API_SERVICE_URL || 'http://localhost:3018'}/api/v1/internal/entitlements/${encodeURIComponent(userId)}`, {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw Object.assign(new Error('Current entitlements cannot be verified'), {statusCode:503, code:'POLICY_UNAVAILABLE'});
  return validateEntitlements(await response.json(), userId);
}

export function validateEntitlements(policy, userId) {
  const bools = ['account_enabled','custom_logo','custom_branding','premium_templates','pdf_watermark','priority_processing','ai_enabled'];
  if (policy?.version !== 1 || policy.user_id !== userId || typeof policy.plan !== 'string' ||
      policy.ai_provider !== undefined && !['groq','claude'].includes(policy.ai_provider) ||
      policy.quota_policy?.unit!=='ai_provider_requests_plus_server_pdf_generations' || policy.quota_policy?.reset!=='first_metered_request' ||
      !Number.isSafeInteger(policy.quota_policy?.window_hours) || policy.quota_policy.window_hours<1 || policy.quota_policy.window_hours>720 ||
      policy.quota_policy.browser_exports!=='local_unmetered_artifacts' ||
      bools.some(key => typeof policy[key] !== 'boolean') || !Number.isSafeInteger(policy.daily_quota) || policy.daily_quota < -1 ||
      !Array.isArray(policy.claude_models) || !policy.claude_models.every(value=>typeof value==='string') ||
      policy.groq_models !== null && (!Array.isArray(policy.groq_models) || !policy.groq_models.every(value=>typeof value==='string')) ||
      policy.retention_days !== null && (!Number.isSafeInteger(policy.retention_days) || policy.retention_days<1)) {
    throw Object.assign(new Error('Invalid entitlement contract'), {statusCode:503, code:'POLICY_UNAVAILABLE'});
  }
  return policy;
}

export function requireEntitlement(policy, feature) {
  if (!policy.account_enabled || policy[feature] !== true) throw Object.assign(new Error('This account is not permitted to use this feature'), {statusCode:403,code:'ENTITLEMENT_DENIED'});
}

/** Explicit user-facing projection; new internal policy keys stay private. */
export function publicEntitlements(policy) {
  return Object.fromEntries(['version','user_id','account_enabled','plan','subscription_status','subscription_expires_at',
    'daily_quota','custom_logo','custom_branding','premium_templates','pdf_watermark','priority_processing','retention_days','ai_enabled','quota_policy']
    .filter(key=>policy[key]!==undefined).map(key=>[key,policy[key]]));
}

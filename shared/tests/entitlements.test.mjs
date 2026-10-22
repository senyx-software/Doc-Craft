import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEntitlements,requireEntitlement} from '../entitlements.mjs';
const policy={version:1,user_id:'owner',plan:'free',account_enabled:true,custom_logo:false,custom_branding:false,premium_templates:false,pdf_watermark:true,priority_processing:false,ai_enabled:true,daily_quota:3,claude_models:['claude-haiku-4-5'],groq_models:null,retention_days:null,quota_policy:{unit:'ai_provider_requests_plus_server_pdf_generations',reset:'first_metered_request',window_hours:20,browser_exports:'local_unmetered_artifacts'}};
test('rejects wrong-owner, malformed and fail-open entitlement envelopes',()=>{
 assert.equal(validateEntitlements(policy,'owner'),policy);
 for(const change of [{user_id:'victim'},{version:2},{daily_quota:NaN},{daily_quota:-2},{premium_templates:'true'},{groq_models:['valid',42]},{retention_days:0},{quota_policy:{window_hours:0}},{ai_provider:'unsupported'}])assert.throws(()=>validateEntitlements({...policy,...change},'owner'));
 assert.throws(()=>requireEntitlement(policy,'custom_logo'));
 assert.throws(()=>requireEntitlement({...policy,account_enabled:false,custom_logo:true},'custom_logo'));
});

test('user entitlement responses retain product features and omit all model/routing metadata',async()=>{
 const {publicEntitlements}=await import('../entitlements.mjs');
 const publicPolicy=publicEntitlements({...policy,ai_provider:'groq',max_model:'internal-model',routing:{secret:'internal'},feature_flags:{internal_provider:'hidden'}});
 assert.equal(publicPolicy.plan,'free');assert.equal(publicPolicy.ai_enabled,true);assert.equal(publicPolicy.quota_policy.window_hours,20);
 for(const key of ['ai_provider','claude_models','groq_models','max_model','routing','feature_flags'])assert.equal(publicPolicy[key],undefined);
});

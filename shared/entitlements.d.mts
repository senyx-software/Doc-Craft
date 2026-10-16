export interface Entitlements {
  version:1; user_id:string; account_enabled:boolean; plan:string; subscription_status:string;
  subscription_expires_at:string|null; source:string; override_expires_at:string|null;
  daily_quota:number; custom_logo:boolean; custom_branding:boolean; premium_templates:boolean;
  pdf_watermark:boolean; priority_processing:boolean; retention_days:number|null; ai_enabled:boolean;
  ai_provider?:'groq'|'claude'; claude_models:string[]; max_model:string|null; groq_models:string[]|null; feature_flags:Record<string,unknown>;
  quota_policy:{unit:string;reset:string;window_hours:number;browser_exports:string};
}
export function getEntitlements(userId:string):Promise<Entitlements>;
export function validateEntitlements(policy:unknown,userId:string):Entitlements;
export function requireEntitlement(policy:Entitlements,feature:keyof Entitlements):void;

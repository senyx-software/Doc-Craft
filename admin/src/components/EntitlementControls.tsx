import {useEffect,useState} from 'react';
import {adminApiClient} from '../api/adminApiClient';
import type {Entitlements} from '../../../shared/entitlements.mjs';

export default function EntitlementControls({userId,onSaved}:{userId:string;onSaved?:()=>void}) {
  const [policy,setPolicy]=useState<Entitlements|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [plan,setPlan]=useState(''),[features,setFeatures]=useState('{}'),[expiry,setExpiry]=useState(''),[reason,setReason]=useState('');
  const load=async()=>{const result=await adminApiClient.getEntitlements(userId);setPolicy(result.entitlements);};
  useEffect(()=>{let active=true;adminApiClient.getEntitlements(userId).then(result=>{if(active)setPolicy(result.entitlements);}).catch(()=>{if(active)setError('Current entitlements unavailable');});return()=>{active=false;};},[userId]);
  const save=async(remove=false)=>{
    setBusy(true);setError('');
    try {
      if(remove)await adminApiClient.deleteEntitlements(userId);
      else await adminApiClient.saveEntitlements(userId,{plan:plan||null,features:JSON.parse(features),expires_at:expiry?new Date(expiry).toISOString():null,reason});
      await load();onSaved?.();
    } catch(error){setError(error instanceof Error?error.message:'Policy update failed');}
    finally {setBusy(false);}
  };
  return <section className="rounded-xl border p-4 space-y-3" aria-label="Effective account entitlements">
    <h3 className="font-semibold">Effective account entitlements</h3>
    {policy&&<><p>Plan: {policy.plan} · Subscription: {policy.subscription_status} · Source: {policy.source}</p>
      <p>Allowance: {policy.daily_quota===-1?'Unlimited':policy.daily_quota} AI requests + server PDFs per {policy.quota_policy.window_hours} hours from first use. Browser exports are unmetered.</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">{(['custom_logo','premium_templates','pdf_watermark','priority_processing','ai_enabled'] as const).map(key=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{policy[key]?'Yes':'No'}</dd></div>)}</dl>
      <p>Retention: {policy.retention_days===null?'No configured expiry':`${policy.retention_days} days`} · Max model: {policy.max_model||'None'}</p></>}
    <label className="block">Override plan (blank keeps subscription)<input className="block border rounded p-2 bg-transparent" value={plan} onChange={event=>setPlan(event.target.value)} placeholder="free, pro, max"/></label>
    <label className="block">Feature overrides (JSON)<textarea className="block w-full border rounded p-2 bg-transparent font-mono" value={features} onChange={event=>setFeatures(event.target.value)} aria-describedby="policy-fields"/></label>
    <p id="policy-fields" className="text-xs">Supported: customLogo, allTemplates, watermark_removal, priority_pdf_rendering, retention_days, ai_enabled, max_model, groq_models, daily_quota, quota_window_hours.</p>
    <label className="block">Expires at<input type="datetime-local" className="block border rounded p-2 bg-transparent" value={expiry} onChange={event=>setExpiry(event.target.value)}/></label>
    <label className="block">Reason<input className="block w-full border rounded p-2 bg-transparent" minLength={5} value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <button type="button" className="border rounded p-2 mr-2" disabled={busy||reason.length<5} onClick={()=>void save()}>Save with second factor</button>
    <button type="button" className="border rounded p-2" disabled={busy} onClick={()=>void save(true)}>Remove override</button>
    {error&&<p role="alert" className="text-red-500">{error}</p>}
  </section>;
}

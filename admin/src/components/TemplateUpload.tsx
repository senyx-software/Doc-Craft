import {useState} from 'react';
import {adminApiClient} from '../api/adminApiClient';

export default function TemplateUpload({onSaved}:{onSaved:()=>void}) {
  const [name,setName]=useState(''),[owner,setOwner]=useState(''),[kind,setKind]=useState('invoice'),[scope,setScope]=useState('private');
  const [family,setFamily]=useState(''),[premium,setPremium]=useState(false),[source,setSource]=useState('<div><h1>{{businessName}}</h1><p>{{clientName}}</p>{{lineItems}}<p>{{totalDue}}</p></div>'),[assets,setAssets]=useState('{}'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const upload=async()=>{
    setBusy(true);setError('');
    try {await adminApiClient.uploadTemplate({name,owner_id:owner,document_type:kind,visibility:scope,premium,family_id:family||null,html:source,assets:JSON.parse(assets)});onSaved();}
    catch(error){setError(error instanceof Error?error.message:'Upload rejected');}finally{setBusy(false);}
  };
  return <details className="border rounded p-3 mb-4"><summary className="cursor-pointer font-semibold">Upload a template or new version</summary>
    <div className="space-y-3 mt-3">
      <label className="block">Name<input className="block w-full border bg-transparent p-2" value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="block">Owner account ID<input className="block w-full border bg-transparent p-2" value={owner} onChange={e=>setOwner(e.target.value)}/></label>
      <label className="block">Document type<select className="block border bg-transparent p-2" value={kind} onChange={e=>setKind(e.target.value)}>{['invoice','quotation','proposal','receipt','purchase_order'].map(type=><option key={type}>{type}</option>)}</select></label>
      <label className="block">Availability<select className="block border bg-transparent p-2" value={scope} onChange={e=>setScope(e.target.value)}><option value="private">Owner account only</option><option value="public">All eligible users</option></select></label>
      <label className="block"><input type="checkbox" checked={premium} onChange={e=>setPremium(e.target.checked)}/> Require premium templates entitlement</label>
      <label className="block">Existing family ID (new version or visibility change)<input className="block w-full border bg-transparent p-2" value={family} onChange={e=>setFamily(e.target.value)}/></label>
      <label className="block">Restricted HTML<textarea className="block w-full border bg-transparent p-2 font-mono" rows={7} value={source} onChange={e=>setSource(e.target.value)}/></label>
      <label className="block">Embedded PNG/JPEG assets (JSON name → data URI)<textarea className="block w-full border bg-transparent p-2 font-mono" value={assets} onChange={e=>setAssets(e.target.value)}/></label>
      <p className="text-xs">Use simple field placeholders and inline styles. Network resources, scripts, SVG, template expressions and external fonts are rejected. Review and approval are required before publication. Publishing an older approved version restores it.</p>
      <button type="button" className="border rounded p-2" disabled={busy||!name||!owner} onClick={()=>void upload()}>Upload for review</button>
      {error&&<p role="alert" className="text-red-500">{error}</p>}
    </div>
  </details>;
}

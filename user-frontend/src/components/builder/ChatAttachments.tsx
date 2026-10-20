import { useEffect, useRef, useState } from 'react';
import { Plus, ImagePlus, PenTool, Loader2, Stamp } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { prepareDocumentAsset } from '../../utils/prepareDocumentAsset';
import type { DocumentAsset } from '../../../../shared/document-assets.mjs';
import { ApiRequestError } from '../../api/client';
import { useQuotaStore } from '../../store/quotaStore';

export default function ChatAttachments() {
  const {sessionId,readOnly,isLoading,saveDocumentAsset}=useChatStore();
  const entitlements=useQuotaStore(state=>state.entitlements);
  const [open,setOpen]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState<string|null>(null);
  const fileInput=useRef<HTMLInputElement>(null), root=useRef<HTMLDivElement>(null), role=useRef<DocumentAsset['role']>('logo');
  const [pending, setPending]=useState<{asset:DocumentAsset;sessionId:string|null}|null>(null);
  useEffect(()=>{
    if(!open)return;
    const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
  },[open]);
  const pick=(kind:DocumentAsset['role'])=>{
    role.current=kind;setOpen(false);setError(null);setPending(null);
    if(kind==='logo'&&entitlements?.custom_logo===false){setError('Business logos are a PRO feature and are not enabled for your account.');return;}
    fileInput.current?.click();
  };
  const upload=async(file?:File)=>{
    if(!file)return;
    const target=sessionId;
    setUploading(true);setError(null);
    try {
      const asset=await prepareDocumentAsset(file,role.current);
      if(useChatStore.getState().sessionId!==target)return;
      setPending({asset,sessionId:target});
      await saveDocumentAsset(asset);
      setPending(null);
    } catch(e){if(useChatStore.getState().sessionId===target){setError(e instanceof Error?e.message:'Upload failed. Please retry.');if(e instanceof ApiRequestError&&[400,403,422].includes(e.status))setPending(null);}}
    finally {setUploading(false);}
  };
  const retry=async()=>{
    const upload=pending;if(!upload||upload.sessionId!==sessionId)return;
    setUploading(true);setError(null);
    try {await useChatStore.getState().fetchMissingFields();await saveDocumentAsset(upload.asset);setPending(null);}
    catch(e){if(useChatStore.getState().sessionId===upload.sessionId){setError(e instanceof Error?e.message:'Upload failed. Please retry.');if(e instanceof ApiRequestError&&[400,403,422].includes(e.status))setPending(null);}}
    finally{setUploading(false);}
  };
  return <div ref={root} className="relative flex-shrink-0">
    <button type="button" aria-label="Add logo, image, or signature" aria-haspopup="menu" aria-expanded={open}
      disabled={!sessionId||readOnly||isLoading||uploading} onClick={()=>setOpen(!open)} title={readOnly?'Open an editable draft to add images':'Add a logo, image, or signature'}
      className="w-6 h-6 rounded-full flex items-center justify-center text-appTextSecondary hover:bg-appSurface hover:text-appTextPrimary disabled:opacity-40">
      {uploading?<Loader2 size={13} className="animate-spin"/>:<Plus size={13}/>}
    </button>
    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose document image" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(file);}}/>
    {open&&<div role="menu" aria-label="Add to document" className="absolute bottom-9 left-0 z-50 w-56 rounded-lg border border-appBorder bg-appSurface shadow-xl p-2 text-appTextPrimary">
      <p className="text-[11px] text-appTextSecondary px-2 pb-2">Automatically fit and position</p>
      {([['logo','Business logo',Stamp],['image','Image',ImagePlus],['signature','Signature image',PenTool]] as const).map(([kind,label,Icon])=>
        <button key={kind} type="button" role="menuitem" onClick={()=>pick(kind)} className="flex items-center gap-2 w-full px-2 py-2 rounded text-sm hover:bg-appBg"><Icon size={15}/>{label}{kind==='logo'&&<span className="ml-auto rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-500">PRO</span>}</button>)}
      <p className="text-[10px] text-appTextSecondary px-2 pt-2">PNG, JPG, or WebP · up to 8 MB</p>
    </div>}
    {error&&<div role="alert" className="absolute bottom-9 left-0 z-50 w-64 border border-red-400 rounded-lg bg-appSurface p-3 text-xs text-red-500">{error}{pending&&<button type="button" disabled={uploading} onClick={()=>void retry()} className="block mt-2 underline">Retry upload</button>}<button type="button" onClick={()=>setError(null)} className="block mt-2 underline">Dismiss</button></div>}
  </div>;
}

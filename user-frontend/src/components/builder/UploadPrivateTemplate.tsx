import {useState} from 'react';
import {uploadPrivateTemplate} from '../../api/documents';
import {prepareTemplateUpload} from '../../utils/templateUpload';

export default function UploadPrivateTemplate({documentType}:{documentType:string}) {
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [name,setName]=useState('');
  const upload=async(file?:File)=>{
    if(!file)return;
    setBusy(true);setMessage('');
    try {
      const payload=await prepareTemplateUpload(file,documentType);
      await uploadPrivateTemplate({...payload,name:name.trim()||payload.name});
      setMessage('Uploaded privately for administrator review. It will appear after approval and publication.');
    } catch(error){setMessage(error instanceof Error?error.message:'Template upload rejected');}
    finally{setBusy(false);}
  };
  return <details className="p-3 border-b border-appBorder text-sm"><summary className="cursor-pointer">Upload your company template</summary>
    <p className="my-2 text-xs">Your account only. Upload a PDF (up to 5 MB and 6 pages), restricted HTML, or a JSON template bundle (under 900 KB). PDFs become editable layouts with the original invoice values cleared. HTML and JSON templates use field placeholders. After administrator approval, edit the layout or fill it through chat.</p>
    <label className="block text-xs">Template name (optional)<input className="my-2 block w-full border border-appBorder bg-appBg p-2" maxLength={100} placeholder="Use the file name" value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
    <label className="block">Template file<input className="block w-full my-2" type="file" accept=".pdf,.html,.htm,.json,application/pdf,text/html,application/json" disabled={busy} onChange={event=>{void upload(event.target.files?.[0]);event.target.value='';}}/></label>
    {busy&&<p role="status" className="text-xs my-2">Uploading template…</p>}
    {message&&<p role="status" className="text-xs my-2">{message}</p>}
  </details>;
}

import {useState} from 'react';
import {uploadPrivateTemplate} from '../../api/documents';

export default function UploadPrivateTemplate({documentType}:{documentType:string}) {
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const upload=async(file?:File)=>{
    if(!file)return;
    if(file.size>900000){setMessage('Choose a template under 900 KB.');return;}
    setBusy(true);setMessage('');
    try {
      const text=await file.text();
      const payload=file.name.endsWith('.json')?JSON.parse(text):{name:file.name.replace(/\.html?$/i,''),document_type:documentType,html:text,assets:{}};
      await uploadPrivateTemplate(payload);
      setMessage('Uploaded privately for administrator review. It will appear after approval and publication.');
    } catch(error){setMessage(error instanceof Error?error.message:'Template upload rejected');}
    finally{setBusy(false);}
  };
  return <details className="p-3 border-b border-appBorder text-sm"><summary className="cursor-pointer">Upload your company template</summary>
    <p className="my-2 text-xs">Your account only. Upload restricted HTML or a JSON bundle with name, document_type, html, and embedded PNG/JPEG assets. An administrator must review and publish it.</p>
    <label className="block">Template file<input className="block w-full my-2" type="file" accept=".html,.htm,.json" disabled={busy} onChange={event=>{void upload(event.target.files?.[0]);event.target.value='';}}/></label>
    {message&&<p role="status" className="text-xs my-2">{message}</p>}
  </details>;
}

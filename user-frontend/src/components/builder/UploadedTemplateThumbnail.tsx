import {useEffect,useRef,useState} from 'react';
import {Loader2} from 'lucide-react';
import {getUploadedPreview} from '../../api/documents';

export default function UploadedTemplateThumbnail({id,name,slots,locked}:{id:string;name:string;slots:Record<string,unknown>;locked:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(false);
  const [html,setHtml]=useState('');
  const [failed,setFailed]=useState(false);
  const [scale,setScale]=useState(.3);
  useEffect(()=>{
    const element=root.current;if(!element)return;
    const resize=new ResizeObserver(([entry])=>setScale(Math.min(entry.contentRect.width/595,entry.contentRect.height/842)));
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'150px'});
    resize.observe(element);observer.observe(element);
    return()=>{resize.disconnect();observer.disconnect();};
  },[]);
  useEffect(()=>{
    if(!visible||locked)return;
    let current=true;
    getUploadedPreview(id,slots).then(result=>{if(current){setHtml(result.html);setFailed(false);}}).catch(()=>{if(current)setFailed(true);});
    return()=>{current=false;};
  },[id,slots,visible,locked]);
  return <div ref={root} className="absolute inset-0 overflow-hidden bg-white flex items-center justify-center pointer-events-none">
    {html?<iframe title={`${name} thumbnail`} sandbox="" srcDoc={html} tabIndex={-1} scrolling="no" className="absolute border-0 bg-white" style={{width:595,height:842,left:`calc(50% - ${595*scale/2}px)`,top:0,transform:`scale(${scale})`,transformOrigin:'top left',pointerEvents:'none'}}/>:failed?<span className="p-3 text-xs text-gray-500">Preview unavailable</span>:<Loader2 aria-label="Loading template preview" size={20} className="animate-spin text-brand-500"/>}
  </div>;
}

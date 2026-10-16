import { MAX_ASSET_LENGTH, type DocumentAsset } from '../../../shared/document-assets.mjs';

export async function prepareDocumentAsset(file:File, role:DocumentAsset['role']):Promise<DocumentAsset> {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG, or WebP image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('This image could not be opened. Choose a different file.'));image.src=url;});
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 24000000) throw new Error('Choose an image with fewer than 24 million pixels.');
    const canvas=document.createElement('canvas');
    let edge=768;
    while(edge>=96) {
      const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image processing is unavailable in this browser.');
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const src=canvas.toDataURL('image/png');
      if(src.length<=MAX_ASSET_LENGTH)return {id:'asset_'+crypto.randomUUID(),name:file.name.slice(0,120),role,src,width:canvas.width,height:canvas.height};
      edge=Math.floor(edge*.75);
    }
    throw new Error('This image is too detailed to upload. Choose a smaller image.');
  } finally {URL.revokeObjectURL(url);}
}

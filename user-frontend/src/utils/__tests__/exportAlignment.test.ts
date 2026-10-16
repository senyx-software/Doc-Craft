import {it,expect} from 'vitest';
import puppeteer from 'puppeteer';
import {createRequire} from 'node:module';
import {withExportFontMetrics} from '../exportFontMetrics';

declare global { interface Window { html2canvas?: typeof import('html2canvas').default } }

it('PDF rasterization matches browser text baselines with Tailwind image resets and preserves artwork',async()=>{
  const browser=await puppeteer.launch({headless:true,args:['--disable-dev-shm-usage']});
  try {
    const page=await browser.newPage();await page.setViewport({width:595,height:842,deviceScaleFactor:1});
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font-family:Arial;line-height:1.5}img{display:block;vertical-align:middle}</style>
      <div id="page" style="width:595px;height:842px;position:relative;background:white">
        <div style="position:absolute;left:64px;top:120px;width:491px;height:24px;background:#0097b2"></div>
        <div style="position:absolute;left:74px;top:125px;font-size:9.5px;font-weight:800;line-height:1.35;color:white">ACCOUNT DATA</div>
        <div style="position:absolute;left:64px;top:814px;width:200px;font-size:8.5px;line-height:1.35;color:#4a5568">No. 40/20, Sagabo Mawatha, Diggala Keselwattapanadura</div>
        <img id="artwork" width="120" height="30" style="position:absolute;left:64px;top:40px;width:120px;height:30px;object-fit:contain" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='30'%3E%3Crect width='120' height='30' fill='%232563eb'/%3E%3C/svg%3E"/>
      </div>`);
    await page.addScriptTag({path:createRequire(import.meta.url).resolve('html2canvas')});
    const native='data:image/png;base64,'+await page.screenshot({encoding:'base64'});
    const result=await page.evaluate(async(source:string,nativeSrc:string)=>{
      const h2c=window.html2canvas,element=document.getElementById('page');
      if(!h2c || !element)throw new Error('Renderer fixture not loaded');
      const old=(await h2c(element,{scale:1,logging:false})).toDataURL();
      const withMetrics=new Function('return ('+source+')')();
      const corrected=await withMetrics(async()=>{
        if(getComputedStyle(document.getElementById('artwork')!).display!=='block')throw new Error('Artwork display was changed');
        return (await h2c(element,{scale:1,logging:false})).toDataURL();
      });
      async function measure(src:string){
        const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=595;c.height=842;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);
        const data=ctx.getImageData(72,120,130,24).data,rows=[];
        for(let y=0;y<24;y++){let white=0;for(let x=0;x<130;x++){const i=(y*130+x)*4;if(data[i]>235&&data[i+1]>235&&data[i+2]>235)white++;}if(white>2)rows.push(y+120);}
        return {top:rows[0],bottom:rows.at(-1)};
      }
      const before=await measure(old),after=await measure(corrected),expected=await measure(nativeSrc);
      let cleanup=false;try{await withMetrics(async()=>{throw new Error('capture failed');});}catch{cleanup=!Array.from(document.head.querySelectorAll('style')).some(s=>s.textContent?.includes('visibility: hidden'));}
      return {before,after,expected,cleanup};
    },withExportFontMetrics.toString(),native);
    expect(result.before.top-result.expected.top).toBeGreaterThanOrEqual(3);
    expect(Math.abs(result.after.top-result.expected.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.after.bottom!-result.expected.bottom!)).toBeLessThanOrEqual(1);
    expect(result.cleanup).toBe(true);
  } finally {await browser.close();}
},20000);

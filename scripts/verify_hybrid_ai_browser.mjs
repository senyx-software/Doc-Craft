/** Browser checks of actual React screens/stores with an isolated fixture transport.
 * Backend authorization, budgets and persistence are tested separately by pytest/Vitest.
 * No production endpoints, credentials, model calls or external network are used.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer';
import {snapshot,applyCandidates} from '../shared/conversation-state.mjs';
import {resolveEditorCommand,applyEditorOperations} from '../shared/editor-commands.mjs';
import {localKnowledge} from '../shared/assistant-knowledge.mjs';
const root=resolve(import.meta.dirname,'..');
const checks=[];
const check=(name)=>checks.push({name,status:'passed'});
const fixtureToken='fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64')+'.fixture';
const provider={id:'p',name:'Fixture local runtime',kind:'ollama',endpoint:'http://127.0.0.1:11434/api',locality:'local',enabled:true,timeout_seconds:45,max_concurrency:1,requests_per_minute:30,credential_required:false};
const model={id:'m',name:'Fixture model',identifier:'fixture-identifier',provider_id:'p',runtime:'ollama',deployment:'self_hosted',enabled:true,context_window:32768,max_input_tokens:24000,max_output_tokens:2048,max_concurrency:1,capabilities:['chat','tools'],repository:null,revision:null,quantization:null,idle_unload_seconds:0,input_usd_per_million:0,output_usd_per_million:0,token_limit_parameter:'max_tokens'};
const registry={version:1,data:{enabled:false,providers:[provider],models:[model],plans:{},monthly_cloud_usd:0,local_max_concurrency:1,queue_timeout_seconds:8,local_min_available_mb:1024,local_max_cpu_percent:95},available_plans:[{code:'free',name:'Free'},{code:'pro',name:'Professional'}],permissions:Object.fromEntries(['ai_models','ai_assignments','ai_credentials','ai_routing','ai_usage','ai_deployments'].map(key=>[key,true])),credentials:[],health:[{model_id:'m',healthy:1,current:true,fresh:true,checked_at:new Date().toISOString(),last_success_at:new Date().toISOString(),latency_ms:10,code:'OK'}]};
const usage={month:'fixture',groups:[],queue:[],resources:{available_memory_mb:4096,cpu_load_percent:10,logical_cpus:2},accounting:'Fixture transport; no measured production costs.'};
const vite=await import(pathToFileURL(createRequire(import.meta.url).resolve('../admin/node_modules/vite')).href);
const servers=[];
async function server(dir,plugins=[]){const require=createRequire(resolve(root,dir,'package.json'));const tailwind=require('tailwindcss');const autoprefixer=require('autoprefixer');const config=(await import(pathToFileURL(resolve(root,dir,'tailwind.config.js')).href)).default;const instance=await vite.createServer({root:resolve(root,dir),configFile:resolve(root,dir,'vite.config.ts'),plugins,css:{postcss:{plugins:[tailwind({...config,content:[resolve(root,dir,'index.html'),resolve(root,dir,'src/**/*.{js,ts,jsx,tsx}')]}),autoprefixer()]}},optimizeDeps:{include:['react','react-dom/client']},server:{host:'127.0.0.1',port:0}});await instance.listen();servers.push(instance);return 'http://127.0.0.1:'+instance.httpServer.address().port;}
const browser=await puppeteer.launch({headless:true,args:['--disable-dev-shm-usage']});
try {
 const adminUrl=await server('admin');
 const admin=await browser.newPage();await admin.setViewport({width:1440,height:1000});
 const errors=[];admin.on('pageerror',error=>errors.push(error.message));
 await admin.evaluateOnNewDocument(token=>{localStorage.setItem('admin_token',token);localStorage.setItem('admin_user',JSON.stringify({id:'fixture',name:'Fixture Administrator',email:'fixture@example.test',role:'Super Admin',isSuperAdmin:true,permissions:['*']}));},fixtureToken);
 await admin.setRequestInterception(true);
 let credentialWrites=0,providerWrites=0;
 admin.on('request',async request=>{
  const url=new URL(request.url());if(request.url().startsWith(adminUrl)){await request.continue();return;}
  const path=url.pathname,method=request.method();let body={};
  if(method==='OPTIONS'){await request.respond({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});return;}
  if(path.endsWith('/admin/ai'))body=registry;
  else if(path.endsWith('/admin/ai/usage'))body=usage;
  else if(path.endsWith('/admin/ai/history'))body=[{version:1,created_at:new Date().toISOString()}];
  else if(path.includes('/admin/ai/audit'))body={items:[{id:'a',admin_email:'fixture@example.test',action:'provider.saved',created_at:new Date().toISOString(),details_json:'{"provider_id":"p"}'}],total:1};
  else if(path.endsWith('/admin/ai/providers')&&method==='POST'){const input=JSON.parse(request.postData());assert.equal(input.expected_version,registry.version);registry.data.providers.push(input.item);registry.version++;providerWrites++;body={version:registry.version,data:registry.data};}
  else if(path.endsWith('/credential')&&method==='PUT'){const input=JSON.parse(request.postData());assert.equal(input.secret,'fixture-browser-secret-123');credentialWrites++;registry.credentials=[{provider_id:'p',masked_identifier:'credential-fixture',generation:credentialWrites,revoked:0,updated_at:new Date().toISOString()}];body=registry.credentials[0];}
  else if(path.endsWith('/test'))body={healthy:true,code:'OK'};
  await request.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
 });
 for(const section of ['ai_providers','ai_models','ai_assignments','ai_routing','ai_credentials','ai_local','ai_usage','ai_health','ai_audit']){
  await admin.goto(adminUrl+'/'+section,{waitUntil:'networkidle0'});await admin.waitForFunction(()=>document.body.innerText.includes('DocCraft AI Management'));
  assert(!await admin.$('[role="alert"]'),section+' has an error');
 }
 assert.equal(errors.length,0,errors.join('\n'));check('All nine AI management screens render without browser errors');
 await admin.goto(adminUrl+'/ai_providers',{waitUntil:'networkidle0'});
 await admin.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add provider')).click());
 await admin.type('[aria-label="Provider name"]','Added in browser');await admin.type('[aria-label="Inference base URL"]','https://api.groq.com/openai/v1');
 await admin.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save provider').click());
 await admin.waitForFunction(()=>document.body.innerText.includes('Configuration saved.'));assert.equal(providerWrites,1);check('Provider form submits a versioned registry mutation');
 await admin.goto(adminUrl+'/ai_credentials',{waitUntil:'networkidle0'});
 for(let generation=1;generation<=2;generation++){
  await admin.evaluate(()=>[...document.querySelectorAll('button')].find(b=>/Add credential|Replace \/ rotate/.test(b.textContent)).click());
  await admin.type('[aria-label="New API credential"]','fixture-browser-secret-123');
  assert.equal(await admin.$eval('[aria-label="New API credential"]',el=>el.type),'password');
  await admin.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save credential securely').click());
  await admin.waitForFunction(n=>document.body.innerText.includes('generation '+n),{},generation);
  assert(!await admin.$('[aria-label="New API credential"]'));assert(!await admin.evaluate(()=>document.body.innerText.includes('fixture-browser-secret-123')));
 }
 check('Credential replacement/rotation clears password inputs and displays only masked metadata');

 let session={id:'browser-session',userId:'u',documentTypeId:'invoice',templateId:'tmpl_invoice_2023_03',status:'ACTIVE',slots:{businessName:'Nexora',clientName:'John',invoiceNumber:'INV-1',issueDate:'2026-10-21',dueDate:'2026-11-21',currency:'USD',lineItems:[{id:'laptops',description:'Laptops',quantity:3,unitPrice:500}]}};
 const html=()=>`<html><body><div id="root"></div><script type="module">
 import React from 'react';
 import {createRoot} from 'react-dom/client';
 import ChatPanel from '/src/components/builder/ChatPanel.tsx';
 import InvoiceCanvas from '/src/components/builder/InvoiceCanvas.tsx';
 import {useChatStore} from '/src/store/chatStore.ts';
 import {useDocumentStore} from '/src/store/documentStore.ts';
 import {useAuthStore} from '/src/store/authStore.ts';
 import '/src/index.css';
 const state=await fetch('/__hybrid_state.json').then(response=>response.json());
 localStorage.setItem('doccraft_token',${JSON.stringify(fixtureToken)});
 useAuthStore.setState({isAuthenticated:true,isGuest:false,user:{id:'u',email:'fixture@example.test',plan:'free'}});
 useChatStore.setState({sessionId:state.sessionId,documentType:'invoice',messages:[{role:'assistant',content:'DocCraft AI Assistant is ready.'}]});useChatStore.getState().reconcileSnapshot(state);
 useDocumentStore.getState().hydrateConversation(state);window.chat=useChatStore;window.doc=useDocumentStore;
 function View(){const d=useDocumentStore();return React.createElement('div',{style:{display:'flex',height:'100vh'}},React.createElement('div',{style:{width:'40%'}},React.createElement(ChatPanel)),React.createElement(InvoiceCanvas,{elements:d.canvasElements||[],selectedElementId:null,selectedElementIds:[],activeTool:'select',zoom:100,pageWidth:d.pageWidth,pageHeight:d.pageHeight,pageBackgroundColor:d.pageBackgroundColor,showGrid:false,onSelect:()=>{},onSelectMany:()=>{},onSelectPage:()=>{},onUpdate:()=>{},onUpdateMany:()=>{},onAddElement:()=>{},onCheckpoint:()=>{},selectedCell:null,onSelectCell:()=>{}}));}
 createRoot(document.getElementById('root')).render(React.createElement(View));
 </script></body></html>`;
 const fixturePlugin={name:'isolated-hybrid-browser-fixture',configureServer(s){s.middlewares.use('/__hybrid_state.json',(req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot(session)));});s.middlewares.use('/__hybrid_test.html',async(req,res,next)=>{if(req.url.includes('?'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/__hybrid_test.html',html()));});}};
 const userUrl=await server('user-frontend',[fixturePlugin]);const user=await browser.newPage();await user.setViewport({width:1500,height:1000});
 const userErrors=[];user.on('pageerror',e=>{userErrors.push(e.message);console.error('User fixture:',e.message);});await user.setRequestInterception(true);
 user.on('request',async request=>{
  if(request.url().startsWith(userUrl)){await request.continue();return;}
  if(request.method()==='OPTIONS'){await request.respond({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});return;}
  const path=new URL(request.url()).pathname;let body={};
  if(path.endsWith('/message')){
   const input=JSON.parse(request.postData());let response=localKnowledge(input.message);
   if(!response){const editor=resolveEditorCommand(input.message,{...snapshot(session),editorContext:input.editorContext});
    assert(editor.operations.length,JSON.stringify({message:input.message,clarification:editor.clarification,elements:input.editorContext?.elements?.filter(e=>/title|invoice|heading/i.test(e.id+' '+e.label))}));const applied=applyCandidates('invoice',session.slots,{slots:{clientName:'Alex'}},{kind:'user',id:input.turnId,message:input.message,correction:true});session.slots=applied.raw;
    const edited=applyEditorOperations(null,input.editorContext,editor.operations,input.message,input.turnId);session.slots._chat={...session.slots._chat,canvasLayout:edited.layout,editorContext:edited.context,layoutRevision:1,revision:2};response='Updated the customer to Alex and made the invoice heading blue.';}
   await request.respond({status:200,contentType:'text/event-stream',headers:{'Access-Control-Allow-Origin':'*'},body:'data: '+JSON.stringify({type:'done',outcome:'success',turnId:input.turnId,state:snapshot(session),response,actions:[]})+'\n\n'});return;
  }
  if(path.includes('templates'))body={templates:[{id:'tmpl_invoice_2023_03',name:'Classic',premium:false}]};
  if(path.endsWith('/sessions'))body={sessions:[]};
  await request.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
 });
 await user.goto(userUrl+'/__hybrid_test.html',{waitUntil:'networkidle0'});await user.waitForSelector('textarea');
 async function send(text){await user.type('textarea',text);await user.keyboard.press('Enter');await user.waitForFunction(()=>!window.chat.getState().isLoading&&window.chat.getState().messages.at(-1)?.role==='assistant');}
 await send('Actually change the customer to Alex and make the invoice heading blue.');
 await user.waitForFunction(()=>window.chat.getState().collectedSlots.clientName==='Alex');
 assert.equal(await user.$eval('[data-element-id="header_title"]',el=>getComputedStyle(el.firstElementChild).color),'rgb(0, 0, 255)');
 check('Real chat input, SSE client, stores and canvas synchronize a compound data/style edit');
 const before=await user.evaluate(()=>JSON.stringify(window.chat.getState().collectedSlots));await send('What is the difference between an invoice and a quotation?');
 assert.equal(await user.evaluate(()=>JSON.stringify(window.chat.getState().collectedSlots)),before);check('Side question preserves document state in the rendered chat');
 await user.reload({waitUntil:'networkidle0'});await user.waitForSelector('[data-element-id="header_title"]');
 assert.equal(await user.evaluate(()=>window.chat.getState().collectedSlots.clientName),'Alex');assert.equal(await user.$eval('[data-element-id="header_title"]',el=>getComputedStyle(el.firstElementChild).color),'rgb(0, 0, 255)');
 assert.equal(userErrors.length,0,userErrors.join('\n'));check('Reload hydrates saved business data and heading style into the actual canvas');
 console.log(JSON.stringify({method:'Chromium, actual React UI and stores; isolated fixture HTTP transport; no live providers',checks},null,2));
} finally {await browser.close();await Promise.all(servers.map(s=>s.close()));}

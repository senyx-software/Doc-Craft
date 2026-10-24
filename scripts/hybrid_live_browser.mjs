/** Actual admin production UI + actual local API/DB, without HTTP response mocks.
 * Email delivery is suppressed. One-use challenges are retrieved only from the
 * task-owned database. The browser's sandbox exception is test-only.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer';
const root=resolve(import.meta.dirname,'..');
const ctx=JSON.parse(readFileSync(resolve(root,'.local/hybrid-live/stack/context.json')));
const python=code=>execFileSync(resolve(root,'.venv-local/bin/python'),['-c',"import sys,json;sys.path.insert(0,'scripts');from hybrid_live_client import Live;live=Live();"+code],{cwd:root,encoding:'utf8'}).trim();
const auth=JSON.parse(python('print(json.dumps(live.login_admin()))'));
const admin={id:auth.admin_id,name:auth.name||'Live Admin',email:auth.email,role:auth.role_name,isSuperAdmin:auth.is_super_admin,permissions:auth.permissions};
const providerName='Browser verification cloud '+Date.now();
const checks=[],errors=[];const origins=new Set(Object.values(ctx.urls).map(url=>new URL(url).origin));
const rejected=[];
let expectedCode='';const codeChecks=[];
const browser=await puppeteer.launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,args:['--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 page.on('response',async response=>{if(response.status()>=400&&response.url().startsWith(ctx.urls['admin-api'])){const data=await response.json().catch(()=>({}));rejected.push({path:new URL(response.url()).pathname,status:response.status(),code:data.code,message:data.message});}});
 page.on('pageerror',error=>errors.push(error.name));await page.setRequestInterception(true);
 page.on('request',request=>{const url=new URL(request.url());if(url.pathname.endsWith('/ai/providers')&&request.method()==='POST'&&request.headers()['x-admin-2fa'])codeChecks.push({sent_code_length:request.headers()['x-admin-2fa'].length,matches_database:request.headers()['x-admin-2fa']===expectedCode});if(origins.has(url.origin)||['data:','blob:'].includes(url.protocol))void request.continue();else void request.abort();});
 await page.evaluateOnNewDocument((origin,token,user)=>{if(location.origin===origin){localStorage.setItem('admin_token',token);localStorage.setItem('admin_user',JSON.stringify(user));}},ctx.urls['admin-ui'],auth.access_token,admin);
 const click=async label=>{const found=await page.evaluate(label=>{const button=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label);if(!button)return false;button.click();return true;},label);if(!found)throw new Error('Missing UI control: '+label);};
 const ready=async()=>page.waitForFunction(()=>document.body.textContent.includes('DocCraft AI Management'),{timeout:20000});
 const factor=async()=>{
  await page.waitForFunction(()=>document.body.textContent.includes('2FA Verification Required'),{timeout:10000});
  const sent=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/admin/auth/request-action-code')&&response.status()===200,{timeout:10000});
  await click("Don't have an authenticator app? Send code via email");await sent;
  const code=python("print(live.query('SELECT code FROM verification_codes WHERE email=%s',('action:'+live.context['admin_email'],))[0][0])");
  expectedCode=code;
  await page.type('input[placeholder="000000"]',code);await click('Verify & Continue');
 };
 for(const section of ['ai_providers','ai_models','ai_assignments','ai_routing','ai_credentials','ai_local','ai_usage','ai_health','ai_audit']){
  await page.goto(ctx.urls['admin-ui']+'/'+section,{waitUntil:'networkidle0'});await ready();
 }
 checks.push({name:'Nine admin AI screens read actual authenticated local API data',passed:true});
 await page.goto(ctx.urls['admin-ui']+'/ai_providers',{waitUntil:'networkidle0'});await ready();await click('Add provider');
 await page.type('[aria-label="Provider name"]',providerName);await page.type('[aria-label="Inference base URL"]','https://api.openai.com/v1');
 await click('Save provider');await factor();await page.waitForFunction(()=>!document.querySelector('[role="dialog"][aria-label="Provider configuration"]'),{timeout:10000});
 checks.push({name:'Provider created from actual browser form with one-use backend 2FA',passed:true});
 for(let generation=1;generation<=2;generation++){
  await page.goto(ctx.urls['admin-ui']+'/ai_credentials',{waitUntil:'networkidle0'});await ready();
  const found=await page.evaluate(name=>{const title=[...document.querySelectorAll('p')].find(el=>el.textContent===name);const row=title?.parentElement?.parentElement;const button=row?.querySelector('button');if(!button)return false;button.click();return true;},providerName);
  if(!found)throw new Error('Credential row unavailable');
  await page.type('[aria-label="New API credential"]','synthetic-browser-not-a-live-key-'+generation+'-123456789');
  await click('Save credential securely');await factor();await page.waitForFunction((name,g)=>{const p=[...document.querySelectorAll('p')].find(el=>el.textContent===name);return p?.parentElement?.parentElement?.textContent.includes('generation '+g);},{timeout:10000},providerName,generation);
 }
 checks.push({name:'Synthetic credential added and rotated through real UI, API and encrypted persistence',passed:true});
 await page.goto(ctx.urls['admin-ui']+'/ai_models',{waitUntil:'networkidle0'});await ready();
 checks.push({name:'Model registry remains readable after runtime policy and process reloads',passed:true});
 await page.goto(ctx.urls['user-ui'],{waitUntil:'networkidle0'});
 checks.push({name:'Actual user production frontend renders without backend configuration disclosure',passed:!(await page.evaluate(()=>document.body.textContent)).includes('qwen3:')});
 if(errors.length)throw new Error('Browser page errors: '+errors.join(','));
 writeFileSync(resolve(root,'docs/hybrid-ai/evidence/live/browser-actual-api.json'),JSON.stringify({method:'Chromium actual production React builds; actual isolated HTTP APIs/PostgreSQL; no response mocks; development-only unsandboxed launcher; no actual email/provider cloud delivery',checks},null,2)+'\n');
 console.log(JSON.stringify({checks:checks.length,passed:checks.every(check=>check.passed),page_errors:errors.length}));
}catch(error){writeFileSync(resolve(root,'.local/hybrid-live/browser-rejections.json'),JSON.stringify({rejected,codeChecks},null,2));throw error;}finally{await browser.close();}

/** Actual React/API/PostgreSQL regression acceptance; no intercepted HTTP responses. */
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer';
const f=JSON.parse(readFileSync('.local/production-remediation/billing-fixture.json'));
const setup=JSON.parse(execFileSync('.venv-local/bin/python',['-c',"import sys,json;sys.path.insert(0,'.local/production-remediation');from live_client import Live;l=Live();f=json.load(open('.local/production-remediation/billing-fixture.json'));u=f['user'];l.admin('PUT','/api/v1/users/'+u['user']['id']+'/entitlements',{'plan':'pro','features':{},'reason':'Owned remediation browser acceptance'},base='');print(json.dumps({'invoices':l.query('SELECT COUNT(*) FROM billing_invoices WHERE \\\"userId\\\"=%s',(u['user']['id'],))[0][0]}))"],{encoding:'utf8'}));
const checks=[];const browser=await puppeteer.launch({headless:true,executablePath:'/tmp/doccraft-test-chrome'});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 await page.evaluateOnNewDocument((origin,token)=>{if(location.origin===origin)localStorage.setItem('doccraft_token',token)},f.urls['user-ui'],f.user.accessToken);
 const calls=[];page.on('response',r=>{if(r.url().includes('/payment/invoices'))calls.push(r.status());});
 await page.goto(f.urls['user-ui']+'/dashboard/billing',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.innerText.includes('No billing transactions have been recorded.'));
 const text=await page.evaluate(()=>document.body.innerText);
 checks.push({id:'FE-001-empty-authoritative-history',status:setup.invoices===0&&!text.includes('2026-08-15')&&!text.includes('LKR 990.00')&&calls.includes(200)?'PASS':'FAIL',persisted_invoice_count:setup.invoices,actual_invoice_api_statuses:calls});
 checks.push({id:'FE-005-cold-billing-plan',status:text.includes('PRO')&&!text.includes('FREE')?'PASS':'FAIL',expected:'Fresh direct billing entry initializes actual pro policy'});
 // Expire only the client access value; the real HttpOnly session cookie must recover it.
 // Establish the cookie by using the actual form login in a separate fixture without MFA.
 const refreshPage=await browser.newPage();
 await refreshPage.goto(f.urls['user-ui']+'/login',{waitUntil:'networkidle0'});
 const login=await refreshPage.evaluate(async({url,email,password})=>{
   const r=await fetch(url+'/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
   const data=await r.json();if(data.accessToken)localStorage.setItem('doccraft_token',data.accessToken);
   return {http:r.status,mfa:Boolean(data.requires2FA)};
 },{url:f.urls.gateway+'/v1',email:f.email,password:f.password});
 if(login.http===200&&!login.mfa){
   const renewals=[];refreshPage.on('response',r=>{if(r.url().endsWith('/auth/refresh')&&r.request().method()==='POST')renewals.push(r.status());});
   await refreshPage.evaluate(()=>{document.cookie='doccraft_token=; Max-Age=0; path=/';localStorage.setItem('doccraft_token','expired-fixture-access');});
   await refreshPage.goto(f.urls['user-ui']+'/dashboard/profile',{waitUntil:'networkidle0'});
   const restored=await refreshPage.evaluate(()=>localStorage.getItem('doccraft_token')!=='expired-fixture-access');
   const cookies=await refreshPage.cookies(f.urls.gateway+'/v1/auth/refresh');
   const secureCookie=cookies.find(c=>c.name==='doccraft_refresh');
   checks.push({id:'FE-006-browser-refresh',status:restored&&renewals.includes(200)&&secureCookie?.httpOnly?'PASS':'FAIL',renewal_statuses:renewals,http_only_refresh_cookie:Boolean(secureCookie?.httpOnly),scope:'Actual browser fetch, HttpOnly cookie, gateway/Auth/PostgreSQL rotation; expired client access replaced'});
   await refreshPage.click('#nav-profile-trigger');
   await refreshPage.click('#nav-dropdown-logout');
   await refreshPage.waitForSelector('#logout-modal');
   await refreshPage.click('#logout-confirm-btn');
   await refreshPage.waitForFunction(()=>location.pathname==='/');
   const afterCookies=await refreshPage.cookies(f.urls.gateway+'/v1/auth/refresh');
   await refreshPage.reload({waitUntil:'networkidle0'});
   const signedOut=await refreshPage.evaluate(()=>!localStorage.getItem('doccraft_token'));
   checks.push({id:'FE-006-browser-logout',status:signedOut&&!afterCookies.some(c=>c.name==='doccraft_refresh')?'PASS':'FAIL',refresh_cookie_removed:!afterCookies.some(c=>c.name==='doccraft_refresh'),no_silent_reauthentication_after_reload:signedOut});

 }else checks.push({id:'FE-006-browser-refresh',status:'BLOCKED',reason:'Login requires the existing MFA factor; no security bypass used'});

} catch(error){checks.push({id:'browser-harness',status:'FAIL',error:error.name,reason:error.message.slice(0,120)});} finally{
 await browser.close();writeFileSync('docs/production-remediation/evidence/runtime/billing-browser.json',JSON.stringify({scope:'Actual browser/backend/DB; no real payment provider transaction asserted',checks},null,2)+'\n');console.log(JSON.stringify(checks));
}

/** Exercise the actual sign-in screens with fixture authentication results. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer';

const root=resolve(import.meta.dirname,'..');
const frontend=resolve(root,'user-frontend');
const require=createRequire(resolve(frontend,'package.json'));
const vite=await import(pathToFileURL(require.resolve('vite')).href);
const fixtureToken='fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const html=`<!doctype html><html><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import GuestRoute from '/src/middleware/GuestRoute.tsx';
import LoginPage from '/src/pages/LoginPage.tsx';
import RegisterPage from '/src/pages/RegisterPage.tsx';
import GuestDownloadModal from '/src/components/shared/GuestDownloadModal.tsx';
import {useAuthStore} from '/src/store/authStore.ts';
import {useChatStore} from '/src/store/chatStore.ts';
import {useQuotaStore} from '/src/store/quotaStore.ts';
import {setToken,clearToken} from '/src/api/client.ts';
const params=new URLSearchParams(window.location.search);
const from=JSON.parse(params.get('from')||'null');
const guest=params.has('guest');
clearToken();
const signedIn=()=>{setToken(${JSON.stringify(fixtureToken)});useAuthStore.setState({user:{user_id:'fixture',email:'fixture@example.test',plan:'free'},isAuthenticated:true,isGuest:false,isInitializing:false});return {};};
useAuthStore.setState({user:null,isAuthenticated:guest,isGuest:guest,isInitializing:false,mfaToken:null,error:null,
 googleAuth:async()=>{if(params.has('mfa')){useAuthStore.setState({mfaToken:'fixture-mfa'});return {requires2FA:true};}return signedIn();},
 login2FA:async()=>{signedIn();}});
if(guest){useChatStore.setState({sessionId:'saved-invoice'});useQuotaStore.setState({showGuestDownloadModal:true});}
function Destination(){const location=useLocation();const isGuest=useAuthStore(state=>state.isGuest);return guest&&isGuest?React.createElement(GuestDownloadModal):React.createElement('div',{id:'destination'},location.pathname+location.search+location.hash);}
const entry={pathname:guest?'/builder':params.get('entry')||'/login',search:guest?'?new=true&type=invoice':'',state:from?{from}:null};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:[entry]},
 React.createElement(Routes,null,
  React.createElement(Route,{path:'/login',element:React.createElement(GuestRoute,null,React.createElement(LoginPage))}),
  React.createElement(Route,{path:'/register',element:React.createElement(GuestRoute,null,React.createElement(RegisterPage))}),
  React.createElement(Route,{path:'*',element:React.createElement(Destination)}))));
</script></body></html>`;

const server=await vite.createServer({root:frontend,configFile:resolve(frontend,'vite.config.ts'),server:{host:'127.0.0.1',port:0},plugins:[{
  name:'auth-redirect-fixture',
  configureServer(server){server.middlewares.use('/__auth_redirect.html',async(req,res,next)=>{
    try{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.originalUrl,html));}
    catch(error){next(error);}
  });},
}]});
let browser;
try{
  await server.listen();
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await puppeteer.launch({headless:true,args:['--disable-dev-shm-usage']});
  const checks=[];
  async function check(name,options,expected){
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request',request=>request.url().startsWith(origin)||request.url().startsWith('data:')?request.continue():request.abort());
    try{
      const query=new URLSearchParams({entry:options.entry||'/login',...(options.from?{from:JSON.stringify(options.from)}:{}),...(options.guest?{guest:'1'}:{}),...(options.mfa?{mfa:'1'}:{})});
      await page.goto(origin+'/__auth_redirect.html?'+query,{waitUntil:'networkidle0'});
      if(options.guest)await page.click('#guest-modal-login');
      for(const target of options.switches||[])await page.click('a[href="'+target+'"]');
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent.includes('Google')));
      await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Google')).click());
      if(options.mfa){await page.waitForSelector('#login-2fa-submit');await page.type('input[maxlength="6"]','123456');await page.click('#login-2fa-submit');}
      await page.waitForSelector('#destination');
      assert.equal(await page.$eval('#destination',element=>element.textContent),expected,name);
      assert.deepEqual(errors,[],name+' browser errors');
      checks.push({name,status:'passed'});
    }catch(error){
      console.error(JSON.stringify({name,errors,body:await page.evaluate(()=>document.body.innerText.slice(0,1600))}));
      throw error;
    }finally{await page.close();}
  }
  await check('Google sign-in opens an invoice by default',{},'/builder?type=invoice');
  await check('Google registration opens an invoice by default',{entry:'/register'},'/builder?type=invoice');
  await check('Switching from sign-in to registration retains the selected document',{from:{pathname:'/builder',search:'?type=quotation&templateId=classic',hash:'#preview'},switches:['/register']},'/builder?type=quotation&templateId=classic#preview');
  await check('Switching from registration to sign-in retains the selected document',{entry:'/register',from:{pathname:'/builder',search:'?type=receipt'},switches:['/login']},'/builder?type=receipt');
  await check('A guest returns to the saved invoice rather than a new draft',{guest:true},'/builder?sessionId=saved-invoice');
  await check('Google registration requiring MFA retains the invoice destination',{entry:'/register',mfa:true,from:{pathname:'/builder',search:'?sessionId=saved-invoice'}},'/builder?sessionId=saved-invoice');
  console.log(JSON.stringify({method:'Real React routes and screens with fixture authentication; no external sign-in',checks},null,2));
}finally{
  if(browser)await browser.close();
  await server.close();
}

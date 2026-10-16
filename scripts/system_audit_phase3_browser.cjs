// Real browser/API/database checks against the isolated stack, with no API mocks.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = [];
const check = (workflow, passed, evidence) => {
  results.push({ workflow, status: passed ? 'VERIFIED' : 'UNRESOLVED', evidence, method: 'Chromium against actual isolated APIs + PostgreSQL; no API interception' });
  if (!passed) throw new Error(workflow);
};
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  const db = new Client({ connectionString: input.databaseUrl });
  await db.connect();
  let stage = 'open admin plans';
  let activePage;
  try {
    const admin = await browser.newPage();
    activePage = admin;
    const errors = [];
    admin.on('pageerror', error => errors.push(error.message));
    await admin.setViewport({ width: 1365, height: 1000 });
    await admin.evaluateOnNewDocument(data => {
      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_user', JSON.stringify(data.user));
    }, { token: input.adminToken, user: { id: input.adminId, name: 'Phase Two Administrator', email: 'phase2-admin@example.com', role: 'Super Admin', isSuperAdmin: true, permissions: ['*'] } });
    await admin.goto(input.adminUrl + '/pack_current', { waitUntil: 'networkidle0' });
    await admin.waitForFunction(() => document.body.innerText.toLowerCase().includes('pro professional'));
    stage = 'open plan editor';
    await admin.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(button => button.innerText.includes('Configure Plan Specs') && button.parentElement.innerText.toLowerCase().includes('pro professional'));
      if (!button) throw new Error('Pro plan edit control not found');
      button.click();
    });
    await admin.waitForSelector('select[aria-label="Billing currency"]');
    await admin.select('select[aria-label="Billing currency"]', 'LKR');
    const fieldId = await admin.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.trim() === 'Price LKR Monthly').control.id);
    await admin.click(`[id="${fieldId}"]`);
    await admin.keyboard.down('Control'); await admin.keyboard.press('A'); await admin.keyboard.up('Control'); await admin.keyboard.press('Backspace');
    await admin.type(`[id="${fieldId}"]`, '1234.50');
    await admin.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Save Plan Specs')).click());
    stage = 'wait for action challenge';
    await admin.waitForSelector('input[autocomplete="one-time-code"]');
    const issued = await fetch(input.adminApiUrl + '/api/v1/admin/auth/request-action-code', { method: 'POST', headers: { Authorization: 'Bearer ' + input.adminToken, 'Content-Type': 'application/json' }, body: '{}' });
    if (!issued.ok) throw new Error('Could not issue local fixture action challenge');
    const code = await db.query('SELECT code FROM verification_codes WHERE email=$1', ['action:phase2-admin@example.com']);
    await admin.type('input[autocomplete="one-time-code"]', code.rows[0].code);
    await admin.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Verify & Continue')).click());
    await admin.waitForFunction(() => !document.querySelector('select[aria-label="Billing currency"]'));
    stage = 'reload saved admin plan';
    await admin.reload({ waitUntil: 'networkidle0' });
    await admin.waitForFunction(() => document.body.innerText.includes('LKR 1234.5'));
    const stored = await db.query('SELECT billing_currency,price_lkr_monthly FROM admin_plans WHERE code=$1', ['pro']);
    check('Admin UI currency/price edit, second factor, database persistence, reload', stored.rows[0].billing_currency === 'LKR' && Number(stored.rows[0].price_lkr_monthly) === 1234.5);

    stage = 'inspect persisted session through admin UI and private MCP';
    await admin.goto(input.adminUrl + '/inf_mcp_chat', { waitUntil: 'networkidle0' });
    const inspectionLabel = input.inspectionSession.slice(0, 8);
    await admin.waitForFunction(id => document.body.innerText.includes(id), {}, inspectionLabel);
    await admin.evaluate(id => {
      const row = [...document.querySelectorAll('tr')].find(row => row.innerText.includes(id));
      const button = row && row.querySelector('button');
      if (!button) throw new Error('Session inspection control unavailable');
      button.click();
    }, inspectionLabel);
    await admin.waitForFunction(() => [...document.querySelectorAll('textarea')].some(area => area.value.includes('"found": true')));
    check('Admin inspection UI reads a persisted session through read-only MCP', await admin.evaluate(id => [...document.querySelectorAll('textarea')].some(area => area.value.includes(id) && area.value.includes('"state"')), input.inspectionSession));

    stage = 'open user pricing';
    const user = await browser.newPage();
    activePage = user;
    user.on('pageerror', error => errors.push(error.message));
    await user.setViewport({ width: 1365, height: 900 });
    await user.evaluateOnNewDocument(token => localStorage.setItem('doccraft_token', token), input.userToken);
    await user.goto(input.userUrl + '/pricing', { waitUntil: 'networkidle0' });
    await user.waitForFunction(() => document.body.innerText.includes('1,234.50'));
    check('Admin price edit reaches actual user pricing UI', await user.evaluate(() => document.body.innerText.includes('AI chat requests + server PDF generations per day')));
    await user.reload({ waitUntil: 'networkidle0' });
    check('User pricing remains current after browser reload', await user.evaluate(() => document.body.innerText.includes('1,234.50')));
    stage='persist canvas layout in the real builder';
    await user.goto(input.userUrl+'/builder?sessionId='+input.canvasSession,{waitUntil:'networkidle0'});
    await user.waitForSelector('#invoice-canvas-container [data-element-id] [contenteditable]',{timeout:30000});
    const target=await user.$eval('#invoice-canvas-container [data-element-id] [contenteditable]',element=>({id:element.parentElement.getAttribute('data-element-id'),x:parseFloat(element.parentElement.style.left)}));
    await user.click(`[data-element-id="${target.id}"] [contenteditable]`);
    const saving=user.waitForResponse(response=>response.request().method()==='PUT' && response.url().endsWith('/canvas'),{timeout:15000});
    await user.keyboard.press('ArrowRight');
    const saved=await saving;
    check('Canvas position edit persists through the actual user control',saved.status()===200,'Click element → ArrowRight → autosave HTTP PUT → PostgreSQL');
    stage='reload persisted canvas layout';
    await user.reload({waitUntil:'networkidle0'});
    await user.waitForFunction(({id,x})=>{
      const element=document.querySelector(`[data-element-id="${id}"]`);
      return element && parseFloat(element.style.left)===x;
    },{timeout:30000},{id:target.id,x:target.x+1});
    check('Canvas presentation survives actual browser reload',true,'Fresh API state hydrates the saved position');
    stage='download actual browser canvas PDF';
    const cdp=await user.createCDPSession();
    await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:input.evidenceDirectory});
    const before=new Set(fs.readdirSync(input.evidenceDirectory));
    await user.click('#builder-page button[title="Download PDF and confirm the current document details"]');
    const deadline=Date.now()+30000;let exported;
    while(Date.now()<deadline){
      exported=fs.readdirSync(input.evidenceDirectory).find(file=>file.endsWith('.pdf')&&!before.has(file));
      if(exported)break;
      const error=await user.$eval('#builder-page',element=>element.querySelector('[role="alert"]')?.textContent||'');
      if(error)throw new Error(error);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    check('Browser canvas PDF downloads after server confirmation',!!exported && fs.readFileSync(path.join(input.evidenceDirectory,exported)).subarray(0,5).toString()==='%PDF-',exported||'No artifact downloaded');
    if(exported)fs.renameSync(path.join(input.evidenceDirectory,exported),path.join(input.evidenceDirectory,'browser-canvas-export.pdf'));
    await user.goto(input.userUrl+'/pricing',{waitUntil:'networkidle0'});
    stage='guest signs into a verified account without losing its draft';
    const guestContext=await browser.createBrowserContext();
    const guest=await guestContext.newPage();
    await guest.setViewport({width:1365,height:900});
    await guest.evaluateOnNewDocument(token=>localStorage.setItem('doccraft_token',token),input.guestToken);
    await guest.goto(input.userUrl+'/builder?sessionId='+input.guestSession,{waitUntil:'networkidle0'});
    await guest.waitForSelector('#invoice-canvas-container [data-element-id]',{timeout:30000});
    await guest.goto(input.userUrl+'/login',{waitUntil:'networkidle0'});
    await guest.waitForSelector('input[type="email"]',{timeout:10000});
    await guest.type('input[type="email"]',input.userEmail);
    await guest.type('input[type="password"]',input.userPassword);
    const transfer=guest.waitForResponse(response=>response.url().endsWith('/guest-migration')&&response.request().method()==='POST',{timeout:15000});
    await guest.click('#login-submit');
    const transferred=await transfer;
    check('Guest account sign-in executes the authorized draft transfer',transferred.status()===200,'Actual guest login form; browser credentials change after server ownership transfer');
    const owner=await db.query('SELECT "userId",slots FROM chat_sessions WHERE id=$1',[input.guestSession]);
    const account=await db.query('SELECT id FROM users WHERE email=$1',[input.userEmail]);
    check('Guest browser draft retains its values under the real account owner',owner.rows[0].userId===account.rows[0].id && owner.rows[0].slots.businessName.toLowerCase()==='guest browser business');
    await guestContext.close();
    await user.setViewport({ width: 390, height: 844 });
    check('Pricing page fits a mobile viewport', await user.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await user.screenshot({ path: path.join(input.evidenceDirectory || path.join(root, 'docs/system-audit/evidence/phase2'), 'pricing-mobile.png'), fullPage: true });
    check('Live integration browser pages have no uncaught script errors', errors.length === 0, errors);
  } catch (error) {
    results.push({ workflow: 'Browser integration stopped', status: 'UNRESOLVED', evidence: stage + ': ' + error.message, rendered: activePage ? (await activePage.evaluate(() => document.body.innerText)).slice(-1600) : '' });
  } finally {
    await db.end();
    await browser.close();
    fs.writeFileSync(path.join(input.evidenceDirectory || path.join(root, 'docs/system-audit/evidence/phase2'), 'browser-integration.json'), JSON.stringify(results, null, 2));
  }
  process.exitCode = results.some(row => row.status === 'UNRESOLVED') ? 1 : 0;
})().catch(error => { process.stderr.write(error.message); process.exitCode = 1; });

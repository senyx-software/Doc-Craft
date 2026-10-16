// Error-state browser coverage with synthetic identity and intercepted APIs.
// This deliberately does not claim a live database/provider journey passed.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const out = process.env.AUDIT_EVIDENCE_DIR || path.join(root, 'docs/system-audit/evidence');
fs.mkdirSync(out, { recursive: true });
const token = `e30.${Buffer.from(JSON.stringify({ sub: 'audit_fixture', type: 'access', plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
const user = { id: 'audit_fixture', email: 'fixture@example.test', fullName: 'Audit Fixture', status: 'active', plan: 'free', authProvider: 'email' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  const results = [];
  try {
    async function pageFor(actor, authenticated = false) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1365, height: 900 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = new URL(request.url());
        if (['5183', '5184'].includes(url.port) && ['127.0.0.1', 'localhost'].includes(url.hostname)) return void request.continue();
        if (url.pathname.endsWith('/auth/me') && actor === 'user' && authenticated) return void request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ user }) });
        if (url.protocol === 'data:') return void request.continue();
        return void request.respond({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify({ message: 'Audit fixture: backend unavailable', detail: 'Audit fixture: backend unavailable' }) });
      });
      if (authenticated) await page.evaluateOnNewDocument((actor, token) => {
        if (actor === 'admin') {
          localStorage.setItem('admin_token', token);
          localStorage.setItem('admin_user', JSON.stringify({ id: 'audit_fixture', name: 'Audit Fixture', role: 'Super Admin', email: 'fixture@example.test', isSuperAdmin: true, permissions: ['*'] }));
        } else localStorage.setItem('doccraft_token', token);
      }, actor, token);
      return page;
    }
    async function check(page, actor, route, expectation) {
      const errors = [];
      const listener = error => errors.push(error.message);
      page.on('pageerror', listener);
      await page.goto(`http://127.0.0.1:${actor === 'admin' ? 5184 : 5183}${route}`, { waitUntil: 'networkidle0', timeout: 20000 });
      await sleep(100);
      const state = await page.evaluate(() => ({ title: document.title, text: document.body.innerText.slice(0, 6000), controls: document.querySelectorAll('button,input,select,textarea,a').length }));
      const boundary = state.text.includes('View Render Error');
      const row = { actor, route, expectation, method: 'Chromium with intercepted backend failures and synthetic browser identity', status: errors.length || boundary ? 'FAIL' : 'PASS', controls: state.controls, pageErrors: errors, boundary, renderedTextLength: state.text.length };
      if (boundary) row.boundaryMessage = state.text.slice(state.text.indexOf('View Render Error'), state.text.indexOf('View Render Error') + 300);
      results.push(row);
      page.off('pageerror', listener);
    }
    const publicPage = await pageFor('user');
    for (const route of ['/', '/login', '/register', '/verify-email', '/password-reset', '/pricing', '/builder', '/dashboard']) await check(publicPage, 'user', route, 'Public page or protected-route redirect handles unavailable APIs without a render crash');
    await publicPage.goto('http://127.0.0.1:5183/login', { waitUntil: 'networkidle0' });
    await publicPage.screenshot({ path: path.join(out, 'user-login.png') });
    await publicPage.close();
    const userPage = await pageFor('user', true);
    for (const route of ['/dashboard', '/dashboard/profile', '/dashboard/document-history', '/dashboard/billing', '/dashboard/support', '/builder?new=true']) await check(userPage, 'user', route, 'Authenticated screen handles unavailable downstream APIs without a render crash');
    await userPage.close();
    const adminPage = await pageFor('admin', true);
    const nav = fs.readFileSync(path.join(root, 'admin/src/config/adminNavSections.tsx'), 'utf8');
    const sections = [...nav.matchAll(/label:\s*'([^']+)',\s*id:\s*'([^']+)'/g)].map(match => match[2]);
    for (const [index, section] of sections.entries()) {
      await check(adminPage, 'admin', '/' + section, 'Admin section renders an error/empty state for backend 503 responses');
      if ((index + 1) % 20 === 0) console.log(`Admin browser routes checked: ${index + 1}/${sections.length}`);
    }
    await adminPage.close();
    const login = await pageFor('admin');
    await check(login, 'admin', '/', 'Unauthenticated admin login screen renders');
    await login.screenshot({ path: path.join(out, 'admin-login.png') });
    await login.close();
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'browser-scenarios.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify({ scenarios: results.length, passed: results.filter(x => x.status === 'PASS').length, failed: results.filter(x => x.status === 'FAIL').length, limitations: 'API requests were intercepted; these are rendering/error-state checks, not live end-to-end proofs.' }));
  if (results.some(x => x.status === 'FAIL')) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });

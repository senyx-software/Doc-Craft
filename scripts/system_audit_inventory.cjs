// Static inventory only: an entry's existence is not evidence that it works.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const out = process.env.AUDIT_EVIDENCE_DIR || path.join(root, 'docs/system-audit/evidence');
const skip = new Set(['node_modules', '.git', '.venv', '.venv-local', 'dist', '__pycache__', '.pytest_cache', 'generated', 'redis-bin', '.idea', 'system-audit']);
const files = [], entries = [], calls = [], symbols = [];
const relative = p => path.relative(root, p).replaceAll(path.sep, '/');
function add(kind, file, line, name, extra = {}) {
  entries.push({ kind, source: relative(file), line, name, status: 'INFERRED', verification: 'NOT TESTED — static discovery', ...extra });
}
function scan(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(item.name) || item.name === 'DOC_CRAFT_FULL_PROJECT_REPORT.md' || item.isSymbolicLink()) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { scan(file); continue; }
    if (/\.env(?:\.|$)/.test(item.name) || /\.env$/.test(item.name) || item.name === 'package-lock.json') continue;
    if (!/\.(?:ts|tsx|js|mjs|mts|cjs|py|json|sql|yml|yaml|md|txt|html|css|prisma)$/.test(file) && item.name !== 'Dockerfile') continue;
    const text = fs.readFileSync(file, 'utf8');
    const rel = relative(file), lines = text.split('\n');
    files.push({ source: rel, lines: lines.length, sha256: crypto.createHash('sha256').update(text).digest('hex') });
    const isTest = /(?:__tests__|\/tests\/|\.test\.|\/test_)/.test(rel);
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const line = node => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name) symbols.push({ source: rel, line: line(node), name: node.name.text, kind: 'function', test: isTest });
        if (ts.isCallExpression(node)) {
          const callee = node.expression.getText(tree);
          const first = node.arguments[0];
          if (!isTest && /(?:^|\.)(?:get|post|patch|put|delete|all|use|register)$/.test(callee) && first && ts.isStringLiteralLike(first)) {
            const verb = callee.split('.').at(-1);
            if (/^(?:router|fastify|server|app)\./.test(callee)) add('api-declaration', file, line(node), `${verb.toUpperCase()} ${first.text}`, { handler: node.arguments.at(-1)?.getText(tree).slice(0, 140), endpoint: first.text });
          }
          if (!isTest && /(?:fetch|apiRequest|get|post|patch|put|delete|request)$/.test(callee) && first && (ts.isStringLiteralLike(first) || ts.isTemplateExpression(first))) {
            const target = first.getText(tree);
            if (target.includes('/')) calls.push({ source: rel, line: line(node), call: callee, target: target.slice(0, 250) });
          }
        }
        if (!isTest && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
          const tag = node.tagName.getText(tree);
          const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
          const events = attrs.filter(a => /^on[A-Z]/.test(a.name.text)).map(a => ({ event: a.name.text, handler: a.initializer?.getText(tree).slice(0, 180) || '' }));
          if (tag === 'Route') {
            const p = attrs.find(a => a.name.text === 'path');
            add('ui-route', file, line(node), p?.initializer?.getText(tree) || '(index)', { endpoint: p?.initializer?.getText(tree), handler: attrs.find(a => a.name.text === 'element')?.initializer?.getText(tree).slice(0, 180) });
          } else if (events.length || /^(?:button|Button|input|Input|select|textarea|form|a|Link|NavLink)$/.test(tag)) {
            const attrsByName = name => attrs.find(a => a.name.text === name)?.initializer?.getText(tree);
            add('ui-control', file, line(node), `${tag}${events.length ? ' ' + events.map(x => x.event).join(', ') : ''}`, { events, type: attrsByName('type'), disabled: attrsByName('disabled'), href: attrsByName('href') || attrsByName('to'), label: attrsByName('aria-label') || attrsByName('title') });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
    if (!isTest && file.endsWith('.py')) {
      let prefix = text.match(/router\s*=\s*APIRouter\(\s*prefix\s*=\s*["']([^"']*)/s)?.[1] || '';
      lines.forEach((s, i) => {
        const match = s.match(/@(router|app)\.(get|post|put|patch|delete)\(["']([^"']*)/);
        if (match) add('api-declaration', file, i + 1, `${match[2].toUpperCase()} ${prefix}${match[3]}`, { endpoint: prefix + match[3], handler: lines.slice(i + 1, i + 12).find(s => /^(?:async )?def /.test(s))?.trim() });
        const symbol = s.match(/^(?:async )?(def|class) (\w+)/);
        if (symbol) symbols.push({ source: rel, line: i + 1, name: symbol[2], kind: symbol[1], test: false });
      });
    }
    if (!isTest && (/\/workers?\//.test(rel) || /\.queue\.ts$/.test(file))) add('worker-module', file, 1, rel);
    if (!isTest && /\/templates\/.*\.(?:html|hbs)$/.test(rel)) add('template', file, 1, rel);
    if (/schema\.prisma$/.test(file)) lines.forEach((s, i) => { const m = s.match(/^model\s+(\w+)/); if (m) add('database-model', file, i + 1, m[1]); });
    if (!isTest && /\.(py|sql)$/.test(file)) {
      const tables = new Set();
      lines.forEach((s, i) => {
        const m = s.match(/CREATE TABLE IF NOT EXISTS\s+["`]?([\w.]+)/i) || s.match(/__tablename__\s*=\s*["']([^"']+)/);
        if (m && !tables.has(m[1])) { tables.add(m[1]); add('database-table', file, i + 1, m[1]); }
      });
    }
  }
}
scan(root);
// Handlebars is included separately because the main source filter is intentionally explicit.
for (const name of fs.readdirSync(path.join(root, 'services/notification/src/templates'))) {
  if (name.endsWith('.hbs')) add('template', path.join(root, 'services/notification/src/templates', name), 1, name);
}
const nav = fs.readFileSync(path.join(root, 'admin/src/config/adminNavSections.tsx'), 'utf8');
for (const m of nav.matchAll(/label:\s*'([^']+)',\s*id:\s*'([^']+)'/g)) add('admin-section', path.join(root, 'admin/src/config/adminNavSections.tsx'), nav.slice(0, m.index).split('\n').length, `${m[2]} — ${m[1]}`, { section: m[2] });
entries.forEach((x, i) => x.id = `F${String(i + 1).padStart(4, '0')}`);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify({ generated_utc: new Date().toISOString(), files, entries, calls, symbols, limitations: ['Static source inventory; route declarations include mount points and are not a count of unique reachable endpoints.', 'Controls inside shared components represent source definitions, not every rendered instance.', 'Dynamic or generated handlers can require manual follow-up.', 'No runtime verification is inferred from source presence.'] }, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, entries: entries.length, kinds: entries.reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {}), client_calls: calls.length, symbols: symbols.length }));

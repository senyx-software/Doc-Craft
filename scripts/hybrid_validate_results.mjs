// Recheck actual inference proposals against the unchanged production schemas.
// Does not dispatch inference or commit document changes.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const directory = path.resolve('docs/hybrid-ai/evidence/live');
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('Usage: node scripts/hybrid_validate_results.mjs <input.jsonl> <validated.json>');
const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map(JSON.parse(fs.readFileSync(path.join(directory, 'tool-schemas.json'), 'utf8')).map(tool => [tool.function.name, ajv.compile(tool.function.parameters)]));
const rows = fs.readFileSync(input, 'utf8').trim().split('\n').map(line => JSON.parse(line));
for (const row of rows) {
  row.errors = row.errors.filter(error => !error.startsWith('production_schema:'));
  for (const call of row.result?.message?.tool_calls || []) {
    const name = call.function.name;
    let valid = false;
    try { valid = validators.has(name) && validators.get(name)(JSON.parse(call.function.arguments)); } catch { /* invalid JSON is a failed proposal */ }
    if (!valid) row.errors.push(`production_schema:${name}`);
  }
  row.passed = row.errors.length === 0;
}
fs.writeFileSync(output, JSON.stringify(rows, null, 2) + '\n');
const times = rows.map(row => row.latency_ms).sort((a, b) => a - b);
const percentile = p => times[Math.max(0, Math.ceil(times.length * p) - 1)];
console.log(JSON.stringify({ total: rows.length, passed: rows.filter(row => row.passed).length, failed: rows.filter(row => !row.passed).length, p50_ms: percentile(.5), p95_ms: percentile(.95) }));

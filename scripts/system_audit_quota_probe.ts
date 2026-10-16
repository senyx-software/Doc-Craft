import { createInterface } from 'node:readline';
import { quotaConfigClient } from '../services/quota/src/services/quotaConfigClient.service.js';

async function main() {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    const limit = await quotaConfigClient.getPlanQuota(line.trim());
    process.stdout.write('AUDIT_QUOTA ' + JSON.stringify({ plan: line.trim(), limit }) + '\n');
  }
  process.exit(0);
}
void main().catch(() => process.exit(1));

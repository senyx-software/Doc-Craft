#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SECRETS_DIR = path.join(ROOT, '.local/secrets');
const isWin = process.platform === 'win32';
const force = process.argv.includes('--force') || process.argv.includes('--overwrite');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function writeIfNotExists(filePath, content, description) {
  if (!fs.existsSync(filePath) || force) {
    if (fs.existsSync(filePath) && force) {
      try {
        fs.chmodSync(filePath, 0o666);
      } catch {
        // Ignore
      }
    }
    fs.writeFileSync(filePath, content.trim() + '\n', { mode: 0o600 });
    console.log(`[setup] Generated ${description}: ${path.relative(ROOT, filePath)}`);
  } else {
    console.log(`[setup] Exists (skipping): ${path.relative(ROOT, filePath)}`);
  }
}

function findPython() {
  const runner = path.join(__dirname, 'run-python.cjs');
  if (fs.existsSync(runner)) {
    return { cmd: process.execPath, args: [runner] };
  }
  return { cmd: isWin ? 'python' : 'python3', args: [] };
}

console.log('=== DocCraft Setup & Bootstrap ===\n');

// 1. Ensure .local/secrets directory exists
ensureDir(SECRETS_DIR);

// 2. Check and generate private service credentials and Redis ACL if missing
const IDENTITIES = [
  'admin-api', 'analytics', 'auth', 'chat',
  'document', 'gateway', 'notification', 'payment', 'pdf', 'quota'
];

let needsSecrets = force;
if (!needsSecrets) {
  for (const id of IDENTITIES) {
    if (!fs.existsSync(path.join(SECRETS_DIR, `${id}.json`)) ||
        !fs.existsSync(path.join(SECRETS_DIR, `${id}.env`))) {
      needsSecrets = true;
      break;
    }
  }
  if (!fs.existsSync(path.join(SECRETS_DIR, 'redis-health.env')) ||
      !fs.existsSync(path.join(SECRETS_DIR, 'redis.acl'))) {
    needsSecrets = true;
  }
}

if (needsSecrets) {
  console.log('[setup] Generating service and Redis ACL credentials...');
  const py = findPython();
  const serviceScript = path.join(__dirname, 'create_service_credentials.py');
  const redisScript = path.join(__dirname, 'create_redis_credentials.py');

  try {
    execFileSync(py.cmd, [...py.args, serviceScript, SECRETS_DIR, '--overwrite'], {
      cwd: ROOT,
      stdio: 'inherit'
    });
    execFileSync(py.cmd, [...py.args, redisScript, SECRETS_DIR, '--overwrite'], {
      cwd: ROOT,
      stdio: 'inherit'
    });
    console.log('[setup] Service credentials and Redis ACL generated successfully.\n');
  } catch (err) {
    console.error('[setup] Failed to generate service/redis credentials:', err.message);
    process.exit(1);
  }
} else {
  console.log('[setup] Service credentials and Redis ACL already present.\n');
}

// 3. Generate root .env if missing
const jwtSecret = crypto.randomBytes(32).toString('hex');
const jwtRefreshSecret = crypto.randomBytes(32).toString('hex');
const adminJwtSecret = crypto.randomBytes(32).toString('hex');
const internalSecret = crypto.randomBytes(32).toString('hex');

const rootEnv = `# DocCraft Environment Configuration
# Ports
GATEWAY_PORT=3001
AUTH_PORT=3011
NOTIFICATION_PORT=3012
DOCUMENT_PORT=3013
PAYMENT_PORT=3014
QUOTA_PORT=3015
CHAT_PORT=3016
ANALYTICS_PORT=3017
ADMIN_API_PORT=3018
DOCUMENT_SIDECAR_PORT=3023
USER_FRONTEND_PORT=5173
ADMIN_FRONTEND_PORT=5174
REDIS_PORT=6379
POSTGRES_PORT=5432

# Database configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=doccraft
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/doccraft
ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
DOCKER_DATABASE_URL=postgresql://postgres:postgres@postgres:5432/doccraft
DOCKER_DIRECT_URL=postgresql://postgres:postgres@postgres:5432/doccraft
DOCKER_ADMIN_DATABASE_URL=postgresql://postgres:postgres@postgres:5432/doccraft

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379/0

# Secrets
JWT_SECRET=${jwtSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}
ADMIN_JWT_SECRET=${adminJwtSecret}
INTERNAL_SERVICE_SECRET=${internalSecret}

# CORS & Frontend
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174
FRONTEND_URL=http://localhost:5173
`;

writeIfNotExists(path.join(ROOT, '.env'), rootEnv, 'root .env');

// 4. Generate service .env files if missing
const serviceEnvs = {
  'services/gateway/gateway.env': `PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174
AUTH_SERVICE_URL=http://localhost:3011
AI_SERVICE_URL=http://localhost:3016
DOCUMENT_SERVICE_URL=http://localhost:3013
BILLING_SERVICE_URL=http://localhost:3014
QUOTA_SERVICE_URL=http://localhost:3015
NOTIFICATION_SERVICE_URL=http://localhost:3012
ANALYTICS_SERVICE_URL=http://localhost:3017
ADMIN_API_SERVICE_URL=http://localhost:3018
`,

  'services/auth/auth.env': `PORT=3011
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/doccraft
FRONTEND_URL=http://localhost:5173
NOTIFICATION_SERVICE_URL=http://localhost:3012
ANALYTICS_SERVICE_URL=http://localhost:3017
ADMIN_API_SERVICE_URL=http://localhost:3018
JWT_SECRET=${jwtSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}
`,

  'services/chat/chat.env': `PORT=3016
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/doccraft
AUTH_SERVICE_URL=http://localhost:3011
ADMIN_API_SERVICE_URL=http://localhost:3018
ANALYTICS_SERVICE_URL=http://localhost:3017
QUOTA_SERVICE_URL=http://localhost:3015
`,

  'services/document/document.env': `PORT=3013
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
AUTH_SERVICE_URL=http://localhost:3011
AI_SERVICE_URL=http://localhost:3016
QUOTA_SERVICE_URL=http://localhost:3015
ANALYTICS_SERVICE_URL=http://localhost:3017
GATEWAY_URL=http://localhost:3001
SIDECAR_URL=http://localhost:3023/generate
`,

  'services/payment/payment.env': `PORT=3014
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/doccraft
AUTH_SERVICE_URL=http://localhost:3011
QUOTA_SERVICE_URL=http://localhost:3015
NOTIFICATION_SERVICE_URL=http://localhost:3012
ADMIN_API_SERVICE_URL=http://localhost:3018
ANALYTICS_SERVICE_URL=http://localhost:3017
FRONTEND_URL=http://localhost:5173
`,

  'services/quota/quota.env': `PORT=3015
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/doccraft
ADMIN_API_SERVICE_URL=http://localhost:3018
ANALYTICS_SERVICE_URL=http://localhost:3017
`,

  'services/notification/notification.env': `PORT=3012
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
AUTH_SERVICE_URL=http://localhost:3011
ADMIN_API_URL=http://localhost:3018
`,

  'services/analytics/analytics.env': `PORT=3017
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
`,

  'services/admin-api/admin-api.env': `PORT=3018
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/doccraft
ADMIN_JWT_SECRET=${adminJwtSecret}
AUTH_SERVICE_URL=http://localhost:3011
QUOTA_SERVICE_URL=http://localhost:3015
PAYMENT_SERVICE_URL=http://localhost:3014
CHAT_SERVICE_URL=http://localhost:3016
DOCUMENT_SERVICE_URL=http://localhost:3013
NOTIFICATION_SERVICE_URL=http://localhost:3012
ANALYTICS_SERVICE_URL=http://localhost:3017
GATEWAY_URL=http://localhost:3001
`
};

for (const [relPath, content] of Object.entries(serviceEnvs)) {
  const fullPath = path.join(ROOT, relPath);
  ensureDir(path.dirname(fullPath));
  writeIfNotExists(fullPath, content, relPath);
}

console.log('\n=== Setup Complete ===');
console.log('You can now:');
console.log('  1. Start the stack with Docker: docker compose up -d');
console.log('  2. Or run services locally: npm run dev\n');

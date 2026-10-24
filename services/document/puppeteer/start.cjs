// The native PDF child receives only its renderer identity and Redis account.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const env = {};
const ALLOWED_KEYS = new Set([
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'NODE_ENV',
  'LANG',
  'DISPLAY',
  'XDG_CACHE_HOME',
  'SIDECAR_PORT',
  'SIDECAR_HOST',
  'PDF_MAX_CONCURRENT',
  // Windows-specific required environment variables for Chromium / Node DLLs
  'SYSTEMROOT',
  'WINDIR',
  'USERPROFILE',
  'LOCALAPPDATA',
  'APPDATA',
  'SYSTEMDRIVE',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'COMMONPROGRAMFILES',
  'COMSPEC'
]);

for (const [key, value] of Object.entries(process.env)) {
  const upper = key.toUpperCase();
  if (ALLOWED_KEYS.has(upper) || upper.startsWith('PUPPETEER_')) {
    env[key] = value;
    if (upper === 'PATH') {
      env.PATH = value;
      env.Path = value;
    }
  }
}

const file = process.env.PDF_SERVICE_AUTH_CONFIG_FILE;
if (!file || JSON.parse(fs.readFileSync(file, 'utf8')).identity !== 'pdf') {
  throw new Error('Dedicated PDF identity is required');
}
env.SERVICE_AUTH_CONFIG_FILE = file;

env.REDIS_URL = process.env.PDF_REDIS_URL || process.env.REDIS_URL;
if (!env.REDIS_URL) {
  throw new Error('Dedicated PDF Redis account is required');
}

const development = process.argv.includes('--development');
const isWin = process.platform === 'win32';

let executable = process.execPath;
if (development) {
  const tsxName = isWin ? 'tsx.cmd' : 'tsx';
  const candidates = [
    path.resolve(__dirname, '../../../node_modules/.bin', tsxName),
    path.resolve(__dirname, '../node_modules/.bin', tsxName),
    path.resolve(__dirname, 'node_modules/.bin', tsxName)
  ];
  const found = candidates.find(c => fs.existsSync(c));
  executable = found || (isWin ? 'tsx.cmd' : 'tsx');
}

const args = development
  ? ['watch', path.join(__dirname, 'server.ts')]
  : [path.resolve(__dirname, '../dist/puppeteer/server.js')];

const useShell = isWin && (executable.endsWith('.cmd') || executable.endsWith('.bat'));
const child = spawn(executable, args, { env, stdio: 'inherit', shell: useShell });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      child.kill(signal);
    } catch {
      // Ignore
    }
  });
}

child.on('error', (err) => {
  console.error('PDF renderer could not start:', err?.message || err);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

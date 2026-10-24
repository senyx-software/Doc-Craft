// Native development launcher. Private identities are never sent to Vite/browser processes.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [identity, ...command] = process.argv.slice(2);
if (!identity || !command.length) {
  throw new Error('Usage: with-service-identity.cjs <identity> <command> [arguments]');
}

const directory = path.resolve(process.env.DOCCRAFT_SECRETS_DIR || path.join(__dirname, '../.local/secrets'));
const file = path.join(directory, identity + '.json');
if (!fs.existsSync(file)) {
  throw new Error(`Missing service identity file: ${file}. Please run setup first.`);
}

const config = JSON.parse(fs.readFileSync(file, 'utf8'));
if (config.identity !== identity) {
  throw new Error('Wrong service identity file');
}

const envFilePath = path.join(directory, identity + '.env');
if (!fs.existsSync(envFilePath)) {
  throw new Error(`Missing service env file: ${envFilePath}`);
}

const redisLine = fs.readFileSync(envFilePath, 'utf8')
  .split(/\r?\n/)
  .find(line => line.startsWith('REDIS_URL='));
if (!redisLine) {
  throw new Error('Missing private Redis client configuration');
}

let redisUrl = redisLine.slice('REDIS_URL='.length).trim();
// If running in local native dev and the redis host is the docker name "redis", redirect to local redis host
const localRedisHost = process.env.REDIS_HOST || '127.0.0.1';
if (redisUrl.includes('@redis:')) {
  redisUrl = redisUrl.replace('@redis:', `@${localRedisHost}:`);
}

const env = { ...process.env, SERVICE_AUTH_CONFIG_FILE: file, REDIS_URL: redisUrl };
delete env.SERVICE_AUTH_CONFIG_JSON;

if (identity === 'document') {
  env.PDF_SERVICE_AUTH_CONFIG_FILE = path.join(directory, 'pdf.json');
  const pdfEnvFile = path.join(directory, 'pdf.env');
  if (fs.existsSync(pdfEnvFile)) {
    const pdfLine = fs.readFileSync(pdfEnvFile, 'utf8')
      .split(/\r?\n/)
      .find(line => line.startsWith('REDIS_URL='));
    if (!pdfLine) throw new Error('Missing private PDF Redis account');
    let pdfRedisUrl = pdfLine.slice('REDIS_URL='.length).trim();
    if (pdfRedisUrl.includes('@redis:')) {
      pdfRedisUrl = pdfRedisUrl.replace('@redis:', `@${localRedisHost}:`);
    }
    env.PDF_REDIS_URL = pdfRedisUrl;
  }
}

const isWin = process.platform === 'win32';

// Cross-platform python / command resolution
let executable = command[0];
const args = command.slice(1);

if (executable.includes('.venv')) {
  if (isWin) {
    const winVenv = executable.replace(/[/\\]bin[/\\]python3?$/i, '\\Scripts\\python.exe');
    if (fs.existsSync(winVenv)) {
      executable = winVenv;
    } else {
      executable = 'python';
    }
  } else {
    if (!fs.existsSync(executable)) {
      executable = 'python3';
    }
  }
} else if (isWin && executable === 'python3') {
  executable = 'python';
}

const child = spawn(executable, args, { env, stdio: 'inherit', shell: isWin });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      child.kill(signal);
    } catch {
      // Ignore errors if child is already dead
    }
  });
}

child.on('error', (err) => {
  console.error(`Unable to launch configured service [${executable}]:`, err?.message || err);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

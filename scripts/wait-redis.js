const net = require('net');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let startedServer = false;
let attempts = 0;
const RETRY_INTERVAL_MS = 500;
const MAX_ATTEMPTS = parseInt(process.env.REDIS_WAIT_MAX_RETRIES || '30', 10);

let redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
let redisHost = process.env.REDIS_HOST || '127.0.0.1';

if (process.env.REDIS_URL) {
  try {
    const parsed = new URL(process.env.REDIS_URL);
    if (parsed.hostname) redisHost = parsed.hostname;
    if (parsed.port) redisPort = parseInt(parsed.port, 10);
  } catch {
    // Ignore URL parse error and fall back to REDIS_HOST / REDIS_PORT
  }
}

// In Node 17+, 'localhost' often resolves to IPv6 ::1 first, which fails if Redis binds to 127.0.0.1
if (redisHost === 'localhost') {
  redisHost = '127.0.0.1';
}

function checkRedis() {
  attempts++;
  const client = net.createConnection({ port: redisPort, host: redisHost, autoSelectFamily: true }, () => {
    client.end();
    console.log(`Redis is ready on ${redisHost}:${redisPort}!`);
    process.exit(0);
  });

  client.setTimeout(1000);
  client.on('timeout', () => {
    client.destroy();
  });

  client.on('error', (err) => {
    client.destroy();

    if (!startedServer) {
      startedServer = true;
      const isWin = process.platform === 'win32';
      const binName = isWin ? 'redis-server.exe' : 'redis-server';
      const binPath = path.resolve(__dirname, `../services/redis-bin/src/${binName}`);
      if (fs.existsSync(binPath)) {
        console.log(`Starting local Redis server via ${binName}...`);
        exec(`"${binPath}" ${isWin ? '' : '--daemonize yes'}`, (execErr) => {
          if (execErr) console.error('Failed to auto-start Redis binary:', execErr.message);
        });
      }
    }

    if (attempts >= MAX_ATTEMPTS) {
      console.error(`\n[ERROR] Redis connection timed out after ${attempts} attempts (${(attempts * RETRY_INTERVAL_MS) / 1000}s).`);
      console.error(`Could not connect to Redis at ${redisHost}:${redisPort}.`);
      console.error('Diagnostic info:');
      console.error(`  - Target host: ${redisHost}`);
      console.error(`  - Target port: ${redisPort}`);
      console.error(`  - Last error: ${err ? err.message : 'Unknown error'}`);
      console.error('\nPlease ensure Redis is running before starting the services.');
      console.error('You can start Redis using Docker:');
      console.error('  docker compose up -d redis\n');
      process.exit(1);
    }

    setTimeout(checkRedis, RETRY_INTERVAL_MS);
  });
}

checkRedis();

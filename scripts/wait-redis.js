const net = require('net');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let startedServer = false;

function checkRedis() {
  const client = net.createConnection({ port: 6379, host: '127.0.0.1' }, () => {
    client.end();
    console.log('Redis is ready on port 6379!');
    process.exit(0);
  });

  client.on('error', () => {
    if (!startedServer) {
      startedServer = true;
      const binPath = path.resolve(__dirname, '../services/redis-bin/src/redis-server');
      if (fs.existsSync(binPath)) {
        console.log('Starting local Redis server...');
        exec(`"${binPath}" --daemonize yes`, (err) => {
          if (err) console.error('Failed to auto-start Redis:', err.message);
        });
      }
    }
    setTimeout(checkRedis, 200);
  });
}

checkRedis();


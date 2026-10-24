#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const isWin = process.platform === 'win32';
const rawArgs = process.argv.slice(2);

function findPython(baseDir) {
  const candidates = [];
  if (baseDir) {
    if (isWin) {
      candidates.push(path.join(baseDir, 'Scripts', 'python.exe'));
      candidates.push(path.join(baseDir, '.venv', 'Scripts', 'python.exe'));
      candidates.push(path.join(baseDir, 'python.exe'));
    } else {
      candidates.push(path.join(baseDir, 'bin', 'python3'));
      candidates.push(path.join(baseDir, 'bin', 'python'));
      candidates.push(path.join(baseDir, '.venv', 'bin', 'python3'));
      candidates.push(path.join(baseDir, '.venv', 'bin', 'python'));
    }
  }

  // Check current working directory
  if (isWin) {
    candidates.push(path.resolve('.venv', 'Scripts', 'python.exe'));
  } else {
    candidates.push(path.resolve('.venv', 'bin', 'python3'));
    candidates.push(path.resolve('.venv', 'bin', 'python'));
  }

  // Check process.env.VIRTUAL_ENV
  if (process.env.VIRTUAL_ENV) {
    if (isWin) {
      candidates.push(path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe'));
    } else {
      candidates.push(path.join(process.env.VIRTUAL_ENV, 'bin', 'python3'));
      candidates.push(path.join(process.env.VIRTUAL_ENV, 'bin', 'python'));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return isWin ? 'python' : 'python3';
}

let pythonExecutable = '';
let pythonArgs = [];

if (rawArgs.length > 0) {
  const first = rawArgs[0];
  // Check if first arg specifies a path to a python binary or a directory
  if (first.includes('.venv') || first.endsWith('python') || first.endsWith('python3') || first.endsWith('python.exe')) {
    // It's a python path like services/admin-api/.venv/bin/python3
    let dir = path.dirname(first);
    if (dir.endsWith('bin') || dir.endsWith('Scripts')) {
      dir = path.dirname(dir);
    }
    pythonExecutable = findPython(dir);
    pythonArgs = rawArgs.slice(1);
  } else if (!first.startsWith('-') && fs.existsSync(first) && fs.statSync(first).isDirectory()) {
    // First arg is a directory like services/analytics or services/admin-api
    pythonExecutable = findPython(first);
    pythonArgs = rawArgs.slice(1);
  } else {
    // Arguments are standard python flags (e.g. -m uvicorn ...)
    pythonExecutable = findPython(process.cwd());
    pythonArgs = rawArgs;
  }
} else {
  pythonExecutable = findPython(process.cwd());
  pythonArgs = [];
}

const child = spawn(pythonExecutable, pythonArgs, {
  stdio: 'inherit',
  shell: false
});

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
  console.error(`Failed to start python executable [${pythonExecutable}]:`, err?.message || err);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

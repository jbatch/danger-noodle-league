import { spawn } from 'node:child_process';
import { request } from 'node:http';

try {
  process.loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const publicPort = process.env.PORT || '3000';
const frontendPort = process.env.FRONTEND_PORT || '3001';
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

const children = [];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

function watchChild(child) {
  child.on('exit', (code) => {
    if (!stopping) {
      process.exitCode = code || 1;
      stop();
    }
  });
}

function start(command, args, options) {
  const child = spawn(command, args, options);
  children.push(child);
  watchChild(child);
  return child;
}

function waitForFrontend(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function probe() {
      if (stopping) {
        reject(new Error('Development server startup was interrupted'));
        return;
      }
      const readinessRequest = request(
        frontendUrl,
        { method: 'HEAD' },
        (response) => {
          response.resume();
          resolve();
        },
      );
      readinessRequest.setTimeout(1_000, () => readinessRequest.destroy());
      readinessRequest.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Vinext did not become ready at ${frontendUrl}`));
          return;
        }
        setTimeout(probe, 100);
      });
      readinessRequest.end();
    }
    probe();
  });
}

start(
  process.execPath,
  [
    'node_modules/vinext/dist/cli.js',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    frontendPort,
  ],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

try {
  await waitForFrontend();
} catch (error) {
  if (!stopping) console.error(error);
  process.exitCode = 1;
  stop();
}

if (!stopping) {
  start(process.execPath, ['server/index.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: publicPort,
      DEV_FRONTEND_URL: frontendUrl,
    },
  });
}

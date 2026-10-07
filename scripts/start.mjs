import { spawn } from 'node:child_process';
import { request } from 'node:http';

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

function watchChild(child, name) {
  child.on('error', (error) => {
    console.error(`${name} failed to start:`, error);
    process.exitCode = 1;
    stop();
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(
      `${name} exited unexpectedly (${signal || `code ${code ?? 1}`})`,
    );
    process.exitCode = code || 1;
    stop();
  });
}

function start(name, command, args, env) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  children.push(child);
  watchChild(child, name);
  return child;
}

function waitForFrontend(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function probe() {
      if (stopping) {
        reject(new Error('Production server startup was interrupted'));
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

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

start('Vinext frontend', process.execPath, ['dist/standalone/server.js'], {
  HOST: '127.0.0.1',
  PORT: frontendPort,
});

try {
  await waitForFrontend();
} catch (error) {
  if (!stopping) console.error(error);
  process.exitCode = 1;
  stop();
}

if (!stopping) {
  start('Danger Noodle server', process.execPath, ['server/index.ts'], {
    FRONTEND_URL: frontendUrl,
    GAME_HOST: process.env.GAME_HOST || '0.0.0.0',
    PORT: publicPort,
  });
}

import { spawn } from 'node:child_process';

try {
  process.loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const publicPort = process.env.PORT || '3000';
const frontendPort = process.env.FRONTEND_PORT || '3001';
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

const children = [
  spawn(process.execPath, ['server/index.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: publicPort,
      DEV_FRONTEND_URL: frontendUrl,
    },
  }),
  spawn(
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
      env: { ...process.env, DEV_HOST: '' },
    },
  ),
];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping && code && code !== 0) {
      process.exitCode = code;
      stop();
    }
  });
}

import {
  createServer,
  request as createProxyRequest,
  type Server as HttpServer,
} from 'node:http';
import { connect as connectTcp } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, InputState } from '../shared/protocol.ts';
import { GameRoom } from './simulation.ts';

const STEP_RATE = 60;
const SNAPSHOT_RATE = 20;

type PlayerSocket = WebSocket & { playerId?: string; roomId?: string };

function cleanRoom(value: string | null) {
  const clean = (value || 'NOODLE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return clean || 'NOODLE';
}

function cleanName(value: string | null) {
  return (value || 'Mystery Noodle').slice(0, 24);
}

function isInput(value: unknown): value is InputState {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  return ['left', 'right', 'jump', 'power'].every(
    (key) => typeof input[key] === 'boolean',
  );
}

export function createGameServer(frontendUrl = process.env.DEV_FRONTEND_URL) {
  const rooms = new Map<string, GameRoom>();
  let nextPlayerId = 1;
  const frontend = frontendUrl ? new URL(frontendUrl) : null;

  const httpServer: HttpServer = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    if (frontend) {
      const headers = { ...request.headers, host: frontend.host };
      const proxyRequest = createProxyRequest(
        {
          protocol: frontend.protocol,
          hostname: frontend.hostname,
          port: frontend.port,
          method: request.method,
          path: request.url,
          headers,
        },
        (proxyResponse) => {
          response.writeHead(
            proxyResponse.statusCode || 502,
            proxyResponse.headers,
          );
          proxyResponse.pipe(response);
        },
      );
      proxyRequest.on('error', () => {
        if (!response.headersSent) {
          response.writeHead(502, { 'content-type': 'text/plain' });
        }
        response.end('Frontend development server is starting');
      });
      request.pipe(proxyRequest);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Danger Noodle League multiplayer server');
  });

  const webSockets = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      if (frontend) {
        const upstream = connectTcp(
          {
            host: frontend.hostname,
            port: Number(frontend.port),
          },
          () => {
            const headerLines = [
              `${request.method} ${request.url} HTTP/${request.httpVersion}`,
            ];
            for (let index = 0; index < request.rawHeaders.length; index += 2) {
              const name = request.rawHeaders[index];
              const value =
                name.toLowerCase() === 'host'
                  ? frontend.host
                  : request.rawHeaders[index + 1];
              headerLines.push(`${name}: ${value}`);
            }
            upstream.write(`${headerLines.join('\r\n')}\r\n\r\n`);
            if (head.length) upstream.write(head);
            socket.pipe(upstream).pipe(socket);
          },
        );
        upstream.on('error', () => socket.destroy());
        socket.on('error', () => upstream.destroy());
        return;
      }
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSockets.emit('connection', webSocket, request);
    });
  });

  webSockets.on('connection', (rawSocket, request) => {
    const socket = rawSocket as PlayerSocket;
    const url = new URL(request.url || '/', 'http://localhost');
    const roomId = cleanRoom(url.searchParams.get('room'));
    const name = cleanName(url.searchParams.get('name'));
    const playerId = `p${nextPlayerId++}`;
    const room = rooms.get(roomId) || new GameRoom(roomId);
    rooms.set(roomId, room);
    room.addPlayer(playerId, name);
    socket.playerId = playerId;
    socket.roomId = roomId;

    socket.send(JSON.stringify({ type: 'welcome', playerId, room: roomId }));
    socket.send(JSON.stringify(room.snapshot()));

    socket.on('message', (data) => {
      try {
        const text =
          data instanceof ArrayBuffer
            ? Buffer.from(data).toString('utf8')
            : Array.isArray(data)
              ? Buffer.concat(data).toString('utf8')
              : data.toString('utf8');
        const message = JSON.parse(text) as ClientMessage;
        if (message.type === 'input' && isInput(message.input)) {
          room.setInput(playerId, message.input);
        } else if (
          message.type === 'ping' &&
          Number.isFinite(message.sentAt)
        ) {
          socket.send(JSON.stringify({ type: 'pong', sentAt: message.sentAt }));
        } else if (
          message.type === 'latency' &&
          Number.isFinite(message.pingMs)
        ) {
          room.setPing(playerId, message.pingMs);
        }
      } catch {
        // Ignore malformed client messages; the next valid input wins.
      }
    });

    socket.on('close', () => {
      room.removePlayer(playerId);
      if (room.snakes.size === 0) rooms.delete(roomId);
    });
  });

  let lastStep = performance.now();
  const stepTimer = setInterval(() => {
    const current = performance.now();
    const dt = (current - lastStep) / 1000;
    lastStep = current;
    const now = Date.now();
    for (const room of rooms.values()) room.step(now, dt);
  }, 1000 / STEP_RATE);

  const snapshotTimer = setInterval(() => {
    const snapshots = new Map<string, string>();
    for (const rawSocket of webSockets.clients) {
      const socket = rawSocket as PlayerSocket;
      if (socket.readyState !== WebSocket.OPEN || !socket.roomId) continue;
      let payload = snapshots.get(socket.roomId);
      if (!payload) {
        const room = rooms.get(socket.roomId);
        if (!room) continue;
        payload = JSON.stringify(room.snapshot());
        snapshots.set(socket.roomId, payload);
      }
      socket.send(payload);
    }
  }, 1000 / SNAPSHOT_RATE);

  function close() {
    clearInterval(stepTimer);
    clearInterval(snapshotTimer);
    for (const socket of webSockets.clients) socket.close();
    return new Promise<void>((resolve, reject) => {
      webSockets.close(() => {
        if (!httpServer.listening) {
          resolve();
          return;
        }
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    });
  }

  return { httpServer, webSockets, rooms, close };
}

export async function startGameServer(port = Number(process.env.PORT || 3000)) {
  const gameServer = createGameServer();
  const host =
    process.env.GAME_HOST || (process.env.DEV_HOST ? '0.0.0.0' : '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      gameServer.httpServer.once('error', reject);
      gameServer.httpServer.listen(port, host, resolve);
    });
  } catch (error) {
    await gameServer.close();
    throw error;
  }
  const address = gameServer.httpServer.address();
  const actualPort =
    typeof address === 'object' && address ? address.port : port;
  console.log(
    `Danger Noodle server listening on http://${host}:${actualPort} (WebSocket: /ws)`,
  );
  return { ...gameServer, port: actualPort };
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryPath) {
  startGameServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

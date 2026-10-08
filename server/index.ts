import {
  createServer,
  request as createProxyRequest,
  type Server as HttpServer,
} from 'node:http';
import { connect as connectTcp } from 'node:net';
import { pipeline } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, InputState } from '../shared/protocol.ts';
import { GameRoom } from './simulation.ts';
import { encodeSnapshotPayload } from './snapshot-codec.ts';
import { NetworkTelemetry } from './telemetry.ts';

const STEP_RATE = 60;
const SNAPSHOT_RATE = 20;
const MAX_SOCKET_BUFFERED_BYTES = 128 * 1024;
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
type PlayerSocket = WebSocket & {
  playerId?: string;
  roomId?: string;
  lastInputSequence?: number;
  alive?: boolean;
};

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

function proxyHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) => value !== undefined && !HOP_BY_HOP_HEADERS.has(name),
    ),
  );
}

export function createGameServer(
  frontendUrl = process.env.FRONTEND_URL || process.env.DEV_FRONTEND_URL,
  options: { developmentProxy?: boolean } = {
    developmentProxy: Boolean(process.env.DEV_FRONTEND_URL),
  },
) {
  const rooms = new Map<string, GameRoom>();
  const telemetry = new NetworkTelemetry();
  let nextPlayerId = 1;
  const frontend = frontendUrl ? new URL(frontendUrl) : null;

  const httpServer: HttpServer = createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/health') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      });
      response.end(
        JSON.stringify({
          ok: true,
          rooms: rooms.size,
          connections: webSockets.clients.size,
        }),
      );
      return;
    }
    if (pathname === '/telemetry') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      });
      response.end(
        JSON.stringify(
          telemetry.snapshot({
            rooms: rooms.size,
            connections: webSockets.clients.size,
          }),
        ),
      );
      return;
    }
    if (frontend) {
      const proxyRequest = createProxyRequest(
        {
          protocol: frontend.protocol,
          hostname: frontend.hostname,
          port: frontend.port,
          method: request.method,
          path: request.url,
          // Preserve the browser-facing Host/Origin pair. Vite validates dev
          // asset requests against it and rejects them as cross-site when the
          // public host is rewritten to the loopback upstream.
          headers: proxyHeaders(request.headers),
        },
        (proxyResponse) => {
          const headers = proxyHeaders(proxyResponse.headers);
          const contentType = headers['content-type'];
          const isHtml =
            typeof contentType === 'string' &&
            contentType.startsWith('text/html');
          const isJavaScript =
            typeof contentType === 'string' &&
            (contentType.startsWith('text/javascript') ||
              contentType.startsWith('application/javascript'));
          if (options.developmentProxy && isJavaScript) {
            // The Vinext bootstrap is unversioned while its imports point into
            // Vite's versioned optimizer graph. Never retain development
            // JavaScript, so the two cannot drift across server restarts.
            headers['cache-control'] = 'no-store';
          } else if (isHtml) {
            // Vite's module URLs carry their own version. Keep navigations
            // fresh while allowing production assets to retain their headers.
            headers['cache-control'] = 'no-store';
          }
          response.writeHead(proxyResponse.statusCode || 502, headers);
          pipeline(proxyResponse, response, (error) => {
            if (error && !response.destroyed) response.destroy(error);
          });
        },
      );
      proxyRequest.setTimeout(60_000, () => {
        proxyRequest.destroy(new Error('Frontend proxy timed out'));
      });
      proxyRequest.on('error', (error) => {
        console.error(`Frontend proxy failed: ${error.message}`);
        if (!response.headersSent) {
          response.writeHead(503, {
            'content-type': 'text/plain',
            'retry-after': '1',
          });
          response.end('Frontend development server is unavailable');
        } else if (!response.destroyed) {
          response.destroy(error);
        }
      });
      request.on('aborted', () => proxyRequest.destroy());
      request.pipe(proxyRequest);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Danger Noodle League multiplayer server');
  });

  const webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: 8_192,
    perMessageDeflate: {
      threshold: 1_024,
      concurrencyLimit: 10,
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      zlibDeflateOptions: { level: 6, memLevel: 7 },
    },
  });

  function encodeSnapshot(room: GameRoom) {
    const started = performance.now();
    const encoded = encodeSnapshotPayload(room.snapshot());
    telemetry.snapshotEncodeMs.observe(performance.now() - started);
    telemetry.snapshotBytes.observe(encoded.bytes);
    telemetry.snapshotsEncoded += 1;
    return encoded;
  }

  function sendSnapshot(
    socket: PlayerSocket,
    encoded: { payload: string; bytes: number },
  ) {
    telemetry.socketBufferedBytes.observe(socket.bufferedAmount);
    if (socket.bufferedAmount > MAX_SOCKET_BUFFERED_BYTES) {
      telemetry.snapshotsSkippedBackpressure += 1;
      return;
    }
    socket.send(encoded.payload);
    telemetry.snapshotsSent += 1;
    telemetry.snapshotBytesSent += encoded.bytes;
  }

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
              const value = request.rawHeaders[index + 1];
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
    telemetry.connectionsAccepted += 1;
    const socket = rawSocket as PlayerSocket;
    if (socket.extensions.includes('permessage-deflate'))
      telemetry.compressionNegotiatedConnections += 1;
    const url = new URL(request.url || '/', 'http://localhost');
    const roomId = cleanRoom(url.searchParams.get('room'));
    const name = cleanName(url.searchParams.get('name'));
    const devMode = url.searchParams.get('dev') === 'true';
    const levelId = url.searchParams.get('level');
    const playerId = `p${nextPlayerId++}`;
    const room =
      rooms.get(roomId) ||
      new GameRoom(roomId, Math.random, {
        devMode,
        levelId: levelId ?? undefined,
        managedMatch: true,
      });
    rooms.set(roomId, room);
    try {
      room.addPlayer(playerId, name);
    } catch {
      telemetry.connectionsClosed += 1;
      socket.close(1008, 'Room is full');
      return;
    }
    socket.playerId = playerId;
    socket.roomId = roomId;
    socket.lastInputSequence = -1;
    socket.alive = true;
    socket.on('pong', () => {
      socket.alive = true;
    });

    socket.send(JSON.stringify({ type: 'welcome', playerId, room: roomId }));
    const initialSnapshot = encodeSnapshot(room);
    for (const rawRoomSocket of webSockets.clients) {
      const roomSocket = rawRoomSocket as PlayerSocket;
      if (
        roomSocket.readyState !== WebSocket.OPEN ||
        roomSocket.roomId !== roomId
      )
        continue;
      sendSnapshot(roomSocket, initialSnapshot);
    }

    socket.on('message', (data) => {
      telemetry.messagesReceived += 1;
      try {
        const text =
          data instanceof ArrayBuffer
            ? Buffer.from(data).toString('utf8')
            : Array.isArray(data)
              ? Buffer.concat(data).toString('utf8')
              : data.toString('utf8');
        const message = JSON.parse(text) as ClientMessage;
        if (
          message.type === 'input' &&
          isInput(message.input) &&
          Number.isSafeInteger(message.sequence) &&
          message.sequence > (socket.lastInputSequence ?? -1)
        ) {
          socket.lastInputSequence = message.sequence;
          room.setInput(playerId, message.input);
        } else if (message.type === 'ping' && Number.isFinite(message.sentAt)) {
          socket.send(JSON.stringify({ type: 'pong', sentAt: message.sentAt }));
        } else if (
          message.type === 'latency' &&
          Number.isFinite(message.pingMs)
        ) {
          room.setPing(playerId, message.pingMs);
          telemetry.roundTripMs.observe(message.pingMs);
        } else if (
          message.type === 'network-stats' &&
          Number.isFinite(message.snapshotIntervalMs) &&
          message.snapshotIntervalMs >= 0 &&
          Number.isFinite(message.snapshotJitterMs) &&
          message.snapshotJitterMs >= 0 &&
          Number.isFinite(message.snapshotDecodeMs) &&
          message.snapshotDecodeMs >= 0 &&
          Number.isSafeInteger(message.droppedSnapshots) &&
          message.droppedSnapshots >= 0 &&
          Number.isSafeInteger(message.staleSnapshots) &&
          message.staleSnapshots >= 0
        ) {
          telemetry.clientSnapshotIntervalMs.observe(
            message.snapshotIntervalMs,
          );
          telemetry.clientSnapshotJitterMs.observe(message.snapshotJitterMs);
          telemetry.clientSnapshotDecodeMs.observe(message.snapshotDecodeMs);
          telemetry.clientReportedDroppedSnapshots += Math.min(
            message.droppedSnapshots,
            1_000_000,
          );
          telemetry.clientReportedStaleSnapshots += Math.min(
            message.staleSnapshots,
            1_000_000,
          );
        } else if (message.type === 'ready') {
          room.setReady(playerId, Boolean(message.ready));
        } else if (message.type === 'configure') {
          room.configure(playerId, {
            mode: message.mode,
            levelId: message.levelId,
            winsToMatch: message.winsToMatch,
          });
        } else if (message.type === 'start-match') {
          room.startMatch(playerId);
        } else if (message.type === 'rematch') {
          room.rematch(playerId);
        } else if (message.type === 'return-to-lobby') {
          room.returnToLobby(playerId);
        }
      } catch {
        telemetry.malformedMessages += 1;
        // Ignore malformed client messages; the next valid input wins.
      }
    });

    socket.on('close', () => {
      telemetry.connectionsClosed += 1;
      room.removePlayer(playerId);
      if (room.players.size === 0) rooms.delete(roomId);
    });
  });

  const fixedStep = 1 / STEP_RATE;
  let lastStep = performance.now();
  let lastStepTimer = lastStep;
  let accumulated = 0;
  const stepTimer = setInterval(() => {
    const current = performance.now();
    telemetry.eventLoopLagMs.observe(
      Math.max(0, current - lastStepTimer - 1000 / STEP_RATE),
    );
    lastStepTimer = current;
    accumulated = Math.min(accumulated + (current - lastStep) / 1000, 0.25);
    lastStep = current;
    while (accumulated >= fixedStep) {
      const tickStarted = performance.now();
      const now = Date.now();
      for (const room of rooms.values()) room.step(now, fixedStep);
      telemetry.tickDurationMs.observe(performance.now() - tickStarted);
      accumulated -= fixedStep;
    }
  }, 1000 / STEP_RATE);

  const snapshotTimer = setInterval(() => {
    const snapshots = new Map<string, { payload: string; bytes: number }>();
    for (const rawSocket of webSockets.clients) {
      const socket = rawSocket as PlayerSocket;
      if (socket.readyState !== WebSocket.OPEN || !socket.roomId) continue;
      let encoded = snapshots.get(socket.roomId);
      if (!encoded) {
        const room = rooms.get(socket.roomId);
        if (!room) continue;
        encoded = encodeSnapshot(room);
        snapshots.set(socket.roomId, encoded);
      }
      sendSnapshot(socket, encoded);
    }
  }, 1000 / SNAPSHOT_RATE);

  const heartbeatTimer = setInterval(() => {
    for (const rawSocket of webSockets.clients) {
      const socket = rawSocket as PlayerSocket;
      if (socket.alive === false) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, 15_000);

  function close() {
    clearInterval(stepTimer);
    clearInterval(snapshotTimer);
    clearInterval(heartbeatTimer);
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

  return { httpServer, webSockets, rooms, telemetry, close };
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

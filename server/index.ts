import {
  createServer,
  request as createProxyRequest,
  type IncomingMessage,
  type ServerResponse,
  type Server as HttpServer,
} from 'node:http';
import { randomBytes } from 'node:crypto';
import { connect as connectTcp } from 'node:net';
import { pipeline } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  AccountIdentity,
  ClientMessage,
  InputState,
} from '../shared/protocol.ts';
import { AccountError, AccountStore } from './account-store.ts';
import type { CommendationCounts } from '../shared/badges.ts';
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
  accountId?: string;
  connectionToken?: string;
};

export type GameServerOptions = {
  developmentProxy?: boolean;
  accountStore?: AccountStore;
};

const ACCOUNT_COOKIE = 'dnl_session';
const MAX_ACCOUNT_BODY_BYTES = 2_048;

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

function parseCookies(request: IncomingMessage) {
  return Object.fromEntries(
    (request.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator < 0) return [part, ''];
        const value = part.slice(separator + 1);
        try {
          return [part.slice(0, separator), decodeURIComponent(value)];
        } catch {
          return [part.slice(0, separator), ''];
        }
      }),
  );
}

function sessionToken(request: IncomingMessage) {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return parseCookies(request)[ACCOUNT_COOKIE] || null;
}

function accountCookie(token: string | null, request: IncomingMessage) {
  const forwardedProtocol = request.headers['x-forwarded-proto'];
  const secureRequest =
    process.env.ACCOUNT_COOKIE_SECURE === 'true' ||
    forwardedProtocol === 'https' ||
    (Array.isArray(forwardedProtocol) && forwardedProtocol.includes('https')) ||
    'encrypted' in request.socket;
  const secure = secureRequest ? '; Secure' : '';
  return token
    ? `${ACCOUNT_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`
    : `${ACCOUNT_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: object,
  cookie?: string,
) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolvePromise, reject) => {
    let bytes = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_ACCOUNT_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        if (tooLarge) throw new Error('request body is too large');
        const parsed = JSON.parse(
          Buffer.concat(chunks).toString('utf8'),
        ) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('invalid JSON body');
        resolvePromise(parsed as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
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
  options: GameServerOptions = {
    developmentProxy: Boolean(process.env.DEV_FRONTEND_URL),
  },
) {
  const rooms = new Map<string, GameRoom>();
  const telemetry = new NetworkTelemetry();
  const accountStore = options.accountStore ?? new AccountStore();
  const socketsByConnectionToken = new Map<string, PlayerSocket>();
  let nextPlayerId = 1;
  const frontend = frontendUrl ? new URL(frontendUrl) : null;

  function anonymousName(requestedName: string) {
    if (!accountStore.isUsernameRegistered(requestedName)) return requestedName;
    return cleanName(`${requestedName.slice(0, 10)} Guest`);
  }

  function broadcastRoom(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    const encoded = encodeSnapshot(room);
    for (const rawRoomSocket of webSockets.clients) {
      const roomSocket = rawRoomSocket as PlayerSocket;
      if (
        roomSocket.readyState === WebSocket.OPEN &&
        roomSocket.roomId === roomId
      )
        sendSnapshot(roomSocket, encoded);
    }
  }

  function bindSocketToAccount(socket: PlayerSocket, account: AccountIdentity) {
    if (!socket.playerId || !socket.roomId)
      return 'That game connection is no longer active.';
    const duplicate = [...webSockets.clients].some((candidate) => {
      const roomSocket = candidate as PlayerSocket;
      return (
        roomSocket !== socket &&
        roomSocket.roomId === socket.roomId &&
        roomSocket.accountId === account.id
      );
    });
    if (duplicate) return 'That account is already playing in this room.';
    const room = rooms.get(socket.roomId);
    if (!room?.renamePlayer(socket.playerId, account.username, true))
      return 'That game connection is no longer active.';
    room.setPlayerCommendations(socket.playerId, account.commendations);
    socket.accountId = account.id;
    broadcastRoom(socket.roomId);
    return null;
  }

  function connectionFromBody(body: Record<string, unknown>) {
    return typeof body.connectionToken === 'string'
      ? socketsByConnectionToken.get(body.connectionToken)
      : undefined;
  }

  function reserveAccountName(account: AccountIdentity, owner?: PlayerSocket) {
    const affectedRooms = new Set<string>();
    for (const candidate of webSockets.clients) {
      const socket = candidate as PlayerSocket;
      if (
        socket === owner ||
        socket.accountId ||
        !socket.playerId ||
        !socket.roomId
      )
        continue;
      const room = rooms.get(socket.roomId);
      const player = room?.players.get(socket.playerId);
      if (
        !player ||
        player.name.toLocaleLowerCase('en-US') !==
          account.username.toLocaleLowerCase('en-US')
      )
        continue;
      room?.renamePlayer(socket.playerId, anonymousName(player.name), false);
      affectedRooms.add(socket.roomId);
    }
    for (const roomId of affectedRooms) broadcastRoom(roomId);
  }

  async function handleAccountRequest(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ) {
    if (pathname === '/api/account/session' && request.method === 'GET') {
      const account = accountStore.accountForSession(sessionToken(request));
      if (!account) {
        sendJson(
          response,
          401,
          { ok: false, code: 'not-authenticated' },
          accountCookie(null, request),
        );
        return;
      }
      sendJson(response, 200, { ok: true, account });
      return;
    }

    if (
      ![
        '/api/account/register',
        '/api/account/login',
        '/api/account/logout',
      ].includes(pathname) ||
      request.method !== 'POST'
    ) {
      sendJson(response, 405, { ok: false, code: 'method-not-allowed' });
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, {
        ok: false,
        code: 'invalid-request',
        error: 'Invalid account request.',
      });
      return;
    }

    if (pathname === '/api/account/logout') {
      const token = sessionToken(request);
      const account = accountStore.accountForSession(token);
      accountStore.revokeSession(token);
      const socket = connectionFromBody(body);
      if (socket?.accountId && account?.id === socket.accountId) {
        socket.accountId = undefined;
        if (socket.playerId && socket.roomId) {
          const room = rooms.get(socket.roomId);
          room?.renamePlayer(
            socket.playerId,
            anonymousName(`${account.username.slice(0, 10)} Guest`),
            false,
          );
          broadcastRoom(socket.roomId);
        }
      }
      sendJson(response, 200, { ok: true }, accountCookie(null, request));
      return;
    }

    const connectionRequested =
      typeof body.connectionToken === 'string' && body.connectionToken !== '';
    const socket = connectionFromBody(body);
    if (connectionRequested && !socket) {
      sendJson(response, 409, {
        ok: false,
        code: 'connection-expired',
        error: 'That game connection has ended. Reopen the account panel.',
      });
      return;
    }
    if (socket?.accountId) {
      sendJson(response, 409, {
        ok: false,
        code: 'already-authenticated',
        error: 'This game connection is already using a saved account.',
      });
      return;
    }

    try {
      const registering = pathname === '/api/account/register';
      const result = registering
        ? await accountStore.register(body.username, body.password)
        : await accountStore.login(body.username, body.password);
      if (socket) {
        const room = socket.roomId ? rooms.get(socket.roomId) : null;
        const sessionCommendations = socket.playerId
          ? room?.pendingPlayerCommendations(socket.playerId)
          : null;
        if (sessionCommendations) {
          const updated = accountStore.addCommendations(
            result.account.id,
            sessionCommendations,
          );
          if (updated) result.account = updated;
        }
        const bindError = bindSocketToAccount(socket, result.account);
        if (bindError) {
          accountStore.revokeSession(result.token);
          sendJson(response, 409, {
            ok: false,
            code: 'account-in-use',
            error: bindError,
          });
          return;
        }
      }
      if (registering) reserveAccountName(result.account, socket);
      sendJson(
        response,
        200,
        { ok: true, account: result.account },
        accountCookie(result.token, request),
      );
    } catch (error) {
      if (error instanceof AccountError) {
        const status =
          error.code === 'username-taken'
            ? 409
            : error.code === 'invalid-credentials'
              ? 401
              : 400;
        sendJson(response, status, {
          ok: false,
          code: error.code,
          error: error.message,
        });
        return;
      }
      console.error('Account request failed', error);
      sendJson(response, 500, {
        ok: false,
        code: 'account-error',
        error: 'The account service could not complete that request.',
      });
    }
  }

  const httpServer: HttpServer = createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname.startsWith('/api/account/')) {
      void handleAccountRequest(request, response, pathname);
      return;
    }
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
    const requestedName = cleanName(url.searchParams.get('name'));
    const account = accountStore.accountForSession(sessionToken(request));
    const name = account?.username ?? anonymousName(requestedName);
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
    if (
      account &&
      [...webSockets.clients].some((candidate) => {
        const roomSocket = candidate as PlayerSocket;
        return (
          roomSocket !== socket &&
          roomSocket.roomId === roomId &&
          roomSocket.accountId === account.id
        );
      })
    ) {
      telemetry.connectionsClosed += 1;
      socket.close(1008, 'Account is already active in this room');
      return;
    }
    try {
      room.addPlayer(
        playerId,
        name,
        Boolean(account),
        account?.commendations ?? {},
      );
    } catch {
      telemetry.connectionsClosed += 1;
      socket.close(1008, 'Room is full');
      return;
    }
    socket.playerId = playerId;
    socket.roomId = roomId;
    socket.lastInputSequence = -1;
    socket.alive = true;
    socket.accountId = account?.id;
    socket.connectionToken = randomBytes(24).toString('base64url');
    socketsByConnectionToken.set(socket.connectionToken, socket);
    socket.on('pong', () => {
      socket.alive = true;
    });

    socket.send(
      JSON.stringify({
        type: 'welcome',
        playerId,
        room: roomId,
        account,
        connectionToken: socket.connectionToken,
      }),
    );
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
      if (socket.connectionToken)
        socketsByConnectionToken.delete(socket.connectionToken);
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
      for (const room of rooms.values()) {
        room.step(now, fixedStep);
        for (const award of room.drainCommendationAwards()) {
          const socket = [...webSockets.clients]
            .map((candidate) => candidate as PlayerSocket)
            .find(
              (candidate) =>
                candidate.roomId === room.id &&
                candidate.playerId === award.playerId &&
                candidate.accountId,
            );
          if (!socket?.accountId) continue;
          const additions = Object.fromEntries(
            award.commendations.map((id) => [id, 1]),
          ) as CommendationCounts;
          accountStore.addCommendations(socket.accountId, additions);
        }
      }
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

  return { httpServer, webSockets, rooms, telemetry, accountStore, close };
}

export async function startGameServer(
  port = Number(process.env.PORT || 3000),
  options?: GameServerOptions,
) {
  const gameServer = createGameServer(undefined, options);
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

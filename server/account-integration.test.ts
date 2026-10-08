import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { RoomPlayerSnapshot, ServerMessage } from '../shared/protocol.ts';
import { AccountStore } from './account-store.ts';
import { startGameServer } from './index.ts';

function parseMessage(raw: WebSocket.RawData) {
  const text =
    raw instanceof ArrayBuffer
      ? Buffer.from(raw).toString('utf8')
      : Array.isArray(raw)
        ? Buffer.concat(raw).toString('utf8')
        : raw.toString('utf8');
  return JSON.parse(text) as ServerMessage;
}

function connectWithWelcome(url: string, cookie?: string) {
  return new Promise<{ socket: WebSocket; welcome: ServerMessage }>(
    (resolve, reject) => {
      const socket = new WebSocket(url, cookie ? { headers: { cookie } } : {});
      const onMessage = (raw: WebSocket.RawData) => {
        const message = parseMessage(raw);
        if (message.type !== 'welcome') return;
        socket.off('message', onMessage);
        resolve({ socket, welcome: message });
      };
      socket.on('message', onMessage);
      socket.once('error', reject);
    },
  );
}

function waitForPlayer(
  socket: WebSocket,
  predicate: (player: RoomPlayerSnapshot) => boolean,
) {
  return new Promise<RoomPlayerSnapshot>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timed out waiting for account snapshot')),
      2_000,
    );
    const onMessage = (raw: WebSocket.RawData) => {
      const message = parseMessage(raw);
      if (message.type !== 'snapshot') return;
      const player = message.players.find(predicate);
      if (!player) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(player);
    };
    socket.on('message', onMessage);
  });
}

function closeSocket(socket: WebSocket) {
  return new Promise<void>((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once('close', () => resolve());
    socket.close();
  });
}

void test('an anonymous player can convert in place and return with the saved name', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'danger-noodle-account-api-'));
  const accountStore = new AccountStore(join(directory, 'accounts.json'));
  const server = await startGameServer(0, { accountStore });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const gameUrl = `ws://127.0.0.1:${server.port}/ws?room=SAVE&name=Saved%20Noodle`;
  const sockets: WebSocket[] = [];

  try {
    const anonymous = await connectWithWelcome(gameUrl);
    sockets.push(anonymous.socket);
    assert.equal(anonymous.welcome.type, 'welcome');
    if (anonymous.welcome.type !== 'welcome') return;
    assert.equal(anonymous.welcome.account, null);
    const anonymousPlayerId = anonymous.welcome.playerId;

    const room = server.rooms.get('SAVE');
    const snake = room?.snakes.get(anonymousPlayerId);
    assert.ok(room && snake);
    snake.dots = 10;
    room.players.get(anonymousPlayerId)!.commendations['egg-lord'] = 2;
    room.players.get(anonymousPlayerId)!.pendingCommendations['egg-lord'] = 2;
    room.players.get(anonymousPlayerId)!.achievements.add('first-win');
    room.players.get(anonymousPlayerId)!.pendingAchievements.add('first-win');
    assert.equal(
      room.snapshot().players.find((player) => player.id === anonymousPlayerId)
        ?.commendations['egg-lord'],
      2,
    );

    const savedSnapshot = waitForPlayer(
      anonymous.socket,
      (player) =>
        player.name === 'Saved Noodle' &&
        player.saved &&
        player.commendations['egg-lord'] === 2 &&
        player.achievements.includes('first-win'),
    );
    const registerResponse = await fetch(`${baseUrl}/api/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'Saved Noodle',
        password: 'super-secret',
        connectionToken: anonymous.welcome.connectionToken,
      }),
    });
    assert.equal(registerResponse.status, 200);
    const registered = (await registerResponse.json()) as {
      ok: boolean;
      account: { username: string };
    };
    assert.equal(registered.ok, true);
    assert.equal(registered.account.username, 'Saved Noodle');
    const setCookie = registerResponse.headers.get('set-cookie');
    assert.match(setCookie ?? '', /HttpOnly/);
    assert.match(setCookie ?? '', /SameSite=Lax/);
    const cookie = setCookie?.split(';')[0];
    assert.ok(cookie);
    await savedSnapshot;
    assert.equal(room.snakes.get(anonymousPlayerId)?.dots, 10);

    const sessionResponse = await fetch(`${baseUrl}/api/account/session`, {
      headers: { cookie },
    });
    assert.equal(sessionResponse.status, 200);

    await closeSocket(anonymous.socket);
    const returning = await connectWithWelcome(gameUrl, cookie);
    sockets.push(returning.socket);
    assert.equal(returning.welcome.type, 'welcome');
    if (returning.welcome.type !== 'welcome') return;
    assert.equal(returning.welcome.account?.username, 'Saved Noodle');
    assert.equal(returning.welcome.account?.commendations['egg-lord'], 2);
    assert.deepEqual(returning.welcome.account?.achievements, ['first-win']);
    await waitForPlayer(
      returning.socket,
      (player) => player.name === 'Saved Noodle' && player.saved,
    );

    const loggedOutSnapshot = waitForPlayer(
      returning.socket,
      (player) => player.name.endsWith(' Guest') && !player.saved,
    );
    const logoutResponse = await fetch(`${baseUrl}/api/account/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        connectionToken: returning.welcome.connectionToken,
      }),
    });
    assert.equal(logoutResponse.status, 200);
    await loggedOutSnapshot;
    const revokedSessionResponse = await fetch(
      `${baseUrl}/api/account/session`,
      { headers: { cookie } },
    );
    assert.equal(revokedSessionResponse.status, 401);

    const guest = await connectWithWelcome(
      `ws://127.0.0.1:${server.port}/ws?room=OTHER&name=Saved%20Noodle`,
    );
    sockets.push(guest.socket);
    const guestPlayer = await waitForPlayer(guest.socket, (player) =>
      player.name.endsWith(' Guest'),
    );
    assert.equal(guestPlayer.saved, false);

    const badLogin = await fetch(`${baseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'Saved Noodle',
        password: 'definitely-wrong',
      }),
    });
    assert.equal(badLogin.status, 401);
  } finally {
    await Promise.all(sockets.map(closeSocket));
    await server.close();
  }
});

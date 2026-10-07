import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { WORLD_WIDTH, type ServerMessage } from '../shared/protocol.ts';
import { startGameServer } from './index.ts';
import { GameRoom, toroidalDistance } from './simulation.ts';

const NO_INPUT = { left: false, right: false, jump: false, power: false };

void test('toroidal distance uses the short route across an arena edge', () => {
  assert.equal(
    toroidalDistance({ x: 2, y: 100 }, { x: WORLD_WIDTH - 3, y: 100 }),
    5,
  );
});

void test('snakes wrap, jump, collect dots, and grow', () => {
  const room = new GameRoom('TEST', () => 0.5);
  const snake = room.addPlayer('p1', 'Tester');
  const start = Date.now() + 2_000;
  snake.head.x = WORLD_WIDTH - 2;
  snake.head.y = 300;
  snake.angle = 0;
  room.food.splice(0, room.food.length, { id: 999, x: 8, y: 300 });
  const groundedTrail = snake.body.map((point) => ({ ...point }));

  room.setInput('p1', { ...NO_INPUT, jump: true });
  room.step(start, 0.05);
  const jumping = room.snapshot(start).snakes[0];

  assert.ok(jumping.head.x < 20, 'head wraps to the left edge');
  assert.ok(jumping.jump > 0, 'down input starts a jump');
  assert.equal(jumping.dots, 1, 'cross-edge dot is collected');
  assert.deepEqual(
    jumping.body,
    groundedTrail,
    'the airborne head does not lay down trail points',
  );

  const originalLength = jumping.body.length;
  room.setInput('p1', NO_INPUT);
  for (let index = 0; index < 20; index += 1)
    room.step(start + 50 + index * 50, 0.05);
  const landed = room.snapshot().snakes[0];
  assert.ok(
    landed.body.length > originalLength,
    'dot collection extends the body',
  );
  assert.ok(
    new Set(landed.body.map((point) => point.segment)).size > 1,
    'landing starts a disconnected trail segment after the jump gap',
  );
});

void test('player latency is stored and bounded for room snapshots', () => {
  const room = new GameRoom('PING', () => 0.5);
  room.addPlayer('p1', 'Tester');
  room.setPing('p1', 42.4);
  assert.equal(room.snapshot().snakes[0].pingMs, 42);
  room.setPing('p1', 100_000);
  assert.equal(room.snapshot().snakes[0].pingMs, 9_999);
});

function connect(url: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitForPlayers(socket: WebSocket, count: number) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timed out waiting for room snapshot')),
      2_000,
    );
    const onMessage = (raw: WebSocket.RawData) => {
      const text =
        raw instanceof ArrayBuffer
          ? Buffer.from(raw).toString('utf8')
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString('utf8')
            : raw.toString('utf8');
      const message = JSON.parse(text) as ServerMessage;
      if (message.type === 'snapshot' && message.snakes.length === count) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(message);
      }
    };
    socket.on('message', onMessage);
  });
}

void test('two websocket clients share an isolated room snapshot', async () => {
  const server = await startGameServer(0);
  const first = await connect(
    `ws://127.0.0.1:${server.port}/ws?room=COIL&name=Alpha`,
  );
  const players = waitForPlayers(first, 2);
  const second = await connect(
    `ws://127.0.0.1:${server.port}/ws?room=COIL&name=Beta`,
  );

  const message = await players;
  assert.equal(message.type, 'snapshot');
  if (message.type === 'snapshot') {
    assert.deepEqual(message.snakes.map((snake) => snake.name).sort(), [
      'Alpha',
      'Beta',
    ]);
  }

  first.close();
  second.close();
  await server.close();
});

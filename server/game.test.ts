import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { WORLD_WIDTH, type ServerMessage } from '../shared/protocol.ts';
import { startGameServer } from './index.ts';
import { GAMEPLAY, GameRoom, toroidalDistance } from './simulation.ts';

const NO_INPUT = { left: false, right: false, jump: false, power: false };

void test('toroidal distance uses the short route across an arena edge', () => {
  assert.equal(
    toroidalDistance({ x: 2, y: 100 }, { x: WORLD_WIDTH - 3, y: 100 }),
    5,
  );
});

void test('movement matches the original speed and turning constants', () => {
  const room = new GameRoom('TEST', () => 0.5);
  const snake = room.addPlayer('p1', 'Tester');
  const start = Date.now() + 2_100;
  room.food.splice(0);
  room.powerUps.splice(0);
  snake.head.x = WORLD_WIDTH - 2;
  snake.head.y = 300;
  snake.angle = 0;

  room.step(start, 1 / 60);
  const moved = room.snapshot(start).snakes[0];
  assert.equal(moved.head.x, 0, 'normal speed is exactly two pixels per tick');
  assert.equal(GAMEPLAY.baseSpeed, 120);

  room.setInput('p1', { ...NO_INPUT, right: true });
  room.step(start + 17, 1 / 60);
  assert.ok(
    Math.abs(room.snapshot().snakes[0].angle - (4 * Math.PI) / 180) < 1e-9,
    'full steering turns four degrees per tick',
  );

  room.setInput('p1', { ...NO_INPUT, left: true, right: true });
  room.step(start + 34, 1 / 60);
  assert.ok(
    Math.abs(room.snapshot().snakes[0].angle - (6 * Math.PI) / 180) < 1e-9,
    'the direction held longer wins at half strength when both are down',
  );
});

void test('jumping keeps its launch trajectory, skips pickups, and leaves a gap', () => {
  const room = new GameRoom('JUMP', () => 0.5);
  const snake = room.addPlayer('p1', 'Jumper');
  const start = Date.now() + 2_100;
  room.powerUps.splice(0);
  room.food.splice(0);
  snake.head.x = 100;
  snake.head.y = 250;
  snake.angle = 0;

  for (let tick = 0; tick < 12; tick += 1)
    room.step(start + tick * (1000 / 60), 1 / 60);
  const groundedLength = room.snapshot().snakes[0].body.length;
  const jumpStartX = snake.head.x;
  room.food.push({ id: 999, x: jumpStartX + 28, y: 250 });

  room.setInput('p1', { ...NO_INPUT, jump: true, right: true });
  for (let tick = 0; tick < 28; tick += 1)
    room.step(start + 300 + tick * (1000 / 60), 1 / 60);
  const landed = room.snapshot().snakes[0];

  assert.ok(
    Math.abs(landed.head.x - (jumpStartX + 56)) < 1e-6,
    'the basic jump crosses 56 pixels',
  );
  assert.ok(
    Math.abs(landed.head.y - 250) < 1e-6,
    'turning does not bend flight',
  );
  assert.ok(landed.angle > Math.PI / 2, 'facing can still turn in the air');
  assert.equal(landed.jump, 0, 'the basic jump lands after 28 ticks');
  assert.equal(landed.dots, 0, 'airborne snakes do not collect dots');
  assert.equal(
    landed.body.length,
    groundedLength,
    'no trail is emitted in flight',
  );

  room.setInput('p1', NO_INPUT);
  for (let tick = 0; tick < 3; tick += 1)
    room.step(start + 900 + tick * (1000 / 60), 1 / 60);
  const trailing = room.snapshot().snakes[0];
  assert.ok(
    new Set(trailing.body.map((point) => point.segment)).size > 1,
    'landing starts a disconnected trail segment after the jump gap',
  );
});

void test('speed boost and fireball are authoritative inventory power-ups', () => {
  const start = Date.now() + 2_100;
  const boostRoom = new GameRoom('BOOST', () => 0.5);
  const boosted = boostRoom.addPlayer('p1', 'Boosted');
  boostRoom.food.splice(0);
  boostRoom.powerUps.splice(0);
  boosted.head.x = 100;
  boosted.head.y = 200;
  boosted.angle = 0;
  boostRoom.step(start, 0);
  boostRoom.spawnPowerUp('speed-boost', { ...boosted.head });
  boostRoom.step(start + 1, 0);
  assert.equal(boostRoom.snapshot().snakes[0].powerUp, 'speed-boost');

  boostRoom.setInput('p1', { ...NO_INPUT, power: true });
  boostRoom.step(start + 17, 1 / 60);
  const boostSnapshot = boostRoom.snapshot().snakes[0];
  assert.equal(boostSnapshot.powerUp, null);
  assert.ok(
    boostSnapshot.speedBoost > 0,
    'activation starts the decaying boost',
  );
  assert.ok(
    boostSnapshot.head.x - 100 > 4.9,
    'boost adds three pixels per tick',
  );

  const fireRoom = new GameRoom('FIRE', () => 0.5);
  const shooter = fireRoom.addPlayer('p1', 'Shooter');
  const target = fireRoom.addPlayer('p2', 'Target');
  fireRoom.food.splice(0);
  fireRoom.powerUps.splice(0);
  shooter.head.x = 100;
  shooter.head.y = 250;
  shooter.angle = 0;
  target.head.x = 220;
  target.head.y = 250;
  target.angle = Math.PI;
  fireRoom.step(start, 0);
  fireRoom.spawnPowerUp('fireball', { ...shooter.head });
  fireRoom.step(start + 1, 0);
  fireRoom.setInput('p1', { ...NO_INPUT, power: true });
  fireRoom.step(start + 2, 0);
  assert.equal(fireRoom.snapshot().fireballs.length, 1);

  for (let tick = 0; tick < 30 && target.alive; tick += 1)
    fireRoom.step(start + 20 + tick * (1000 / 60), 1 / 60);
  assert.equal(target.alive, false, 'a fireball kills a grounded target');
  assert.equal(fireRoom.snapshot().fireballs.length, 0, 'the hit consumes it');
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

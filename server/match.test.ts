import assert from 'node:assert/strict';
import test from 'node:test';
import { GameRoom } from './simulation.ts';

const neutralInput = {
  left: false,
  right: false,
  jump: false,
  power: false,
};

void test('Survival runs a host-controlled match and awards the last owner alive', () => {
  const room = new GameRoom('MATCH', () => 0.5, {
    managedMatch: true,
    levelId: 'castle',
  });
  room.addPlayer('host', 'Host Noodle');
  room.addPlayer('guest', 'Guest Noodle');

  assert.equal(room.snapshot().phase, 'lobby');
  assert.equal(room.snapshot().hostId, 'host');
  assert.equal(room.startMatch('guest', 1_000), false, 'only the host starts');

  room.configure('host', { mode: 'survival', winsToMatch: 1 });
  room.setReady('host', true);
  room.setReady('guest', true);
  assert.equal(room.startMatch('host', 1_000), true);
  assert.equal(room.snapshot().phase, 'countdown');

  room.step(4_000, 1 / 60);
  assert.equal(room.snapshot().phase, 'playing');

  const guest = room.snakes.get('guest');
  assert.ok(guest);
  const wall = room.level.walls[0];
  assert.ok(wall);
  guest.invulnerable = false;
  guest.invulnerableUntil = 0;
  guest.head = { x: wall.x + 16, y: wall.y + 16 };
  room.step(4_100, 1 / 60);

  const result = room.snapshot();
  assert.equal(result.phase, 'match-over');
  assert.equal(result.roundWinnerId, 'host');
  assert.equal(result.matchWinnerId, 'host');
  assert.equal(result.players.find((player) => player.id === 'host')?.wins, 1);
  assert.equal(
    result.players.find((player) => player.id === 'host')?.commendations.winner,
    1,
  );

  assert.equal(room.rematch('host', 5_000), true);
  const rematch = room.snapshot();
  assert.equal(rematch.phase, 'countdown');
  assert.equal(rematch.roundNumber, 1);
  assert.equal(
    rematch.players.every((player) => player.wins === 0),
    true,
  );
  assert.equal(
    rematch.players.find((player) => player.id === 'host')?.commendations
      .winner,
    1,
    'commendation totals survive a rematch',
  );
});

void test('Quickplay keeps the original automatic respawn loop', () => {
  const room = new GameRoom('QUICK', () => 0.5, {
    managedMatch: true,
    levelId: 'castle',
  });
  room.addPlayer('host', 'Host Noodle');
  room.configure('host', { mode: 'quickplay' });
  room.setReady('host', true);
  assert.equal(room.startMatch('host', 1_000), true);
  room.step(4_000, 1 / 60);

  const snake = room.snakes.get('host');
  const wall = room.level.walls[0];
  assert.ok(snake && wall);
  snake.invulnerable = false;
  snake.invulnerableUntil = 0;
  snake.head = { x: wall.x + 16, y: wall.y + 16 };
  room.step(4_100, 1 / 60);
  assert.equal(snake.alive, false);
  assert.equal(room.snapshot().phase, 'playing');

  room.step(5_400, 1 / 60);
  assert.equal(snake.alive, true);
  assert.equal(room.snapshot().phase, 'playing');
});

void test('late Survival joins spectate and host ownership migrates', () => {
  const room = new GameRoom('LATE', () => 0.5, {
    managedMatch: true,
    levelId: 'empty',
  });
  room.addPlayer('host', 'Host');
  room.addPlayer('guest', 'Guest');
  room.setReady('host', true);
  room.setReady('guest', true);
  room.startMatch('host', 1_000);
  room.step(4_000, 1 / 60);

  const late = room.addPlayer('late', 'Late Noodle');
  assert.equal(late.alive, false);
  assert.equal(
    room.snapshot().players.find((player) => player.id === 'late')?.spectator,
    true,
  );

  room.removePlayer('host');
  assert.equal(room.snapshot().hostId, 'guest');
});

void test('a shield absorbs lethal collision damage and grants break protection', () => {
  const room = new GameRoom('SHIELD', () => 0.5);
  const shielded = room.addPlayer('shielded', 'Shielded');
  const target = room.addPlayer('target', 'Target');
  shielded.head = { x: 400, y: 300 };
  target.head = { x: 400, y: 300 };
  shielded.invulnerable = false;
  target.invulnerable = false;
  shielded.invulnerableUntil = 0;
  target.invulnerableUntil = 0;
  shielded.shield = 100;
  room.setInput('shielded', neutralInput);
  room.setInput('target', neutralInput);

  room.step(10_000, 0);
  assert.equal(shielded.alive, true);
  assert.equal(shielded.shield, 0);
  assert.equal(shielded.invulnerable, true);
  assert.equal(target.alive, false);
});

void test('Bullet Hell turrets move, rotate, and emit authoritative shots', () => {
  const room = new GameRoom('TURRETS', () => 0.5, {
    levelId: 'bullethell',
  });
  assert.equal(room.snapshot().turrets.length, 2);
  const before = room.snapshot().turrets[0];
  for (let tick = 0; tick < 6; tick += 1) room.step(10_000 + tick * 50, 0.05);
  const after = room.snapshot().turrets[0];
  assert.notEqual(after.x, before.x);
  assert.notEqual(after.angle, before.angle);
  assert.ok(room.snapshot().turretShots.length > 0);
});

void test('pressing jump in midair slams and stuns nearby opponents on landing', () => {
  const room = new GameRoom('SLAM', () => 0.5);
  const source = room.addPlayer('source', 'Source');
  const target = room.addPlayer('target', 'Target');
  source.head = { x: 400, y: 300 };
  target.head = { x: 435, y: 300 };
  source.baseSpeed = 0;
  target.baseSpeed = 0;
  target.invulnerable = false;
  target.invulnerableUntil = 0;

  room.setInput('source', { ...neutralInput, jump: true });
  room.step(1_000, 1 / 60);
  room.setInput('source', neutralInput);
  for (let tick = 0; tick < 8; tick += 1) room.step(1_020 + tick * 17, 1 / 60);
  room.setInput('source', { ...neutralInput, jump: true });
  room.step(1_200, 1 / 60);
  room.setInput('source', neutralInput);
  for (let tick = 0; tick < 12; tick += 1) room.step(1_220 + tick * 17, 1 / 60);

  const state = room.snapshot();
  assert.equal(
    state.snakes.find((snake) => snake.id === 'target')?.stunned,
    true,
  );
  assert.ok(state.blasts.some((blast) => blast.kind === 'shockwave'));
});

void test('hidden pickups apply shield, Tron, Ghost, Napalm, and Disco behaviour', () => {
  const room = new GameRoom('HIDDEN', () => 0.5);
  const snake = room.addPlayer('p1', 'Power Noodle');
  const start = Date.now() + 2_100;
  room.food.splice(0);
  room.powerUps.splice(0);
  snake.head = { x: 400, y: 300 };
  snake.baseSpeed = 0;

  room.spawnPowerUp('shield', { ...snake.head });
  room.step(start, 0);
  assert.equal(snake.shield, 100);

  const previousLength = snake.targetLength;
  room.spawnPowerUp('tron-mode', { ...snake.head });
  room.step(start + 1, 0);
  assert.equal(snake.targetLength, previousLength + 120);

  room.spawnPowerUp('disco-ball', { ...snake.head });
  room.step(start + 2, 0);
  assert.ok((room.snapshot(start + 2).discoUntil ?? 0) > start + 2);

  room.spawnPowerUp('ghost', { ...snake.head });
  room.step(start + 3, 0);
  room.setInput('p1', { ...neutralInput, power: true });
  room.step(start + 4, 0);
  assert.equal(snake.ghosted, true);

  room.setInput('p1', neutralInput);
  room.step(start + 5, 0);
  snake.ghostedUntil = 0;
  room.spawnPowerUp('napalm', { ...snake.head });
  room.step(start + 6, 0);
  room.setInput('p1', { ...neutralInput, power: true });
  room.step(start + 7, 0);
  assert.equal(room.grenades[0]?.blastRadius, 50);
});

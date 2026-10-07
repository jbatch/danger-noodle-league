import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS, getLevel } from '../shared/levels.generated.ts';
import { GameRoom } from './simulation.ts';

void test('compiled catalogue validates every recovered map and public name', () => {
  assert.equal(LEVELS.length, 14);
  assert.equal(LEVELS.filter((level) => level.selectable).length, 13);
  assert.ok(LEVELS.every((level) => level.playerSpawns.length === 8));
  assert.equal(getLevel('sprint2').displayName, 'Sprint 2');
  assert.equal(getLevel('sunshine').displayName, 'Sunshine');
  assert.equal(getLevel('icefortress').displayName, 'Ice Fortress');
  assert.equal(getLevel('starfield').selectable, false);
  assert.equal(getLevel('bullethell').features.length, 2);
  assert.equal(getLevel('sunshine').fixedItems.length, 8);
  assert.equal(getLevel('noveria').fixedItems[0]?.kind, 'grenade');
});

void test('authored player spawns are unique and rooms cap at eight owners', () => {
  const room = new GameRoom('CASTLE', () => 0.5, { levelId: 'castle' });
  const positions = new Set<string>();
  for (let index = 0; index < 8; index += 1) {
    const snake = room.addPlayer(`p${index}`, `Player ${index}`);
    positions.add(`${snake.head.x},${snake.head.y}`);
  }
  assert.equal(positions.size, 8);
  assert.throws(() => room.addPlayer('p9', 'Overflow'), /room is full/);
});

void test('developer rooms force Void and seed one of every core power-up', () => {
  const room = new GameRoom('DEV', () => 0.5, {
    devMode: true,
    levelId: 'castle',
  });
  assert.equal(room.level.id, 'empty');
  assert.equal(room.snapshot().devMode, true);
  assert.deepEqual(
    room
      .snapshot()
      .powerUps.map((powerUp) => powerUp.type)
      .sort(),
    [
      'fireball',
      'grenade',
      'jumper',
      'one-eighty',
      'rail-gun',
      'speed-boost',
      'trident',
    ],
  );
});

void test('static level walls collide authoritatively after spawn protection', () => {
  const room = new GameRoom('WALLS', () => 0.5, { levelId: 'castle' });
  const snake = room.addPlayer('p1', 'Wall Tester');
  const wall = room.level.walls[0];
  assert.ok(wall);
  snake.head = { x: wall.x + 16, y: wall.y + 16 };
  room.step(Date.now() + 2_100, 0);
  assert.equal(snake.alive, false);
});

void test('grounded head collisions eliminate both owners', () => {
  const room = new GameRoom('HEADS', () => 0.5);
  const first = room.addPlayer('p1', 'First');
  const second = room.addPlayer('p2', 'Second');
  first.head = { x: 640, y: 336 };
  second.head = { x: 640, y: 336 };
  room.step(Date.now() + 2_100, 0);
  assert.equal(first.alive, false);
  assert.equal(second.alive, false);
});

void test('new trail points receive three ticks of collision grace', () => {
  const room = new GameRoom('TRAIL-GRACE', () => 0.5);
  const owner = room.addPlayer('p1', 'Owner');
  const crossing = room.addPlayer('p2', 'Crossing');
  const now = Date.now() + 2_100;
  owner.head = { x: 100, y: 100 };
  crossing.head = { x: 600, y: 300 };
  owner.body.push({
    x: crossing.head.x,
    y: crossing.head.y,
    segment: 0,
    collisionAge: 0,
  });

  room.step(now, 0);
  room.step(now + 17, 0);
  assert.equal(crossing.alive, true);
  room.step(now + 34, 0);
  assert.equal(crossing.alive, false);
});

void test('death detaches the trail and leaves it hazardous', () => {
  const room = new GameRoom('DETACHED', () => 0.5);
  const first = room.addPlayer('p1', 'First');
  const second = room.addPlayer('p2', 'Second');
  const now = Date.now() + 2_100;
  first.body.push({
    x: 760,
    y: 300,
    segment: 0,
    collisionAge: 3,
  });
  first.head = { x: 640, y: 336 };
  second.head = { x: 640, y: 336 };
  room.step(now, 0);
  assert.equal(room.snapshot().detachedTrails.length, 1);

  const third = room.addPlayer('p3', 'Third');
  third.head = { x: 760, y: 300 };
  room.step(now + 2_100, 0);
  assert.equal(third.alive, false);
});

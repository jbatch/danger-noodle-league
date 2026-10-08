import assert from 'node:assert/strict';
import test from 'node:test';
import { ACHIEVEMENT_IDS } from '../shared/achievements.ts';
import type { PowerUpType } from '../shared/protocol.ts';
import { GameRoom } from './simulation.ts';

const corePowerUps: PowerUpType[] = [
  'speed-boost',
  'fireball',
  'jumper',
  'grenade',
  'one-eighty',
  'rail-gun',
  'trident',
];

void test('the starter achievement set unlocks once from Survival milestones', () => {
  const room = new GameRoom('ACHIEVE', () => 0.5, {
    managedMatch: true,
    levelId: 'empty',
  });
  for (let index = 0; index < 8; index += 1) {
    room.addPlayer(`p${index}`, `Player ${index}`);
  }
  room.configure('p0', { mode: 'survival', winsToMatch: 1 });
  for (let index = 0; index < 8; index += 1) room.setReady(`p${index}`, true);
  assert.equal(room.startMatch('p0', 1_000), true);
  room.step(4_001, 0);

  const winner = room.players.get('p0');
  const crashTester = room.players.get('p1');
  assert.ok(winner && crashTester);
  winner.roundStats.eggs = 12;
  winner.roundStats.jumps = 20;
  winner.roundStats.peakTail = 350;
  winner.roundStats.activatedCorePowerUps = new Set(corePowerUps);
  crashTester.roundStats.headsLost = 3;

  for (let index = 1; index < 8; index += 1) {
    const snake = room.snakes.get(`p${index}`);
    assert.ok(snake);
    snake.alive = false;
    room.players.get(`p${index}`)!.roundStats.eliminatedAt = 4_100 + index;
  }
  room.step(4_200, 0);

  assert.deepEqual(
    room.playerAchievements('p0').sort(),
    ACHIEVEMENT_IDS.filter((id) => id !== 'hard-headed').sort(),
  );
  assert.deepEqual(room.playerAchievements('p1'), ['hard-headed']);
  assert.equal(room.snapshot().roundAchievements.length, 2);

  assert.equal(room.rematch('p0', 5_000), true);
  room.step(8_001, 0);
  for (let index = 1; index < 8; index += 1) {
    const snake = room.snakes.get(`p${index}`);
    assert.ok(snake);
    snake.alive = false;
  }
  room.step(8_100, 0);
  assert.equal(room.playerAchievements('p0').length, 8);
  assert.deepEqual(room.snapshot().roundAchievements, []);
});

void test('anonymous achievements reset after leaving the room', () => {
  const room = new GameRoom('RESET', () => 0.5, { levelId: 'empty' });
  room.addPlayer('player', 'Noodle', false, {}, ['first-win']);
  assert.deepEqual(room.playerAchievements('player'), ['first-win']);
  assert.deepEqual(room.pendingPlayerAchievements('player'), ['first-win']);
  room.removePlayer('player');
  room.addPlayer('player', 'Noodle');
  assert.deepEqual(room.playerAchievements('player'), []);
});

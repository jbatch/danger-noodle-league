import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommendationId } from '../shared/badges.ts';
import { GameRoom } from './simulation.ts';

function startSurvival(ids: string[], winsToMatch = 3) {
  const room = new GameRoom('AWARDS', () => 0.5, {
    managedMatch: true,
    levelId: 'empty',
  });
  for (const id of ids) room.addPlayer(id, id);
  room.configure(ids[0], { mode: 'survival', winsToMatch });
  for (const id of ids) room.setReady(id, true);
  assert.equal(room.startMatch(ids[0], 1_000), true);
  room.step(4_001, 0);
  assert.equal(room.phase, 'playing');
  return room;
}

function commendationsFor(room: GameRoom, playerId: string) {
  return (
    room.snapshot().players.find((player) => player.id === playerId)
      ?.commendations ?? {}
  );
}

function awardIds(room: GameRoom, playerId: string) {
  return (
    room
      .snapshot()
      .roundCommendations.find((award) => award.playerId === playerId)
      ?.commendations ?? []
  );
}

function expectAwards(
  room: GameRoom,
  playerId: string,
  expected: CommendationId[],
) {
  assert.deepEqual([...awardIds(room, playerId)].sort(), [...expected].sort());
}

void test('Survival awards all ten round commendations from authoritative stats', () => {
  const room = startSurvival(['host', 'guest', 'third']);
  const host = room.players.get('host');
  const guest = room.players.get('guest');
  const third = room.players.get('third');
  assert.ok(host && guest && third);

  host.roundStats = {
    eggs: 3,
    jumps: 2,
    powerUps: 1,
    damageTaken: 0,
    headsLost: 0,
    peakTail: 350,
    eliminatedAt: null,
    activatedCorePowerUps: new Set(),
  };
  guest.roundStats = {
    eggs: 5,
    jumps: 2,
    powerUps: 4,
    damageTaken: 100,
    headsLost: 1,
    peakTail: 300,
    eliminatedAt: 4_100,
    activatedCorePowerUps: new Set(),
  };
  third.roundStats = {
    eggs: 5,
    jumps: 1,
    powerUps: 0,
    damageTaken: 200,
    headsLost: 2,
    peakTail: 200,
    eliminatedAt: 4_200,
    activatedCorePowerUps: new Set(),
  };

  const hostSnake = room.snakes.get('host');
  const guestSnake = room.snakes.get('guest');
  const thirdSnake = room.snakes.get('third');
  assert.ok(hostSnake && guestSnake && thirdSnake);
  hostSnake.body = Array.from({ length: 20 }, (_, index) => ({
    x: index,
    y: 0,
    segment: 0,
    collisionAge: 100,
  }));
  guestSnake.alive = false;
  thirdSnake.alive = false;
  room.step(4_300, 0);

  expectAwards(room, 'host', [
    'winner',
    'longest-noodle',
    'peak-noodle',
    'maxed-out',
    'untouchable',
    'frequent-flyer',
  ]);
  expectAwards(room, 'guest', ['egg-lord', 'frequent-flyer', 'power-player']);
  expectAwards(room, 'third', ['egg-lord', 'survivor', 'crash-test']);
});

void test('commendations repeat across rounds and totals survive a rematch', () => {
  const room = startSurvival(['host', 'guest'], 1);
  const guestSnake = room.snakes.get('guest');
  assert.ok(guestSnake);
  guestSnake.alive = false;
  room.players.get('guest')!.roundStats.eliminatedAt = 4_100;
  room.step(4_101, 0);
  assert.equal(commendationsFor(room, 'host').winner, 1);

  assert.equal(room.rematch('host', 5_000), true);
  room.step(8_001, 0);
  const rematchGuest = room.snakes.get('guest');
  assert.ok(rematchGuest);
  rematchGuest.alive = false;
  room.players.get('guest')!.roundStats.eliminatedAt = 8_100;
  room.step(8_101, 0);
  assert.equal(commendationsFor(room, 'host').winner, 2);
});

void test('anonymous commendation totals reset after leaving the room', () => {
  const room = new GameRoom('RESET', () => 0.5, { levelId: 'empty' });
  room.addPlayer('player', 'Noodle', false, { winner: 3 });
  assert.equal(commendationsFor(room, 'player').winner, 3);
  room.removePlayer('player');
  room.addPlayer('player', 'Noodle');
  assert.deepEqual(commendationsFor(room, 'player'), {});
});

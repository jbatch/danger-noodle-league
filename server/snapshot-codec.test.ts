import assert from 'node:assert/strict';
import test from 'node:test';
import type { PackedGameSnapshot, TrailPoint } from '../shared/protocol.ts';
import { unpackSnapshot, unpackTrail } from '../shared/snapshot-codec.ts';
import { GameRoom } from './simulation.ts';
import { encodeSnapshotPayload, packTrail } from './snapshot-codec.ts';

void test('packed trails round-trip with quarter-pixel precision', () => {
  const trail: TrailPoint[] = [
    { x: 0, y: 0, segment: 0 },
    { x: 1279.93, y: 671.88, segment: 1 },
    { x: 415.12, y: 92.49, segment: 255 },
  ];
  const unpacked = unpackTrail(packTrail(trail));

  assert.equal(unpacked.length, trail.length);
  for (let index = 0; index < trail.length; index += 1) {
    assert.ok(Math.abs(unpacked[index].x - trail[index].x) <= 0.125);
    assert.ok(Math.abs(unpacked[index].y - trail[index].y) <= 0.125);
    assert.equal(unpacked[index].segment, trail[index].segment);
  }
});

void test('packed snapshots preserve state and substantially reduce trails', () => {
  const room = new GameRoom('PACKED', () => 0.5, { levelId: 'empty' });
  for (let player = 0; player < 8; player += 1) {
    const snake = room.addPlayer(`p${player}`, `Player ${player}`);
    snake.body = Array.from({ length: 117 }, (_, index) => ({
      x: (120 + player * 130 + index * 3.17) % 1280,
      y: 80 + player * 67 + Math.sin(index / 7) * 8,
      segment: index > 70 ? 1 : 0,
      collisionAge: 100,
    }));
  }
  const snapshot = room.snapshot(123_456);
  const rawPayload = JSON.stringify(snapshot);
  const encoded = encodeSnapshotPayload(snapshot);
  const wireSnapshot = JSON.parse(encoded.payload) as PackedGameSnapshot;
  const unpacked = unpackSnapshot(wireSnapshot);

  assert.equal(wireSnapshot.encoding, 'trail-pack-v1');
  assert.ok(encoded.bytes < Buffer.byteLength(rawPayload) * 0.4);
  assert.equal(unpacked.serverTime, snapshot.serverTime);
  assert.equal(unpacked.snakes.length, 8);
  assert.equal(unpacked.snakes[7].body.length, 117);
  assert.equal(unpacked.snakes[7].body[71].segment, 1);
  assert.ok(
    Math.abs(unpacked.snakes[3].body[53].x - snapshot.snakes[3].body[53].x) <=
      0.125,
  );
});

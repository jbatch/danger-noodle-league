import type {
  GameSnapshot,
  PackedGameSnapshot,
  TrailPoint,
} from '../shared/protocol.ts';

const POSITION_SCALE = 4;
const BYTES_PER_TRAIL_POINT = 5;

function quantizePosition(value: number) {
  return Math.min(65_535, Math.max(0, Math.round(value * POSITION_SCALE)));
}

export function packTrail(points: TrailPoint[]) {
  const bytes = Buffer.allocUnsafe(points.length * BYTES_PER_TRAIL_POINT);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const offset = index * BYTES_PER_TRAIL_POINT;
    bytes.writeUInt16LE(quantizePosition(point.x), offset);
    bytes.writeUInt16LE(quantizePosition(point.y), offset + 2);
    bytes[offset + 4] = point.segment & 0xff;
  }
  return bytes.toString('base64');
}

export function packSnapshot(snapshot: GameSnapshot): PackedGameSnapshot {
  return {
    ...snapshot,
    encoding: 'trail-pack-v1',
    snakes: snapshot.snakes.map((snake) => ({
      ...snake,
      body: packTrail(snake.body),
    })),
    detachedTrails: snapshot.detachedTrails.map((trail) => ({
      ...trail,
      body: packTrail(trail.body),
    })),
  };
}

export function encodeSnapshotPayload(snapshot: GameSnapshot) {
  const payload = JSON.stringify(packSnapshot(snapshot));
  return { payload, bytes: Buffer.byteLength(payload) };
}

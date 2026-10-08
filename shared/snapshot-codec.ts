import type { GameSnapshot, PackedGameSnapshot, TrailPoint } from './protocol';

const POSITION_SCALE = 4;
const BYTES_PER_TRAIL_POINT = 5;

export function unpackTrail(packed: string): TrailPoint[] {
  const binary = atob(packed);
  if (binary.length % BYTES_PER_TRAIL_POINT !== 0)
    throw new Error('Invalid packed trail length');
  const points: TrailPoint[] = [];
  for (
    let offset = 0;
    offset < binary.length;
    offset += BYTES_PER_TRAIL_POINT
  ) {
    const x = binary.charCodeAt(offset) | (binary.charCodeAt(offset + 1) << 8);
    const y =
      binary.charCodeAt(offset + 2) | (binary.charCodeAt(offset + 3) << 8);
    points.push({
      x: x / POSITION_SCALE,
      y: y / POSITION_SCALE,
      segment: binary.charCodeAt(offset + 4),
    });
  }
  return points;
}

export function unpackSnapshot(snapshot: PackedGameSnapshot): GameSnapshot {
  const { encoding: _, ...unpacked } = snapshot;
  return {
    ...unpacked,
    snakes: snapshot.snakes.map((snake) => ({
      ...snake,
      body: unpackTrail(snake.body),
    })),
    detachedTrails: snapshot.detachedTrails.map((trail) => ({
      ...trail,
      body: unpackTrail(trail.body),
    })),
  };
}

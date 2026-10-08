import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { GameRoom } from '../server/simulation.ts';
import { encodeSnapshotPayload } from '../server/snapshot-codec.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRate = 20;
const iterations = 600;
const warmupIterations = 100;

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? fallback
  );
}

const outputName = argument('output', 'network-performance-current');
if (!/^[a-z0-9-]+$/.test(outputName))
  throw new Error('Benchmark output name must contain only a-z, 0-9, and -');
const benchmarkLabel = argument('label', 'current implementation');

function randomFromSeed(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function trailPoint(head, index, playerIndex) {
  return {
    x: (head.x - (index + 1) * 3 + 1280) % 1280,
    y: head.y + Math.sin(index / 9 + playerIndex) * 4.25,
    segment: 0,
    collisionAge: 100,
  };
}

function createRoom(players, busy = false) {
  const random = randomFromSeed(2_026_10_08 + players + Number(busy));
  const room = new GameRoom('BENCH', random, {
    levelId: 'empty',
    mode: 'quickplay',
  });
  room.food.splice(0);
  room.powerUps.splice(0);

  for (let index = 0; index < players; index += 1) {
    const snake = room.addPlayer(`p${index + 1}`, `Benchmark ${index + 1}`);
    snake.head.x = 170 + (index % 4) * 285;
    snake.head.y = 95 + Math.floor(index / 4) * 315 + (index % 4) * 48;
    snake.angle = index * 0.71;
    snake.baseSpeed = 0;
    snake.invulnerableUntil = 0;
    snake.invulnerable = false;
    snake.pingMs = 28 + index * 3;
    snake.body = Array.from({ length: 117 }, (_, pointIndex) =>
      trailPoint(snake.head, pointIndex, index),
    );
  }

  for (let index = 0; index < 4; index += 1) {
    room.food.push({ id: index + 1, x: 260 + index * 180, y: 330 });
    room.spawnPowerUp(
      ['speed-boost', 'fireball', 'grenade', 'rail-gun'][index],
      { x: 330 + index * 175, y: 410 },
    );
  }

  if (!busy) return room;

  for (let index = 0; index < players * 2; index += 1) {
    room.fireballs.push({
      id: index + 1,
      x: 90 + index * 37,
      y: 120 + (index % 5) * 83,
      angle: index * 0.37,
      ownerId: `p${(index % players) + 1}`,
      lifeRemaining: 4.5,
    });
  }
  for (let index = 0; index < players; index += 1) {
    room.grenades.push({
      id: index + 1,
      x: 180 + index * 61,
      y: 520 - index * 29,
      angle: index * 0.41,
      ownerId: `p${index + 1}`,
      scale: 0.6,
      speed: 240,
      elapsed: 0.4,
      blastRadius: 75,
    });
    room.blasts.push({
      id: index + 1,
      x: 800 + index * 21,
      y: 180 + index * 34,
      radius: 75,
      progress: 0.35,
      kind: index % 2 === 0 ? 'explosion' : 'shockwave',
      elapsed: 0.14,
    });
  }
  room.rails.push({
    id: 1,
    ownerId: 'p1',
    start: { x: 100, y: 75 },
    end: { x: 1_180, y: 605 },
    opacity: 0.8,
    remaining: 0.18,
  });
  for (let index = 0; index < 24; index += 1) {
    room.events.push({
      id: index + 1,
      type: index % 2 === 0 ? 'fireball-impact' : 'food-collected',
      x: 80 + index * 43,
      y: 90 + (index % 7) * 71,
    });
  }
  room.detachedTrails.push({
    id: 1,
    color: 290,
    body: Array.from({ length: 117 }, (_, index) => ({
      x: 60 + index * 3.1,
      y: 610 + Math.sin(index / 8) * 3,
      segment: 0,
      collisionAge: 100,
    })),
  });
  return room;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(values) {
  return {
    mean: values.reduce((total, value) => total + value, 0) / values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Math.max(...values),
  };
}

function measure(operation) {
  for (let index = 0; index < warmupIterations; index += 1) operation();
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  return summarize(samples);
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function benchmarkScenario(players, busy) {
  const room = createRoom(players, busy);
  const snapshot = room.snapshot(0);
  const { payload, bytes: rawBytes } = encodeSnapshotPayload(snapshot);
  const deflateBytes = deflateRawSync(payload, { level: 6 }).byteLength;
  const snapshotAndEncode = measure(() =>
    encodeSnapshotPayload(room.snapshot(0)),
  );

  const tickRoom = createRoom(players, busy);
  let tick = 0;
  const tickDuration = measure(() => {
    tick += 1;
    tickRoom.step(2_100 + tick * (1_000 / 60), 1 / 60);
  });

  return {
    scenario: busy ? 'busy-combat' : 'full-trails',
    players,
    rawBytes,
    deflateBytes,
    deflateRatio: round(deflateBytes / rawBytes, 4),
    projectedClientKiBps: round((rawBytes * snapshotRate) / 1024, 1),
    projectedRoomMiBps: round(
      (rawBytes * snapshotRate * players) / (1024 * 1024),
      3,
    ),
    projectedRoomGiBPerHour: round(
      (rawBytes * snapshotRate * players * 3_600) / 1024 ** 3,
      2,
    ),
    snapshotAndEncodeMs: Object.fromEntries(
      Object.entries(snapshotAndEncode).map(([key, value]) => [
        key,
        round(value),
      ]),
    ),
    tickDurationMs: Object.fromEntries(
      Object.entries(tickDuration).map(([key, value]) => [key, round(value)]),
    ),
  };
}

function gitValue(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const results = [false, true].flatMap((busy) =>
  [2, 4, 8].map((players) => benchmarkScenario(players, busy)),
);
const metadata = {
  label: benchmarkLabel,
  capturedAt: new Date().toISOString(),
  commit: gitValue('rev-parse', '--short', 'HEAD'),
  workingTree: gitValue('status', '--porcelain') ? 'dirty' : 'clean',
  node: process.version,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpu: `${os.cpus()[0]?.model ?? 'unknown'} (${os.cpus().length} logical cores)`,
  snapshotRateHz: snapshotRate,
  measuredIterations: iterations,
  warmupIterations,
};

function markdownTable(headers, rows, rightAligned) {
  const widths = headers.map((header, column) =>
    Math.max(
      header.length,
      3,
      ...rows.map((row) => String(row[column]).length),
    ),
  );
  const renderRow = (row, alignValues) =>
    `| ${row
      .map((value, column) =>
        String(value)[
          alignValues && rightAligned[column] ? 'padStart' : 'padEnd'
        ](widths[column]),
      )
      .join(' | ')} |`;
  const divider = widths.map((width, column) =>
    rightAligned[column] ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width),
  );
  return [renderRow(headers, false), renderRow(divider, false)]
    .concat(rows.map((row) => renderRow(row, true)))
    .join('\n');
}

const table = markdownTable(
  [
    'Scenario',
    'Players',
    'Raw bytes/snapshot',
    'Deflate bytes',
    'Deflate/raw',
    'Projected client KiB/s',
    'Projected room MiB/s',
    'Snapshot + JSON p95 ms',
    'Tick p95 ms',
  ],
  results.map((result) => [
    result.scenario,
    result.players,
    result.rawBytes.toLocaleString('en-US'),
    result.deflateBytes.toLocaleString('en-US'),
    `${(result.deflateRatio * 100).toFixed(1)}%`,
    result.projectedClientKiBps.toFixed(1),
    result.projectedRoomMiBps.toFixed(3),
    result.snapshotAndEncodeMs.p95.toFixed(3),
    result.tickDurationMs.p95.toFixed(3),
  ]),
  [false, true, true, true, true, true, true, true, true],
);

const markdown = `# Network performance baseline — ${benchmarkLabel}

This is the **${benchmarkLabel}** baseline for Danger Noodle League's WebSocket transport. It is generated by \`npm run benchmark:network\`; do not hand-edit the result table.

- Captured: ${metadata.capturedAt}
- Commit: \`${metadata.commit}\` (${metadata.workingTree} working tree)
- Runtime: ${metadata.node} on ${metadata.platform}
- CPU: ${metadata.cpu}

## Scenario

The harness creates deterministic 2-, 4-, and 8-player rooms on the empty arena. Every snake has a mature 117-point trail. The \`busy-combat\` case additionally includes two fireballs and one grenade/blast per player, an active rail, 24 recent events, four world pickups, and a detached 117-point trail.

Each timing reports ${iterations.toLocaleString('en-US')} measured operations after ${warmupIterations.toLocaleString('en-US')} warmups. Bandwidth is projected from the measured UTF-8 snapshot payload at the production target of ${snapshotRate} snapshots/second. \`deflate bytes\` uses raw DEFLATE level 6 and closely estimates the optimized server's negotiated WebSocket per-message compression before framing.

${table}

## Interpretation

- The current protocol resends the complete room state to every client at 20 Hz, so room egress grows approximately with the square of player count: more players make each snapshot larger and create more recipients.
- Trail points use a versioned five-byte packed representation with quarter-pixel coordinates, replacing verbose repeated JSON keys while preserving visual precision.
- WebSocket per-message compression is negotiated for snapshots over 1 KiB, and the server skips superseded snapshots when a client's buffered queue exceeds 128 KiB.
- Further gains could come from delta trail encoding, event acknowledgements, and compact keys, but should be weighed against complexity after real-world smoke testing.
- These local numbers deliberately exclude Internet latency, packet loss, TLS framing, TCP retransmission, and browser rendering. The live \`/telemetry\` endpoint records real-server snapshot size/encode cost, tick time, event-loop lag, socket buffering, RTT, and browser-reported cadence/jitter/gaps during smoke tests.

## Reproduce and compare

Run the following command on the same machine and runtime before and after a networking change:

\`\`\`bash
npm run benchmark:network
\`\`\`

The command updates this Markdown report and its adjacent JSON file. For a fair comparison, use a distinct \`--output\` name or commit the previous result before rerunning it. During a real playtest, sample \`http://<server>/telemetry\` before, during, and after the session; the endpoint is process-local and resets when the server restarts.
`;

if (process.argv.includes('--write')) {
  await mkdir(path.join(root, 'docs'), { recursive: true });
  const markdownPath = path.join(root, `docs/${outputName}.md`);
  const jsonPath = path.join(root, `docs/${outputName}.json`);
  await Promise.all([
    writeFile(markdownPath, markdown),
    writeFile(jsonPath, `${JSON.stringify({ metadata, results }, null, 2)}\n`),
  ]);
  console.log(`Updated docs/${outputName}.md and .json`);
} else {
  console.log(markdown);
}

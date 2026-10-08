import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const beforePath = path.join(root, 'docs/network-performance-before.json');
const afterPath = path.join(root, 'docs/network-performance-after.json');
const outputPath = path.join(root, 'docs/network-performance-comparison.md');

const [before, after] = await Promise.all(
  [beforePath, afterPath].map(async (file) =>
    JSON.parse(await readFile(file, 'utf8')),
  ),
);

function matchingResult(result) {
  const match = after.results.find(
    (candidate) =>
      candidate.scenario === result.scenario &&
      candidate.players === result.players,
  );
  if (!match)
    throw new Error(
      `Missing after result for ${result.scenario}/${result.players}`,
    );
  return match;
}

function reduction(beforeValue, afterValue) {
  return ((1 - afterValue / beforeValue) * 100).toFixed(1);
}

function compressedRoomMiBps(result, snapshotRateHz) {
  return (
    (result.deflateBytes * snapshotRateHz * result.players) / (1024 * 1024)
  );
}

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

const rows = before.results.map((oldResult) => {
  const newResult = matchingResult(oldResult);
  const estimatedOnWire = compressedRoomMiBps(
    newResult,
    after.metadata.snapshotRateHz,
  );
  return [
    oldResult.scenario,
    oldResult.players,
    oldResult.rawBytes.toLocaleString('en-US'),
    newResult.rawBytes.toLocaleString('en-US'),
    `${reduction(oldResult.rawBytes, newResult.rawBytes)}%`,
    oldResult.projectedRoomMiBps.toFixed(3),
    newResult.projectedRoomMiBps.toFixed(3),
    estimatedOnWire.toFixed(3),
    `${reduction(oldResult.projectedRoomMiBps, estimatedOnWire)}%`,
    `${reduction(
      oldResult.snapshotAndEncodeMs.p95,
      newResult.snapshotAndEncodeMs.p95,
    )}%`,
  ];
});

const table = markdownTable(
  [
    'Scenario',
    'Players',
    'Before bytes',
    'After bytes',
    'Payload reduction',
    'Before room MiB/s',
    'After raw MiB/s',
    'After compressed MiB/s',
    'Estimated wire reduction',
    'Encode p95 reduction',
  ],
  rows,
  [false, true, true, true, true, true, true, true, true, true],
);

const fullEightBefore = before.results.find(
  (result) => result.scenario === 'full-trails' && result.players === 8,
);
const fullEightAfter = matchingResult(fullEightBefore);
const busyEightBefore = before.results.find(
  (result) => result.scenario === 'busy-combat' && result.players === 8,
);
const busyEightAfter = matchingResult(busyEightBefore);
const fullEightWire = compressedRoomMiBps(
  fullEightAfter,
  after.metadata.snapshotRateHz,
);
const busyEightWire = compressedRoomMiBps(
  busyEightAfter,
  after.metadata.snapshotRateHz,
);

const markdown = `# Network performance comparison

This compares the preserved before-optimization run with the optimized packed-trail WebSocket transport on the same machine, runtime, scenarios, snapshot rate, warmup, and sample count.

- Before: ${before.metadata.capturedAt}
- After: ${after.metadata.capturedAt}
- Snapshot rate: ${after.metadata.snapshotRateHz} Hz

${table}

## Headline results

- The 8-player full-trail payload fell from ${fullEightBefore.rawBytes.toLocaleString('en-US')} to ${fullEightAfter.rawBytes.toLocaleString('en-US')} bytes (${reduction(fullEightBefore.rawBytes, fullEightAfter.rawBytes)}% smaller). With negotiated compression, estimated room egress is ${fullEightWire.toFixed(3)} MiB/s versus the previous uncompressed ${fullEightBefore.projectedRoomMiBps.toFixed(3)} MiB/s—an ${reduction(fullEightBefore.projectedRoomMiBps, fullEightWire)}% reduction.
- The 8-player busy-combat payload fell from ${busyEightBefore.rawBytes.toLocaleString('en-US')} to ${busyEightAfter.rawBytes.toLocaleString('en-US')} bytes (${reduction(busyEightBefore.rawBytes, busyEightAfter.rawBytes)}% smaller). Estimated compressed room egress is ${busyEightWire.toFixed(3)} MiB/s versus ${busyEightBefore.projectedRoomMiBps.toFixed(3)} MiB/s—an ${reduction(busyEightBefore.projectedRoomMiBps, busyEightWire)}% reduction.
- Snapshot construction plus encoding also became cheaper because copying thousands of trail objects into verbose JSON was replaced with a compact five-byte-per-point representation. Simulation tick timings are effectively unchanged, as expected.

The compressed figures use raw DEFLATE level 6 as a close estimate of WebSocket per-message compression and exclude framing, TLS, retransmission, and TCP/IP headers. Validate them with live \`/telemetry\` plus host network counters during the real-world smoke test.
`;

await writeFile(outputPath, markdown);
console.log('Updated docs/network-performance-comparison.md');

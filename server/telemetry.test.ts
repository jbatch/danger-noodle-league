import assert from 'node:assert/strict';
import test from 'node:test';
import { NetworkTelemetry, RollingMetric } from './telemetry.ts';

void test('rolling metrics retain a bounded window and summarize it', () => {
  const metric = new RollingMetric(3);
  metric.observe(Number.NaN);
  metric.observe(1);
  metric.observe(2);
  metric.observe(3);
  metric.observe(4);

  assert.deepEqual(metric.summary(), {
    count: 3,
    latest: 4,
    mean: 3,
    p50: 3,
    p95: 4,
    p99: 4,
    max: 4,
  });
});

void test('network telemetry exposes aggregate state without room details', () => {
  const telemetry = new NetworkTelemetry();
  telemetry.connectionsAccepted = 3;
  telemetry.connectionsClosed = 1;
  telemetry.snapshotsSent = 20;
  telemetry.snapshotBytesSent = 42_000;
  telemetry.clientReportedDroppedSnapshots = 2;
  telemetry.tickDurationMs.observe(0.25);
  telemetry.snapshotBytes.observe(2_100);

  const snapshot = telemetry.snapshot({ rooms: 1, connections: 2 });
  assert.deepEqual(snapshot.state, { rooms: 1, connections: 2 });
  assert.equal(snapshot.counters.connectionsAccepted, 3);
  assert.equal(snapshot.counters.connectionsClosed, 1);
  assert.equal(snapshot.counters.snapshotBytesSent, 42_000);
  assert.equal(snapshot.counters.clientReportedDroppedSnapshots, 2);
  assert.equal(snapshot.metrics.tickDurationMs.mean, 0.25);
  assert.equal(snapshot.metrics.snapshotBytes.mean, 2_100);
  assert.equal('roomIds' in snapshot, false);
});

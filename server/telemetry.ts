export type MetricSummary = {
  count: number;
  latest: number | null;
  mean: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
};

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export class RollingMetric {
  private readonly values: number[] = [];
  private readonly capacity: number;

  constructor(capacity = 4_096) {
    this.capacity = capacity;
  }

  observe(value: number) {
    if (!Number.isFinite(value)) return;
    this.values.push(value);
    if (this.values.length > this.capacity)
      this.values.splice(0, this.values.length - this.capacity);
  }

  summary(): MetricSummary {
    if (this.values.length === 0)
      return {
        count: 0,
        latest: null,
        mean: null,
        p50: null,
        p95: null,
        p99: null,
        max: null,
      };
    const sorted = [...this.values].sort((a, b) => a - b);
    const percentile = (fraction: number) =>
      sorted[
        Math.min(
          sorted.length - 1,
          Math.max(0, Math.ceil(sorted.length * fraction) - 1),
        )
      ];
    return {
      count: this.values.length,
      latest: round(this.values.at(-1) ?? 0),
      mean: round(
        this.values.reduce((total, value) => total + value, 0) /
          this.values.length,
      ),
      p50: round(percentile(0.5)),
      p95: round(percentile(0.95)),
      p99: round(percentile(0.99)),
      max: round(sorted.at(-1) ?? 0),
    };
  }
}

export class NetworkTelemetry {
  readonly startedAt = new Date().toISOString();
  readonly tickDurationMs = new RollingMetric();
  readonly eventLoopLagMs = new RollingMetric();
  readonly snapshotEncodeMs = new RollingMetric();
  readonly snapshotBytes = new RollingMetric();
  readonly socketBufferedBytes = new RollingMetric();
  readonly roundTripMs = new RollingMetric();
  readonly clientSnapshotIntervalMs = new RollingMetric();
  readonly clientSnapshotJitterMs = new RollingMetric();
  readonly clientSnapshotDecodeMs = new RollingMetric();
  connectionsAccepted = 0;
  connectionsClosed = 0;
  messagesReceived = 0;
  malformedMessages = 0;
  snapshotsEncoded = 0;
  snapshotsSent = 0;
  snapshotsSkippedBackpressure = 0;
  snapshotBytesSent = 0;
  compressionNegotiatedConnections = 0;
  clientReportedDroppedSnapshots = 0;
  clientReportedStaleSnapshots = 0;

  snapshot(state: { rooms: number; connections: number }) {
    return {
      generatedAt: new Date().toISOString(),
      startedAt: this.startedAt,
      state,
      counters: {
        connectionsAccepted: this.connectionsAccepted,
        connectionsClosed: this.connectionsClosed,
        messagesReceived: this.messagesReceived,
        malformedMessages: this.malformedMessages,
        snapshotsEncoded: this.snapshotsEncoded,
        snapshotsSent: this.snapshotsSent,
        snapshotsSkippedBackpressure: this.snapshotsSkippedBackpressure,
        snapshotBytesSent: this.snapshotBytesSent,
        compressionNegotiatedConnections: this.compressionNegotiatedConnections,
        clientReportedDroppedSnapshots: this.clientReportedDroppedSnapshots,
        clientReportedStaleSnapshots: this.clientReportedStaleSnapshots,
      },
      metrics: {
        tickDurationMs: this.tickDurationMs.summary(),
        eventLoopLagMs: this.eventLoopLagMs.summary(),
        snapshotEncodeMs: this.snapshotEncodeMs.summary(),
        snapshotBytes: this.snapshotBytes.summary(),
        socketBufferedBytes: this.socketBufferedBytes.summary(),
        roundTripMs: this.roundTripMs.summary(),
        clientSnapshotIntervalMs: this.clientSnapshotIntervalMs.summary(),
        clientSnapshotJitterMs: this.clientSnapshotJitterMs.summary(),
        clientSnapshotDecodeMs: this.clientSnapshotDecodeMs.summary(),
      },
    };
  }
}

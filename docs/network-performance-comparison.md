# Network performance comparison

This compares the preserved before-optimization run with the optimized packed-trail WebSocket transport on the same machine, runtime, scenarios, snapshot rate, warmup, and sample count.

- Before: 2026-10-08T01:16:40.072Z
- After: 2026-10-08T01:24:09.653Z
- Snapshot rate: 20 Hz

| Scenario    | Players | Before bytes | After bytes | Payload reduction | Before room MiB/s | After raw MiB/s | After compressed MiB/s | Estimated wire reduction | Encode p95 reduction |
| ----------- | ------: | -----------: | ----------: | ----------------: | ----------------: | --------------: | ---------------------: | -----------------------: | -------------------: |
| full-trails |       2 |       11,811 |       3,052 |             74.2% |             0.451 |           0.116 |                  0.060 |                    86.6% |                49.1% |
| full-trails |       4 |       22,980 |       5,331 |             76.8% |             1.753 |           0.407 |                  0.198 |                    88.7% |                67.4% |
| full-trails |       8 |       45,130 |       9,874 |             78.1% |             6.886 |           1.507 |                  0.699 |                    89.8% |                71.0% |
| busy-combat |       2 |       19,238 |       5,644 |             70.7% |             0.734 |           0.215 |                  0.096 |                    86.9% |                59.5% |
| busy-combat |       4 |       30,897 |       8,413 |             72.8% |             2.357 |           0.642 |                  0.279 |                    88.2% |                55.6% |
| busy-combat |       8 |       54,051 |      13,960 |             74.2% |             8.248 |           2.130 |                  0.905 |                    89.0% |                68.7% |

## Headline results

- The 8-player full-trail payload fell from 45,130 to 9,874 bytes (78.1% smaller). With negotiated compression, estimated room egress is 0.699 MiB/s versus the previous uncompressed 6.886 MiB/s—an 89.8% reduction.
- The 8-player busy-combat payload fell from 54,051 to 13,960 bytes (74.2% smaller). Estimated compressed room egress is 0.905 MiB/s versus 8.248 MiB/s—an 89.0% reduction.
- Snapshot construction plus encoding also became cheaper because copying thousands of trail objects into verbose JSON was replaced with a compact five-byte-per-point representation. Simulation tick timings are effectively unchanged, as expected.

The compressed figures use raw DEFLATE level 6 as a close estimate of WebSocket per-message compression and exclude framing, TLS, retransmission, and TCP/IP headers. Validate them with live `/telemetry` plus host network counters during the real-world smoke test.

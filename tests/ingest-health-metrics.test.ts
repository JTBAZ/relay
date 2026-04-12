import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateIngestHealthGates,
  recordDlqAppend,
  recordIngestBatchResult,
  resetIngestHealthMetrics
} from "../src/ingest/ingest-health-metrics.js";

describe("ingest health metrics (T-009)", () => {
  beforeEach(() => {
    resetIngestHealthMetrics();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("aggregates batch results", async () => {
    recordIngestBatchResult({
      job_id: "j1",
      idempotent_skips: 2,
      campaigns_upserted: 0,
      tiers_upserted: 0,
      posts_written: 1,
      media_upserted: 1,
      tombstones_applied: 0,
      events_emitted: 0
    });
    recordIngestBatchResult({
      job_id: "j2",
      idempotent_skips: 0,
      campaigns_upserted: 1,
      tiers_upserted: 0,
      posts_written: 0,
      media_upserted: 0,
      tombstones_applied: 0,
      events_emitted: 0
    });
    recordDlqAppend();

    const g = await evaluateIngestHealthGates({
      pendingRetryJobs: 0,
      dlqRecordCount: 1
    });
    expect(g.metrics.batches_completed).toBe(2);
    expect(g.metrics.idempotent_skips_total).toBe(2);
    expect(g.metrics.dlq_appends_total).toBe(1);
    expect(g.dlq_per_batch).toBeCloseTo(0.5, 5);
    expect(g.duplicate_handling_ratio).toBeCloseTo(2 / (2 + 3), 5);
  });

  it("fires alert when DLQ backlog exceeds RELAY_INGEST_ALERT_MAX_DLQ_RECORDS", async () => {
    vi.stubEnv("RELAY_INGEST_ALERT_MAX_DLQ_RECORDS", "2");
    const g = await evaluateIngestHealthGates({
      pendingRetryJobs: 0,
      dlqRecordCount: 3
    });
    expect(g.alerts.some((a) => a.includes("dlq_records=3"))).toBe(true);
  });
});

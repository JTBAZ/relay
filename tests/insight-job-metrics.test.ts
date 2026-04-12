import { describe, expect, it } from "vitest";
import {
  evaluateInsightJobHealth,
  getInsightJobMetricsSnapshot,
  recordAnalyticsGenerateAttempt,
  recordAnalyticsGenerateFailure,
  recordAnalyticsGenerateSuccess,
  resetInsightJobMetricsForTests
} from "../src/analytics/insight-job-metrics.js";

describe("insight job metrics", () => {
  it("tracks generate attempts and success/failure ratios", () => {
    resetInsightJobMetricsForTests();
    recordAnalyticsGenerateAttempt();
    recordAnalyticsGenerateSuccess();
    recordAnalyticsGenerateAttempt();
    recordAnalyticsGenerateFailure();
    const snap = getInsightJobMetricsSnapshot();
    expect(snap.generate_attempts).toBe(2);
    expect(snap.generate_successes).toBe(1);
    expect(snap.generate_failures).toBe(1);
    expect(snap.success_ratio).toBeCloseTo(0.5);
  });

  it("alerts when failure ratio exceeds threshold with enough samples", () => {
    resetInsightJobMetricsForTests();
    const prevMin = process.env.RELAY_INSIGHT_JOB_ALERT_MIN_SAMPLES;
    const prevRatio = process.env.RELAY_INSIGHT_JOB_ALERT_MAX_FAILURE_RATIO;
    process.env.RELAY_INSIGHT_JOB_ALERT_MIN_SAMPLES = "10";
    process.env.RELAY_INSIGHT_JOB_ALERT_MAX_FAILURE_RATIO = "0.01";
    try {
      for (let i = 0; i < 10; i++) {
        recordAnalyticsGenerateAttempt();
        recordAnalyticsGenerateFailure();
      }
      const h = evaluateInsightJobHealth();
      expect(h.alerts.length).toBeGreaterThan(0);
      expect(h.metrics.failure_ratio).toBe(1);
    } finally {
      if (prevMin === undefined) delete process.env.RELAY_INSIGHT_JOB_ALERT_MIN_SAMPLES;
      else process.env.RELAY_INSIGHT_JOB_ALERT_MIN_SAMPLES = prevMin;
      if (prevRatio === undefined) delete process.env.RELAY_INSIGHT_JOB_ALERT_MAX_FAILURE_RATIO;
      else process.env.RELAY_INSIGHT_JOB_ALERT_MAX_FAILURE_RATIO = prevRatio;
    }
  });
});

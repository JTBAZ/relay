import { describe, expect, it } from "vitest";
import {
  evaluateExportRetrievalHealth,
  getExportRetrievalMetricsSnapshot,
  recordContentDeliveryFailure,
  recordContentDeliverySuccess,
  resetExportRetrievalMetricsForTests
} from "../src/export/export-retrieval-metrics.js";

describe("export retrieval metrics", () => {
  it("computes content retrieval ratio", () => {
    resetExportRetrievalMetricsForTests();
    recordContentDeliverySuccess();
    recordContentDeliverySuccess();
    recordContentDeliveryFailure();
    const m = getExportRetrievalMetricsSnapshot();
    expect(m.content_retrieval_ratio).toBeCloseTo(2 / 3);
  });

  it("alerts when content failure ratio exceeds threshold", () => {
    resetExportRetrievalMetricsForTests();
    const prevMin = process.env.RELAY_EXPORT_HEALTH_MIN_SAMPLES;
    const prevMax = process.env.RELAY_EXPORT_HEALTH_MAX_CONTENT_FAILURE_RATIO;
    process.env.RELAY_EXPORT_HEALTH_MIN_SAMPLES = "10";
    process.env.RELAY_EXPORT_HEALTH_MAX_CONTENT_FAILURE_RATIO = "0.001";
    try {
      for (let i = 0; i < 10; i++) {
        recordContentDeliveryFailure();
      }
      const h = evaluateExportRetrievalHealth();
      expect(h.alerts.length).toBeGreaterThan(0);
    } finally {
      if (prevMin === undefined) delete process.env.RELAY_EXPORT_HEALTH_MIN_SAMPLES;
      else process.env.RELAY_EXPORT_HEALTH_MIN_SAMPLES = prevMin;
      if (prevMax === undefined) delete process.env.RELAY_EXPORT_HEALTH_MAX_CONTENT_FAILURE_RATIO;
      else process.env.RELAY_EXPORT_HEALTH_MAX_CONTENT_FAILURE_RATIO = prevMax;
    }
  });
});

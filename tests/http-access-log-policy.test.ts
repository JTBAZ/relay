import { describe, expect, it } from "vitest";
import {
  isHighVolumeAccessLogPath,
  resolveHttpAccessLogEmit
} from "../src/lib/http-access-log-policy.js";

describe("http-access-log-policy (P2-obs-007)", () => {
  it("isHighVolumeAccessLogPath matches health, metrics, patron entitlements health", () => {
    expect(isHighVolumeAccessLogPath("/api/v1/health")).toBe(true);
    expect(isHighVolumeAccessLogPath("/api/v1/health/ingest")).toBe(true);
    expect(isHighVolumeAccessLogPath("/api/v1/metrics/summary")).toBe(true);
    expect(isHighVolumeAccessLogPath("/api/v1/patron/entitlements/health")).toBe(true);
    expect(isHighVolumeAccessLogPath("/api/v1/patreon/foo")).toBe(false);
  });

  it("non-production uses info for high-volume paths", () => {
    expect(
      resolveHttpAccessLogEmit({
        pathOnly: "/api/v1/health",
        nodeEnv: "development",
        sampleRateEnv: undefined,
        random: () => 0
      })
    ).toBe("info");
    expect(
      resolveHttpAccessLogEmit({
        pathOnly: "/api/v1/health",
        nodeEnv: "test",
        sampleRateEnv: undefined,
        random: () => 0
      })
    ).toBe("info");
  });

  it("production high-volume defaults to trace", () => {
    expect(
      resolveHttpAccessLogEmit({
        pathOnly: "/api/v1/health",
        nodeEnv: "production",
        sampleRateEnv: undefined,
        random: () => 0
      })
    ).toBe("trace");
  });

  it("production high-volume honors RELAY_LOG_SAMPLE_RATE", () => {
    expect(
      resolveHttpAccessLogEmit({
        pathOnly: "/api/v1/metrics/summary",
        nodeEnv: "production",
        sampleRateEnv: "0.5",
        random: () => 0.2
      })
    ).toBe("info");
    expect(
      resolveHttpAccessLogEmit({
        pathOnly: "/api/v1/metrics/summary",
        nodeEnv: "production",
        sampleRateEnv: "0.5",
        random: () => 0.7
      })
    ).toBe("skip");
  });

  it("low-volume paths always info in production", () => {
    expect(
      resolveHttpAccessLogEmit({
        pathOnly: "/api/v1/auth/login",
        nodeEnv: "production",
        sampleRateEnv: undefined,
        random: () => 0
      })
    ).toBe("info");
  });

  it("ignores invalid sample rate (falls back to trace)", () => {
    expect(
      resolveHttpAccessLogEmit({
        pathOnly: "/api/v1/health",
        nodeEnv: "production",
        sampleRateEnv: "not-a-number",
        random: () => 0
      })
    ).toBe("trace");
  });
});

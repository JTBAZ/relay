import { describe, expect, it } from "vitest";
import { computeAutosyncDelayAfterCycle } from "../src/patreon/incremental-sync-worker.js";

describe("computeAutosyncDelayAfterCycle (T-008 fallback cadence)", () => {
  it("returns base + jitter only when backoff off or no failure streak", () => {
    const d = computeAutosyncDelayAfterCycle({
      baseIntervalMs: 60_000,
      jitterMaxMs: 0,
      backoffEnabled: true,
      consecutiveFailureCycles: 0,
      maxBackoffMultiplier: 8
    });
    expect(d).toBe(60_000);
  });

  it("doubles delay after first failure streak when backoff enabled", () => {
    const d = computeAutosyncDelayAfterCycle({
      baseIntervalMs: 100,
      jitterMaxMs: 0,
      backoffEnabled: true,
      consecutiveFailureCycles: 1,
      maxBackoffMultiplier: 8,
      random: () => 0
    });
    expect(d).toBe(200);
  });

  it("caps multiplier", () => {
    const d = computeAutosyncDelayAfterCycle({
      baseIntervalMs: 100,
      jitterMaxMs: 0,
      backoffEnabled: true,
      consecutiveFailureCycles: 10,
      maxBackoffMultiplier: 4,
      random: () => 0
    });
    expect(d).toBe(400);
  });

  it("adds jitter deterministically via random()", () => {
    const d = computeAutosyncDelayAfterCycle({
      baseIntervalMs: 1000,
      jitterMaxMs: 100,
      backoffEnabled: false,
      consecutiveFailureCycles: 0,
      maxBackoffMultiplier: 8,
      random: () => 0.5
    });
    expect(d).toBe(1050);
  });
});

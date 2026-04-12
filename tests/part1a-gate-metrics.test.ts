import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluatePart1aGates,
  recordCreatorOAuthExchangeAttempt,
  recordCreatorOAuthExchangeFailure,
  recordCreatorOAuthExchangeSuccess,
  recordTokenRefreshAttempt,
  recordTokenRefreshFailure,
  recordTokenRefreshSuccess,
  resetPart1aGateMetricsForTests
} from "../src/auth/part1a-gate-metrics.js";

describe("Part 1 A gate metrics (T-010)", () => {
  afterEach(() => {
    resetPart1aGateMetricsForTests();
    vi.unstubAllEnvs();
  });

  it("computes creator OAuth completion ratio", () => {
    for (let i = 0; i < 18; i += 1) {
      recordCreatorOAuthExchangeAttempt();
      recordCreatorOAuthExchangeSuccess();
    }
    recordCreatorOAuthExchangeAttempt();
    recordCreatorOAuthExchangeFailure();

    const g = evaluatePart1aGates();
    expect(g.metrics.creator_oauth_attempts).toBe(19);
    expect(g.creator_oauth_completion_ratio).toBeCloseTo(18 / 19, 5);
  });

  it("alerts when creator completion below threshold with enough samples", () => {
    vi.stubEnv("RELAY_PART1A_MIN_SAMPLES_FOR_ALERTS", "5");
    vi.stubEnv("RELAY_PART1A_ALERT_CREATOR_OAUTH_MIN_COMPLETION", "0.99");
    for (let i = 0; i < 10; i += 1) {
      recordCreatorOAuthExchangeAttempt();
      recordCreatorOAuthExchangeSuccess();
    }
    recordCreatorOAuthExchangeAttempt();
    recordCreatorOAuthExchangeFailure();

    const g = evaluatePart1aGates();
    expect(g.alerts.some((a) => a.includes("creator OAuth"))).toBe(true);
  });

  it("computes token refresh failure ratio", () => {
    recordTokenRefreshAttempt();
    recordTokenRefreshSuccess();
    recordTokenRefreshAttempt();
    recordTokenRefreshSuccess();
    recordTokenRefreshAttempt();
    recordTokenRefreshFailure();
    const g = evaluatePart1aGates();
    expect(g.token_refresh_failure_ratio).toBeCloseTo(1 / 3, 5);
  });
});

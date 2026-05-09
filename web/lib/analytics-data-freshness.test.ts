import { afterEach, describe, expect, it, vi } from "vitest";
import {
  insightsStaleDaysLimit,
  isInsightsCsvStale
} from "./analytics-data-freshness";

describe("analytics-data-freshness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 14 days", () => {
    expect(insightsStaleDaysLimit()).toBe(14);
  });

  it("reads NEXT_PUBLIC_RELAY_INSIGHTS_STALE_DAYS when valid", () => {
    vi.stubEnv("NEXT_PUBLIC_RELAY_INSIGHTS_STALE_DAYS", "21");
    expect(insightsStaleDaysLimit()).toBe(21);
  });

  it("returns false when import time missing", () => {
    expect(isInsightsCsvStale(null, 1_000_000, 14)).toBe(false);
  });

  it("returns true when older than threshold", () => {
    const now = Date.parse("2026-02-15T12:00:00.000Z");
    const uploaded = "2026-01-01T00:00:00.000Z";
    expect(isInsightsCsvStale(uploaded, now, 14)).toBe(true);
  });

  it("returns false when within threshold", () => {
    const now = Date.parse("2026-02-15T12:00:00.000Z");
    const uploaded = "2026-02-10T00:00:00.000Z";
    expect(isInsightsCsvStale(uploaded, now, 14)).toBe(false);
  });
});

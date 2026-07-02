import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getMetricRegistrySeed } from "../src/platform-metrics/metric-registry-seed.js";
import {
  REVENUE_EVENT_KINDS,
  REVENUE_METRIC_DEFINITIONS,
  REVENUE_SOURCE_LABELS,
  validateRevenueTelemetryEvent
} from "../src/platform-metrics/revenue-telemetry-contract.js";

const repoRoot = join(import.meta.dirname, "..");

describe("revenue telemetry contract (PMD-060)", () => {
  it("defines approved source labels and event kinds", () => {
    expect(REVENUE_SOURCE_LABELS).toEqual([
      "relay_native",
      "patreon_upstream",
      "external_estimate"
    ]);
    expect(REVENUE_EVENT_KINDS.length).toBeGreaterThanOrEqual(9);
  });

  it("maps metric definitions to registry seed keys", () => {
    const registryKeys = new Set(getMetricRegistrySeed().map((entry) => entry.key));
    for (const metric of REVENUE_METRIC_DEFINITIONS) {
      expect(registryKeys.has(metric.key), metric.key).toBe(true);
      expect(metric.allowedSourceLabels).toContain("relay_native");
    }
  });

  it("validates checkout_completed and rejects Patreon on Relay-native checkout", () => {
    const ok = validateRevenueTelemetryEvent({
      event_kind: "checkout_completed",
      source_label: "relay_native",
      occurred_at: "2026-05-25T12:00:00.000Z",
      creator_id: "creator_1",
      checkout_id: "chk_1",
      amount_cents: 1800,
      currency: "USD",
      status: "succeeded",
      provider: "stripe"
    });
    expect(ok.valid).toBe(true);

    const mixed = validateRevenueTelemetryEvent({
      event_kind: "checkout_completed",
      source_label: "patreon_upstream",
      occurred_at: "2026-05-25T12:00:00.000Z",
      creator_id: "creator_1",
      checkout_id: "chk_1",
      amount_cents: 1800,
      currency: "USD",
      status: "succeeded"
    });
    expect(mixed.valid).toBe(false);
    expect(mixed.errors.some((error) => error.includes("not allowed"))).toBe(true);
  });

  it("rejects forbidden PII fields", () => {
    const bad = validateRevenueTelemetryEvent({
      event_kind: "refund_issued",
      source_label: "relay_native",
      occurred_at: "2026-05-25T12:00:00.000Z",
      amount_cents: 500,
      currency: "USD",
      email: "user@example.com"
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((error) => error.includes("email"))).toBe(true);
  });
});

describe("PMD-060 platform revenue events migration", () => {
  it("migration SQL defines revenue table with RLS", () => {
    const sql = readFileSync(
      join(repoRoot, "prisma/migrations/20260525190000_platform_revenue_events/migration.sql"),
      "utf8"
    );
    expect(sql).toContain('CREATE TABLE "platform_revenue_events"');
    expect(sql).toContain("PlatformRevenueSourceLabel");
    expect(sql).toContain("PlatformRevenueEventKind");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });
});

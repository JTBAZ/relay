/**
 * @fileoverview Tip beta funnel service tests (MB-8).
 */
import { describe, expect, it, vi } from "vitest";
import {
  computeTipBetaFunnel,
  parseTipBetaPeriodKey,
  tipBetaPeriodKeyUtc
} from "../src/analytics/tip-beta-funnel-service.js";

describe("tipBetaPeriodKeyUtc / parseTipBetaPeriodKey", () => {
  it("formats UTC month keys", () => {
    expect(tipBetaPeriodKeyUtc(new Date("2026-07-16T12:00:00.000Z"))).toBe("2026-07");
  });

  it("parses period bounds", () => {
    const p = parseTipBetaPeriodKey("2026-07");
    expect(p.period_start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(p.period_end.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("computeTipBetaFunnel", () => {
  it("computes converters / active fans and go/no-go", async () => {
    const prisma = {
      session: {
        findMany: vi.fn(async () => [
          { tenantMembership: { accountId: "a1" } },
          { tenantMembership: { accountId: "a2" } },
          { tenantMembership: { accountId: "a1" } },
          { tenantMembership: { accountId: "a3" } }
        ])
      },
      tipLedgerEntry: {
        findMany: vi.fn(async () => [{ accountId: "a1" }, { accountId: "a99" }])
      },
      tipReveal: { count: vi.fn(async () => 4) },
      relayEngagementEvent: { count: vi.fn(async () => 10) },
      marketingOfferClickEvent: { count: vi.fn(async () => 2) }
    };

    const rollup = await computeTipBetaFunnel(prisma as never, { periodKey: "2026-07" });
    expect(rollup.active_fans).toBe(3);
    expect(rollup.converters).toBe(1); // only a1 is active + spender
    expect(rollup.conversion_rate).toBeCloseTo(1 / 3, 5);
    expect(rollup.reveals).toBe(4);
    expect(rollup.reveals_per_converter).toBe(4);
    expect(rollup.offer_ctr).toBeCloseTo(0.2, 5);
    expect(rollup.go_no_go_pass).toBe(true); // ~33% ≥ 15%
  });

  it("marks go_no_go_pass when conversion_rate >= 15%", async () => {
    const prisma = {
      session: {
        findMany: vi.fn(async () => [
          { tenantMembership: { accountId: "a1" } },
          { tenantMembership: { accountId: "a2" } }
        ])
      },
      tipLedgerEntry: {
        findMany: vi.fn(async () => [{ accountId: "a1" }])
      },
      tipReveal: { count: vi.fn(async () => 1) },
      relayEngagementEvent: { count: vi.fn(async () => 0) },
      marketingOfferClickEvent: { count: vi.fn(async () => 0) }
    };
    const rollup = await computeTipBetaFunnel(prisma as never, { periodKey: "2026-07" });
    expect(rollup.conversion_rate).toBe(0.5);
    expect(rollup.go_no_go_pass).toBe(true);
  });
});

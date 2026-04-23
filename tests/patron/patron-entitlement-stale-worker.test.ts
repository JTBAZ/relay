import { describe, expect, it, vi } from "vitest";
import { runPatronEntitlementStaleRefreshCycle } from "../../src/patron/patron-entitlement-stale-worker.js";

vi.mock("../../src/patron/patron-entitlement-refresh.js", () => ({
  refreshPatronEntitlementSnapshotFromPatreon: vi.fn().mockResolvedValue({ ok: true })
}));

describe("runPatronEntitlementStaleRefreshCycle", () => {
  it("returns zeros when no stale snapshots", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { patronEntitlementSnapshot: { findMany } };
    const now = new Date("2026-01-01T00:00:00.000Z");
    const r = await runPatronEntitlementStaleRefreshCycle({
      prisma: prisma as never,
      encryption: {} as never,
      patreonClient: {} as never,
      fetchImpl: fetch,
      batchSize: 10,
      now
    });
    expect(r).toEqual({
      cycle_started_at: now.toISOString(),
      rows_scanned: 0,
      refreshed: 0,
      skipped: 0,
      failed: 0
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { staleAfter: { lt: now } },
      take: 10,
      orderBy: { staleAfter: "asc" }
    });
  });
});

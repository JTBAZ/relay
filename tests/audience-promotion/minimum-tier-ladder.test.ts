/**
 * Slice 2 Batch 1 — pure amount-sorted minimum-tier ladder.
 */
import { describe, expect, it } from "vitest";
import {
  buildMinimumTierAccessState,
  buildMinimumTierLadder,
  buildTierLadderRows,
  type LadderComposeTier
} from "../../web/lib/minimum-tier-ladder";
import { RELAY_TIER_PUBLIC } from "../../web/lib/tier-access";

const catalog: LadderComposeTier[] = [
  {
    tier_id: "prisma_studio",
    relay_tier_id: "patreon_tier_studio",
    title: "Studio",
    amount_cents: 2500
  },
  {
    tier_id: "prisma_basic",
    relay_tier_id: "patreon_tier_basic",
    title: "Basic",
    amount_cents: 500
  },
  {
    tier_id: "prisma_pro",
    relay_tier_id: "patreon_tier_pro",
    title: "Pro",
    amount_cents: 1500
  }
];

describe("buildMinimumTierAccessState", () => {
  it("treats empty / public-only upstream as public", () => {
    expect(buildMinimumTierAccessState([], catalog)).toMatchObject({
      is_public: true,
      minimum_tier_id: null
    });
    expect(buildMinimumTierAccessState([RELAY_TIER_PUBLIC], catalog)).toMatchObject({
      is_public: true,
      minimum_tier_id: null
    });
  });

  it("picks the lowest-priced matched compose tier as minimum", () => {
    const gate = buildMinimumTierAccessState(
      ["patreon_tier_pro", "patreon_tier_basic"],
      catalog
    );
    expect(gate.is_public).toBe(false);
    expect(gate.minimum_tier_id).toBe("prisma_basic");
    expect(gate.upstream_tier_ids).toEqual(["patreon_tier_pro", "patreon_tier_basic"]);
  });
});

describe("buildTierLadderRows", () => {
  it("sorts by amount_cents ascending", () => {
    const rows = buildTierLadderRows(catalog, {
      is_public: true,
      minimum_tier_id: null,
      upstream_tier_ids: []
    });
    expect(rows.map((r) => r.tier_id)).toEqual([
      "prisma_basic",
      "prisma_pro",
      "prisma_studio"
    ]);
    expect(rows.every((r) => r.state === "public")).toBe(true);
  });

  it("marks minimum / implied / locked_out for a gated floor", () => {
    const { rows } = buildMinimumTierLadder(["patreon_tier_pro"], catalog);
    expect(rows.find((r) => r.tier_id === "prisma_basic")?.state).toBe("locked_out");
    expect(rows.find((r) => r.tier_id === "prisma_pro")?.state).toBe("minimum");
    expect(rows.find((r) => r.tier_id === "prisma_studio")?.state).toBe("implied");
  });

  it("never invents catalog rows from fallback labels", () => {
    const { rows } = buildMinimumTierLadder(["patreon_tier_basic"], catalog);
    expect(rows.map((r) => r.label).sort()).toEqual(["Basic", "Pro", "Studio"]);
    expect(rows.some((r) => /goku|advanced|fallback/i.test(r.label))).toBe(false);
  });
});

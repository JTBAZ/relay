import { describe, expect, it } from "vitest";
import {
  tierFloorCents,
  userMeetsTierGatesWithOrdering
} from "../src/clone/tier-rules.js";
import type { TierRow } from "../src/ingest/canonical-store.js";

const base = (id: string, amount: number): TierRow => ({
  tier_id: id,
  creator_id: "c",
  campaign_id: "camp",
  title: id,
  amount_cents: amount,
  upstream_updated_at: "2026-01-01T00:00:00.000Z",
  version_seq: 1
});

describe("tierFloorCents", () => {
  it("reads amount_cents from catalog", () => {
    const tiers = { t1: base("t1", 500) };
    expect(tierFloorCents(tiers, "t1")).toBe(500);
  });

  it("returns null when tier row missing or amount unknown", () => {
    expect(tierFloorCents({}, "t_x")).toBeNull();
  });
});

describe("userMeetsTierGatesWithOrdering", () => {
  const tiers: Record<string, TierRow> = {
    patreon_tier_low: base("patreon_tier_low", 500),
    patreon_tier_high: base("patreon_tier_high", 2500)
  };

  it("allows patron on a higher pledge tier than the post minimum", () => {
    expect(
      userMeetsTierGatesWithOrdering(
        ["patreon_tier_low"],
        ["patreon_tier_high"],
        tiers
      )
    ).toBe(true);
  });

  it("denies patron on a lower pledge tier than required", () => {
    expect(
      userMeetsTierGatesWithOrdering(
        ["patreon_tier_high"],
        ["patreon_tier_low"],
        tiers
      )
    ).toBe(false);
  });

  it("still allows exact tier id match when amounts tie", () => {
    expect(
      userMeetsTierGatesWithOrdering(["patreon_tier_low"], ["patreon_tier_low"], tiers)
    ).toBe(true);
  });
});

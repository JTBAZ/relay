import { describe, expect, it } from "vitest";
import {
  canAccessPost,
  isFreeTier,
  paidUserTierIds,
  resolvePostAccessLevel,
  tierFloorCents,
  userMeetsTierGatesWithOrdering
} from "../src/clone/tier-rules.js";
import type { TierRow } from "../src/ingest/canonical-store.js";

const base = (
  id: string,
  amount: number | undefined,
  title?: string
): TierRow => ({
  tier_id: id,
  creator_id: "c",
  campaign_id: "camp",
  title: title ?? id,
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

describe("isFreeTier (PE-C P0)", () => {
  it("returns true when amount_cents === 0", () => {
    expect(isFreeTier(base("t", 0))).toBe(true);
  });

  it("returns false when amount_cents > 0", () => {
    expect(isFreeTier(base("t", 500, "Basic"))).toBe(false);
  });

  it("uses the title heuristic when amount_cents is missing", () => {
    expect(isFreeTier(base("t", undefined, "Free"))).toBe(true);
    expect(isFreeTier(base("t", undefined, "Free Tier"))).toBe(true);
    expect(isFreeTier(base("t", undefined, "FREE MEMBER"))).toBe(true);
  });

  it("defaults to NOT free when amount_cents is missing and title is non-free (avoid locking out real patrons during ingest gap)", () => {
    expect(isFreeTier(base("t", undefined, "Basic"))).toBe(false);
    expect(isFreeTier(base("t", undefined, "Advanced"))).toBe(false);
  });
});

describe("paidUserTierIds (PE-C P0)", () => {
  const catalog: Record<string, TierRow> = {
    free_t: base("free_t", 0, "Free"),
    basic_t: base("basic_t", 500, "Basic"),
    nullPaid_t: base("nullPaid_t", undefined, "Advanced")
  };

  it("drops $0 / Free Tier ids", () => {
    expect(paidUserTierIds(["free_t", "basic_t"], catalog)).toEqual(["basic_t"]);
  });

  it("keeps Patreon tier ids whose amount_cents is null but title is non-free", () => {
    expect(paidUserTierIds(["nullPaid_t"], catalog)).toEqual(["nullPaid_t"]);
  });

  it("drops synthetic relay_tier_* markers if they leak into a user's tier list", () => {
    expect(
      paidUserTierIds(["relay_tier_public", "relay_tier_all_patrons", "basic_t"], catalog)
    ).toEqual(["basic_t"]);
  });

  it("keeps tier ids absent from the catalog (catalog lag — assume paid for safety)", () => {
    expect(paidUserTierIds(["unknown_t"], catalog)).toEqual(["unknown_t"]);
  });
});

describe("canAccessPost — Free Tier members vs paying patrons (PE-C P0)", () => {
  const catalog: Record<string, TierRow> = {
    patreon_tier_free: base("patreon_tier_free", 0, "Free"),
    patreon_tier_basic: base("patreon_tier_basic", 500, "Basic"),
    patreon_tier_advanced: base("patreon_tier_advanced", 1000, "Advanced")
  };
  // Production builds `rules` from the same catalog via `evaluateTierRules`, so the
  // Free Tier is also in `rules`. Mirror that here so `resolvePostAccessLevel` produces
  // `tier_gated` (not the synthetic-only `member_only` fallback) for explicit Free Tier
  // posts.
  const rules = Object.values(catalog).map((t) => ({
    tier_id: t.tier_id,
    title: t.title,
    access_level: "tier_gated" as const,
    campaign_id: t.campaign_id
  }));

  it("'all patrons' member_only post: Free Tier member is DENIED", () => {
    const access = resolvePostAccessLevel(["relay_tier_all_patrons"], rules);
    expect(canAccessPost(access, ["patreon_tier_free"], catalog)).toBe(false);
  });

  it("'all patrons' member_only post: paying patron at Basic is allowed", () => {
    const access = resolvePostAccessLevel(["relay_tier_all_patrons"], rules);
    expect(canAccessPost(access, ["patreon_tier_basic"], catalog)).toBe(true);
  });

  it("'all patrons' member_only post: free follower (no tiers) is denied", () => {
    const access = resolvePostAccessLevel(["relay_tier_all_patrons"], rules);
    expect(canAccessPost(access, [], catalog)).toBe(false);
  });

  it("tier_gated post (Basic+): Free Tier member is denied", () => {
    const access = resolvePostAccessLevel(["patreon_tier_basic"], rules);
    expect(canAccessPost(access, ["patreon_tier_free"], catalog)).toBe(false);
  });

  it("tier_gated post (Basic+): Advanced patron is allowed via pledge-floor ordering", () => {
    const access = resolvePostAccessLevel(["patreon_tier_basic"], rules);
    expect(canAccessPost(access, ["patreon_tier_advanced"], catalog)).toBe(true);
  });

  it("tier_gated post explicitly requiring Free Tier: Free Tier member is allowed", () => {
    const access = resolvePostAccessLevel(["patreon_tier_free"], rules);
    expect(canAccessPost(access, ["patreon_tier_free"], catalog)).toBe(true);
  });

  it("public post: anyone (including no-tier viewer) is allowed", () => {
    const access = resolvePostAccessLevel(["relay_tier_public"], rules);
    expect(canAccessPost(access, [], catalog)).toBe(true);
  });
});

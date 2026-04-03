import { describe, expect, it } from "vitest";
import {
  expandAllPatronsTierIds,
  listCampaignPaidPatreonTierIds,
  listCampaignPatreonTierIds
} from "../src/patreon/expand-all-patrons-tiers.js";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
import type { IngestTier } from "../src/ingest/types.js";

const tier = (id: string, amount_cents?: number): IngestTier => ({
  tier_id: id,
  title: id,
  upstream_updated_at: "2026-01-01T00:00:00Z",
  ...(amount_cents !== undefined ? { amount_cents } : {})
});

describe("listCampaignPatreonTierIds", () => {
  it("returns sorted patreon_tier_* ids only", () => {
    const tiers: IngestTier[] = [
      tier("patreon_tier_2"),
      tier("relay_tier_all_patrons"),
      tier("patreon_tier_10"),
      tier("patreon_tier_2")
    ];
    expect(listCampaignPatreonTierIds(tiers)).toEqual(["patreon_tier_10", "patreon_tier_2"]);
  });

  it("returns empty for undefined or empty", () => {
    expect(listCampaignPatreonTierIds(undefined)).toEqual([]);
    expect(listCampaignPatreonTierIds([])).toEqual([]);
  });
});

describe("listCampaignPaidPatreonTierIds", () => {
  it("includes only patreon_tier_* with amount_cents > 0, sorted by amount desc", () => {
    const tiers: IngestTier[] = [
      tier("patreon_tier_low", 100),
      tier("patreon_tier_high", 900),
      tier("patreon_tier_free", 0),
      tier("relay_tier_all_patrons")
    ];
    expect(listCampaignPaidPatreonTierIds(tiers)).toEqual([
      "patreon_tier_high",
      "patreon_tier_low"
    ]);
  });

  it("returns empty when no paid tiers", () => {
    expect(listCampaignPaidPatreonTierIds([tier("patreon_tier_x", 0)])).toEqual([]);
    expect(listCampaignPaidPatreonTierIds([tier("patreon_tier_y")])).toEqual([]);
  });
});

describe("expandAllPatronsTierIds", () => {
  it("expands sole all_patrons to single patreon tier", () => {
    expect(
      expandAllPatronsTierIds([RELAY_TIER_ALL_PATRONS], ["patreon_tier_5"])
    ).toEqual(["patreon_tier_5"]);
  });

  it("expands to full sorted campaign list", () => {
    expect(
      expandAllPatronsTierIds([RELAY_TIER_ALL_PATRONS], ["patreon_tier_a", "patreon_tier_b"])
    ).toEqual(["patreon_tier_a", "patreon_tier_b"]);
  });

  it("leaves all_patrons when no patreon tiers to expand into", () => {
    expect(expandAllPatronsTierIds([RELAY_TIER_ALL_PATRONS], [])).toEqual([
      RELAY_TIER_ALL_PATRONS
    ]);
  });

  it("does not change public", () => {
    expect(expandAllPatronsTierIds([RELAY_TIER_PUBLIC], ["patreon_tier_1"])).toEqual([
      RELAY_TIER_PUBLIC
    ]);
  });

  it("does not change concrete patreon tiers", () => {
    expect(expandAllPatronsTierIds(["patreon_tier_5"], ["patreon_tier_5"])).toEqual([
      "patreon_tier_5"
    ]);
  });

  it("does not change empty array", () => {
    expect(expandAllPatronsTierIds([], ["patreon_tier_1"])).toEqual([]);
  });

  it("does not expand when all_patrons is mixed with other ids", () => {
    expect(
      expandAllPatronsTierIds([RELAY_TIER_ALL_PATRONS, "patreon_tier_1"], ["patreon_tier_1"])
    ).toEqual([RELAY_TIER_ALL_PATRONS, "patreon_tier_1"]);
  });

  it("is idempotent under double expansion", () => {
    const once = expandAllPatronsTierIds([RELAY_TIER_ALL_PATRONS], ["patreon_tier_x"]);
    const twice = expandAllPatronsTierIds(once, ["patreon_tier_x"]);
    expect(twice).toEqual(once);
  });
});

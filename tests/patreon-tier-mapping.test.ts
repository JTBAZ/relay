import { describe, expect, it } from "vitest";
import {
  applyPatreonAccessToTierIds,
  mapPatreonPostToIngest,
  patreonBoolAttr,
  tierIdsFromPatreonPost
} from "../src/patreon/map-patreon-to-ingest.js";
import {
  RELAY_TIER_ALL_PATRONS,
  RELAY_TIER_PUBLIC
} from "../src/patreon/relay-access-tiers.js";
import type { JsonApiResource } from "../src/patreon/jsonapi-types.js";
import { resolvePostAccessLevel } from "../src/clone/tier-rules.js";
import type { CloneTierRule } from "../src/clone/types.js";

describe("Patreon tier mapping", () => {
  it("parses attributes.tiers as string ids, numbers, or link-shaped objects", () => {
    const r1: JsonApiResource = {
      type: "post",
      id: "1",
      attributes: { tiers: ["555", 777] }
    };
    expect(tierIdsFromPatreonPost(r1)).toEqual([
      "patreon_tier_555",
      "patreon_tier_777"
    ]);

    const r2: JsonApiResource = {
      type: "post",
      id: "2",
      attributes: {
        tiers: [{ type: "tier", id: "999" }, { id: "1000" }]
      }
    };
    expect(tierIdsFromPatreonPost(r2)).toEqual([
      "patreon_tier_999",
      "patreon_tier_1000"
    ]);
  });

  it("falls back to relationships.tiers when attributes.tiers is empty", () => {
    const r: JsonApiResource = {
      type: "post",
      id: "3",
      attributes: { tiers: [] },
      relationships: {
        tiers: { data: [{ type: "tier", id: "42" }] }
      }
    };
    expect(tierIdsFromPatreonPost(r)).toEqual(["patreon_tier_42"]);
  });

  it("patreonBoolAttr coerces string booleans", () => {
    expect(patreonBoolAttr({ is_public: "true" }, "is_public")).toBe(true);
    expect(patreonBoolAttr({ is_public: "False" }, "is_public")).toBe(false);
    expect(patreonBoolAttr({}, "is_public")).toBeUndefined();
  });

  it("applyPatreonAccessToTierIds uses is_public when present", () => {
    expect(
      applyPatreonAccessToTierIds(["patreon_tier_5"], { is_public: true })
    ).toEqual([RELAY_TIER_PUBLIC]);
    expect(applyPatreonAccessToTierIds([], { is_public: true })).toEqual([
      RELAY_TIER_PUBLIC
    ]);
    expect(
      applyPatreonAccessToTierIds(["patreon_tier_5"], { is_public: false })
    ).toEqual(["patreon_tier_5"]);
    expect(applyPatreonAccessToTierIds([], { is_public: false })).toEqual([
      RELAY_TIER_ALL_PATRONS
    ]);
    expect(applyPatreonAccessToTierIds(["patreon_tier_5"], {})).toEqual([
      "patreon_tier_5"
    ]);
    expect(applyPatreonAccessToTierIds([], { is_public: "true" })).toEqual([
      RELAY_TIER_PUBLIC
    ]);
  });

  it("applyPatreonAccessToTierIds falls back to is_paid when is_public absent", () => {
    expect(applyPatreonAccessToTierIds([], { is_paid: true })).toEqual([
      RELAY_TIER_ALL_PATRONS
    ]);
    expect(applyPatreonAccessToTierIds([], { is_paid: false })).toEqual([
      RELAY_TIER_PUBLIC
    ]);
    expect(applyPatreonAccessToTierIds([], {})).toEqual([]);
  });

  it("mapPatreonPostToIngest wires tier extraction and is_public", () => {
    const resource: JsonApiResource = {
      type: "post",
      id: "99",
      attributes: {
        title: "Hello",
        published_at: "2026-01-01T00:00:00.000Z",
        content: "",
        tiers: [{ type: "tier", id: "111" }],
        is_public: false
      }
    };
    const ing = mapPatreonPostToIngest(resource);
    expect(ing.tier_ids).toEqual(["patreon_tier_111"]);
  });

  it("resolvePostAccessLevel maps synthetic relay tiers for clone", () => {
    const rules: CloneTierRule[] = [
      {
        tier_id: "patreon_tier_5",
        title: "5",
        access_level: "tier_gated",
        campaign_id: "c"
      }
    ];
    expect(
      resolvePostAccessLevel([RELAY_TIER_PUBLIC], rules).level
    ).toBe("public");
    expect(
      resolvePostAccessLevel([RELAY_TIER_ALL_PATRONS], rules).level
    ).toBe("member_only");
  });

  it("resolvePostAccessLevel treats empty tier_ids as member_only (conservative default)", () => {
    expect(resolvePostAccessLevel([], []).level).toBe("member_only");
  });
});

import { describe, expect, it } from "vitest";
import {
  normalizePostAccessGate,
  oauthPostAccessGateFromResource,
  postAccessGatesEqual
} from "../src/patreon/sync-post-access-from-oauth.js";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
import type { JsonApiResource } from "../src/patreon/jsonapi-types.js";

const paidTiers = ["patreon_tier_555", "patreon_tier_777"];

describe("sync post access gate normalization", () => {
  it("treats relay_tier_public as public with empty tier list", () => {
    expect(normalizePostAccessGate([RELAY_TIER_PUBLIC], undefined, paidTiers)).toEqual({
      isPublic: true,
      tierIds: []
    });
  });

  it("expands relay_tier_all_patrons on both sides for comparison", () => {
    const fromAllPatrons = normalizePostAccessGate(
      [RELAY_TIER_ALL_PATRONS],
      undefined,
      paidTiers
    );
    const fromExpanded = normalizePostAccessGate([...paidTiers], false, paidTiers);
    expect(postAccessGatesEqual(fromAllPatrons, fromExpanded)).toBe(true);
  });

  it("detects tier list changes after normalization", () => {
    const before = normalizePostAccessGate(["patreon_tier_555"], false, paidTiers);
    const after = normalizePostAccessGate(
      ["patreon_tier_555", "patreon_tier_777"],
      false,
      paidTiers
    );
    expect(postAccessGatesEqual(before, after)).toBe(false);
  });

  it("maps OAuth is_public post resource to public gate", () => {
    const resource: JsonApiResource = {
      type: "post",
      id: "123",
      attributes: {
        is_public: true,
        is_paid: false,
        tiers: []
      }
    };
    expect(oauthPostAccessGateFromResource(resource, paidTiers)).toEqual({
      isPublic: true,
      tierIds: []
    });
  });

  it("maps OAuth tier-gated post to sorted concrete tier ids", () => {
    const resource: JsonApiResource = {
      type: "post",
      id: "456",
      attributes: {
        is_public: false,
        tiers: [{ id: "777" }, { id: "555" }]
      }
    };
    expect(oauthPostAccessGateFromResource(resource, paidTiers)).toEqual({
      isPublic: false,
      tierIds: ["patreon_tier_555", "patreon_tier_777"]
    });
  });
});

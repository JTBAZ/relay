import { describe, expect, it } from "vitest";
import {
  extractPatronSyncFromIdentity,
  tierIdsFromIdentityDoc,
  type PatreonIdentityDocument
} from "../src/patreon/patreon-user-identity.js";

function doc(
  overrides: Partial<PatreonIdentityDocument> & {
    included?: PatreonIdentityDocument["included"];
  }
): PatreonIdentityDocument {
  return {
    data: {
      type: "user",
      id: "u_9",
      attributes: { email: "x@y.com", full_name: "X" },
      ...overrides.data
    },
    included: overrides.included ?? []
  };
}

describe("tierIdsFromIdentityDoc", () => {
  it("collects entitled tiers for active patron on matching campaign", () => {
    const d = doc({
      included: [
        {
          type: "member",
          id: "m1",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: {
              data: [
                { type: "tier", id: "10" },
                { type: "tier", id: "11" }
              ]
            }
          }
        }
      ]
    });
    expect(tierIdsFromIdentityDoc(d, "111").sort()).toEqual([
      "patreon_tier_10",
      "patreon_tier_11"
    ]);
  });

  it("ignores non-active patrons", () => {
    const d = doc({
      included: [
        {
          type: "member",
          id: "m1",
          attributes: { patron_status: "former_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "10" }] }
          }
        }
      ]
    });
    expect(tierIdsFromIdentityDoc(d, "111")).toEqual([]);
  });

  it("filters by campaign when multiple memberships exist", () => {
    const d = doc({
      included: [
        {
          type: "member",
          id: "m1",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "999" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "bad" }] }
          }
        },
        {
          type: "member",
          id: "m2",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "good" }] }
          }
        }
      ]
    });
    expect(tierIdsFromIdentityDoc(d, "111")).toEqual(["patreon_tier_good"]);
  });

  it("dedupes tier ids", () => {
    const d = doc({
      included: [
        {
          type: "member",
          id: "m1",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "5" }] }
          }
        },
        {
          type: "member",
          id: "m2",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "5" }] }
          }
        }
      ]
    });
    expect(tierIdsFromIdentityDoc(d, "111")).toEqual(["patreon_tier_5"]);
  });
});

describe("extractPatronSyncFromIdentity", () => {
  it("maps email and tier ids", () => {
    const d = doc({
      data: { type: "user", id: "pat_1", attributes: { email: "A@B.COM" } },
      included: [
        {
          type: "member",
          id: "m1",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "7" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "3" }] }
          }
        }
      ]
    });
    const s = extractPatronSyncFromIdentity(d, "7");
    expect(s).toEqual({
      patreon_user_id: "pat_1",
      email: "a@b.com",
      tier_ids: ["patreon_tier_3"]
    });
  });

  it("uses relay.local email when email missing", () => {
    const d = doc({
      data: { type: "user", id: "nop", attributes: {} },
      included: [
        {
          type: "member",
          id: "m1",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "7" } },
            currently_entitled_tiers: { data: [] }
          }
        }
      ]
    });
    const s = extractPatronSyncFromIdentity(d, "7");
    expect(s.email).toBe("patreon_nop@relay.local");
    expect(s.tier_ids).toEqual([]);
  });
});

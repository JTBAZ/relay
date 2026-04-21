import { describe, expect, it } from "vitest";
import {
  buildPatronIdentityRequestUrl,
  extractPatronSyncFromIdentity,
  extractUnifiedPatreonIdentity,
  PATREON_PATRON_OAUTH_SCOPES,
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

describe("PATREON_PATRON_OAUTH_SCOPES", () => {
  it("includes campaigns scope so unified extractor can read owned-campaign", () => {
    const scopes = PATREON_PATRON_OAUTH_SCOPES.split(/\s+/);
    expect(scopes).toContain("identity");
    expect(scopes).toContain("identity[email]");
    expect(scopes).toContain("identity.memberships");
    expect(scopes).toContain("campaigns");
  });
});

describe("buildPatronIdentityRequestUrl", () => {
  it("requests memberships, owned campaign, and campaign metadata", () => {
    const url = new URL(buildPatronIdentityRequestUrl());
    const include = url.searchParams.get("include") ?? "";
    expect(include).toContain("memberships");
    expect(include).toContain("memberships.campaign");
    expect(include).toContain("memberships.currently_entitled_tiers");
    expect(include).toContain("campaign");
    expect(url.searchParams.get("fields[campaign]")).toBe("vanity,creation_name");
  });
});

describe("extractUnifiedPatreonIdentity", () => {
  it("returns email + multiple memberships sorted by campaign id", () => {
    const d = doc({
      data: { type: "user", id: "u_42", attributes: { email: "Multi@Example.com" } },
      included: [
        {
          type: "member",
          id: "m1",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "200" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "20" }] }
          }
        },
        {
          type: "member",
          id: "m2",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "100" } },
            currently_entitled_tiers: {
              data: [
                { type: "tier", id: "11" },
                { type: "tier", id: "10" }
              ]
            }
          }
        }
      ]
    });
    const out = extractUnifiedPatreonIdentity(d);
    expect(out.patreon_user_id).toBe("u_42");
    expect(out.email).toBe("multi@example.com");
    expect(out.owned_campaign_id).toBeNull();
    expect(out.memberships).toEqual([
      {
        patreon_campaign_id: "100",
        tier_ids: ["patreon_tier_10", "patreon_tier_11"],
        status: "paid"
      },
      {
        patreon_campaign_id: "200",
        tier_ids: ["patreon_tier_20"],
        status: "paid"
      }
    ]);
  });

  it("surfaces owned_campaign_id when user owns a Patreon campaign", () => {
    const d = doc({
      data: {
        type: "user",
        id: "creator_user",
        attributes: { email: "c@x.com" },
        relationships: {
          campaign: { data: { type: "campaign", id: "9001" } }
        }
      },
      included: []
    });
    const out = extractUnifiedPatreonIdentity(d);
    expect(out.owned_campaign_id).toBe("9001");
    expect(out.memberships).toEqual([]);
  });

  it("collapses duplicate paid rows for the same campaign and ignores stale lower-priority tiers", () => {
    const d = doc({
      data: { type: "user", id: "u1", attributes: { email: "a@b.co" } },
      included: [
        {
          type: "member",
          id: "old",
          attributes: { patron_status: "former_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "skipme" }] }
          }
        },
        {
          type: "member",
          id: "live1",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "5" }] }
          }
        },
        {
          type: "member",
          id: "live2",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "5" }] }
          }
        }
      ]
    });
    const out = extractUnifiedPatreonIdentity(d);
    expect(out.memberships).toEqual([
      { patreon_campaign_id: "111", tier_ids: ["patreon_tier_5"], status: "paid" }
    ]);
  });

  it("categorizes free followers (patron_status === null) with empty tier_ids", () => {
    const d = doc({
      data: { type: "user", id: "u_free", attributes: { email: "f@x.co" } },
      included: [
        {
          type: "member",
          id: "m_free",
          attributes: { patron_status: null },
          relationships: {
            campaign: { data: { type: "campaign", id: "555" } },
            currently_entitled_tiers: { data: [] }
          }
        }
      ]
    });
    const out = extractUnifiedPatreonIdentity(d);
    expect(out.memberships).toEqual([
      { patreon_campaign_id: "555", tier_ids: [], status: "free_follower" }
    ]);
  });

  it("categorizes former_patron and declined_patron, surfacing them with empty tier_ids", () => {
    const d = doc({
      data: { type: "user", id: "u_mix", attributes: { email: "m@x.co" } },
      included: [
        {
          type: "member",
          id: "m_former",
          attributes: { patron_status: "former_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "111" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "stale" }] }
          }
        },
        {
          type: "member",
          id: "m_declined",
          attributes: { patron_status: "declined_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "222" } },
            currently_entitled_tiers: { data: [] }
          }
        }
      ]
    });
    const out = extractUnifiedPatreonIdentity(d);
    expect(out.memberships).toEqual([
      { patreon_campaign_id: "111", tier_ids: ["patreon_tier_stale"], status: "former_patron" },
      { patreon_campaign_id: "222", tier_ids: [], status: "declined_patron" }
    ]);
  });

  it("returns mixed-status memberships sorted deterministically by campaign id", () => {
    const d = doc({
      data: { type: "user", id: "u_mixed", attributes: { email: "x@y.co" } },
      included: [
        {
          type: "member",
          id: "free",
          attributes: { patron_status: null },
          relationships: {
            campaign: { data: { type: "campaign", id: "300" } },
            currently_entitled_tiers: { data: [] }
          }
        },
        {
          type: "member",
          id: "paid",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "100" } },
            currently_entitled_tiers: { data: [{ type: "tier", id: "9" }] }
          }
        },
        {
          type: "member",
          id: "former",
          attributes: { patron_status: "former_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "200" } },
            currently_entitled_tiers: { data: [] }
          }
        }
      ]
    });
    const out = extractUnifiedPatreonIdentity(d);
    expect(out.memberships.map((m) => m.patreon_campaign_id)).toEqual(["100", "200", "300"]);
    expect(out.memberships.map((m) => m.status)).toEqual([
      "paid",
      "former_patron",
      "free_follower"
    ]);
  });

  it("ignores unrecognized patron_status values (forward-compat)", () => {
    const d = doc({
      data: { type: "user", id: "u_unk", attributes: { email: "u@x.co" } },
      included: [
        {
          type: "member",
          id: "weird",
          attributes: { patron_status: "future_status_value" },
          relationships: {
            campaign: { data: { type: "campaign", id: "999" } },
            currently_entitled_tiers: { data: [] }
          }
        }
      ]
    });
    const out = extractUnifiedPatreonIdentity(d);
    expect(out.memberships).toEqual([]);
  });

  it("falls back to relay.local email when missing", () => {
    const d = doc({
      data: { type: "user", id: "no_email", attributes: {} },
      included: []
    });
    const out = extractUnifiedPatreonIdentity(d);
    expect(out.email).toBe("patreon_no_email@relay.local");
  });

  it("throws on missing user resource", () => {
    expect(() =>
      extractUnifiedPatreonIdentity({ data: null, included: [] } as PatreonIdentityDocument)
    ).toThrow(/missing user resource/);
  });
});

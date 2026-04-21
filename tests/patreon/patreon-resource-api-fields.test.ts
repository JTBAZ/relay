import { describe, expect, it, vi } from "vitest";
import {
  fetchCampaignsWithTiers,
  membersPageUrl
} from "../../src/patreon/patreon-resource-api.js";

/**
 * PE-C P1 regression — `amount_cents` MUST be requested on every Tier resource fetch.
 * Without it, `paidUserTierIds` cannot distinguish Free Tier members from paying patrons,
 * and `expandAllPatronsTierIds` cannot expand `relay_tier_all_patrons` to the explicit
 * paid-tier list (the davoicework x jordanmtaylor93 leak).
 *
 * The patron `/v2/identity` extractor (`patreon-user-identity.ts`) already requests it;
 * these tests cover the *creator-side* OAuth endpoints that populate the campaign tier
 * catalog (`Tier.amount_cents` in our DB).
 */
describe("Patreon resource API — fields[tier] (PE-C P1)", () => {
  it("fetchCampaignsWithTiers requests amount_cents", async () => {
    let capturedUrl = "";
    const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      return new Response(JSON.stringify({ data: [], included: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;

    await fetchCampaignsWithTiers({
      access_token: "test_token",
      fetch_impl: fakeFetch
    });

    const u = new URL(capturedUrl);
    const fieldsTier = u.searchParams.get("fields[tier]") ?? "";
    expect(fieldsTier.split(",")).toContain("amount_cents");
    // title is also required for the free-tier-name heuristic when amount_cents is missing.
    expect(fieldsTier.split(",")).toContain("title");
  });

  it("membersPageUrl requests amount_cents on the included Tier objects", () => {
    const url = new URL(membersPageUrl("123456"));
    const fieldsTier = url.searchParams.get("fields[tier]") ?? "";
    expect(fieldsTier.split(",")).toContain("amount_cents");
    expect(fieldsTier.split(",")).toContain("title");
  });
});

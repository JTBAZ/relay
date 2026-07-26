import { describe, expect, it } from "vitest";
import {
  diffAudienceAccessTiers,
  formatAudienceAccessConfirmCopy,
  gateFromComposeSelection,
  LIBRARY_CREATE_POST_PUBLIC_TIER
} from "./audience-access-tier-diff";
import type { RelayComposeTierRow, TierFacet } from "./relay-api";

const catalog: RelayComposeTierRow[] = [
  {
    tier_id: "prisma_supporter",
    relay_tier_id: "patreon_tier_supporter",
    title: "Supporter",
    amount_cents: 500
  },
  {
    tier_id: "prisma_studio",
    relay_tier_id: "patreon_tier_studio",
    title: "Studio",
    amount_cents: 2500
  }
];

describe("diffAudienceAccessTiers", () => {
  it("Supporter → Studio: Supporter tier patrons lose access", () => {
    const oldAccess: TierFacet[] = [{ tier_id: "patreon_tier_supporter", title: "Supporter" }];
    const diff = diffAudienceAccessTiers(oldAccess, "prisma_studio", catalog);
    expect(diff.losing).toEqual(["Supporter"]);
    expect(diff.gaining).toEqual([]);
  });

  it("Studio → Supporter: Supporter tier patrons gain access", () => {
    const oldAccess: TierFacet[] = [{ tier_id: "patreon_tier_studio", title: "Studio" }];
    const diff = diffAudienceAccessTiers(oldAccess, "prisma_supporter", catalog);
    expect(diff.losing).toEqual([]);
    expect(diff.gaining).toEqual(["Supporter"]);
  });

  it("Public → Studio: open web loses; Studio+ unchanged for studio patrons", () => {
    const oldAccess: TierFacet[] = [];
    const diff = diffAudienceAccessTiers(oldAccess, "prisma_studio", catalog);
    expect(diff.losing).toContain("Public (open web)");
    expect(diff.gaining).toEqual([]);
  });

  it("Studio → Public: open web gains access", () => {
    const oldAccess: TierFacet[] = [{ tier_id: "patreon_tier_studio", title: "Studio" }];
    const diff = diffAudienceAccessTiers(oldAccess, LIBRARY_CREATE_POST_PUBLIC_TIER, catalog);
    expect(diff.losing).toEqual([]);
    expect(diff.gaining).toContain("Public (open web)");
  });
});

describe("formatAudienceAccessConfirmCopy", () => {
  it("Studio → Supporter example message lists gaining Supporter", () => {
    const oldAccess: TierFacet[] = [{ tier_id: "patreon_tier_studio", title: "Studio" }];
    const diff = diffAudienceAccessTiers(oldAccess, "prisma_supporter", catalog);
    const copy = formatAudienceAccessConfirmCopy(diff);
    expect(copy.summaryLine).toContain("Supporter");
    expect(copy.gainingLine).toBe("Tiers gaining access: Supporter");
    expect(copy.losingLine).toBe("Tiers losing access: none");
  });
});

describe("gateFromComposeSelection", () => {
  it("maps public sentinel to isPublic gate", () => {
    expect(gateFromComposeSelection(LIBRARY_CREATE_POST_PUBLIC_TIER, catalog)).toEqual({
      isPublic: true,
      relayTierIds: []
    });
  });
});

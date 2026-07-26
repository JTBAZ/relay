import { describe, expect, it } from "vitest";
import {
  resolveEffectiveMarketingOffer,
  resolveMinimumGateRelayTierId
} from "../../src/marketing/effective-marketing-offer.js";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../../src/patreon/relay-access-tiers.js";

const catalog = [
  { relay_tier_id: "tier_basic", amount_cents: 500 },
  { relay_tier_id: "tier_pro", amount_cents: 1500 },
  { relay_tier_id: "tier_elite", amount_cents: 3000 }
];

const tierDefault = {
  active: true,
  gate_relay_tier_id: "tier_pro",
  segment: "unpermissioned",
  headline: "Unlock Pro",
  cta_text: "Get 20% off",
  redirect_slug: "abc123",
  discount_code: { code: "PRO20", percent_off: 20, active: true }
};

describe("resolveMinimumGateRelayTierId", () => {
  it("picks the lowest-amount concrete tier", () => {
    expect(
      resolveMinimumGateRelayTierId(["tier_elite", "tier_pro"], catalog)
    ).toBe("tier_pro");
  });

  it("returns null for public / empty / all-patrons-only", () => {
    expect(resolveMinimumGateRelayTierId([RELAY_TIER_PUBLIC], catalog)).toBeNull();
    expect(resolveMinimumGateRelayTierId([RELAY_TIER_ALL_PATRONS], catalog)).toBeNull();
    expect(resolveMinimumGateRelayTierId([], catalog)).toBeNull();
  });
});

describe("resolveEffectiveMarketingOffer", () => {
  it("returns null for allow and hidden", () => {
    expect(
      resolveEffectiveMarketingOffer({
        permissionOutcome: "allow",
        audienceKey: "anonymous",
        postTierIds: ["tier_pro"],
        catalogTiers: catalog,
        explicitOffers: [],
        tierDefaults: [tierDefault]
      })
    ).toBeNull();
    expect(
      resolveEffectiveMarketingOffer({
        permissionOutcome: "hidden",
        audienceKey: "anonymous",
        postTierIds: ["tier_pro"],
        catalogTiers: catalog,
        explicitOffers: [],
        tierDefaults: [tierDefault]
      })
    ).toBeNull();
  });

  it("inherits tier default for locked anonymous", () => {
    const promo = resolveEffectiveMarketingOffer({
      permissionOutcome: "deny",
      audienceKey: "anonymous",
      postTierIds: ["tier_pro", "tier_elite"],
      catalogTiers: catalog,
      explicitOffers: [],
      tierDefaults: [tierDefault]
    });
    expect(promo).toMatchObject({
      headline: "Unlock Pro",
      code: "PRO20",
      percent_off: 20,
      tracked_url: "/go/abc123",
      source: "tier_default"
    });
  });

  it("inherits after future gate tier change matching the default", () => {
    const promo = resolveEffectiveMarketingOffer({
      permissionOutcome: "locked_preview",
      audienceKey: "tier:tier_basic",
      postTierIds: ["tier_pro"],
      catalogTiers: catalog,
      explicitOffers: [],
      tierDefaults: [tierDefault]
    });
    expect(promo?.source).toBe("tier_default");
    expect(promo?.code).toBe("PRO20");
  });

  it("prefers explicit post/persona override over tier default", () => {
    const promo = resolveEffectiveMarketingOffer({
      permissionOutcome: "deny",
      audienceKey: "anonymous",
      postTierIds: ["tier_pro"],
      catalogTiers: catalog,
      explicitOffers: [
        {
          active: true,
          audience_key: "anonymous",
          headline: "Launch only",
          cta_text: "Claim",
          redirect_slug: "xyz",
          discount_code: { code: "LAUNCH", percent_off: 50, active: true }
        }
      ],
      tierDefaults: [tierDefault]
    });
    expect(promo).toMatchObject({
      headline: "Launch only",
      code: "LAUNCH",
      source: "explicit",
      tracked_url: "/go/xyz"
    });
  });

  it("skips inactive or missing codes without wiping copy when headline present", () => {
    const promo = resolveEffectiveMarketingOffer({
      permissionOutcome: "deny",
      audienceKey: "anonymous",
      postTierIds: ["tier_pro"],
      catalogTiers: catalog,
      explicitOffers: [],
      tierDefaults: [
        {
          ...tierDefault,
          discount_code: { code: "OLD", percent_off: 10, active: false },
          headline: "Still see this"
        }
      ]
    });
    expect(promo).toMatchObject({
      headline: "Still see this",
      code: null,
      percent_off: null,
      source: "tier_default"
    });
  });

  it("returns null when no matching default for gate", () => {
    expect(
      resolveEffectiveMarketingOffer({
        permissionOutcome: "deny",
        audienceKey: "anonymous",
        postTierIds: ["tier_basic"],
        catalogTiers: catalog,
        explicitOffers: [],
        tierDefaults: [tierDefault]
      })
    ).toBeNull();
  });

  it("falls through to tier default when explicit override is inactive (return-to-default)", () => {
    const promo = resolveEffectiveMarketingOffer({
      permissionOutcome: "deny",
      audienceKey: "anonymous",
      postTierIds: ["tier_pro"],
      catalogTiers: catalog,
      explicitOffers: [
        {
          active: false,
          audience_key: "anonymous",
          headline: "Old override",
          cta_text: "Old",
          redirect_slug: "old",
          discount_code: { code: "OLD", percent_off: 10, active: true }
        }
      ],
      tierDefaults: [tierDefault]
    });
    expect(promo).toMatchObject({
      source: "tier_default",
      code: "PRO20",
      tracked_url: "/go/abc123"
    });
  });

  it("patron-safe DTO never includes raw destination fields", () => {
    const promo = resolveEffectiveMarketingOffer({
      permissionOutcome: "locked_preview",
      audienceKey: "tier:tier_basic",
      postTierIds: ["tier_pro"],
      catalogTiers: catalog,
      explicitOffers: [],
      tierDefaults: [tierDefault]
    });
    expect(promo).not.toBeNull();
    expect(promo).not.toHaveProperty("patreon_destination_url");
    expect(promo).not.toHaveProperty("discount_code_id");
    expect(Object.keys(promo!).sort()).toEqual(
      ["code", "cta_text", "headline", "percent_off", "source", "tracked_url"].sort()
    );
  });

  it("returns null for missing_post", () => {
    expect(
      resolveEffectiveMarketingOffer({
        permissionOutcome: "missing_post",
        audienceKey: "anonymous",
        postTierIds: ["tier_pro"],
        catalogTiers: catalog,
        explicitOffers: [],
        tierDefaults: [tierDefault]
      })
    ).toBeNull();
  });
});

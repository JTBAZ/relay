/**
 * PILOT-003 — tier catalog labels resolve from normalized Tier rows (not heuristics).
 */
import { describe, expect, it } from "vitest";
import type { TierRow } from "../src/ingest/canonical-store.js";
import {
  pickPrimaryTierIdForDisplay,
  resolvePatronEntitlementDisplayLabel,
  resolvePostTierDisplayLabel
} from "../src/gallery/tier-display-label.js";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";

function catalog(
  rows: Array<{ tier_id: string; title: string; amount_cents?: number }>
): Record<string, TierRow> {
  const map: Record<string, TierRow> = {};
  for (const r of rows) {
    map[r.tier_id] = {
      tier_id: r.tier_id,
      creator_id: "rcx_test",
      title: r.title,
      amount_cents: r.amount_cents,
      upstream_updated_at: "2026-01-01T00:00:00.000Z",
      version_seq: 1
    };
  }
  return map;
}

describe("PILOT-003 — tier display labels from catalog", () => {
  const pilotCatalog = catalog([
    { tier_id: "patreon_tier_ava_supporter", title: "Supporter", amount_cents: 500 },
    { tier_id: "patreon_tier_ava_studio", title: "Studio", amount_cents: 1500 },
    { tier_id: "patreon_tier_milo_backstage", title: "Backstage", amount_cents: 2000 }
  ]);

  it("resolvePostTierDisplayLabel uses Tier.title for gated posts", () => {
    expect(
      resolvePostTierDisplayLabel({
        tierIds: ["patreon_tier_ava_studio"],
        tierCatalog: pilotCatalog
      })
    ).toBe("Studio");
    expect(
      resolvePostTierDisplayLabel({
        tierIds: ["patreon_tier_milo_backstage"],
        tierCatalog: pilotCatalog
      })
    ).toBe("Backstage");
  });

  it("resolvePostTierDisplayLabel returns Free for public posts and relay_tier_public", () => {
    expect(
      resolvePostTierDisplayLabel({
        tierIds: [],
        tierCatalog: pilotCatalog,
        isPublicPost: true
      })
    ).toBe("Free");
    expect(
      resolvePostTierDisplayLabel({
        tierIds: [RELAY_TIER_PUBLIC],
        tierCatalog: pilotCatalog
      })
    ).toBe("Free");
  });

  it("pickPrimaryTierIdForDisplay chooses highest pledge floor", () => {
    expect(
      pickPrimaryTierIdForDisplay(
        ["patreon_tier_ava_supporter", "patreon_tier_ava_studio"],
        pilotCatalog
      )
    ).toBe("patreon_tier_ava_studio");
  });

  it("resolvePatronEntitlementDisplayLabel uses highest entitled paid tier title", () => {
    expect(
      resolvePatronEntitlementDisplayLabel(
        ["patreon_tier_ava_supporter", "patreon_tier_ava_studio"],
        pilotCatalog
      )
    ).toBe("Studio");
    expect(resolvePatronEntitlementDisplayLabel([], pilotCatalog)).toBe("Free");
  });
});

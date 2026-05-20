/**
 * Chain: mapper output → session tier list → tier-rules gate (matches clone/export semantics).
 */
import { describe, expect, it } from "vitest";
import { canAccessPost, evaluateTierRules, resolvePostAccessLevel } from "../src/clone/tier-rules.js";
import type { TierRow } from "../src/ingest/canonical-store.js";
import { mapSubscribeStarPatronSubscriptionDataToRelayTierIds } from "../src/subscribestar/map-subscribestar-subscription-to-relay-tier-ids.js";

describe("SubscribeStar tier id chain (fixture → gate)", () => {
  it("allows tier_gated post when patron holds matching substar_tier", () => {
    const graphqlData = {
      viewer: {
        subscriptions: {
          edges: [
            {
              node: {
                status: "active",
                subscribeable: { id: "creator_ss_profile" },
                plan: { id: "42" }
              }
            }
          ]
        }
      }
    };

    const entitled = mapSubscribeStarPatronSubscriptionDataToRelayTierIds(graphqlData, {
      creatorSubscribeStarProfileId: "creator_ss_profile"
    });
    expect(entitled).toContain("substar_tier_42");

    const tierCatalog: Record<string, TierRow> = {
      substar_tier_42: {
        tier_id: "substar_tier_42",
        creator_id: "relay_creator_x",
        title: "Gold",
        campaign_id: "substar_campaign_1",
        amount_cents: 500,
        upstream_updated_at: "2026-01-01T00:00:00.000Z",
        version_seq: 1
      }
    };

    const rules = evaluateTierRules(tierCatalog);
    const access = resolvePostAccessLevel(["substar_tier_42"], rules);

    const allowed = canAccessPost(access, entitled, tierCatalog);
    expect(allowed).toBe(true);
  });
});

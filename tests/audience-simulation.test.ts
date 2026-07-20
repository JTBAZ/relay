/**
 * Slice 3 Batch 1 — pure audience simulator matrices (canonical evaluator, never owner bypass).
 */
import { describe, expect, it } from "vitest";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
import { simulateAudiencePersonas } from "../src/gallery/audience-simulation.js";
import { evaluatePostPermission } from "../src/gallery/post-permission.js";

const creatorId = "cr_sim";
const postId = "post_sim";

const catalog = [
  { relay_tier_id: "patreon_tier_low", title: "Low", amount_cents: 500 },
  { relay_tier_id: "patreon_tier_high", title: "High", amount_cents: 3000 }
];

describe("simulateAudiencePersonas", () => {
  it("public post — anonymous and all tiers allow", () => {
    const result = simulateAudiencePersonas({
      creatorId,
      postId,
      postTierIds: [RELAY_TIER_PUBLIC],
      catalogTiers: catalog,
      relayPostVisibility: "visible"
    });
    expect(result.personas.map((p) => p.persona_key)).toEqual([
      "anonymous",
      "tier:patreon_tier_low",
      "tier:patreon_tier_high"
    ]);
    expect(result.personas.every((p) => p.outcome === "allow")).toBe(true);
  });

  it("minimum-tier gate — anonymous deny; lower locked_preview; higher allow", () => {
    const result = simulateAudiencePersonas({
      creatorId,
      postId,
      postTierIds: ["patreon_tier_high"],
      catalogTiers: catalog,
      relayPostVisibility: "visible"
    });
    const byKey = Object.fromEntries(result.personas.map((p) => [p.persona_key, p]));
    expect(byKey.anonymous?.outcome).toBe("deny");
    expect(byKey["tier:patreon_tier_low"]?.outcome).toBe("locked_preview");
    expect(byKey["tier:patreon_tier_high"]?.outcome).toBe("allow");
  });

  it("hidden Layer C — deny for every persona regardless of tier", () => {
    const result = simulateAudiencePersonas({
      creatorId,
      postId,
      postTierIds: ["patreon_tier_low"],
      catalogTiers: catalog,
      relayPostVisibility: "hidden"
    });
    expect(result.personas.every((p) => p.outcome === "deny")).toBe(true);
    expect(result.personas.every((p) => p.reason === "Post hidden by creator.")).toBe(true);
  });

  it("matches direct evaluatePostPermission for identical inputs (parity)", () => {
    const input = {
      creatorId,
      postId,
      postTierIds: ["patreon_tier_high"],
      catalogTiers: catalog,
      relayPostVisibility: "visible" as const
    };
    const sim = simulateAudiencePersonas(input);
    const low = sim.personas.find((p) => p.persona_key === "tier:patreon_tier_low")!;
    // Rebuild the same snapshot path via a second simulate call's gate — compare shape to evaluator on same synthetic post.
    const direct = evaluatePostPermission({
      snapshot: {
        ingest_idempotency: {},
        campaigns: {},
        tiers: {
          [creatorId]: {
            patreon_tier_low: {
              tier_id: "patreon_tier_low",
              creator_id: creatorId,
              campaign_id: "sim_campaign",
              title: "Low",
              amount_cents: 500,
              upstream_updated_at: "1970-01-01T00:00:00.000Z",
              version_seq: 1
            },
            patreon_tier_high: {
              tier_id: "patreon_tier_high",
              creator_id: creatorId,
              campaign_id: "sim_campaign",
              title: "High",
              amount_cents: 3000,
              upstream_updated_at: "1970-01-01T00:00:00.000Z",
              version_seq: 1
            }
          }
        },
        posts: {
          [creatorId]: {
            [postId]: {
              post_id: postId,
              creator_id: creatorId,
              upstream_status: "active",
              current: {
                version_seq: 1,
                upstream_revision: "sim",
                title: "Simulation",
                published_at: "1970-01-01T00:00:00.000Z",
                tag_ids: [],
                tier_ids: ["patreon_tier_high"],
                media_ids: [],
                ingested_at: "1970-01-01T00:00:00.000Z"
              },
              versions: []
            }
          }
        },
        media: {}
      },
      creatorId,
      postId,
      session: {
        token: "sim",
        user_id: "sim_patreon_tier_low",
        creator_id: creatorId,
        tier_ids: ["patreon_tier_low"],
        expires_at: "2099-01-01T00:00:00.000Z"
      },
      isContentOwner: false,
      relayPostVisibility: "visible"
    });
    expect(low.outcome).toBe(direct?.outcome);
    if (direct && "reason" in direct) {
      expect(low.reason).toBe(direct.reason);
    }
  });

  it("never invents fallback persona labels", () => {
    const result = simulateAudiencePersonas({
      creatorId,
      postId,
      postTierIds: [RELAY_TIER_PUBLIC],
      catalogTiers: catalog,
      relayPostVisibility: "visible"
    });
    const labels = result.personas.map((p) => p.label).join(" ");
    expect(labels).not.toMatch(/goku|basic\s*\/\s*advanced|fallback/i);
  });
});

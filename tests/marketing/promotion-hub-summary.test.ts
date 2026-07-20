import { describe, expect, it } from "vitest";
import { RELAY_TIER_PUBLIC } from "../../src/patreon/relay-access-tiers.js";
import { resolveMinimumGateRelayTierId } from "../../src/marketing/effective-marketing-offer.js";
import { summarizePromotionHub } from "../../src/marketing/promotion-hub-summary-service.js";

const catalog = [
  { relay_tier_id: "tier_bronze", amount_cents: 500 },
  { relay_tier_id: "tier_silver", amount_cents: 1000 },
  { relay_tier_id: "tier_gold", amount_cents: 2000 }
];

describe("summarizePromotionHub gate matching", () => {
  it("reuses resolveMinimumGateRelayTierId for one concrete tier", () => {
    const gate = resolveMinimumGateRelayTierId(["tier_silver"], catalog);
    expect(gate).toBe("tier_silver");
    const summary = summarizePromotionHub({
      creator_id: "cr_1",
      pieces: [
        {
          promo_piece_id: "pp_1",
          slot_rank: 1,
          post_id: "post_1",
          title: "A",
          post_tier_ids: ["tier_silver"]
        }
      ],
      catalog_tiers: catalog,
      defaults: [{ id: "def_1", gate_relay_tier_id: "tier_silver", active: true }]
    });
    expect(summary.rules[0]).toEqual({
      default_id: "def_1",
      gate_relay_tier_id: "tier_silver",
      inherited_piece_count: 1,
      matching_promo_piece_ids: ["pp_1"]
    });
    expect(summary.pieces[0]?.unmatched_reason).toBeNull();
  });

  it("picks the minimum amount among multiple tiers", () => {
    const gate = resolveMinimumGateRelayTierId(
      ["tier_gold", "tier_bronze"],
      catalog
    );
    expect(gate).toBe("tier_bronze");
    const summary = summarizePromotionHub({
      creator_id: "cr_1",
      pieces: [
        {
          promo_piece_id: "pp_1",
          slot_rank: 1,
          post_id: "post_1",
          post_tier_ids: ["tier_gold", "tier_bronze"]
        }
      ],
      catalog_tiers: catalog,
      defaults: [{ id: "def_bronze", gate_relay_tier_id: "tier_bronze", active: true }]
    });
    expect(summary.rules[0]?.inherited_piece_count).toBe(1);
  });

  it("handles unknown catalog amounts via deterministic floor", () => {
    const gate = resolveMinimumGateRelayTierId(["tier_z", "tier_a"], []);
    expect(gate).toBe("tier_a");
  });

  it("marks public / ungated posts as public_or_ungated", () => {
    const summary = summarizePromotionHub({
      creator_id: "cr_1",
      pieces: [
        {
          promo_piece_id: "pp_public",
          slot_rank: 1,
          post_id: "post_public",
          post_tier_ids: [RELAY_TIER_PUBLIC]
        }
      ],
      catalog_tiers: catalog,
      defaults: [{ id: "def_1", gate_relay_tier_id: "tier_silver", active: true }]
    });
    expect(summary.pieces[0]?.unmatched_reason).toBe("public_or_ungated");
    expect(summary.unmatched.public_or_ungated_count).toBe(1);
    expect(summary.rules[0]?.inherited_piece_count).toBe(0);
  });

  it("marks missing posts and unresolved legacy media", () => {
    const summary = summarizePromotionHub({
      creator_id: "cr_1",
      pieces: [
        {
          promo_piece_id: "pp_missing",
          slot_rank: 1,
          post_id: null,
          post_tier_ids: null
        }
      ],
      catalog_tiers: catalog,
      defaults: []
    });
    expect(summary.pieces[0]?.unmatched_reason).toBe("missing_post");
    expect(summary.unmatched.missing_post_count).toBe(1);
  });

  it("counts no_matching_default when gate exists but no rule", () => {
    const summary = summarizePromotionHub({
      creator_id: "cr_1",
      pieces: [
        {
          promo_piece_id: "pp_1",
          slot_rank: 1,
          post_id: "post_1",
          post_tier_ids: ["tier_gold"]
        }
      ],
      catalog_tiers: catalog,
      defaults: [{ id: "def_silver", gate_relay_tier_id: "tier_silver", active: true }]
    });
    expect(summary.pieces[0]?.unmatched_reason).toBe("no_matching_default");
    expect(summary.pieces[0]?.minimum_gate_relay_tier_id).toBe("tier_gold");
    expect(summary.unmatched.no_matching_default_count).toBe(1);
    expect(summary.rules[0]?.inherited_piece_count).toBe(0);
  });

  it("ignores inactive defaults for inheritance counts", () => {
    const summary = summarizePromotionHub({
      creator_id: "cr_1",
      pieces: [
        {
          promo_piece_id: "pp_1",
          slot_rank: 1,
          post_id: "post_1",
          post_tier_ids: ["tier_silver"]
        }
      ],
      catalog_tiers: catalog,
      defaults: [{ id: "def_1", gate_relay_tier_id: "tier_silver", active: false }]
    });
    expect(summary.rules).toHaveLength(0);
    expect(summary.pieces[0]?.unmatched_reason).toBe("no_matching_default");
  });

  it("passes through creator-only code_usage summaries", () => {
    const summary = summarizePromotionHub({
      creator_id: "cr_1",
      pieces: [],
      catalog_tiers: catalog,
      defaults: [],
      code_usage: [
        {
          discount_code_id: "c1",
          tier_rule_active_count: 2,
          tier_rule_inactive_count: 0,
          post_offer_active_count: 1,
          post_offer_inactive_count: 1
        }
      ]
    });
    expect(summary.code_usage).toEqual([
      {
        discount_code_id: "c1",
        tier_rule_active_count: 2,
        tier_rule_inactive_count: 0,
        post_offer_active_count: 1,
        post_offer_inactive_count: 1
      }
    ]);
  });
});

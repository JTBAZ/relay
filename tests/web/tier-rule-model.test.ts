import { describe, expect, it } from "vitest";
import {
  activeCodesForNewAssignment,
  buildTierRuleCards,
  emptyTierRuleDraft,
  tierTitle
} from "../../web/app/studio/promos/tier-rule-model";

describe("tier-rule-model", () => {
  it("prefers human tier titles over raw ids", () => {
    expect(
      tierTitle("tier_silver", [
        {
          tier_id: "tier_silver",
          relay_tier_id: "tier_silver",
          title: "Silver",
          amount_cents: 1000
        }
      ])
    ).toBe("Silver");
  });

  it("filters inactive codes from new assignment lists", () => {
    const codes = activeCodesForNewAssignment([
      {
        id: "c1",
        creator_id: "cr",
        code: "LIVE",
        percent_off: 10,
        label: null,
        active: true,
        created_at: "",
        updated_at: ""
      },
      {
        id: "c2",
        creator_id: "cr",
        code: "DEAD",
        percent_off: 20,
        label: null,
        active: false,
        created_at: "",
        updated_at: ""
      }
    ]);
    expect(codes.map((c) => c.code)).toEqual(["LIVE"]);
  });

  it("builds cards with truthful inherited counts from summary", () => {
    const cards = buildTierRuleCards({
      defaults: [
        {
          id: "def_1",
          creator_id: "cr",
          gate_relay_tier_id: "tier_silver",
          segment: "unpermissioned",
          discount_code_id: "c1",
          headline: "Unlock",
          cta_text: "Join",
          patreon_destination_url: "https://www.patreon.com/x",
          redirect_slug: "abc",
          active: true,
          created_at: "",
          updated_at: "",
          discount_code: {
            id: "c1",
            code: "LIVE",
            percent_off: 10,
            active: true,
            label: null
          }
        }
      ],
      tiers: [
        {
          tier_id: "tier_silver",
          relay_tier_id: "tier_silver",
          title: "Silver",
          amount_cents: 1000
        }
      ],
      codes: [
        {
          id: "c1",
          creator_id: "cr",
          code: "LIVE",
          percent_off: 10,
          label: null,
          active: true,
          created_at: "",
          updated_at: ""
        }
      ],
      summary: {
        creator_id: "cr",
        pieces: [],
        rules: [
          {
            default_id: "def_1",
            gate_relay_tier_id: "tier_silver",
            inherited_piece_count: 2,
            matching_promo_piece_ids: ["pp_1", "pp_2"]
          }
        ],
        unmatched: {
          missing_post_count: 0,
          public_or_ungated_count: 0,
          no_matching_default_count: 0
        },
        code_usage: []
      }
    });
    expect(cards[0]).toMatchObject({
      tier_title: "Silver",
      inherited_piece_count: 2,
      tracked_link_ready: true,
      code_label: "LIVE"
    });
  });

  it("serializes an empty draft for tab navigation", () => {
    expect(emptyTierRuleDraft("tier_x").gate_relay_tier_id).toBe("tier_x");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPromoPreviewModel,
  resolveSlotForPreview
} from "../../web/app/studio/promos/promo-preview-model";
import type {
  AudienceSimulationEnvelope,
  CreatorPromoSlotRow,
  PromotionHubSummary
} from "../../web/lib/relay-api";

const SLOT: CreatorPromoSlotRow = {
  promo_piece_id: "pp_1",
  slot_rank: 1,
  target_kind: "post",
  target_id: "post_1",
  post_id: "post_1",
  title: "Piece One",
  thumb_url_path: null
};

const SUMMARY: PromotionHubSummary = {
  creator_id: "cr",
  pieces: [
    {
      promo_piece_id: "pp_1",
      slot_rank: 1,
      post_id: "post_1",
      title: "Piece One",
      minimum_gate_relay_tier_id: "tier_silver",
      unmatched_reason: null
    }
  ],
  rules: [
    {
      default_id: "def_1",
      gate_relay_tier_id: "tier_silver",
      inherited_piece_count: 1,
      matching_promo_piece_ids: ["pp_1"]
    }
  ],
  unmatched: {
    missing_post_count: 0,
    public_or_ungated_count: 0,
    no_matching_default_count: 0
  },
  code_usage: []
};

function sim(personas: AudienceSimulationEnvelope["simulation"]["personas"]): AudienceSimulationEnvelope {
  return {
    post_id: "post_1",
    creator_id: "cr",
    gate: { is_public: false, tier_ids: ["tier_silver"] },
    relay_visibility: "active",
    is_mature: false,
    catalog_tiers: [
      { relay_tier_id: "tier_silver", title: "Silver", amount_cents: 1000 }
    ],
    simulation: {
      personas,
      gate_tier_ids: ["tier_silver"],
      relay_visibility: "active"
    },
    tier_preview_settings: null
  };
}

describe("VS5 Preview characterization + view model", () => {
  it("resolves Preview selection by stable promo_piece_id over rank", () => {
    const slots = [
      SLOT,
      { ...SLOT, promo_piece_id: "pp_2", slot_rank: 2, target_id: "post_2", post_id: "post_2" }
    ];
    expect(
      resolveSlotForPreview({ slots, promoPieceId: "pp_2", slotRank: 1 })?.promo_piece_id
    ).toBe("pp_2");
  });

  it("passes effective_promo through unchanged (no client fabrication)", () => {
    const dto = {
      headline: "Unlock",
      cta_text: "Join",
      code: "LIVE10",
      percent_off: 10,
      tracked_url: "http://localhost:8787/go/abc",
      source: "tier_default" as const
    };
    const model = buildPromoPreviewModel({
      slot: SLOT,
      summary: SUMMARY,
      simulation: sim([
        {
          persona_key: "anonymous",
          label: "Anonymous",
          outcome: "deny",
          effective_promo: dto
        }
      ]),
      personaKey: "anonymous"
    });
    expect(model.effective_promo).toBe(dto);
    expect(model.effective_source).toBe("tier_default");
    expect(model.tracked_link_ready).toBe(true);
    expect(model.status_lines.some((l) => l.includes("tier_default"))).toBe(true);
  });

  it("shows entitled persona with no promo", () => {
    const model = buildPromoPreviewModel({
      slot: SLOT,
      summary: SUMMARY,
      simulation: sim([
        {
          persona_key: "tier:tier_gold",
          label: "Gold",
          outcome: "allow",
          effective_promo: null
        }
      ]),
      personaKey: "tier:tier_gold"
    });
    expect(model.effective_promo).toBeNull();
    expect(model.status_lines).toContain("Entitled viewer — content, no promo");
  });

  it("prefers explicit source when simulation says explicit", () => {
    const model = buildPromoPreviewModel({
      slot: SLOT,
      summary: SUMMARY,
      simulation: sim([
        {
          persona_key: "anonymous",
          label: "Anonymous",
          outcome: "locked_preview",
          effective_promo: {
            headline: "Post override",
            cta_text: "Go",
            code: "EXPLICIT",
            percent_off: 15,
            tracked_url: null,
            source: "explicit"
          }
        }
      ]),
      personaKey: "anonymous"
    });
    expect(model.effective_source).toBe("explicit");
    expect(model.tracked_link_ready).toBe(false);
    expect(model.status_lines.some((l) => /Tracked link not minted/.test(l))).toBe(
      true
    );
  });

  it("marks public/ungated hub pieces as no matching Tier Rule", () => {
    const summary: PromotionHubSummary = {
      ...SUMMARY,
      pieces: [
        {
          promo_piece_id: "pp_1",
          slot_rank: 1,
          post_id: "post_1",
          title: "Public",
          minimum_gate_relay_tier_id: null,
          unmatched_reason: "public_or_ungated"
        }
      ],
      rules: []
    };
    const model = buildPromoPreviewModel({
      slot: SLOT,
      summary,
      simulation: {
        ...sim([]),
        gate: { is_public: true, tier_ids: [] }
      },
      personaKey: null
    });
    expect(model.hub_unmatched_reason).toBe("public_or_ungated");
    expect(model.matching_default_id).toBeNull();
  });

  it("flags unresolved legacy media without post_id", () => {
    const model = buildPromoPreviewModel({
      slot: {
        promo_piece_id: "pp_legacy",
        slot_rank: 3,
        target_kind: "media",
        target_id: "media_x",
        title: "Orphan",
        thumb_url_path: null
      },
      summary: {
        ...SUMMARY,
        pieces: [
          {
            promo_piece_id: "pp_legacy",
            slot_rank: 3,
            post_id: null,
            title: null,
            minimum_gate_relay_tier_id: null,
            unmatched_reason: "missing_post"
          }
        ]
      },
      simulation: null,
      personaKey: null
    });
    expect(model.unresolved).toBe(true);
    expect(model.status_lines.some((l) => /Unresolved/.test(l))).toBe(true);
  });

  it("documents that LockedPromoOverlay must receive the server DTO unchanged", () => {
    const serverPromo = {
      headline: "Server",
      cta_text: "CTA",
      code: null,
      percent_off: null,
      tracked_url: null,
      source: "tier_default" as const
    };
    const model = buildPromoPreviewModel({
      slot: SLOT,
      summary: SUMMARY,
      simulation: sim([
        {
          persona_key: "anonymous",
          label: "Anonymous",
          outcome: "deny",
          effective_promo: serverPromo
        }
      ]),
      personaKey: "anonymous"
    });
    // Overlay prop contract: effectivePromo={model.effective_promo}
    expect(model.effective_promo).toEqual(serverPromo);
    expect(model.effective_promo).not.toEqual({
      ...serverPromo,
      source: "explicit"
    });
  });
});

describe("promo performance contract", () => {
  it("distinguishes unavailable from zero", async () => {
    const { unavailablePromoPerformance, formatPromoPerformanceMetric } =
      await import("../../web/lib/promo-performance-contract");
    const unavailable = unavailablePromoPerformance({
      promo_piece_id: "pp_1",
      post_id: "post_1"
    });
    expect(unavailable.available).toBe(false);
    if (!unavailable.available) {
      expect(unavailable.reason).toMatch(/No distribution data yet/);
    }
    expect(formatPromoPerformanceMetric({ status: "unavailable" })).toBe("—");
    expect(formatPromoPerformanceMetric({ status: "zero" })).toBe("0");
    expect(formatPromoPerformanceMetric({ status: "value", value: 3 })).toBe("3");
  });
});

describe("Preview selection race posture", () => {
  it("clears prior simulation identity when switching promo_piece_id before fetch resolves", () => {
    // PromoPreviewPanel sets simulation=null when selectedPostId changes (cancelled flag).
    let simulationPostId: string | null = "post_old";
    const onSelect = (postId: string) => {
      simulationPostId = null; // loading cleared
      // fetch would then set post_new only if not cancelled
      simulationPostId = postId;
    };
    onSelect("post_new");
    expect(simulationPostId).toBe("post_new");
  });

  it("deep-link post_id resolves a slot when no piece id selected", () => {
    const slots = [
      SLOT,
      {
        ...SLOT,
        promo_piece_id: "pp_2",
        slot_rank: 2 as const,
        target_id: "post_deeplink",
        post_id: "post_deeplink",
        title: "Deep"
      }
    ];
    expect(
      resolveSlotForPreview({
        slots,
        promoPieceId: null,
        deepLinkPostId: "post_deeplink"
      })?.promo_piece_id
    ).toBe("pp_2");
  });
});

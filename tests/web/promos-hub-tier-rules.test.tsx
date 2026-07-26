/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsertCreatorTierPromotionDefault = vi.fn();
const deleteCreatorTierPromotionDefault = vi.fn();
const ensureTierDefaultTrackedLink = vi.fn();

vi.mock("@/lib/relay-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/relay-api")>("@/lib/relay-api");
  return {
    ...actual,
    upsertCreatorTierPromotionDefault: (...args: unknown[]) =>
      upsertCreatorTierPromotionDefault(...args),
    deleteCreatorTierPromotionDefault: (...args: unknown[]) =>
      deleteCreatorTierPromotionDefault(...args),
    ensureTierDefaultTrackedLink: (...args: unknown[]) =>
      ensureTierDefaultTrackedLink(...args),
    RELAY_API_BASE: "http://localhost:8787"
  };
});

vi.mock("@/lib/offer-tracked-link-qr", () => ({
  offerTrackedLinkQrDataUrl: vi.fn(async () => "data:image/png;base64,abc"),
  downloadDataUrl: vi.fn()
}));

import TierRulesPanel from "../../web/app/studio/promos/TierRulesPanel";
import type {
  CreatorDiscountCodeRecord,
  PromotionHubSummary,
  RelayComposeTierRow,
  TierPromotionDefaultRecord
} from "../../web/lib/relay-api";

const TIERS: RelayComposeTierRow[] = [
  {
    tier_id: "tier_silver",
    relay_tier_id: "tier_silver",
    title: "Silver",
    amount_cents: 1000
  },
  {
    tier_id: "tier_gold",
    relay_tier_id: "tier_gold",
    title: "Gold",
    amount_cents: 2000
  }
];

const CODE_LIVE: CreatorDiscountCodeRecord = {
  id: "c_live",
  creator_id: "cr_test",
  code: "LIVE10",
  percent_off: 10,
  label: null,
  active: true,
  created_at: "",
  updated_at: ""
};

const CODE_DEAD: CreatorDiscountCodeRecord = {
  id: "c_dead",
  creator_id: "cr_test",
  code: "DEAD20",
  percent_off: 20,
  label: null,
  active: false,
  created_at: "",
  updated_at: ""
};

const RULE_READY: TierPromotionDefaultRecord = {
  id: "def_ready",
  creator_id: "cr_test",
  gate_relay_tier_id: "tier_silver",
  segment: "unpermissioned",
  discount_code_id: "c_live",
  headline: "Unlock Silver",
  cta_text: "Join",
  patreon_destination_url: "https://www.patreon.com/demo",
  redirect_slug: "go_silver",
  active: true,
  created_at: "",
  updated_at: "",
  discount_code: {
    id: "c_live",
    code: "LIVE10",
    percent_off: 10,
    active: true,
    label: null
  }
};

const RULE_NO_DEST: TierPromotionDefaultRecord = {
  id: "def_nodest",
  creator_id: "cr_test",
  gate_relay_tier_id: "tier_gold",
  segment: "unpermissioned",
  discount_code_id: "c_dead",
  headline: "Unlock Gold",
  cta_text: "Claim",
  patreon_destination_url: null,
  redirect_slug: null,
  active: true,
  created_at: "",
  updated_at: "",
  discount_code: {
    id: "c_dead",
    code: "DEAD20",
    percent_off: 20,
    active: false,
    label: null
  }
};

const SUMMARY: PromotionHubSummary = {
  creator_id: "cr_test",
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
      default_id: "def_ready",
      gate_relay_tier_id: "tier_silver",
      inherited_piece_count: 1,
      matching_promo_piece_ids: ["pp_1"]
    },
    {
      default_id: "def_nodest",
      gate_relay_tier_id: "tier_gold",
      inherited_piece_count: 0,
      matching_promo_piece_ids: []
    }
  ],
  unmatched: {
    missing_post_count: 0,
    public_or_ungated_count: 1,
    no_matching_default_count: 0
  },
  code_usage: [
    {
      discount_code_id: "c_live",
      tier_rule_active_count: 1,
      tier_rule_inactive_count: 0,
      post_offer_active_count: 0,
      post_offer_inactive_count: 0
    },
    {
      discount_code_id: "c_dead",
      tier_rule_active_count: 1,
      tier_rule_inactive_count: 0,
      post_offer_active_count: 0,
      post_offer_inactive_count: 0
    }
  ]
};

function renderPanel(args?: {
  defaults?: TierPromotionDefaultRecord[];
  codes?: CreatorDiscountCodeRecord[];
  summary?: PromotionHubSummary | null;
  onDefaultsChange?: ReturnType<typeof vi.fn>;
  onError?: ReturnType<typeof vi.fn>;
  onPreviewPiece?: ReturnType<typeof vi.fn>;
  onAddCode?: ReturnType<typeof vi.fn>;
}) {
  const onDefaultsChange = args?.onDefaultsChange ?? vi.fn();
  const onError = args?.onError ?? vi.fn();
  const onPreviewPiece = args?.onPreviewPiece ?? vi.fn();
  const onAddCode = args?.onAddCode ?? vi.fn();
  render(
    <TierRulesPanel
      creatorId="cr_test"
      tiers={TIERS}
      defaults={args?.defaults ?? [RULE_READY, RULE_NO_DEST]}
      codes={args?.codes ?? [CODE_LIVE, CODE_DEAD]}
      summary={args?.summary === undefined ? SUMMARY : args.summary}
      onDefaultsChange={onDefaultsChange}
      onError={onError}
      onPreviewPiece={onPreviewPiece}
      onAddCode={onAddCode}
    />
  );
  return { onDefaultsChange, onError, onPreviewPiece, onAddCode };
}

describe("VS3 TierRulesPanel", () => {
  beforeEach(() => {
    upsertCreatorTierPromotionDefault.mockReset();
    deleteCreatorTierPromotionDefault.mockReset();
    ensureTierDefaultTrackedLink.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders truthful inherited counts and unmatched summary", () => {
    renderPanel();
    const cards = [...document.querySelectorAll("[data-tier-rule-card]")];
    expect(cards).toHaveLength(2);
    const byGate = Object.fromEntries(
      cards.map((el) => [
        el.textContent?.includes("Gold") ? "gold" : "silver",
        el.getAttribute("data-inherited-count")
      ])
    );
    expect(byGate.silver).toBe("1");
    expect(byGate.gold).toBe("0");
    expect(screen.getByText(/Unmatched promo pieces: 1 public\/ungated/)).toBeTruthy();
    expect(screen.getAllByText(/LIVE10/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\(inactive\)/)).toBeTruthy();
  });

  it("shows destination warning and blocks mint when destination missing", () => {
    renderPanel({ defaults: [RULE_NO_DEST], summary: SUMMARY });
    expect(
      screen.getByText(/Add a Patreon destination URL before sharing the link/)
    ).toBeTruthy();
    const mint = screen.getByRole("button", {
      name: /Mint tracked link/i
    }) as HTMLButtonElement;
    expect(mint.disabled).toBe(true);
  });

  it("copies tracked link for a ready rule", async () => {
    renderPanel({ defaults: [RULE_READY] });
    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/go/go_silver")
      );
    });
  });

  it("mints a tracked link when destination present and slug missing", async () => {
    const onDefaultsChange = vi.fn();
    const pending: TierPromotionDefaultRecord = {
      ...RULE_READY,
      redirect_slug: null
    };
    ensureTierDefaultTrackedLink.mockResolvedValue({
      redirect_slug: "minted_slug",
      redirect_path: "/go/minted_slug"
    });
    renderPanel({ defaults: [pending], onDefaultsChange });
    fireEvent.click(screen.getByRole("button", { name: /Mint tracked link/i }));
    await waitFor(() => {
      expect(ensureTierDefaultTrackedLink).toHaveBeenCalledWith({
        creatorId: "cr_test",
        defaultId: "def_ready"
      });
      expect(onDefaultsChange).toHaveBeenCalled();
    });
  });

  it("creates a rule and auto-mints when destination is set", async () => {
    const onDefaultsChange = vi.fn();
    upsertCreatorTierPromotionDefault.mockResolvedValue({
      ...RULE_READY,
      id: "def_new",
      redirect_slug: null
    });
    ensureTierDefaultTrackedLink.mockResolvedValue({
      redirect_slug: "auto_slug",
      redirect_path: "/go/auto_slug"
    });
    renderPanel({ defaults: [], onDefaultsChange });
    fireEvent.change(screen.getByPlaceholderText(/patreon\.com/i), {
      target: { value: "https://www.patreon.com/new" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Save tier rule/i }));
    await waitFor(() => {
      expect(upsertCreatorTierPromotionDefault).toHaveBeenCalled();
      expect(ensureTierDefaultTrackedLink).toHaveBeenCalledWith({
        creatorId: "cr_test",
        defaultId: "def_new"
      });
      expect(onDefaultsChange).toHaveBeenCalled();
    });
  });

  it("surfaces mutation errors without clearing existing cards", async () => {
    const onError = vi.fn();
    upsertCreatorTierPromotionDefault.mockRejectedValue(new Error("save failed"));
    renderPanel({ onError });
    fireEvent.click(screen.getByRole("button", { name: /Save tier rule/i }));
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("save failed");
    });
    expect(document.querySelectorAll("[data-tier-rule-card]")).toHaveLength(2);
  });

  it("deletes a rule", async () => {
    const onDefaultsChange = vi.fn();
    deleteCreatorTierPromotionDefault.mockResolvedValue(undefined);
    renderPanel({ defaults: [RULE_READY], onDefaultsChange });
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    await waitFor(() => {
      expect(deleteCreatorTierPromotionDefault).toHaveBeenCalledWith({
        creatorId: "cr_test",
        defaultId: "def_ready"
      });
      expect(onDefaultsChange).toHaveBeenCalledWith([]);
    });
  });

  it("expands matching pieces and hands Preview to parent", () => {
    const onPreviewPiece = vi.fn();
    renderPanel({ onPreviewPiece });
    fireEvent.click(screen.getByRole("button", { name: /Show pieces/i }));
    expect(screen.getByText(/Piece One/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    expect(onPreviewPiece).toHaveBeenCalledWith("pp_1");
  });

  it("routes Add code when no active codes exist", () => {
    const onAddCode = vi.fn();
    renderPanel({ codes: [CODE_DEAD], defaults: [], onAddCode });
    fireEvent.click(screen.getByRole("button", { name: /Add code/i }));
    expect(onAddCode).toHaveBeenCalled();
  });
});

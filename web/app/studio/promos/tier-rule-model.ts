/**
 * Pure view models for /studio/promos Tier Rules tab.
 */

import type {
  CreatorDiscountCodeRecord,
  PromotionHubSummary,
  RelayComposeTierRow,
  TierPromotionDefaultRecord
} from "@/lib/relay-api";

export type TierRuleDraft = {
  gate_relay_tier_id: string;
  discount_code_id: string;
  headline: string;
  cta_text: string;
  patreon_destination_url: string;
};

export type TierRuleCardModel = {
  id: string;
  gate_relay_tier_id: string;
  tier_title: string;
  tier_amount_label: string;
  code_label: string;
  code_inactive: boolean;
  code_missing: boolean;
  headline: string;
  cta_text: string;
  inherited_piece_count: number;
  matching_promo_piece_ids: string[];
  redirect_slug: string | null;
  has_destination: boolean;
  tracked_link_ready: boolean;
  active: boolean;
};

export function emptyTierRuleDraft(gateId = ""): TierRuleDraft {
  return {
    gate_relay_tier_id: gateId,
    discount_code_id: "",
    headline: "Unlock with a discount",
    cta_text: "Claim on Patreon",
    patreon_destination_url: ""
  };
}

export function tierTitle(
  gateId: string,
  tiers: readonly RelayComposeTierRow[]
): string {
  const row = tiers.find(
    (t) => (t.relay_tier_id || t.tier_id) === gateId || t.tier_id === gateId
  );
  return row?.title?.trim() || gateId;
}

export function tierAmountLabel(
  gateId: string,
  tiers: readonly RelayComposeTierRow[]
): string {
  const row = tiers.find(
    (t) => (t.relay_tier_id || t.tier_id) === gateId || t.tier_id === gateId
  );
  if (row?.amount_cents != null && Number.isFinite(row.amount_cents)) {
    return `$${(row.amount_cents / 100).toFixed(0)}`;
  }
  return "—";
}

export function activeCodesForNewAssignment(
  codes: readonly CreatorDiscountCodeRecord[]
): CreatorDiscountCodeRecord[] {
  return codes.filter((c) => c.active);
}

export function buildTierRuleCards(args: {
  defaults: readonly TierPromotionDefaultRecord[];
  tiers: readonly RelayComposeTierRow[];
  codes: readonly CreatorDiscountCodeRecord[];
  summary: PromotionHubSummary | null;
}): TierRuleCardModel[] {
  const ruleByDefaultId = new Map(
    (args.summary?.rules ?? []).map((r) => [r.default_id, r] as const)
  );
  const codeById = new Map(args.codes.map((c) => [c.id, c] as const));

  return [...args.defaults]
    .sort((a, b) => a.gate_relay_tier_id.localeCompare(b.gate_relay_tier_id))
    .map((d) => {
      const rule = ruleByDefaultId.get(d.id);
      const code =
        (d.discount_code_id ? codeById.get(d.discount_code_id) : null) ??
        d.discount_code ??
        null;
      const codeMissing = Boolean(d.discount_code_id && !code) || Boolean(d.code_missing);
      const codeInactive = Boolean(code && !code.active);
      const hasDestination = Boolean(d.patreon_destination_url?.trim());
      const redirectSlug = d.redirect_slug?.trim() || null;
      return {
        id: d.id,
        gate_relay_tier_id: d.gate_relay_tier_id,
        tier_title: tierTitle(d.gate_relay_tier_id, args.tiers),
        tier_amount_label: tierAmountLabel(d.gate_relay_tier_id, args.tiers),
        code_label: code?.code ?? (codeMissing ? "missing code" : "no code"),
        code_inactive: codeInactive,
        code_missing: codeMissing,
        headline: d.headline || "Untitled",
        cta_text: d.cta_text,
        inherited_piece_count: rule?.inherited_piece_count ?? 0,
        matching_promo_piece_ids: rule?.matching_promo_piece_ids ?? [],
        redirect_slug: redirectSlug,
        has_destination: hasDestination,
        tracked_link_ready: Boolean(d.active && hasDestination && redirectSlug),
        active: d.active
      };
    });
}

/**
 * Pure Preview tab view model for /studio/promos.
 * Display-only — never mutates access, offers, or fabricates effective_promo.
 */

import type {
  AudienceSimulationEnvelope,
  AudienceSimulationPersonaOutcome,
  CreatorDiscountCodeRecord,
  CreatorPromoSlotRow,
  PromotionHubSummary,
  TierPromotionDefaultRecord
} from "@/lib/relay-api";

export type PromoPreviewEffectivePromo = NonNullable<
  AudienceSimulationPersonaOutcome["effective_promo"]
>;

export type PromoPreviewModel = {
  promo_piece_id: string | null;
  slot_rank: number | null;
  post_id: string | null;
  title: string | null;
  unresolved: boolean;
  in_promo_pool: boolean;
  access_gate_label: string;
  hub_unmatched_reason:
    | "missing_post"
    | "public_or_ungated"
    | "no_matching_default"
    | null;
  matching_default_id: string | null;
  persona: AudienceSimulationPersonaOutcome | null;
  /** Pass-through from simulation — never client-fabricated. */
  effective_promo: PromoPreviewEffectivePromo | null;
  effective_source: "explicit" | "tier_default" | null;
  code_label: string | null;
  tracked_url: string | null;
  tracked_link_ready: boolean;
  status_lines: string[];
};

function gateLabelFromSimulation(
  simulation: AudienceSimulationEnvelope | null
): string {
  if (!simulation) return "Gate unknown (simulation not loaded)";
  if (simulation.gate.is_public) return "Public / ungated";
  const ids = simulation.gate.tier_ids.filter(Boolean);
  if (ids.length === 0) return "Public / ungated";
  const titles = ids.map((id) => {
    const row = simulation.catalog_tiers.find((t) => t.relay_tier_id === id);
    return row?.title?.trim() || id;
  });
  return titles.join(", ");
}

/**
 * Join selected Promo Piece + hub summary + simulation persona into a status chain.
 * `effective_promo` is always the persona DTO field verbatim (or null).
 */
export function buildPromoPreviewModel(args: {
  slot: CreatorPromoSlotRow | null;
  summary: PromotionHubSummary | null;
  simulation: AudienceSimulationEnvelope | null;
  personaKey: string | null;
  defaults?: readonly TierPromotionDefaultRecord[];
  codes?: readonly CreatorDiscountCodeRecord[];
}): PromoPreviewModel {
  const slot = args.slot;
  const postId =
    slot?.post_id?.trim() ||
    (slot?.target_kind === "post" ? slot.target_id.trim() : "") ||
    null;
  const promoPieceId = slot?.promo_piece_id?.trim() || null;
  const pieceSummary = promoPieceId
    ? args.summary?.pieces.find((p) => p.promo_piece_id === promoPieceId)
    : undefined;

  const unresolved =
    !slot ||
    !postId ||
    pieceSummary?.unmatched_reason === "missing_post" ||
    (!slot.post_id && slot.target_kind === "media");

  const persona =
    args.simulation?.simulation.personas.find(
      (p) => p.persona_key === args.personaKey
    ) ?? null;

  // Critical invariant: never invent an effective_promo client-side.
  const effectivePromo = persona?.effective_promo ?? null;
  const effectiveSource = effectivePromo?.source ?? null;
  const trackedUrl = effectivePromo?.tracked_url ?? null;

  const matchingRule =
    pieceSummary?.unmatched_reason == null && pieceSummary?.minimum_gate_relay_tier_id
      ? args.summary?.rules.find(
          (r) => r.gate_relay_tier_id === pieceSummary.minimum_gate_relay_tier_id
        )
      : undefined;

  const defaultRow = matchingRule
    ? args.defaults?.find((d) => d.id === matchingRule.default_id)
    : undefined;
  const codeFromDefault = defaultRow?.discount_code_id
    ? args.codes?.find((c) => c.id === defaultRow.discount_code_id)
    : undefined;

  const codeLabel =
    effectivePromo?.code ??
    codeFromDefault?.code ??
    defaultRow?.discount_code?.code ??
    null;

  const status_lines: string[] = [];
  if (!slot) {
    status_lines.push("No Promo Piece selected");
  } else {
    status_lines.push(
      promoPieceId
        ? `In Promo Pool · piece ${promoPieceId} · rank #${slot.slot_rank}`
        : `In Promo Pool · rank #${slot.slot_rank} (legacy id pending)`
    );
  }
  status_lines.push(`Access gate: ${gateLabelFromSimulation(args.simulation)}`);

  if (unresolved) {
    status_lines.push("Unresolved target — no post to simulate");
  } else if (pieceSummary?.unmatched_reason === "public_or_ungated") {
    status_lines.push("No matching Tier Rule (public / ungated)");
  } else if (pieceSummary?.unmatched_reason === "no_matching_default") {
    status_lines.push(
      `No matching Tier Rule for gate ${pieceSummary.minimum_gate_relay_tier_id}`
    );
  } else if (matchingRule) {
    status_lines.push(
      `Matching Tier Rule inherits ${matchingRule.inherited_piece_count} piece${
        matchingRule.inherited_piece_count === 1 ? "" : "s"
      }`
    );
  } else if (args.summary) {
    status_lines.push("No matching Tier Rule in hub summary");
  }

  if (!persona) {
    status_lines.push("Select a persona to inspect the locked overlay");
  } else if (persona.outcome === "allow") {
    status_lines.push("Entitled viewer — content, no promo");
  } else if (persona.outcome === "missing_post") {
    status_lines.push("Simulation: missing post");
  } else if (effectivePromo) {
    status_lines.push(`Effective source: ${effectivePromo.source}`);
    status_lines.push(
      `Code / CTA: ${effectivePromo.code ?? "no code"} · ${effectivePromo.cta_text || "—"}`
    );
    status_lines.push(
      trackedUrl
        ? `Tracked link ready · ${trackedUrl}`
        : "Tracked link not minted for this effective offer"
    );
  } else {
    status_lines.push("Locked persona with no effective promo from server");
  }

  return {
    promo_piece_id: promoPieceId,
    slot_rank: slot?.slot_rank ?? null,
    post_id: postId,
    title: slot?.title ?? pieceSummary?.title ?? null,
    unresolved: Boolean(unresolved),
    in_promo_pool: Boolean(slot),
    access_gate_label: gateLabelFromSimulation(args.simulation),
    hub_unmatched_reason: pieceSummary?.unmatched_reason ?? null,
    matching_default_id: matchingRule?.default_id ?? null,
    persona,
    effective_promo: effectivePromo,
    effective_source: effectiveSource,
    code_label: codeLabel,
    tracked_url: trackedUrl,
    tracked_link_ready: Boolean(trackedUrl),
    status_lines
  };
}

/** Selection helper — prefer stable promo_piece_id over rank alone. */
export function resolveSlotForPreview(args: {
  slots: readonly CreatorPromoSlotRow[];
  promoPieceId?: string | null;
  slotRank?: number | null;
  deepLinkPostId?: string | null;
}): CreatorPromoSlotRow | null {
  const byPiece = args.promoPieceId?.trim();
  if (byPiece) {
    return args.slots.find((s) => s.promo_piece_id === byPiece) ?? null;
  }
  if (args.slotRank != null) {
    return args.slots.find((s) => s.slot_rank === args.slotRank) ?? null;
  }
  const deep = args.deepLinkPostId?.trim();
  if (deep) {
    return (
      args.slots.find((s) => s.post_id === deep || s.target_id === deep) ?? null
    );
  }
  return args.slots[0] ?? null;
}

"use client";

import { useMemo, useState } from "react";
import {
  deleteCreatorTierPromotionDefault,
  ensureTierDefaultTrackedLink,
  upsertCreatorTierPromotionDefault,
  type CreatorDiscountCodeRecord,
  type PromotionHubSummary,
  type RelayComposeTierRow,
  type TierPromotionDefaultRecord
} from "@/lib/relay-api";
import TierDefaultTrackedLinkPanel from "./TierDefaultTrackedLinkPanel";
import {
  activeCodesForNewAssignment,
  buildTierRuleCards,
  emptyTierRuleDraft,
  type TierRuleDraft
} from "./tier-rule-model";

export type TierRulesPanelProps = {
  creatorId: string;
  tiers: RelayComposeTierRow[];
  defaults: TierPromotionDefaultRecord[];
  codes: CreatorDiscountCodeRecord[];
  summary: PromotionHubSummary | null;
  busy?: boolean;
  draft?: TierRuleDraft;
  onDraftChange?: (draft: TierRuleDraft) => void;
  onDefaultsChange: (defaults: TierPromotionDefaultRecord[]) => void;
  onError: (message: string | null) => void;
  onPreviewPiece?: (promoPieceId: string) => void;
  onAddCode?: () => void;
};

export default function TierRulesPanel({
  creatorId,
  tiers,
  defaults,
  codes,
  summary,
  busy: busyProp = false,
  draft: draftProp,
  onDraftChange,
  onDefaultsChange,
  onError,
  onPreviewPiece,
  onAddCode
}: TierRulesPanelProps) {
  const [localDraft, setLocalDraft] = useState<TierRuleDraft>(() =>
    emptyTierRuleDraft(
      (tiers[0]?.relay_tier_id || tiers[0]?.tier_id || "").trim()
    )
  );
  const [localBusy, setLocalBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const busy = busyProp || localBusy;
  const draft = draftProp ?? localDraft;
  const setDraft = (next: TierRuleDraft) => {
    if (onDraftChange) onDraftChange(next);
    else setLocalDraft(next);
  };

  const cards = useMemo(
    () => buildTierRuleCards({ defaults, tiers, codes, summary }),
    [defaults, tiers, codes, summary]
  );
  const activeCodes = useMemo(() => activeCodesForNewAssignment(codes), [codes]);

  const saveRule = async () => {
    if (!draft.gate_relay_tier_id.trim() || busy) return;
    setLocalBusy(true);
    onError(null);
    try {
      let row = await upsertCreatorTierPromotionDefault({
        creatorId,
        gate_relay_tier_id: draft.gate_relay_tier_id.trim(),
        segment: "unpermissioned",
        discount_code_id: draft.discount_code_id.trim() || null,
        headline: draft.headline,
        cta_text: draft.cta_text,
        patreon_destination_url: draft.patreon_destination_url.trim() || null,
        active: true
      });
      if (draft.patreon_destination_url.trim()) {
        const minted = await ensureTierDefaultTrackedLink({
          creatorId,
          defaultId: row.id
        });
        row = { ...row, redirect_slug: minted.redirect_slug };
      }
      const others = defaults.filter(
        (d) =>
          !(
            d.gate_relay_tier_id === row.gate_relay_tier_id &&
            d.segment === row.segment
          )
      );
      onDefaultsChange(
        [...others, row].sort((a, b) =>
          a.gate_relay_tier_id.localeCompare(b.gate_relay_tier_id)
        )
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save tier rule.");
    } finally {
      setLocalBusy(false);
    }
  };

  const removeRule = async (id: string) => {
    if (busy) return;
    setLocalBusy(true);
    onError(null);
    try {
      await deleteCreatorTierPromotionDefault({ creatorId, defaultId: id });
      onDefaultsChange(defaults.filter((d) => d.id !== id));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not delete rule.");
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <section className="space-y-4" data-promos-rules>
      <p className="text-[12px] text-[var(--relay-fg-muted)]">
        Live marketing defaults for locked viewers. These do not change access tiers —
        they only set the discount overlay when someone cannot open the post.
      </p>

      <div className="grid gap-3 rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] p-4 sm:grid-cols-2">
        <label className="block text-[11px] text-[var(--relay-fg-muted)]">
          Minimum gate tier
          <select
            value={draft.gate_relay_tier_id}
            onChange={(e) => setDraft({ ...draft, gate_relay_tier_id: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--relay-border)] bg-[var(--relay-bg)] px-2 py-1.5 text-[12px] text-[var(--relay-fg)]"
          >
            {tiers.map((t) => (
              <option key={t.tier_id} value={t.relay_tier_id || t.tier_id}>
                {t.title} (
                {t.amount_cents != null ? `$${(t.amount_cents / 100).toFixed(0)}` : "—"})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-[var(--relay-fg-muted)]">
          Discount code
          <select
            value={draft.discount_code_id}
            onChange={(e) => setDraft({ ...draft, discount_code_id: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--relay-border)] bg-[var(--relay-bg)] px-2 py-1.5 text-[12px] text-[var(--relay-fg)]"
          >
            <option value="">No code</option>
            {activeCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.percent_off}%
              </option>
            ))}
          </select>
        </label>
        {activeCodes.length === 0 ? (
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => onAddCode?.()}
              className="text-[12px] text-[var(--relay-green-400)] underline"
            >
              Add code
            </button>
          </div>
        ) : null}
        <label className="block text-[11px] text-[var(--relay-fg-muted)]">
          Headline
          <input
            value={draft.headline}
            onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--relay-border)] bg-[var(--relay-bg)] px-2 py-1.5 text-[12px] text-[var(--relay-fg)]"
          />
        </label>
        <label className="block text-[11px] text-[var(--relay-fg-muted)]">
          CTA text
          <input
            value={draft.cta_text}
            onChange={(e) => setDraft({ ...draft, cta_text: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--relay-border)] bg-[var(--relay-bg)] px-2 py-1.5 text-[12px] text-[var(--relay-fg)]"
          />
        </label>
        <label className="block text-[11px] text-[var(--relay-fg-muted)] sm:col-span-2">
          Patreon destination (https)
          <input
            value={draft.patreon_destination_url}
            onChange={(e) =>
              setDraft({ ...draft, patreon_destination_url: e.target.value })
            }
            placeholder="https://www.patreon.com/…"
            className="mt-1 w-full rounded-lg border border-[var(--relay-border)] bg-[var(--relay-bg)] px-2 py-1.5 text-[12px] text-[var(--relay-fg)]"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="button"
            disabled={busy || !draft.gate_relay_tier_id}
            onClick={() => void saveRule()}
            className="rounded-lg bg-[var(--relay-green-600)] px-3 py-2 text-[12px] font-semibold text-[var(--relay-fg)] disabled:opacity-40"
          >
            Save tier rule
          </button>
        </div>
      </div>

      {summary &&
      (summary.unmatched.public_or_ungated_count > 0 ||
        summary.unmatched.missing_post_count > 0) ? (
        <p className="text-[11px] text-[var(--relay-fg-muted)]">
          Unmatched promo pieces: {summary.unmatched.public_or_ungated_count} public/ungated
          {summary.unmatched.missing_post_count
            ? `, ${summary.unmatched.missing_post_count} missing post`
            : ""}
          .
        </p>
      ) : null}

      <ul className="space-y-2">
        {cards.map((card) => (
          <li
            key={card.id}
            className="rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2"
            data-tier-rule-card
            data-inherited-count={card.inherited_piece_count}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-[var(--relay-fg)]">
                  {card.tier_title} ({card.tier_amount_label}) → {card.code_label}
                  {card.code_inactive ? " (inactive)" : ""}
                  {card.code_missing ? " (missing)" : ""} · {card.headline}
                </p>
                <p className="text-[11px] text-[var(--relay-fg-muted)]">
                  Inherits to {card.inherited_piece_count} promo piece
                  {card.inherited_piece_count === 1 ? "" : "s"}
                  {card.redirect_slug ? ` · /go/${card.redirect_slug}` : ""}
                  {!card.has_destination ? " · destination needed for tracked link" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {card.matching_promo_piece_ids.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId((id) => (id === card.id ? null : card.id))
                    }
                    className="rounded border border-[var(--relay-border)] px-2 py-1 text-[11px] text-[var(--relay-fg)]"
                  >
                    {expandedId === card.id ? "Hide pieces" : "Show pieces"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeRule(card.id)}
                  className="rounded border border-red-900/50 px-2 py-1 text-[11px] text-red-200"
                >
                  Remove
                </button>
              </div>
            </div>
            {expandedId === card.id ? (
              <ul className="mt-2 space-y-1 border-t border-[var(--relay-border)] pt-2">
                {card.matching_promo_piece_ids.map((pieceId) => {
                  const piece = summary?.pieces.find((p) => p.promo_piece_id === pieceId);
                  return (
                    <li
                      key={pieceId}
                      className="flex items-center justify-between gap-2 text-[11px] text-[var(--relay-fg-muted)]"
                    >
                      <span>
                        #{piece?.slot_rank ?? "?"} {piece?.title || pieceId}
                      </span>
                      {onPreviewPiece ? (
                        <button
                          type="button"
                          onClick={() => onPreviewPiece(pieceId)}
                          className="text-[var(--relay-green-400)] underline"
                        >
                          Preview
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {(() => {
              const rule = defaults.find((d) => d.id === card.id);
              return rule ? (
                <TierDefaultTrackedLinkPanel
                  creatorId={creatorId}
                  rule={rule}
                  onSlugMinted={(slug) => {
                    onDefaultsChange(
                      defaults.map((d) =>
                        d.id === rule.id ? { ...d, redirect_slug: slug } : d
                      )
                    );
                  }}
                />
              ) : null;
            })()}
          </li>
        ))}
      </ul>
    </section>
  );
}

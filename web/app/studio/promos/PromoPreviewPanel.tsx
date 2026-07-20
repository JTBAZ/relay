"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LockedPromoOverlay } from "@/app/components/visitor/LockedPromoOverlay";
import {
  fetchAudienceSimulation,
  type AudienceSimulationEnvelope,
  type CreatorDiscountCodeRecord,
  type CreatorPromoSlotRow,
  type PromotionHubSummary,
  type TierPromotionDefaultRecord
} from "@/lib/relay-api";
import {
  unavailablePromoPerformance,
  type PromoPerformanceAvailability
} from "@/lib/promo-performance-contract";
import {
  buildPromoPreviewModel,
  resolveSlotForPreview
} from "./promo-preview-model";

export type PromoPreviewPanelProps = {
  creatorId: string;
  slots: CreatorPromoSlotRow[];
  summary: PromotionHubSummary | null;
  defaults: TierPromotionDefaultRecord[];
  codes: CreatorDiscountCodeRecord[];
  selectedPromoPieceId: string | null;
  deepLinkPostId?: string | null;
  onSelectPromoPieceId: (promoPieceId: string | null) => void;
  performance?: PromoPerformanceAvailability | null;
};

export default function PromoPreviewPanel({
  creatorId,
  slots,
  summary,
  defaults,
  codes,
  selectedPromoPieceId,
  deepLinkPostId = null,
  onSelectPromoPieceId,
  performance: performanceProp
}: PromoPreviewPanelProps) {
  const selectedSlot = useMemo(
    () =>
      resolveSlotForPreview({
        slots,
        promoPieceId: selectedPromoPieceId,
        deepLinkPostId
      }),
    [slots, selectedPromoPieceId, deepLinkPostId]
  );

  const selectedPostId =
    selectedSlot?.post_id?.trim() ||
    (selectedSlot?.target_kind === "post" ? selectedSlot.target_id : null) ||
    deepLinkPostId;

  const [simulation, setSimulation] = useState<AudienceSimulationEnvelope | null>(
    null
  );
  const [simPersona, setSimPersona] = useState("anonymous");
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!creatorId || !selectedPostId) {
      setSimulation(null);
      setSimLoading(false);
      setSimError(null);
      return;
    }
    let cancelled = false;
    setSimLoading(true);
    setSimError(null);
    setSimulation(null);
    void fetchAudienceSimulation({ relayCreatorId: creatorId, postId: selectedPostId })
      .then((env) => {
        if (cancelled) return;
        setSimulation(env);
        const firstLocked = env.simulation.personas.find(
          (p) => p.outcome === "deny" || p.outcome === "locked_preview"
        );
        setSimPersona(
          firstLocked?.persona_key ??
            env.simulation.personas[0]?.persona_key ??
            "anonymous"
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setSimulation(null);
        setSimError(e instanceof Error ? e.message : "Simulation failed");
      })
      .finally(() => {
        if (!cancelled) setSimLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId, selectedPostId, retryToken]);

  const model = useMemo(
    () =>
      buildPromoPreviewModel({
        slot: selectedSlot,
        summary,
        simulation,
        personaKey: simPersona,
        defaults,
        codes
      }),
    [selectedSlot, summary, simulation, simPersona, defaults, codes]
  );

  const performance =
    performanceProp ??
    (selectedSlot?.promo_piece_id
      ? unavailablePromoPerformance({
          promo_piece_id: selectedSlot.promo_piece_id,
          post_id: selectedPostId
        })
      : null);

  return (
    <section className="space-y-4" data-promos-preview>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-[11px] text-[var(--relay-fg-muted)]">
          Promo piece
          <select
            value={selectedSlot?.promo_piece_id ?? ""}
            onChange={(e) => onSelectPromoPieceId(e.target.value || null)}
            className="mt-1 block min-w-[14rem] rounded-lg border border-[var(--relay-border)] bg-[var(--relay-bg)] px-2 py-1.5 text-[12px] text-[var(--relay-fg)]"
          >
            {slots.map((s) => (
              <option key={s.promo_piece_id || s.slot_rank} value={s.promo_piece_id || ""}>
                #{s.slot_rank} {s.title || s.target_id}
              </option>
            ))}
          </select>
        </label>
        {selectedPostId ? (
          <Link
            href={`/studio?hero=${encodeURIComponent(selectedPostId)}&mode=audience_promotion`}
            className="text-[12px] text-[var(--relay-green-400)] underline"
          >
            Open in Hero Audience &amp; Promotion
          </Link>
        ) : null}
      </div>

      {simError ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-[12px] text-red-200">
          {simError}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRetryToken((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}

      {simLoading ? (
        <p className="text-sm text-[var(--relay-fg-muted)]">Loading simulation…</p>
      ) : null}

      {!simLoading && !simError && simulation ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {simulation.simulation.personas.map((p) => (
              <button
                key={p.persona_key}
                type="button"
                onClick={() => setSimPersona(p.persona_key)}
                className={`rounded-full border px-2.5 py-1 text-[10px] ${
                  p.persona_key === simPersona
                    ? "border-[var(--relay-green-400)]/40 bg-[var(--relay-green-400)]/10 text-[var(--relay-green-400)]"
                    : "border-[var(--relay-border)] text-[var(--relay-fg-muted)]"
                }`}
              >
                {p.label} · {p.outcome}
              </button>
            ))}
          </div>
          <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-[var(--relay-border)] bg-[var(--relay-bg)]">
            {model.persona &&
            (model.persona.outcome === "deny" ||
              model.persona.outcome === "locked_preview") ? (
              <LockedPromoOverlay
                unlockLabel={model.persona.label}
                accentColor="#9bf0c4"
                effectivePromo={model.effective_promo ?? null}
                variant="locked"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--relay-fg-muted)]">
                {model.persona?.outcome === "allow"
                  ? "Entitled viewer — content, no promo"
                  : model.unresolved
                    ? "Unresolved piece — no locked overlay"
                    : "Select a locked persona"}
              </div>
            )}
          </div>
        </>
      ) : null}

      {!simLoading && !selectedPostId ? (
        <p className="text-sm text-[var(--relay-fg-muted)]">
          Select a promo piece with a post target to preview locked overlays.
        </p>
      ) : null}

      <ul
        className="space-y-1 rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2 text-[11px] text-[var(--relay-fg-muted)]"
        data-promo-preview-status
      >
        {model.status_lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div
        className="rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2"
        data-promo-performance
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--relay-fg-muted)]">
          Performance
        </p>
        {performance && !performance.available ? (
          <p className="mt-1 text-[12px] text-[var(--relay-fg-muted)]">
            No distribution data yet
            <span className="mt-0.5 block text-[10px] opacity-80">{performance.reason}</span>
          </p>
        ) : performance?.available ? (
          <p className="mt-1 text-[12px] text-[var(--relay-fg)]">
            Impressions / clicks / conversions available from backend summary.
          </p>
        ) : (
          <p className="mt-1 text-[12px] text-[var(--relay-fg-muted)]">
            No distribution data yet
          </p>
        )}
      </div>
    </section>
  );
}

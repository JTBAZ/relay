"use client";

import { X } from "lucide-react";
import { RELAY_API_BASE, type CreatorPromoSlotRow } from "@/lib/relay-api";
import { buildPromoAttributionContextV1 } from "@/lib/promo-attribution-context";
import {
  tipEligibilityReasonCopy,
  type TipEligibilityReason
} from "./tip-eligibility-copy";

function thumbUrl(path?: string): string | null {
  const p = path?.trim();
  if (!p) return null;
  if (p.startsWith("http")) return p;
  return `${RELAY_API_BASE}${p.startsWith("/") ? "" : "/"}${p}`;
}

export type PromoPieceCardProps = {
  slot: CreatorPromoSlotRow;
  creatorId: string;
  busy?: boolean;
  hero?: boolean;
  onRemove: () => void;
  onInspect?: () => void;
  onTipEligibleChange?: (tipEligible: boolean) => void;
};

function TipEligibilityBlock({
  slot,
  busy,
  onTipEligibleChange
}: {
  slot: CreatorPromoSlotRow;
  busy: boolean;
  onTipEligibleChange?: (tipEligible: boolean) => void;
}): React.ReactElement | null {
  const eligibility = slot.tip_eligibility;
  if (!eligibility && slot.tip_eligible === undefined) return null;

  const eligible = eligibility?.eligible === true;
  const tipOn = slot.tip_eligible !== false;
  const reasons = (eligibility?.reasons ?? []) as TipEligibilityReason[];
  const primaryReason = reasons.find((r) => r !== "disabled") ?? reasons[0];
  const reasonCopy = primaryReason ? tipEligibilityReasonCopy(primaryReason) : null;

  return (
    <div
      className="space-y-1.5"
      data-testid="promo-tip-eligibility"
      data-eligible={eligible ? "1" : "0"}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            eligible
              ? "border border-[#00AA6F]/40 bg-[#00AA6F]/15 text-[#9bf0c4]"
              : "border border-amber-800/50 bg-amber-950/40 text-amber-200/90"
          }`}
          data-testid="promo-tip-eligibility-badge"
        >
          {eligible ? "Tips OK" : "Tips blocked"}
        </span>
        {onTipEligibleChange ? (
          <label className="flex items-center gap-1.5 text-[10px] text-[#8a928e]">
            <input
              type="checkbox"
              data-testid="promo-tip-eligible-toggle"
              checked={tipOn}
              disabled={busy || reasons.includes("mature") || reasons.includes("storefront")}
              onChange={(e) => {
                e.stopPropagation();
                onTipEligibleChange(e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
            />
            Tips on
          </label>
        ) : null}
      </div>
      {!eligible && reasonCopy ? (
        <p
          className="text-[10px] leading-snug text-[#8a928e]"
          data-testid="promo-tip-eligibility-reason"
        >
          {reasonCopy}
        </p>
      ) : null}
    </div>
  );
}

export default function PromoPieceCard({
  slot,
  creatorId,
  busy = false,
  hero = false,
  onRemove,
  onInspect,
  onTipEligibleChange
}: PromoPieceCardProps) {
  const src = thumbUrl(slot.thumb_url_path);
  const title = slot.title || slot.label || slot.target_id;
  const memberLabel: string | null = null;
  const unresolvedLegacy =
    slot.target_kind === "media" && !(slot.post_id?.trim());
  const postId =
    slot.post_id?.trim() ||
    (slot.target_kind === "post" ? slot.target_id : "");
  const attribution =
    slot.promo_piece_id && postId
      ? buildPromoAttributionContextV1({
          promo_piece_id: slot.promo_piece_id,
          creator_id: creatorId,
          post_id: postId,
          slot_rank: slot.slot_rank
        })
      : null;

  if (hero) {
    return (
      <article
        data-promo-piece-card
        data-promo-piece-id={slot.promo_piece_id || undefined}
        data-promo-post-id={postId || undefined}
        data-promo-rank={slot.slot_rank}
        data-promo-source="promo_pool"
        data-promo-target-kind={slot.target_kind}
        data-promo-target-id={slot.target_id}
        data-promo-attribution-version={attribution?.version}
        data-promo-hero="1"
        className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#24332c] bg-[#0e1411]/80 transition-all hover:border-[#00AA6F]/40"
      >
        <button
          type="button"
          onClick={() => onInspect?.()}
          disabled={!onInspect}
          aria-label={`Inspect ${title}`}
          className="flex flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00AA6F] disabled:cursor-default"
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#070a09]">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- gallery thumb
              <img
                src={src}
                alt=""
                className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-3 text-center text-xs text-[#68706c]">
                {title}
              </div>
            )}
            <div className="absolute left-3 top-3 flex size-8 items-center justify-center rounded-full border border-[#00AA6F]/30 bg-[#070a09]/90 font-mono text-sm font-bold text-[#9bf0c4]">
              {slot.slot_rank}
            </div>
            <span className="absolute bottom-3 left-3 rounded-full border border-[#00AA6F]/40 bg-[#070a09]/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9bf0c4]">
              Promo
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-4">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[#e8eee9]">
              {title}
            </h3>
            {memberLabel ? (
              <p className="truncate text-xs text-[#9bf0c4]">{memberLabel}</p>
            ) : null}
            {unresolvedLegacy ? (
              <p className="text-xs text-amber-200/90">Legacy media — unresolved post</p>
            ) : (
              <p className="text-xs text-[#68706c]">
                Open to inspect health · graph &amp; discount ladder next
              </p>
            )}
            <TipEligibilityBlock
              slot={slot}
              busy={busy}
              onTipEligibleChange={onTipEligibleChange}
            />
          </div>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${title} from promo pieces`}
          data-promo-piece-id={slot.promo_piece_id || undefined}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-[#24332c] bg-[#070a09]/85 text-[#8a928e] transition-colors hover:border-red-900/50 hover:text-red-200 disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </article>
    );
  }

  return (
    <article
      data-promo-piece-card
      data-promo-piece-id={slot.promo_piece_id || undefined}
      data-promo-post-id={postId || undefined}
      data-promo-rank={slot.slot_rank}
      data-promo-source="promo_pool"
      data-promo-target-kind={slot.target_kind}
      data-promo-target-id={slot.target_id}
      data-promo-attribution-version={attribution?.version}
      className="flex max-w-[9.5rem] flex-col gap-1 rounded-lg border border-[var(--relay-border)] bg-[var(--relay-surface-1)] p-1.5"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-[var(--relay-bg)]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- gallery thumb
          <img src={src} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-1.5 text-center text-[10px] text-[var(--relay-fg-muted)]">
            {title}
          </div>
        )}
        <span className="absolute left-1 top-1 rounded-full bg-[var(--relay-green-600)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--relay-fg)]">
          #{slot.slot_rank}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          aria-label={`Remove ${title} from promo pieces`}
          data-promo-piece-id={slot.promo_piece_id || undefined}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--relay-border)] bg-[var(--relay-surface-1)]/90 text-[var(--relay-fg)] transition-colors hover:border-red-900/50 hover:text-red-200 disabled:opacity-40"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
        <span className="absolute bottom-1 left-1 rounded-full border border-[var(--relay-green-600)]/40 bg-[var(--relay-green-600)]/20 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[var(--relay-green-400)]">
          Promo
        </span>
      </div>

      <div className="min-w-0 space-y-0.5 px-0.5">
        <p className="truncate text-[11px] font-medium text-[var(--relay-fg)]">{title}</p>
        {memberLabel ? (
          <p className="truncate text-[10px] text-[var(--relay-green-400)]">{memberLabel}</p>
        ) : null}
        {unresolvedLegacy ? (
          <p className="text-[10px] text-amber-200/90">Legacy media — unresolved post</p>
        ) : null}
        <TipEligibilityBlock
          slot={slot}
          busy={busy}
          onTipEligibleChange={onTipEligibleChange}
        />
      </div>
    </article>
  );
}

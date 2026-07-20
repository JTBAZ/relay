"use client";

import { Lock } from "lucide-react";
import type { GalleryItem } from "@/lib/relay-api";
import type { PreviewTreatment } from "@/lib/audience-promotion-contracts";
import type { EffectivePromo } from "@/lib/effective-promo";
import { trackedPromoHref } from "@/lib/effective-promo";
import { galleryItemImageGridSrc, RELAY_API_BASE } from "@/lib/relay-api";
import { outcomeLabel } from "@/lib/audience-simulation-client";
import { LockedPromoOverlay } from "@/app/components/visitor/LockedPromoOverlay";

function thumbSrc(item: GalleryItem | null): string | null {
  if (!item) return null;
  const path = galleryItemImageGridSrc(item);
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${RELAY_API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export type AudienceSimulatorPreviewCardProps = {
  item: GalleryItem | null;
  title: string;
  personaLabel: string;
  outcome: "allow" | "deny" | "locked_preview" | "missing_post";
  previewStyle: PreviewTreatment;
  ctaText: string;
  /** Slice 9 — same locked promo model as patron surfaces. */
  effectivePromo?: EffectivePromo | null;
  unlockLabel?: string;
  accentColor?: string;
};

/**
 * Compact patron-feed preview for Audience Simulator.
 * No FALLBACK_AUDIENCES, local save preference, or inspect media editors.
 */
export default function AudienceSimulatorPreviewCard({
  item,
  title,
  personaLabel,
  outcome,
  previewStyle,
  ctaText,
  effectivePromo = null,
  unlockLabel = "Members only",
  accentColor = "#9bf0c4"
}: AudienceSimulatorPreviewCardProps) {
  const canView = outcome === "allow";
  const src = thumbSrc(item);
  const lockedTreatment =
    previewStyle === "partial-unblur"
      ? "Preview is partially unblurred for this audience."
      : previewStyle === "partial-unlock"
        ? "A limited preview is unlocked for this audience."
        : previewStyle === "free-cta"
          ? "Upgrade call-to-action is emphasized."
          : "Standard locked preview is shown.";
  const promoHref = trackedPromoHref(effectivePromo);

  return (
    <article
      className="overflow-hidden rounded-xl border border-[#242424] bg-[#0e0e0e]"
      data-audience-simulator-preview-card
      data-promo-source={effectivePromo?.source ?? undefined}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#1a1a1a] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#555]">
            Viewer preview
          </p>
          <p className="truncate text-[11px] font-medium text-[#e8eee9]">{title}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium ${
            canView
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
              : "border-amber-400/40 bg-amber-400/10 text-amber-100"
          }`}
        >
          {outcomeLabel(outcome)} · {personaLabel}
        </span>
      </div>
      <div className="relative min-h-[5.5rem] bg-black/40">
        <div
          className={
            canView
              ? ""
              : previewStyle === "partial-unblur"
                ? "blur-[2px]"
                : "opacity-75 blur-md"
          }
        >
          <div className="flex min-h-[5.5rem] items-center justify-center p-2">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" className="max-h-28 w-full object-contain" />
            ) : (
              <p className="text-[11px] text-[#555]">No art</p>
            )}
          </div>
        </div>
        {!canView && effectivePromo ? (
          <LockedPromoOverlay
            unlockLabel={unlockLabel}
            accentColor={accentColor}
            effectivePromo={effectivePromo}
            variant="blurred"
          />
        ) : !canView ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 px-3 text-center">
            <Lock size={16} className="text-[#9bf0c4]" />
            <p className="text-[10px] text-[#c8d0cb]">{lockedTreatment}</p>
            {ctaText.trim() ? (
              <p className="mt-1 rounded-full border border-[#9bf0c43d] px-2.5 py-1 text-[10px] text-[#9bf0c4]">
                {ctaText.trim()}
              </p>
            ) : null}
            {promoHref.startsWith("/go/") ? (
              <a
                href={promoHref}
                className="mt-1 text-[10px] text-[#9bf0c4] underline"
                data-simulator-promo-link
              >
                Tracked offer link
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

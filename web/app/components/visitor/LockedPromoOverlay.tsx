"use client";

import { Lock } from "lucide-react";
import type { EffectivePromo } from "@/lib/effective-promo";
import { trackedPromoHref } from "@/lib/effective-promo";
import {
  VisitorTierGateOverlay,
  type VisitorTierGateOverlayVariant
} from "@/app/components/visitor/VisitorTierGateOverlay";

export type LockedPromoOverlayProps = {
  unlockLabel: string;
  accentColor: string;
  membershipUrl?: string | null;
  effectivePromo?: EffectivePromo | null;
  variant?: VisitorTierGateOverlayVariant;
  className?: string;
  onUpgradeClick?: () => void;
};

/**
 * Shared locked-viewer chrome: discount text + tracked `/go/:slug` CTA when a promo resolves,
 * otherwise the standard tier-gate Upgrade overlay.
 */
export function LockedPromoOverlay({
  unlockLabel,
  accentColor,
  membershipUrl,
  effectivePromo,
  variant = "blurred",
  className = "",
  onUpgradeClick
}: LockedPromoOverlayProps) {
  if (!effectivePromo) {
    return (
      <VisitorTierGateOverlay
        unlockLabel={unlockLabel}
        accentColor={accentColor}
        membershipUrl={membershipUrl}
        variant={variant}
        className={className}
        onUpgradeClick={onUpgradeClick}
      />
    );
  }

  const href = trackedPromoHref(effectivePromo, membershipUrl);
  const headline =
    effectivePromo.headline.trim() ||
    (effectivePromo.code ? `Use code ${effectivePromo.code}` : unlockLabel);
  const cta = effectivePromo.cta_text.trim() || "Unlock on Patreon";
  const codeLine =
    effectivePromo.code && effectivePromo.percent_off != null
      ? `${effectivePromo.code} · ${effectivePromo.percent_off}% off`
      : effectivePromo.code
        ? effectivePromo.code
        : null;

  const shell =
    variant === "locked"
      ? "pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center gap-2.5 bg-black px-4"
      : "pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center gap-2 px-3";
  const shellStyle =
    variant === "locked"
      ? undefined
      : { backdropFilter: "blur(10px)", background: "rgba(0,0,0,0.35)" };

  return (
    <div
      className={`${shell} ${className}`}
      style={shellStyle}
      data-locked-promo-overlay
      data-promo-source={effectivePromo.source}
    >
      <Lock
        className={variant === "locked" ? "h-11 w-11 text-white" : "h-[18px] w-[18px] text-white/90"}
        strokeWidth={1.5}
        aria-hidden
      />
      <span
        className={
          variant === "locked"
            ? "max-w-[16rem] text-center text-pretty text-[0.85rem] font-semibold leading-snug text-white"
            : "max-w-[12rem] text-center text-pretty text-[0.7rem] font-semibold text-white/90"
        }
      >
        {headline}
      </span>
      {codeLine ? (
        <span className="rounded border border-white/25 bg-black/30 px-2 py-0.5 font-mono text-[0.65rem] tracking-wide text-white/85">
          {codeLine}
        </span>
      ) : null}
      <a
        href={href}
        target={href.startsWith("/go/") ? undefined : "_blank"}
        rel={href.startsWith("/go/") ? undefined : "noopener noreferrer"}
        onClick={() => onUpgradeClick?.()}
        className="pointer-events-auto rounded-md px-3.5 py-2 text-xs font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90"
        style={{ background: accentColor }}
        data-locked-promo-cta
      >
        {cta}
      </a>
    </div>
  );
}

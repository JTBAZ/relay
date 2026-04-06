"use client";

import { Lock } from "lucide-react";

export type VisitorTierGateOverlayVariant = "blurred" | "locked";

type Props = {
  /** e.g. `Basic+` from `designerUnlockLabelFromFacets` */
  unlockLabel: string;
  /** Theme accent for Upgrade control (hex or CSS color) */
  accentColor: string;
  /** Patreon membership URL; Upgrade is still shown but links to patreon.com if missing */
  membershipUrl?: string | null;
  variant?: VisitorTierGateOverlayVariant;
  className?: string;
};

/**
 * Censored / tier-locked tile chrome — matches Site Designer “blurred” (default) and “locked” presets.
 */
export function VisitorTierGateOverlay({
  unlockLabel,
  accentColor,
  membershipUrl,
  variant = "blurred",
  className = ""
}: Props) {
  const href = membershipUrl?.trim() || "https://www.patreon.com";

  if (variant === "locked") {
    return (
      <div
        className={`pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center gap-3 bg-black px-4 ${className}`}
      >
        <Lock className="h-11 w-11 text-white" strokeWidth={1.5} aria-hidden />
        <span className="max-w-[14rem] text-center text-pretty text-[0.8rem] font-semibold leading-snug text-white/90">
          {unlockLabel}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto rounded-md px-3.5 py-2 text-xs font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90"
          style={{ background: accentColor }}
        >
          Upgrade
        </a>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center gap-2 px-3 ${className}`}
      style={{ backdropFilter: "blur(10px)", background: "rgba(0,0,0,0.35)" }}
    >
      <Lock className="h-[18px] w-[18px] text-white/90" aria-hidden />
      <span className="max-w-[11rem] text-center text-pretty text-[0.65rem] font-semibold text-white/80">
        {unlockLabel}
      </span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto rounded-md px-3.5 py-2 text-xs font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90"
        style={{ background: accentColor }}
      >
        Upgrade
      </a>
    </div>
  );
}

/**
 * Full-bleed layer behind {@link VisitorTierGateOverlay}: API preview when present, else gradient stub.
 */
export function VisitorTierGateBackdrop({
  previewSrc,
  alt = ""
}: {
  previewSrc?: string | null;
  alt?: string;
}) {
  if (previewSrc) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt={alt}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-black/35" aria-hidden />
      </>
    );
  }
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-0 scale-110 bg-gradient-to-br from-[oklch(0.28_0.055_160)] via-[oklch(0.18_0.025_160)] to-[oklch(0.11_0.012_160)]"
        style={{ filter: "blur(14px)" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-black/30" aria-hidden />
    </>
  );
}

"use client";

import { ExternalLink } from "lucide-react";
import type { PublicProfileHeroModel } from "@/lib/public-profile-hero";

export type CreatorPublicHeroProps = {
  model: PublicProfileHeroModel;
  className?: string;
  id?: string;
  /** Designer typography tokens; omit on routes that set fonts on an ancestor. */
  fonts?: { heading: string; body: string };
  /** Outer hero shell corner radius (designer frame often passes 0px). */
  radius?: string;
  /** Defaults to designer canvas profile card height. */
  minHeight?: string;
};

/**
 * Shared WYSIWYG hero: same markup and `--relay-*` styling as the former `HeroPreview`
 * in the designer canvas. Mount inside a subtree that defines relay CSS variables.
 */
export default function CreatorPublicHero({
  model,
  className,
  id,
  fonts,
  radius = "0px",
  minHeight = "min(52vh, 380px)"
}: CreatorPublicHeroProps) {
  const showPatreon = Boolean(model.showPatreonLink && model.patreonProfileHref && model.patreonSlug);
  const belowAvatar = model.patreonLinkPosition === "below_avatar";
  const headingFont = fonts?.heading;
  const bodyFont = fonts?.body;

  const patreonEl = showPatreon ? (
    <a
      href={model.patreonProfileHref!}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-90"
      style={{ color: "var(--relay-green-400)", ...(bodyFont ? { fontFamily: bodyFont } : {}) }}
    >
      <ExternalLink size={12} />
      patreon.com/{model.patreonSlug}
    </a>
  ) : null;

  const coverSrc = model.coverImageUrl?.trim();
  const showCoverBackdrop = model.showCover;

  const shellClass = `relative flex flex-col items-center justify-end overflow-hidden${className ? ` ${className}` : ""}`;

  return (
    <div
      id={id}
      className={shellClass}
      style={{ minHeight, borderRadius: radius }}
    >
      {showCoverBackdrop && coverSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic cover URL from export or Patreon
        <img
          src={coverSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background: showCoverBackdrop
            ? "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.82) 100%)"
            : "var(--relay-surface-2)"
        }}
      />
      <div
        className="relative z-10 flex w-full flex-col items-center gap-4 px-6 pb-10 pt-8"
        style={{ textAlign: "center" }}
      >
        {model.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- patron / designer dynamic URLs
            <img
              src={model.avatarUrl}
              alt=""
              className="h-24 w-24 shrink-0 rounded-full object-cover shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-2 ring-white/25"
            />
          ) : (
            <div
              className="h-24 w-24 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--relay-surface-2)_55%,var(--relay-border))] shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-2 ring-white/25"
              aria-hidden
            />
          )}
        {belowAvatar && showPatreon ? <div className="flex w-full justify-center">{patreonEl}</div> : null}
        <div className="flex w-full max-w-lg flex-col items-center gap-2">
          <h1
            className="text-balance font-bold tracking-tight"
            style={{
              color: "var(--relay-fg)",
              fontSize: "clamp(1.5rem, 2.8vw, 2rem)",
              lineHeight: 1.15,
              ...(headingFont ? { fontFamily: headingFont } : {})
            }}
          >
            {model.headline}
          </h1>
          {model.heroPrimary ? (
            <p
              className="text-pretty text-[0.95rem] font-medium"
              style={{
                color: "rgba(249,250,251,0.88)",
                lineHeight: 1.45,
                ...(bodyFont ? { fontFamily: bodyFont } : {})
              }}
            >
              {model.heroPrimary}
            </p>
          ) : null}
          {model.heroSecondary ? (
            <p
              className="text-pretty text-[0.8125rem]"
              style={{
                color: "rgba(249,250,251,0.65)",
                lineHeight: 1.45,
                ...(bodyFont ? { fontFamily: bodyFont } : {})
              }}
            >
              {model.heroSecondary}
            </p>
          ) : null}
          {!model.heroPrimary && !model.heroSecondary && model.fallbackTagline ? (
            <p
              className="text-pretty text-[0.95rem] font-medium"
              style={{
                color: "rgba(249,250,251,0.88)",
                lineHeight: 1.45,
                ...(bodyFont ? { fontFamily: bodyFont } : {})
              }}
            >
              {model.fallbackTagline}
            </p>
          ) : null}
          {!belowAvatar && showPatreon ? patreonEl : null}
        </div>
      </div>
    </div>
  );
}

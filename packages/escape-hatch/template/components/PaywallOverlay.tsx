"use client";

import Link from "next/link";
import type { PaywallStyle } from "@/lib/access";
import {
  paywallCopyForReason,
  type PaywallAudience
} from "@/lib/paywall/copy";

type CommunityCta = { label: string; href: string };

type Props = {
  style: PaywallStyle;
  allowed: boolean;
  reason: string;
  audience: PaywallAudience;
  message?: string;
  communityCta?: CommunityCta | null;
  /** Compact teaser for gallery cards */
  compact?: boolean;
};

/**
 * Honest paywall overlay (EH-034).
 * Never unlocks content — only renders CTAs. Bytes stay behind /api/media.
 */
export function PaywallOverlay({
  style,
  allowed,
  reason,
  audience,
  message,
  communityCta,
  compact = false
}: Props) {
  const copy = paywallCopyForReason({
    reason,
    allowed,
    audience,
    themeMessage: message,
    communityCta
  });

  if (allowed) {
    return null;
  }

  const isExternal =
    copy.primaryHref.startsWith("http://") ||
    copy.primaryHref.startsWith("https://");
  const secondaryExternal =
    copy.secondaryHref &&
    (copy.secondaryHref.startsWith("http://") ||
      copy.secondaryHref.startsWith("https://"));

  return (
    <div
      className={`paywall-cta paywall-overlay ${compact ? "paywall-overlay--compact" : ""} paywall-overlay--${style}`}
      role="region"
      aria-label="Membership paywall"
    >
      <strong>{copy.headline}</strong>
      {!compact ? <p className="paywall-overlay-detail">{copy.detail}</p> : null}
      <p className="visually-hidden" role="status">
        {copy.deniedAnnouncement}
      </p>
      {isExternal ? (
        <a
          className="cta paywall-cta-btn paywall-cta-btn--live"
          href={copy.primaryHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {copy.primaryCta}
        </a>
      ) : (
        <Link
          className="cta paywall-cta-btn paywall-cta-btn--live"
          href={copy.primaryHref}
          onClick={(e) => e.stopPropagation()}
        >
          {copy.primaryCta}
        </Link>
      )}
      {copy.secondaryCta && copy.secondaryHref ? (
        secondaryExternal ? (
          <a
            className="paywall-community"
            href={copy.secondaryHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {copy.secondaryCta}
          </a>
        ) : (
          <Link
            className="paywall-community"
            href={copy.secondaryHref}
            onClick={(e) => e.stopPropagation()}
          >
            {copy.secondaryCta}
          </Link>
        )
      ) : null}
      {copy.honestyNote ? (
        <span className="paywall-preview-note">{copy.honestyNote}</span>
      ) : compact ? (
        <span className="paywall-preview-note">Server-gated · not client unlock</span>
      ) : (
        <span className="paywall-preview-note">
          Access decided server-side · premium bytes never load while locked
        </span>
      )}
    </div>
  );
}

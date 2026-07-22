"use client";

import type { PaywallStyle } from "@/lib/access";

type Props = {
  style: PaywallStyle;
  message?: string;
  communityCta?: { label: string; href: string };
};

function defaultCopy(style: PaywallStyle): string {
  if (style === "hard") return "Members only";
  if (style === "teaser") return "Peek reserved for subscribers";
  return "Unlock to view";
}

export function PaywallTeaser({ style, message, communityCta }: Props) {
  const copy = message?.trim() || defaultCopy(style);

  return (
    <div className="paywall-cta" role="group" aria-label="Membership preview teaser">
      <strong>{copy}</strong>
      <span className="cta paywall-cta-btn">Join to unlock</span>
      <span className="paywall-preview-note">Preview only — not a hard paywall</span>
      {communityCta ? (
        <a
          className="paywall-community"
          href={communityCta.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {communityCta.label}
        </a>
      ) : null}
    </div>
  );
}

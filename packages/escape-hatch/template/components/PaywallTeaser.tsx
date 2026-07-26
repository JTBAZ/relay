"use client";

import { PaywallOverlay } from "@/components/PaywallOverlay";
import type { PaywallStyle } from "@/lib/access";

type Props = {
  style: PaywallStyle;
  message?: string;
  communityCta?: { label: string; href: string };
  /** Optional reason when caller already evaluated access. */
  reason?: string;
};

/**
 * Backward-compatible teaser wrapper — EH-034 PaywallOverlay underneath.
 * Assumes locked / anonymous unless reason says otherwise.
 */
export function PaywallTeaser({ style, message, communityCta, reason }: Props) {
  return (
    <PaywallOverlay
      style={style}
      allowed={false}
      reason={reason ?? "anonymous_denied"}
      audience="anonymous"
      message={message}
      communityCta={communityCta}
      compact
    />
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  buildOfferTrackedLinkUrl,
  ensureTierDefaultTrackedLink,
  type TierPromotionDefaultRecord
} from "@/lib/relay-api";
import {
  downloadDataUrl,
  offerTrackedLinkQrDataUrl
} from "@/lib/offer-tracked-link-qr";

type Props = {
  creatorId: string;
  rule: TierPromotionDefaultRecord;
  studioWriteBlocked?: boolean;
  onSlugMinted?: (slug: string) => void;
};

/**
 * Tracked link + QR for creator tier-promotion defaults (parity with OfferTrackedLinkPanel).
 */
export default function TierDefaultTrackedLinkPanel({
  creatorId,
  rule,
  studioWriteBlocked = false,
  onSlugMinted
}: Props) {
  const [slug, setSlug] = useState(rule.redirect_slug ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSlug(rule.redirect_slug ?? null);
  }, [rule.id, rule.redirect_slug]);

  const destinationOk = Boolean(rule.patreon_destination_url?.trim());
  const redirectReady = Boolean(rule.active && destinationOk);
  const trackedUrl = slug ? buildOfferTrackedLinkUrl(slug) : null;

  const mint = async () => {
    if (studioWriteBlocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await ensureTierDefaultTrackedLink({
        creatorId,
        defaultId: rule.id
      });
      setSlug(out.redirect_slug);
      onSlugMinted?.(out.redirect_slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!trackedUrl) return;
    try {
      await navigator.clipboard.writeText(trackedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy link.");
    }
  };

  const downloadQr = async (format: "png" | "svg") => {
    if (!trackedUrl) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await offerTrackedLinkQrDataUrl(trackedUrl, format);
      downloadDataUrl(dataUrl, `tier-default-link-${slug}.${format}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-1.5" data-tier-default-tracked-link>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--relay-fg-muted)]">
        Tracked link &amp; QR
      </p>
      {!redirectReady ? (
        <p className="text-[10px] leading-relaxed text-amber-200/90">
          {!rule.active
            ? "Rule is inactive — redirects return gone until reactivated."
            : "Add a Patreon destination URL before sharing the link."}
        </p>
      ) : null}
      {trackedUrl ? (
        <div className="space-y-1.5">
          <p className="break-all font-mono text-[10px] text-[var(--relay-green-400)]">
            {trackedUrl}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="rounded-lg border border-[var(--relay-border)] px-2 py-1 text-[10px] text-[var(--relay-green-400)]"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadQr("png")}
              className="rounded-lg border border-[var(--relay-border)] px-2 py-1 text-[10px] text-[var(--relay-green-400)] disabled:opacity-40"
            >
              QR PNG
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadQr("svg")}
              className="rounded-lg border border-[var(--relay-border)] px-2 py-1 text-[10px] text-[var(--relay-green-400)] disabled:opacity-40"
            >
              QR SVG
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={studioWriteBlocked || busy || !redirectReady}
          onClick={() => void mint()}
          className="rounded-lg border border-[var(--relay-border)] px-2.5 py-1.5 text-[10px] text-[var(--relay-green-400)] disabled:opacity-40"
        >
          {busy ? "Minting…" : "Mint tracked link"}
        </button>
      )}
      {error ? (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-2 py-1 text-[10px] text-red-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}

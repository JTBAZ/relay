"use client";

import { useEffect, useState } from "react";
import {
  buildOfferTrackedLinkUrl,
  ensureOfferTrackedLink,
  type PostMarketingOfferRecord
} from "@/lib/relay-api";
import {
  downloadDataUrl,
  offerTrackedLinkQrDataUrl
} from "@/lib/offer-tracked-link-qr";

type Props = {
  creatorId: string;
  postId: string;
  offer: PostMarketingOfferRecord | null;
  studioWriteBlocked: boolean;
};

export default function OfferTrackedLinkPanel({
  creatorId,
  postId,
  offer,
  studioWriteBlocked
}: Props) {
  const [slug, setSlug] = useState(offer?.redirect_slug ?? null);

  useEffect(() => {
    setSlug(offer?.redirect_slug ?? null);
  }, [offer?.id, offer?.redirect_slug]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const destinationOk = Boolean(offer?.patreon_destination_url?.trim());
  const redirectReady = Boolean(offer?.active && destinationOk);
  const trackedUrl = slug ? buildOfferTrackedLinkUrl(slug) : null;

  const mint = async () => {
    if (!offer || studioWriteBlocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await ensureOfferTrackedLink({
        creatorId,
        postId,
        offerId: offer.id
      });
      setSlug(out.redirect_slug);
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
      downloadDataUrl(dataUrl, `offer-link-${slug}.${format}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!offer) {
    return (
      <p className="px-3 text-[10px] text-[#555]">
        Save an offer for this persona to mint a tracked link.
      </p>
    );
  }

  return (
    <div className="space-y-2 px-3" data-offer-tracked-link-panel>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#555]">
        Tracked link &amp; QR
      </p>
      {!redirectReady ? (
        <p className="text-[10px] leading-relaxed text-amber-200/90">
          {!offer.active
            ? "Offer is inactive — redirects return gone until reactivated."
            : "Add a Patreon destination URL on this offer before sharing the link."}
        </p>
      ) : null}
      {trackedUrl ? (
        <div className="space-y-1.5">
          <p className="break-all font-mono text-[10px] text-[#9bf0c4]">{trackedUrl}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="rounded-lg border border-[#2a302d] px-2 py-1 text-[10px] text-[#9bf0c4]"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadQr("png")}
              className="rounded-lg border border-[#2a302d] px-2 py-1 text-[10px] text-[#9bf0c4] disabled:opacity-40"
            >
              QR PNG
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadQr("svg")}
              className="rounded-lg border border-[#2a302d] px-2 py-1 text-[10px] text-[#9bf0c4] disabled:opacity-40"
            >
              QR SVG
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={studioWriteBlocked || busy}
          onClick={() => void mint()}
          className="rounded-lg border border-[#2a302d] px-2.5 py-1.5 text-[10px] text-[#9bf0c4] disabled:opacity-40"
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

"use client";

import Link from "next/link";
import { useState } from "react";
import { Coins, X } from "lucide-react";
import {
  RelayApiError,
  createTipReveal,
  fetchTipsWallet,
  type TipGatedDiscoverItem
} from "@/lib/relay-api";
import { RELAY_API_BASE } from "@/lib/relay-api";
import { isPaidFanPlanId } from "@/lib/fan-plans";

export type TipRevealModalProps = {
  open: boolean;
  item: TipGatedDiscoverItem | null;
  offer?: { headline: string; cta_text: string; slug: string } | null;
  surface?: "discover" | "artist_page";
  onClose: () => void;
  onRevealed?: (result: { reveal_id: string; expires_at: string; media_ids: string[] }) => void;
};

type InsufficientTipsState = {
  paidFan: boolean;
};

/**
 * Confirm Tip spend → reveal media window. MB-10 disclosure: "$0.33 goes to [artist]".
 * MB-15B: insufficient Tips routes to /plans (Compare or Reload) instead of a dead end.
 */
export function TipRevealModal({
  open,
  item,
  offer,
  surface = "discover",
  onClose,
  onRevealed
}: TipRevealModalProps): React.ReactElement | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<InsufficientTipsState | null>(null);
  const [revealed, setRevealed] = useState<{
    expires_at: string;
    media_ids: string[];
  } | null>(null);

  if (!open || !item) return null;

  const thumbSrc =
    item.blur_thumb_url != null
      ? item.blur_thumb_url.startsWith("http")
        ? item.blur_thumb_url
        : `${RELAY_API_BASE}${item.blur_thumb_url}`
      : null;

  const spend = async () => {
    setBusy(true);
    setError(null);
    setInsufficient(null);
    try {
      const result = await createTipReveal({
        post_id: item.post_id,
        surface
      });
      setRevealed({
        expires_at: result.expires_at,
        media_ids: result.media.media_ids
      });
      window.dispatchEvent(new Event("relay-tips-wallet"));
      onRevealed?.({
        reveal_id: result.reveal_id,
        expires_at: result.expires_at,
        media_ids: result.media.media_ids
      });
    } catch (err) {
      if (err instanceof RelayApiError && err.status === 402) {
        let paidFan = false;
        try {
          const wallet = await fetchTipsWallet();
          paidFan = isPaidFanPlanId(wallet.plan);
        } catch {
          paidFan = false;
        }
        setInsufficient({ paidFan });
        setError(
          paidFan
            ? "Not enough Tips. Get more Tips to unlock this piece."
            : "Not enough Tips. Compare plans for a monthly Tip allowance."
        );
      } else if (err instanceof RelayApiError && err.status === 409) {
        setError("This piece isn’t available for Tips right now.");
      } else {
        setError(err instanceof Error ? err.message : "Reveal failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const plansHref = insufficient?.paidFan
    ? "/plans?from=tip_reveal#reload"
    : "/plans?from=tip_reveal";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reveal with a Tip"
      data-testid="tip-reveal-modal"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-[#222] bg-[#141414] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-[#888] hover:bg-[#1f1f1f] hover:text-white"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <div className="relative aspect-[4/3] overflow-hidden bg-[#0a0a0a]">
          {thumbSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- tip blur preview
            <img
              src={thumbSrc}
              alt=""
              className={`h-full w-full object-cover ${revealed ? "" : "scale-105 blur-md"}`}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[#555]">
              Preview
            </div>
          )}
          {!revealed ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40"
              style={{ backdropFilter: "blur(2px)" }}
            >
              <Coins className="h-6 w-6 text-[#9bf0c4]" aria-hidden />
              <p className="text-sm font-medium text-white">Reveal for {item.tip_cost} Tip</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 p-4">
          {revealed ? (
            <>
              <p className="text-sm text-[#E0E0E0]" data-testid="tip-reveal-open-copy">
                Open for 14 days — until{" "}
                {new Date(revealed.expires_at).toLocaleDateString()}
              </p>
              {revealed.media_ids[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${RELAY_API_BASE}/api/v1/export/media/${encodeURIComponent(item.creator_id)}/${encodeURIComponent(revealed.media_ids[0])}/content`}
                  alt=""
                  className="max-h-64 w-full rounded-md object-contain"
                  data-testid="tip-reveal-media"
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-[#E0E0E0]">
                Spend {item.tip_cost} Tip to unlock this piece for a limited window.
              </p>
              <p className="text-[11px] text-[#888]" data-testid="tip-reveal-disclosure">
                $0.33 goes to{" "}
                {item.creator_display_name?.trim() || "this artist"}
              </p>
              <button
                type="button"
                data-testid="tip-reveal-confirm"
                disabled={busy}
                onClick={() => void spend()}
                className="w-full rounded-md bg-[#2D6A4F] px-3 py-2 text-sm font-medium text-white hover:bg-[#40916C] disabled:opacity-50"
              >
                {busy ? "Revealing…" : `Reveal · ${item.tip_cost} Tip`}
              </button>
            </>
          )}

          {offer ? (
            <a
              href={`/go/${encodeURIComponent(offer.slug)}`}
              className="block rounded-md border border-[#1B4332] bg-[#0D1F17] px-3 py-2 text-center text-sm text-[#9bf0c4] hover:border-[#2D6A4F]"
              data-testid="tip-reveal-offer-cta"
            >
              {offer.headline || offer.cta_text}
            </a>
          ) : null}

          {error ? (
            <div className="space-y-2" data-testid="tip-reveal-insufficient">
              <p className="text-xs text-red-400" role="alert" data-testid="tip-reveal-error">
                {error}
              </p>
              {insufficient ? (
                <Link
                  href={plansHref}
                  data-testid={
                    insufficient.paidFan
                      ? "tip-reveal-reload-cta"
                      : "tip-reveal-compare-plans-cta"
                  }
                  className="inline-flex h-7 items-center rounded-md bg-[#2D6A4F] px-3 text-xs font-medium text-white outline-none transition-colors hover:bg-[#40916C] focus-visible:ring-2 focus-visible:ring-[#00AA6F]/40"
                >
                  {insufficient.paidFan ? "Get more Tips" : "Compare plans"}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export type TipBlurredTileProps = {
  item: TipGatedDiscoverItem;
  onSelect: (item: TipGatedDiscoverItem) => void;
};

export function TipBlurredTile({ item, onSelect }: TipBlurredTileProps): React.ReactElement {
  const thumbSrc =
    item.blur_thumb_url != null
      ? item.blur_thumb_url.startsWith("http")
        ? item.blur_thumb_url
        : `${RELAY_API_BASE}${item.blur_thumb_url}`
      : null;
  const tipAgain = item.tip_again === true;

  return (
    <button
      type="button"
      data-testid={`tip-blurred-tile-${item.post_id}`}
      data-tip-again={tipAgain ? "1" : "0"}
      onClick={() => onSelect(item)}
      className="group relative overflow-hidden rounded-lg border border-[#1F1F1F] bg-[#141414] text-left transition-colors hover:border-[#2D6A4F]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#0a0a0a]">
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt=""
            className="h-full w-full scale-110 object-cover blur-md brightness-75 transition group-hover:brightness-90"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-[#555]">
            {tipAgain ? "Tip again" : "Tip to reveal"}
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35">
          <Coins className="h-5 w-5 text-[#9bf0c4]" aria-hidden />
          <span className="text-xs font-medium text-white">
            {tipAgain ? "Tip again to re-open" : "1 Tip"}
          </span>
        </div>
      </div>
      <div className="p-2.5">
        <p className="truncate text-[11px] text-[#888]">
          {item.creator_display_name?.trim() || item.creator_id}
        </p>
      </div>
    </button>
  );
}

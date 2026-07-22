"use client";

import { useEffect, useRef, useState } from "react";

export type MediaAttachReceiptData = {
  eventId: string;
  scheduledLabel: string;
  platformCount: number;
  remind: boolean;
};

type MediaAttachReceiptProps = {
  receipt: MediaAttachReceiptData;
  onAddPostDetails: () => void;
  onDismiss: () => void;
};

const DISMISS_MS = 7000;

export function MediaAttachReceipt({
  receipt,
  onAddPostDetails,
  onDismiss,
}: MediaAttachReceiptProps) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(DISMISS_MS);
  const startedRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const clear = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (paused) {
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedRef.current)
      );
      clear();
      return clear;
    }

    startedRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, remainingRef.current);

    return clear;
  }, [paused, onDismiss, receipt.eventId]);

  const platformPhrase =
    receipt.platformCount === 1
      ? "1 platform"
      : `${receipt.platformCount} platforms`;

  return (
    <div
      role="status"
      data-testid="media-attach-receipt"
      className="pointer-events-auto absolute bottom-3 left-2 right-2 z-[80] animate-popover-in rounded-xl border border-[#2a3a32] bg-[#0e100f]/96 px-3 py-2.5 shadow-xl shadow-black/50 ring-1 ring-white/5 backdrop-blur-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <p className="text-[12px] font-medium leading-snug text-[#edf2ef]">
        Post scheduled for {receipt.scheduledLabel}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-[#888]">
        Media attached for {platformPhrase}.
        {receipt.remind ? " Relay will remind you." : ""}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-[#9bf0c4] px-2.5 py-1 text-[11px] font-medium text-[#0a100c] transition-transform active:scale-[0.98]"
          onClick={onAddPostDetails}
        >
          Add post details
        </button>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-[11px] text-[#888] hover:text-[#ccc]"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

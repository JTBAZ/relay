"use client";

import type { ReactNode } from "react";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { useState } from "react";

interface ErrorBannerProps {
  message?: string;
  /** Called when user clicks Retry (e.g. refetch live feed). */
  onRetry?: () => void;
  /** Optional primary action (e.g. link to Patreon connect). */
  actionSlot?: ReactNode;
}

export function ErrorBanner({
  message = "We couldn't load the latest posts.",
  onRetry,
  actionSlot,
}: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-[#2A2A2A] bg-[#111111] px-4 py-3 text-sm"
      role="alert"
    >
      <AlertCircle
        size={15}
        className="mt-0.5 shrink-0 text-[#6B7280]"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 leading-relaxed text-[#9CA3AF]">{message}</span>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {actionSlot}
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className="flex items-center gap-1.5 text-xs text-[#2D6A4F] transition-colors hover:text-[#40916C]"
            aria-label="Retry"
          >
            <RefreshCw size={13} aria-hidden="true" />
            Retry
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded p-0.5 text-[#5A5A5A] hover:bg-[#1a1a1a] hover:text-[#9CA3AF]"
          aria-label="Dismiss"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

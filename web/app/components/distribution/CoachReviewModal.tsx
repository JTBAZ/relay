"use client";

/**
 * Shared overlay shell for Relay Coach Attack Review
 * (gather → findings → per-platform copy). Matches path-picker modal chrome.
 */

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export type CoachReviewModalProps = {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  onClose: () => void;
  /** Wider for copy review editors. */
  size?: "md" | "lg";
};

export function CoachReviewModal({
  title,
  subtitle,
  children,
  onClose,
  size = "md"
}: CoachReviewModalProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[rgba(0,0,0,0.82)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="coach-review-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          size === "lg" ? "max-w-xl" : "max-w-md"
        }`}
        style={{
          borderColor: "rgba(0,170,111,0.22)",
          background:
            "linear-gradient(165deg, rgba(14,22,18,0.98) 0%, #0a0a0a 42%, #080808 100%)"
        }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9bf0c4]">
                Relay Coach
              </p>
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#f9fafb]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-[12px] leading-snug text-[#9ca3af]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6b7280] transition-colors hover:text-[#f9fafb]"
            aria-label="Close Coach"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

"use client"

import { useState } from "react"
import { Send, ShieldAlert, AlertTriangle, ChevronRight } from "lucide-react"

interface PreflightFooterProps {
  canPublish: boolean
  blockerCount: number
  warningCount: number
  scheduledAt: string | null
}

export function PreflightFooter({
  canPublish,
  blockerCount,
  warningCount,
  scheduledAt,
}: PreflightFooterProps) {
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished]   = useState(false)

  function handlePublish() {
    if (!canPublish || publishing || published) return
    setPublishing(true)
    // Mock async publish
    setTimeout(() => {
      setPublishing(false)
      setPublished(true)
    }, 1800)
  }

  return (
    <div className="sticky bottom-0 border-t border-[var(--relay-border)] bg-[var(--relay-surface-1)]/95 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-6 py-4">

        {/* Blocker banner */}
        {!canPublish && (
          <div className="mb-3 flex items-start gap-2.5 rounded-md border border-[var(--relay-blocker-border)] bg-[var(--relay-blocker-bg)] px-4 py-3">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-[var(--relay-blocker)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[var(--relay-blocker)]">
                {blockerCount} blocker{blockerCount > 1 ? "s" : ""} must be resolved before publishing.
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--relay-fg-muted)]">
                Blockers prevent distribution. Fix all issues above to enable the Publish button.
              </p>
            </div>
          </div>
        )}

        {/* Warning notice (only when no blockers) */}
        {canPublish && warningCount > 0 && (
          <div className="mb-3 flex items-start gap-2.5 rounded-md border border-[var(--relay-warning-border)] bg-[var(--relay-warning-bg)] px-4 py-3">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--relay-warning)]" aria-hidden="true" />
            <p className="text-[12px] text-[var(--relay-fg-muted)]">
              <span className="font-semibold text-[var(--relay-warning)]">{warningCount} warning{warningCount > 1 ? "s" : ""}</span>
              {" "}won&apos;t block publishing, but may reduce reach or subscriber experience. Review before proceeding.
            </p>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-[12px] text-[var(--relay-fg-subtle)]">
            {published ? (
              <span className="text-[var(--relay-pass)] font-medium">Post queued for delivery.</span>
            ) : scheduledAt ? (
              <>Scheduled for <span className="text-[var(--relay-fg-muted)]">{scheduledAt}</span></>
            ) : (
              "Will publish immediately."
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Back to editor */}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--relay-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--relay-fg-muted)] hover:border-[var(--relay-border-hi)] hover:text-[var(--relay-fg)] transition-colors"
            >
              <ChevronRight size={13} className="rotate-180" aria-hidden="true" />
              Back to editor
            </button>

            {/* Primary publish CTA */}
            <button
              type="button"
              onClick={handlePublish}
              disabled={!canPublish || publishing || published}
              aria-disabled={!canPublish || publishing || published}
              className={[
                "inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                published
                  ? "bg-[var(--relay-green-800)] text-[var(--relay-green-200)] cursor-default"
                  : canPublish
                  ? "bg-[var(--relay-green-600)] text-white hover:bg-[var(--relay-green-400)] active:scale-[0.98] shadow-[0_0_0_1px_var(--relay-green-800)]"
                  : "bg-[var(--relay-surface-3)] text-[var(--relay-fg-subtle)] cursor-not-allowed opacity-50",
              ].join(" ")}
            >
              {publishing ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
                  Publishing…
                </>
              ) : published ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-[var(--relay-pass)]" aria-hidden="true" />
                  Queued
                </>
              ) : (
                <>
                  <Send size={13} aria-hidden="true" />
                  {scheduledAt ? "Schedule Post" : "Publish Now"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

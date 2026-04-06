"use client"

import { FileText, ChevronRight, Clock } from "lucide-react"
import type { PreflightRelease } from "@/lib/preflight-data"

interface PreflightHeaderProps {
  release: PreflightRelease
  blockerCount: number
  warningCount: number
  passingCount: number
  total: number
}

export function PreflightHeader({
  release,
  blockerCount,
  warningCount,
  passingCount,
  total,
}: PreflightHeaderProps) {
  return (
    <div className="border-b border-[var(--relay-border)] bg-[var(--relay-surface-1)]">
      <div className="max-w-4xl mx-auto px-6 py-5">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 mb-4 text-xs text-[var(--relay-fg-subtle)]">
          <span className="text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)] cursor-pointer transition-colors">Library</span>
          <ChevronRight size={12} className="opacity-40" />
          <span className="text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)] cursor-pointer transition-colors">Editor</span>
          <ChevronRight size={12} className="opacity-40" />
          <span className="text-[var(--relay-fg)]">Publish Review</span>
        </nav>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--relay-surface-2)] border border-[var(--relay-border)]">
              <FileText size={16} className="text-[var(--relay-fg-muted)]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--relay-fg)] text-balance leading-snug">
                {release.title}
              </h1>
              <div className="flex items-center flex-wrap gap-2 mt-1">
                <span className="inline-flex items-center rounded-full border border-[var(--relay-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--relay-fg-muted)]">
                  {release.type}
                </span>
                <span className="inline-flex items-center rounded-full bg-[var(--relay-green-950)] border border-[var(--relay-green-800)] px-2 py-0.5 text-[11px] font-medium text-[var(--relay-green-200)]">
                  {release.tier}
                </span>
                {release.scheduledAt && (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--relay-fg-subtle)]">
                    <Clock size={11} className="opacity-60" />
                    {release.scheduledAt}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Score strip */}
          <div className="flex items-center gap-1 text-xs shrink-0 self-start mt-0.5">
            {blockerCount > 0 && (
              <ScorePill value={blockerCount} label="blocker" color="blocker" />
            )}
            {warningCount > 0 && (
              <ScorePill value={warningCount} label="warning" color="warning" />
            )}
            <ScorePill value={passingCount} label={`of ${total} pass`} color="pass" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ScorePill({
  value,
  label,
  color,
}: {
  value: number
  label: string
  color: "blocker" | "warning" | "pass"
}) {
  const styles: Record<typeof color, string> = {
    blocker: "bg-[var(--relay-blocker-bg)] border-[var(--relay-blocker-border)] text-[var(--relay-blocker)]",
    warning: "bg-[var(--relay-warning-bg)] border-[var(--relay-warning-border)] text-[var(--relay-warning)]",
    pass:    "bg-[var(--relay-pass-bg)]    border-[var(--relay-pass-border)]    text-[var(--relay-pass)]",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono font-semibold ${styles[color]}`}>
      {value}
      <span className="font-sans font-normal opacity-80">{label}{value !== 1 && color !== "pass" ? "s" : ""}</span>
    </span>
  )
}

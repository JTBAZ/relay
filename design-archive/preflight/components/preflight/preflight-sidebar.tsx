"use client"

import { CheckCircle2, XCircle, AlertTriangle, Info, RefreshCw } from "lucide-react"

interface PreflightSidebarProps {
  blockerCount: number
  warningCount: number
  passingCount: number
  infoCount: number
  total: number
  canPublish: boolean
  onRerun?: () => void
}

export function PreflightSidebar({
  blockerCount,
  warningCount,
  passingCount,
  infoCount,
  total,
  canPublish,
  onRerun,
}: PreflightSidebarProps) {
  const passPercent = Math.round((passingCount / total) * 100)

  return (
    <aside
      aria-label="Preflight summary"
      className="w-64 shrink-0 rounded-lg border border-[var(--relay-border)] bg-[var(--relay-surface-2)] p-5 self-start sticky top-6"
    >
      {/* Status headline */}
      <div className="mb-4">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
            canPublish
              ? "border-[var(--relay-pass-border)] bg-[var(--relay-pass-bg)] text-[var(--relay-pass)]"
              : "border-[var(--relay-blocker-border)] bg-[var(--relay-blocker-bg)] text-[var(--relay-blocker)]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${canPublish ? "bg-[var(--relay-pass)]" : "bg-[var(--relay-blocker)]"}`}
            aria-hidden="true"
          />
          {canPublish ? "Ready to publish" : "Blocked"}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-[var(--relay-fg-subtle)] uppercase tracking-wide">
            Checks passing
          </span>
          <span className="text-[11px] font-mono text-[var(--relay-fg-muted)]">
            {passingCount}/{total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--relay-surface-1)]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${passPercent}%`,
              background: canPublish
                ? "var(--relay-green-600)"
                : "var(--relay-blocker)",
            }}
            role="progressbar"
            aria-valuenow={passingCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`${passingCount} of ${total} checks passing`}
          />
        </div>
      </div>

      {/* Count rows */}
      <div className="flex flex-col gap-2">
        <CountRow
          icon={XCircle}
          iconClass="text-[var(--relay-blocker)]"
          label="Blockers"
          value={blockerCount}
          active={blockerCount > 0}
          activeClass="text-[var(--relay-blocker)]"
        />
        <CountRow
          icon={AlertTriangle}
          iconClass="text-[var(--relay-warning)]"
          label="Warnings"
          value={warningCount}
          active={warningCount > 0}
          activeClass="text-[var(--relay-warning)]"
        />
        <CountRow
          icon={CheckCircle2}
          iconClass="text-[var(--relay-pass)]"
          label="Passing"
          value={passingCount}
          active={false}
          activeClass="text-[var(--relay-pass)]"
        />
        <CountRow
          icon={Info}
          iconClass="text-[var(--relay-info)]"
          label="Informational"
          value={infoCount}
          active={false}
          activeClass="text-[var(--relay-info)]"
        />
      </div>

      <div className="mt-5 border-t border-[var(--relay-border)] pt-4">
        <button
          type="button"
          onClick={onRerun}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--relay-border)] bg-transparent py-2 text-[12px] font-medium text-[var(--relay-fg-muted)] hover:border-[var(--relay-border-hi)] hover:text-[var(--relay-fg)] transition-colors"
        >
          <RefreshCw size={12} aria-hidden="true" />
          Re-run checks
        </button>
      </div>
    </aside>
  )
}

function CountRow({
  icon: Icon,
  iconClass,
  label,
  value,
  active,
  activeClass,
}: {
  icon: React.ElementType
  iconClass: string
  label: string
  value: number
  active: boolean
  activeClass: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={13} className={iconClass} aria-hidden="true" />
        <span className="text-[12px] text-[var(--relay-fg-muted)]">{label}</span>
      </div>
      <span
        className={`font-mono text-[12px] font-semibold ${
          active ? activeClass : "text-[var(--relay-fg-subtle)]"
        }`}
      >
        {value}
      </span>
    </div>
  )
}

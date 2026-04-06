"use client"

import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ArrowRight,
} from "lucide-react"
import type { PreflightCheck, Severity } from "@/lib/preflight-data"

interface CheckRowProps {
  check: PreflightCheck
}

const severityConfig: Record<
  Severity,
  {
    icon: React.ElementType
    iconClass: string
    rowClass: string
    badgeClass: string
    badgeLabel: string
    dotClass: string
  }
> = {
  blocker: {
    icon: XCircle,
    iconClass: "text-[var(--relay-blocker)]",
    rowClass:
      "border border-[var(--relay-blocker-border)] bg-[var(--relay-blocker-bg)]",
    badgeClass:
      "bg-[var(--relay-blocker-bg)] border border-[var(--relay-blocker-border)] text-[var(--relay-blocker)]",
    badgeLabel: "Blocker",
    dotClass: "bg-[var(--relay-blocker)]",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-[var(--relay-warning)]",
    rowClass:
      "border border-[var(--relay-warning-border)] bg-[var(--relay-warning-bg)]",
    badgeClass:
      "bg-[var(--relay-warning-bg)] border border-[var(--relay-warning-border)] text-[var(--relay-warning)]",
    badgeLabel: "Warning",
    dotClass: "bg-[var(--relay-warning)]",
  },
  pass: {
    icon: CheckCircle2,
    iconClass: "text-[var(--relay-pass)]",
    rowClass:
      "border border-[var(--relay-border)] bg-[var(--relay-surface-2)]",
    badgeClass:
      "bg-[var(--relay-pass-bg)] border border-[var(--relay-pass-border)] text-[var(--relay-pass)]",
    badgeLabel: "Pass",
    dotClass: "bg-[var(--relay-pass)]",
  },
  info: {
    icon: Info,
    iconClass: "text-[var(--relay-info)]",
    rowClass:
      "border border-[var(--relay-border)] bg-[var(--relay-surface-2)]",
    badgeClass:
      "bg-[var(--relay-info-bg)] border border-[var(--relay-info-border)] text-[var(--relay-info)]",
    badgeLabel: "Info",
    dotClass: "bg-[var(--relay-info)]",
  },
}

export function CheckRow({ check }: CheckRowProps) {
  // For passed checks, always show the pass config regardless of stored severity
  const effectiveSeverity: Severity =
    check.status === "pass" ? "pass" : check.severity

  const cfg = severityConfig[effectiveSeverity]
  const Icon = cfg.icon

  return (
    <div
      className={`flex items-start gap-3 rounded-md px-4 py-3 transition-colors ${cfg.rowClass}`}
      role="listitem"
    >
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        <Icon size={15} className={cfg.iconClass} aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[var(--relay-fg)] leading-5">
            {check.label}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${cfg.badgeClass}`}
            aria-label={`Severity: ${cfg.badgeLabel}`}
          >
            {cfg.badgeLabel}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--relay-fg-muted)]">
          {check.detail}
        </p>
      </div>

      {/* Action */}
      {check.actionLabel && check.status === "fail" && (
        <a
          href={check.actionHref ?? "#"}
          className="shrink-0 mt-0.5 flex items-center gap-1 text-[12px] font-medium text-[var(--relay-green-400)] hover:text-[var(--relay-green-200)] transition-colors whitespace-nowrap"
          aria-label={`${check.actionLabel} for ${check.label}`}
        >
          {check.actionLabel}
          <ArrowRight size={11} />
        </a>
      )}
    </div>
  )
}

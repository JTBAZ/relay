"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import type { PreflightGroup } from "@/lib/preflight-data"
import { CheckRow } from "./check-row"

interface PreflightSectionProps {
  group: PreflightGroup
  defaultOpen?: boolean
}

export function PreflightSection({
  group,
  defaultOpen = true,
}: PreflightSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  const failCount  = group.checks.filter((c) => c.status === "fail").length
  const blockCount = group.checks.filter((c) => c.severity === "blocker" && c.status === "fail").length
  const warnCount  = group.checks.filter((c) => c.severity === "warning" && c.status === "fail").length

  return (
    <section aria-labelledby={`section-${group.id}`}>
      {/* Section header */}
      <button
        id={`section-${group.id}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-1 py-2 text-left group"
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold uppercase tracking-widest text-[var(--relay-fg-subtle)]">
            {group.name}
          </span>
          {/* Inline severity counts */}
          {blockCount > 0 && (
            <Dot color="blocker" label={`${blockCount} blocker${blockCount > 1 ? "s" : ""}`} />
          )}
          {warnCount > 0 && (
            <Dot color="warning" label={`${warnCount} warning${warnCount > 1 ? "s" : ""}`} />
          )}
          {failCount === 0 && (
            <Dot color="pass" label="All clear" />
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-[var(--relay-fg-subtle)] transition-transform duration-200 group-hover:text-[var(--relay-fg-muted)] ${open ? "rotate-0" : "-rotate-90"}`}
          aria-hidden="true"
        />
      </button>

      {/* Checks list */}
      {open && (
        <div role="list" className="flex flex-col gap-2 pb-2">
          {group.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      )}
    </section>
  )
}

function Dot({
  color,
  label,
}: {
  color: "blocker" | "warning" | "pass"
  label: string
}) {
  const styles: Record<typeof color, string> = {
    blocker: "text-[var(--relay-blocker)]",
    warning: "text-[var(--relay-warning)]",
    pass:    "text-[var(--relay-pass)]",
  }
  return (
    <span className={`text-[11px] font-medium ${styles[color]}`}>
      {label}
    </span>
  )
}

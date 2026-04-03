"use client"

import { useMemo, useEffect, useRef } from "react"
import { X, PieChart as PieChartIcon } from "lucide-react"
import type { MediaItem } from "./media-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface GalleryStatsPopoverProps {
  isOpen: boolean
  onClose: () => void
  items: MediaItem[]
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

export function GalleryStatsDrawer({ isOpen, onClose, items, anchorRef }: GalleryStatsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  const stats = useMemo(() => {
    const matureCount = items.filter(i => i.isMature).length
    const generalCount = items.length - matureCount

    const tierCounts: Record<string, number> = {}
    const tagCounts: Record<string, number> = {}

    items.forEach(item => {
      tierCounts[item.tier] = (tierCounts[item.tier] || 0) + 1
      item.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      })
    })

    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)

    return { total: items.length, matureCount, generalCount, tierCounts, sortedTags }
  }, [items])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handle(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [isOpen, onClose, anchorRef])

  if (!isOpen) return null

  const tierColors: Record<string, string> = {
    "Tier 1": "#00ffb4",
    "Tier 2": "#00d4a0",
    "Tier 3": "#00a882",
    "Tier 4": "#007d64",
  }

  const tierEntries = Object.entries(stats.tierCounts)
  const tierTotal = tierEntries.reduce((sum, [, c]) => sum + c, 0)
  let cumulative = 0

  return (
    <div
      ref={popoverRef}
      className={cn(
        "absolute left-2 z-50 w-72 bg-card border border-border rounded-lg shadow-2xl flex flex-col",
        "top-[calc(2.5rem+2px)]" // sits just below the grid header bar
      )}
      style={{ maxHeight: "420px" }}
    >
      {/* Header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-[11px] font-semibold tracking-wide text-foreground uppercase">Gallery Statistics</span>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Total */}
          <div className="flex items-baseline gap-2 px-1">
            <span className="text-2xl font-bold tabular-nums text-foreground" suppressHydrationWarning>
              {stats.total.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">total assets</span>
          </div>

          {/* Content Rating */}
          <section>
            <h4 className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Content Rating
            </h4>
            <div className="space-y-1.5">
              <StatBar label="General" count={stats.generalCount} total={stats.total} color="#00ffb4" />
              <StatBar label="Mature 18+" count={stats.matureCount} total={stats.total} color="#ef4444" />
            </div>
          </section>

          {/* Tier Distribution */}
          <section>
            <h4 className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Tier Distribution
            </h4>

            {/* Pie chart + legend inline */}
            <div className="flex items-center gap-3 mb-2">
              <div className="relative w-16 h-16 shrink-0">
                <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
                  {tierEntries.map(([tier, count]) => {
                    const pct = (count / tierTotal) * 100
                    const offset = -cumulative
                    cumulative += pct
                    return (
                      <circle
                        key={tier}
                        r="14"
                        cx="16"
                        cy="16"
                        fill="transparent"
                        stroke={tierColors[tier] || "#666"}
                        strokeWidth="4"
                        strokeDasharray={`${(count / tierTotal) * 87.96} 87.96`}
                        strokeDashoffset={offset * 0.8796}
                      />
                    )
                  })}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <PieChartIcon className="w-4 h-4 text-muted-foreground/20" />
                </div>
              </div>

              <div className="flex-1 space-y-1">
                {tierEntries.map(([tier, count]) => (
                  <div key={tier} className="flex items-center gap-1.5 text-[11px]">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tierColors[tier] || "#666" }} />
                    <span className="text-muted-foreground flex-1">{tier}</span>
                    <span className="tabular-nums text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              {tierEntries.map(([tier, count]) => (
                <StatBar key={tier} label={tier} count={count} total={stats.total} color={tierColors[tier] || "#666"} />
              ))}
            </div>
          </section>

          {/* Tags */}
          <section>
            <h4 className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Most Common Tags
            </h4>
            <div className="space-y-1.5">
              {stats.sortedTags.map(([tag, count], i) => (
                <div key={tag} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-16 truncate">{tag}</span>
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / stats.sortedTags[0][1]) * 100}%`,
                        backgroundColor: `oklch(0.68 0.14 ${155 + i * 12})`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-foreground tabular-nums w-5 text-right">{count}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}

function StatBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-16 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-foreground tabular-nums w-8 text-right">{count.toLocaleString()}</span>
    </div>
  )
}

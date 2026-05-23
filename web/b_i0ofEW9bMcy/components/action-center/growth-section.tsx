"use client"

import { useState } from "react"
import {
  Plus,
  Eye,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
  ExternalLink,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────
interface PromoMetric {
  visitors: number
  conversions: number
  trend: "up" | "down" | "flat"
  trendValue: number
}

interface PromoPiece {
  id: number
  rank: number
  title: string
  type: "photo" | "writing" | "audio"
  hasContent: boolean
  metrics?: PromoMetric
}

// ── Mock data ────────────────────────────────────────────────────────
const promoPieces: PromoPiece[] = [
  { id: 1, rank: 1, title: "Autumn Series No. 4",      type: "photo",   hasContent: true,
    metrics: { visitors: 1842, conversions: 12, trend: "up",   trendValue: 18 } },
  { id: 2, rank: 2, title: "On Silence & Digital...",  type: "writing", hasContent: true,
    metrics: { visitors: 1205, conversions:  9, trend: "up",   trendValue:  7 } },
  { id: 3, rank: 3, title: "Studio Ambient Vol. 2",    type: "audio",   hasContent: true,
    metrics: { visitors:  980, conversions:  6, trend: "flat", trendValue:  0 } },
  { id: 4, rank: 4, title: "Portrait Study III",       type: "photo",   hasContent: true,
    metrics: { visitors:  744, conversions:  4, trend: "up",   trendValue:  3 } },
  { id: 5, rank: 5, title: "Margins Essay",            type: "writing", hasContent: true,
    metrics: { visitors:  601, conversions:  3, trend: "down", trendValue:  5 } },
  { id: 6,  rank: 6,  title: "", type: "photo",   hasContent: false },
  { id: 7,  rank: 7,  title: "", type: "writing", hasContent: false },
  { id: 8,  rank: 8,  title: "", type: "audio",   hasContent: false },
  { id: 9,  rank: 9,  title: "", type: "photo",   hasContent: false },
  { id: 10, rank: 10, title: "", type: "writing", hasContent: false },
]

// ── Trend indicator ──────────────────────────────────────────────────
function Trend({ trend, value }: { trend: PromoMetric["trend"]; value: number }) {
  if (trend === "flat") {
    return (
      <span className="flex items-center gap-1 text-xs text-text-mute">
        <Minus className="w-3 h-3" /> 0%
      </span>
    )
  }
  const up = trend === "up"
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${up ? "text-ok" : "text-destructive"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {value}%
    </span>
  )
}

// ── Promo card ───────────────────────────────────────────────────────
function PromoCard({ piece }: { piece: PromoPiece }) {
  if (!piece.hasContent) {
    return (
      <button
        className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border h-[120px] transition-all hover:border-accent hover:bg-surface-1"
        aria-label={`Add promo, slot ${piece.rank}`}
      >
        <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center group-hover:bg-accent-soft transition-colors">
          <Plus className="w-5 h-5 text-text-lo group-hover:text-accent" />
        </div>
      </button>
    )
  }

  const m = piece.metrics!

  return (
    <div className="group flex flex-col rounded-xl bg-surface-1 border border-border p-4 h-[120px] transition-all hover:border-border-mid hover:shadow-lg cursor-pointer">
      {/* Title */}
      <p className="text-sm font-medium text-text-hi line-clamp-2 leading-snug mb-auto">
        {piece.title}
      </p>

      {/* Metrics row */}
      <div className="flex items-end justify-between pt-2 mt-2 border-t border-border">
        <div>
          <p className="text-xl font-semibold text-text-hi tabular-nums">{m.visitors.toLocaleString()}</p>
          <p className="text-[10px] text-text-lo mt-0.5">visitors</p>
        </div>
        <Trend trend={m.trend} value={m.trendValue} />
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────
export function GrowthSection() {
  const [metric] = useState<"visitors" | "conversions">("visitors")

  const totalVisitors = promoPieces.filter(p => p.hasContent).reduce((s, p) => s + (p.metrics?.visitors ?? 0), 0)
  const totalConversions = promoPieces.filter(p => p.hasContent).reduce((s, p) => s + (p.metrics?.conversions ?? 0), 0)

  return (
    <section className="space-y-6">
      {/* Header row with insights */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-hi">Promotions</h2>

        {/* Quick stats */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-1">
            <Eye className="w-4 h-4 text-accent" />
            <span className="text-lg font-semibold text-text-hi tabular-nums">{totalVisitors.toLocaleString()}</span>
            <span className="text-xs text-text-lo">visitors</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-1">
            <Users className="w-4 h-4 text-accent" />
            <span className="text-lg font-semibold text-text-hi tabular-nums">{totalConversions}</span>
            <span className="text-xs text-text-lo">conversions</span>
          </div>
        </div>
      </div>

      {/* 5x2 Promo grid */}
      <div className="grid grid-cols-5 gap-3">
        {promoPieces.map((piece) => (
          <PromoCard key={piece.id} piece={piece} />
        ))}
      </div>

      {/* Discovery tools row */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <span className="text-sm text-text-lo">Discovery settings</span>
        <div className="flex items-center gap-2">
          <a
            href="#"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-2 text-sm text-text-mid hover:bg-surface-3 transition-colors"
            data-tooltip="Choose which posts appear in patron discovery feeds"
          >
            <Settings className="w-4 h-4" />
            Manage eligibility
          </a>
          <a
            href="#"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-2 text-sm text-text-mid hover:bg-surface-3 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Preview
          </a>
        </div>
      </div>
    </section>
  )
}

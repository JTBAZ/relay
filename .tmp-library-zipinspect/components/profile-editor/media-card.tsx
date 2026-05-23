'use client'

import { Lock, Check } from 'lucide-react'

interface MediaCardProps {
  id: string
  title: string
  tier?: number
  aspectRatio: string
  isSelected: boolean
  isLocked: boolean
  onClick: (e: React.MouseEvent) => void
}

export function MediaCard({
  id,
  title,
  tier,
  aspectRatio,
  isSelected,
  isLocked,
  onClick,
}: MediaCardProps) {
  return (
    <button
      className={`group relative rounded-xl overflow-hidden bg-surface-2 transition-all text-left w-full ${
        isSelected
          ? 'ring-2 ring-select ring-offset-2 ring-offset-surface-1 scale-[0.98]'
          : 'hover:ring-1 hover:ring-border-mid'
      }`}
      onClick={onClick}
      style={{ aspectRatio }}
    >
      {/* Placeholder image with gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-3 via-surface-2 to-surface-3">
        {/* Simulated artwork texture */}
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.1),transparent_60%)]" />
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-select flex items-center justify-center z-10">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Locked overlay for tier-gated content */}
      {isLocked && (
        <div className="absolute inset-0 bg-surface-0/70 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-1">
            <Lock className="w-5 h-5 text-text-mute" />
            <span className="text-[10px] text-text-mute">Tier {tier}+</span>
          </div>
        </div>
      )}

      {/* Tier badge — visible when not locked */}
      {tier && !isLocked && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-gold-soft text-gold text-[10px] font-medium z-10">
          Tier {tier}
        </div>
      )}

      {/* Title overlay on hover */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-surface-0/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-xs font-medium text-text-hi truncate">{title}</p>
      </div>
    </button>
  )
}

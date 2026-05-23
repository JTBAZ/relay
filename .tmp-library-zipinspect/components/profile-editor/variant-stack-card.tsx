'use client'

import { Layers, Check } from 'lucide-react'

interface VariantStackCardProps {
  id: string
  title: string
  variantCount: number
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
}

export function VariantStackCard({
  id,
  title,
  variantCount,
  isSelected,
  onClick,
}: VariantStackCardProps) {
  return (
    <button
      className={`group relative rounded-xl overflow-hidden bg-surface-2 transition-all text-left w-full ${
        isSelected
          ? 'ring-2 ring-select ring-offset-2 ring-offset-surface-1 scale-[0.98]'
          : 'hover:ring-1 hover:ring-border-mid'
      }`}
      onClick={onClick}
      style={{ aspectRatio: '4/5' }}
    >
      {/* Stacked card effect — multiple layers behind */}
      <div className="absolute inset-0">
        <div className="absolute inset-1 rounded-lg bg-surface-3 transform rotate-2 translate-x-1" />
        <div className="absolute inset-0.5 rounded-lg bg-surface-3 transform -rotate-1" />
      </div>

      {/* Main card face */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-surface-3 via-surface-2 to-surface-3 z-10">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_40%_30%,rgba(255,255,255,0.12),transparent_50%)]" />
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-select flex items-center justify-center z-20">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Variant count badge */}
      <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-surface-0/80 backdrop-blur-sm border border-border flex items-center gap-1.5 z-20">
        <Layers className="w-3 h-3 text-gold" />
        <span className="text-[10px] font-medium text-text-hi">+{variantCount} variants</span>
      </div>

      {/* Title overlay */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-surface-0/90 to-transparent z-20">
        <p className="text-xs font-medium text-text-hi">{title}</p>
        <p className="text-[10px] text-text-mute mt-0.5">Variant Stack</p>
      </div>
    </button>
  )
}

'use client'

import { GripVertical, Settings, Trash2, ChevronUp, ChevronDown } from 'lucide-react'

interface SectionWrapperProps {
  id: string
  label: string
  isSelected: boolean
  onSelect: () => void
  canReorder?: boolean
  children: React.ReactNode
}

export function SectionWrapper({
  id,
  label,
  isSelected,
  onSelect,
  canReorder,
  children,
}: SectionWrapperProps) {
  return (
    <div
      className={`relative group rounded-2xl transition-all ${
        isSelected
          ? 'ring-2 ring-select ring-offset-2 ring-offset-surface-canvas'
          : 'hover:ring-1 hover:ring-border-mid hover:ring-offset-1 hover:ring-offset-surface-canvas'
      }`}
      onClick={onSelect}
    >
      {/* Section label — visible on hover or when selected */}
      <div
        className={`absolute -top-3 left-4 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider z-10 transition-opacity ${
          isSelected
            ? 'bg-select text-white opacity-100'
            : 'bg-surface-3 text-text-lo opacity-0 group-hover:opacity-100'
        }`}
      >
        {label}
      </div>

      {/* Floating toolbar — visible when selected */}
      {isSelected && (
        <div className="absolute -top-3 right-4 flex items-center gap-1 z-10">
          {canReorder && (
            <>
              <button
                className="w-7 h-7 rounded-lg bg-surface-3 border border-border-mid flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-4 transition-colors"
                onClick={e => { e.stopPropagation() }}
                data-tooltip="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                className="w-7 h-7 rounded-lg bg-surface-3 border border-border-mid flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-4 transition-colors"
                onClick={e => { e.stopPropagation() }}
                data-tooltip="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            className="w-7 h-7 rounded-lg bg-surface-3 border border-border-mid flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-4 transition-colors"
            onClick={e => { e.stopPropagation() }}
            data-tooltip="Section settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          {canReorder && (
            <button
              className="w-7 h-7 rounded-lg bg-surface-3 border border-border-mid flex items-center justify-center text-text-lo hover:text-destructive hover:bg-destructive-soft transition-colors"
              onClick={e => { e.stopPropagation() }}
              data-tooltip="Remove section"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Drag handle — left edge when selected */}
      {isSelected && canReorder && (
        <div className="absolute -left-5 top-1/2 -translate-y-1/2 cursor-grab">
          <GripVertical className="w-4 h-4 text-select" />
        </div>
      )}

      {/* Content */}
      <div className="relative">{children}</div>
    </div>
  )
}

'use client'

import { Layers, FolderPlus, Eye, EyeOff, Trash2, X } from 'lucide-react'

interface BatchActionBarProps {
  count: number
  onClear: () => void
}

export function BatchActionBar({ count, onClear }: BatchActionBarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-2 border border-border shadow-2xl shadow-surface-0/50">
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-3 border-r border-border">
          <span className="w-6 h-6 rounded-lg bg-select flex items-center justify-center text-xs font-semibold text-white">
            {count}
          </span>
          <span className="text-sm text-text-mid">selected</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gold-soft text-gold text-sm font-medium hover:bg-gold/20 transition-colors"
            data-tooltip="Create variant stack from selection"
          >
            <Layers className="w-4 h-4" />
            Stack Variants
          </button>

          <button
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-3 text-text-mid text-sm font-medium hover:text-text-hi hover:bg-surface-4 transition-colors"
            data-tooltip="Add to collection"
          >
            <FolderPlus className="w-4 h-4" />
            Add to Collection
          </button>

          <button
            className="w-9 h-9 rounded-xl bg-surface-3 flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-4 transition-colors"
            data-tooltip="Set visibility"
          >
            <Eye className="w-4 h-4" />
          </button>

          <button
            className="w-9 h-9 rounded-xl bg-surface-3 flex items-center justify-center text-text-lo hover:text-destructive hover:bg-destructive-soft transition-colors"
            data-tooltip="Remove from gallery"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Clear selection */}
        <button
          onClick={onClear}
          className="ml-2 w-8 h-8 rounded-xl flex items-center justify-center text-text-mute hover:text-text-hi hover:bg-surface-3 transition-colors"
          data-tooltip="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

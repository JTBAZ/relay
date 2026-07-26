'use client'

import { Film, Image, Music, FileText } from 'lucide-react'

export type MediaTypeValue = 'image' | 'video' | 'audio' | 'text'

const MEDIA_TYPES = [
  { id: 'image', label: 'Image', icon: Image },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'text', label: 'Text', icon: FileText },
] as const

interface MediaTypeMultiSelectProps {
  selected: MediaTypeValue[]
  onChange: (selected: MediaTypeValue[]) => void
}

export default function MediaTypeMultiSelect({
  selected,
  onChange,
}: MediaTypeMultiSelectProps) {
  const toggleType = (type: MediaTypeValue) => {
    if (selected.includes(type)) {
      onChange(selected.filter(t => t !== type))
    } else {
      onChange([...selected, type])
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {MEDIA_TYPES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => toggleType(id as MediaTypeValue)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
            selected.includes(id as MediaTypeValue)
              ? 'border-[var(--lib-primary)] bg-[var(--lib-primary)] text-[var(--lib-primary-fg)]'
              : 'border-[var(--lib-border)] bg-[var(--lib-sidebar-accent)] text-[var(--lib-fg-muted)] hover:border-[var(--lib-primary)]/50 hover:text-[var(--lib-fg)]'
          }`}
          title={label}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

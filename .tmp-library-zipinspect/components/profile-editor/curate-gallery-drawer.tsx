'use client'

import { useState, useCallback } from 'react'
import {
  X,
  ExternalLink,
  Check,
  Star,
  EyeOff,
  Layers,
  FolderOpen,
  ImageIcon,
  Lock,
  Sparkles,
  BookOpen,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type ArtworkStatus = 'shown' | 'new' | 'hidden' | 'in-stack' | 'locked'
type FilterTab = 'shown' | 'new' | 'hidden' | 'stacks' | 'collections'

interface Artwork {
  id: string
  title: string
  type: 'photo' | 'audio' | 'writing'
  status: ArtworkStatus
  tier?: string
  thumb?: string
  year?: string
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_ARTWORK: Artwork[] = [
  { id: 'a1', title: 'Autumn Series No. 4', type: 'photo', status: 'shown', year: '2024' },
  { id: 'a2', title: 'Winter Threshold', type: 'photo', status: 'shown', year: '2024' },
  { id: 'a3', title: 'Margins Essay', type: 'writing', status: 'shown', year: '2024' },
  { id: 'a4', title: 'Studio Ambient Vol. 2', type: 'audio', status: 'shown', year: '2023' },
  { id: 'a5', title: 'Portrait Study III', type: 'photo', status: 'new', year: '2024' },
  { id: 'a6', title: 'On Silence (draft)', type: 'writing', status: 'new', year: '2024' },
  { id: 'a7', title: 'Field Recording – Fog', type: 'audio', status: 'hidden', year: '2023' },
  { id: 'a8', title: 'Unfinished Series', type: 'photo', status: 'hidden', year: '2022' },
  { id: 'a9', title: 'Autumn Series (all)', type: 'photo', status: 'in-stack', year: '2024' },
  { id: 'a10', title: 'Studio Process Archive', type: 'photo', status: 'locked', tier: 'Studio' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ArtworkStatus, { label: string; className: string }> = {
  shown:    { label: 'Shown',      className: 'bg-accent/15 text-accent border-accent/30' },
  new:      { label: 'New',        className: 'bg-gold/15 text-gold border-gold/30' },
  hidden:   { label: 'Hidden',     className: 'bg-surface-3 text-text-lo border-border' },
  'in-stack': { label: 'In Stack', className: 'bg-select/15 text-select border-select/30' },
  locked:   { label: 'Locked',     className: 'bg-surface-3 text-text-lo border-border' },
}

const TYPE_ICON: Record<Artwork['type'], React.ReactNode> = {
  photo:   <ImageIcon className="w-3 h-3" />,
  audio:   <span className="text-[10px] font-mono leading-none">AU</span>,
  writing: <BookOpen className="w-3 h-3" />,
}

function ArtworkCard({
  artwork,
  selected,
  onToggle,
}: {
  artwork: Artwork
  selected: boolean
  onToggle: (id: string) => void
}) {
  const { label, className: statusClass } = STATUS_CONFIG[artwork.status]
  const isLocked = artwork.status === 'locked'

  return (
    <button
      onClick={() => onToggle(artwork.id)}
      className={`relative group flex flex-col gap-0 rounded-xl border text-left transition-all overflow-hidden ${
        selected
          ? 'border-accent ring-1 ring-accent/50 bg-surface-2'
          : 'border-border bg-surface-1 hover:border-border-strong hover:bg-surface-2'
      }`}
    >
      {/* Thumbnail area */}
      <div className="relative w-full aspect-[4/3] bg-surface-3 flex items-center justify-center overflow-hidden">
        <div className="text-text-mute">{TYPE_ICON[artwork.type]}</div>
        {/* Placeholder gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-surface-3 to-surface-4 opacity-60" />

        {/* Selection check */}
        <div className={`absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center transition-all ${
          selected ? 'bg-accent border-accent' : 'bg-surface-1/60 border-border-strong opacity-0 group-hover:opacity-100'
        }`}>
          {selected && <Check className="w-3 h-3 text-primary-foreground" />}
        </div>

        {/* Lock icon */}
        {isLocked && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded bg-surface-1/80 flex items-center justify-center">
            <Lock className="w-3 h-3 text-text-lo" />
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="px-2.5 py-2 flex flex-col gap-1.5">
        <p className="text-[12px] font-medium text-text-hi leading-tight line-clamp-1">{artwork.title}</p>
        <div className="flex items-center justify-between gap-1">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusClass}`}>
            {isLocked && artwork.tier ? artwork.tier : label}
          </span>
          {artwork.year && <span className="text-[10px] text-text-mute">{artwork.year}</span>}
        </div>
      </div>
    </button>
  )
}

// ── Batch Action Bar (drawer-internal) ────────────────────────────────────────

function DrawerBatchBar({
  count,
  onClear,
}: {
  count: number
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-5 py-3 bg-surface-2 border-t border-border">
      <span className="text-xs text-text-mid mr-1">{count} selected</span>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-primary-foreground hover:bg-accent/90 transition-colors">
        <Star className="w-3 h-3" /> Feature
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-text-mid hover:bg-surface-4 hover:text-text-hi transition-colors">
        <EyeOff className="w-3 h-3" /> Hide
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-select/15 text-select border border-select/30 hover:bg-select/25 transition-colors">
        <Layers className="w-3 h-3" /> Stack variants
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-text-mid hover:bg-surface-4 hover:text-text-hi transition-colors">
        <FolderOpen className="w-3 h-3" /> Move to collection
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-text-mid hover:bg-surface-4 hover:text-text-hi transition-colors">
        <ImageIcon className="w-3 h-3" /> Set cover
      </button>
      <button onClick={onClear} className="ml-auto text-xs text-text-mute hover:text-text-lo transition-colors">
        Clear
      </button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'shown',       label: 'Shown on Profile' },
  { key: 'new',         label: 'Newly Synced' },
  { key: 'hidden',      label: 'Hidden' },
  { key: 'stacks',      label: 'Suggested Stacks' },
  { key: 'collections', label: 'Collections' },
]

const TAB_FILTER: Record<FilterTab, (a: Artwork) => boolean> = {
  shown:       a => a.status === 'shown',
  new:         a => a.status === 'new',
  hidden:      a => a.status === 'hidden',
  stacks:      a => a.status === 'in-stack',
  collections: a => a.status === 'locked',
}

interface CurateGalleryDrawerProps {
  onClose: () => void
}

export function CurateGalleryDrawer({ onClose }: CurateGalleryDrawerProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('shown')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const visibleArtwork = MOCK_ARTWORK.filter(TAB_FILTER[activeTab])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="relative z-10 w-[520px] max-w-full h-full flex flex-col bg-surface-1 border-l border-border shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-text-hi">Curate Gallery</h2>
            <p className="mt-0.5 text-[12px] text-text-lo leading-relaxed">
              Your profile updates from your synced Library.
              <br />Curate what appears here.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-text-mute hover:text-text-hi hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0 overflow-x-auto">
          {TABS.map(tab => {
            const count = MOCK_ARTWORK.filter(TAB_FILTER[tab.key]).length
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); clearSelection() }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-accent text-primary-foreground'
                    : 'bg-surface-2 text-text-mid hover:bg-surface-3'
                }`}
              >
                {tab.key === 'stacks' && <Sparkles className="w-3 h-3" />}
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] px-1 rounded ${
                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-surface-3 text-text-mute'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Suggested Stacks callout */}
        {activeTab === 'stacks' && (
          <div className="mx-4 mt-3 px-3 py-2.5 rounded-xl bg-select/10 border border-select/25 flex items-start gap-2 flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-select mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-text-mid leading-relaxed">
              These pieces share similar subjects, series, or format. Stacking groups them under one card — viewers can swipe through variants.
            </p>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {visibleArtwork.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
              <ImageIcon className="w-8 h-8 text-text-mute" />
              <p className="text-sm text-text-lo">Nothing here yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {visibleArtwork.map(artwork => (
                <ArtworkCard
                  key={artwork.id}
                  artwork={artwork}
                  selected={selected.has(artwork.id)}
                  onToggle={toggleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Batch actions — only when items selected */}
        {selected.size > 0 && (
          <DrawerBatchBar count={selected.size} onClear={clearSelection} />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border flex-shrink-0">
          <p className="text-[11px] text-text-mute leading-snug max-w-[280px]">
            To add new artwork, publish or sync it through Patreon or Library.
          </p>
          <a
            href="#"
            className="flex items-center gap-1.5 text-xs text-text-lo hover:text-text-mid transition-colors whitespace-nowrap"
          >
            Open full Library <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

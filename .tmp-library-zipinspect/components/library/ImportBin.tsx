'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ChevronDown,
  RefreshCw,
  X,
  Trash2,
  Sparkles,
  Hash,
  Upload,
  Link2,
  ImageIcon,
  Film,
  Music,
  FileText,
  CheckCircle2,
  Plus,
  LayoutGrid,
  ChevronsDown,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportBinItem = {
  id: string
  src: string | null
  mimeType: string
  filename: string
  timestamp: Date
  source: ImportSource
}

export type ImportSource = 'discord' | 'upload' | 'url'

type DiscordChannel = {
  id: string
  name: string
  connected: boolean
}

type Props = {
  onAddToNewPost: (items: ImportBinItem[]) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mediaBadgeLabel(mimeType: string) {
  if (mimeType.startsWith('video/')) return { label: 'VIDEO', icon: Film }
  if (mimeType.startsWith('audio/')) return { label: 'AUDIO', icon: Music }
  if (mimeType.startsWith('text/'))  return { label: 'TEXT',  icon: FileText }
  return { label: 'IMAGE', icon: ImageIcon }
}

function formatTimestamp(d: Date) {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function colorSvg(fill: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="${fill}" width="200" height="200"/><text x="100" y="108" text-anchor="middle" font-size="18" font-family="sans-serif" fill="rgba(255,255,255,0.45)">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const MOCK_DISCORD_CHANNELS: DiscordChannel[] = [
  { id: 'dc-1', name: 'art-wips',        connected: true  },
  { id: 'dc-2', name: 'finished-art',    connected: false },
  { id: 'dc-3', name: 'reference-drops', connected: false },
]

const MOCK_BIN_ITEMS: ImportBinItem[] = [
  { id: 'b1', src: colorSvg('#c0392b', 'capture 01'), mimeType: 'image/jpeg', filename: 'relay_m_capture_01.jpg', timestamp: new Date(Date.now() - 60*12*1000),  source: 'discord' },
  { id: 'b2', src: colorSvg('#1a6fa8', 'capture 02'), mimeType: 'image/jpeg', filename: 'relay_m_capture_02.jpg', timestamp: new Date(Date.now() - 60*34*1000),  source: 'discord' },
  { id: 'b3', src: colorSvg('#6d4c9e', 'capture 03'), mimeType: 'image/jpeg', filename: 'relay_m_capture_03.jpg', timestamp: new Date(Date.now() - 60*58*1000),  source: 'discord' },
  { id: 'b4', src: colorSvg('#2e7d5e', 'capture 04'), mimeType: 'video/mp4',  filename: 'relay_m_capture_04.mp4', timestamp: new Date(Date.now() - 60*90*1000), source: 'discord' },
]

const SOURCE_TABS: { id: ImportSource; label: string; icon: React.ElementType }[] = [
  { id: 'discord', label: 'Discord',      icon: Hash   },
  { id: 'upload',  label: 'Upload Files', icon: Upload },
  { id: 'url',     label: 'URL',          icon: Link2  },
]

// ---------------------------------------------------------------------------
// MediaTypeBadge
// ---------------------------------------------------------------------------

function MediaTypeBadge({ mimeType }: { mimeType: string }) {
  const { label, icon: Icon } = mediaBadgeLabel(mimeType)
  return (
    <div className="flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-black/70 backdrop-blur-sm border border-white/10">
      <Icon size={9} className="text-white/70" />
      <span className="text-[9px] font-bold tracking-widest text-white/70 ml-0.5">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BinCard
// ---------------------------------------------------------------------------

function BinCard({ item, selected, onToggle, onDiscard, beaming }: {
  item: ImportBinItem
  selected: boolean
  onToggle: () => void
  onDiscard: () => void
  beaming?: boolean
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        transition: beaming ? 'opacity 0.5s ease, transform 0.5s ease' : undefined,
        opacity: beaming ? 0 : 1,
        transform: beaming ? 'translateY(32px) scale(0.88)' : 'none',
      }}
      className={`group/card relative flex-shrink-0 w-40 rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-200
        ${selected
          ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-transparent shadow-lg shadow-[var(--accent)]/20'
          : 'ring-1 ring-white/[0.08] hover:ring-white/20'
        } bg-[var(--surface-2)]`}
    >
      {/* Thumbnail */}
      <div className="relative h-32 overflow-hidden">
        {item.src
          ? <img src={item.src} alt={item.filename} className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-[1.04]" /> // eslint-disable-line @next/next/no-img-element
          : <div className="w-full h-full flex items-center justify-center bg-[var(--surface-2)]"><ImageIcon size={28} className="text-[var(--text-mute)]" /></div>
        }
        {selected && <div className="absolute inset-0 bg-[var(--accent)]/10 pointer-events-none" />}
        <div className={`absolute top-2 left-2 z-10 transition-all duration-150 ${selected ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
          <CheckCircle2 size={20} className="text-[var(--accent)] drop-shadow-md" fill="var(--accent)" />
        </div>
        <div className="absolute top-2 right-2 z-10">
          <MediaTypeBadge mimeType={item.mimeType} />
        </div>
      </div>

      {/* Meta */}
      <div className="px-2.5 pt-2 pb-1">
        <p className="text-[10px] font-semibold text-[var(--text-mid)] truncate">
          {item.filename.length > 20 ? item.filename.slice(0, 20) + '…' : item.filename}
        </p>
        <p className="text-[9px] text-[var(--text-mute)] mt-0.5 tabular-nums">{formatTimestamp(item.timestamp)}</p>
      </div>

      <button
        type="button"
        onClick={e => { e.stopPropagation(); onDiscard() }}
        className="w-full flex items-center justify-center gap-1 py-1.5 border-t border-white/[0.06] text-[9px] font-bold uppercase tracking-widest text-[var(--text-mute)] hover:text-red-400 hover:bg-red-500/10 transition-colors duration-100"
      >
        <Trash2 size={10} />
        Discard
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DiscordPanel
// ---------------------------------------------------------------------------

function DiscordPanel({ channels, onToggle }: { channels: DiscordChannel[]; onToggle: (id: string) => void }) {
  const connected = channels.filter(c => c.connected)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="text-[10px] font-semibold text-[var(--accent)]">
            {connected.length > 0 ? `Syncing ${connected.map(c => '#' + c.name).join(', ')}` : 'No channels connected'}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {channels.map(ch => (
          <button
            key={ch.id}
            type="button"
            onClick={() => onToggle(ch.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-150
              ${ch.connected
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--accent)]'
                : 'bg-white/[0.04] border-white/10 text-[var(--text-lo)] hover:border-[var(--accent)]/30 hover:text-[var(--accent)]'
              }`}
          >
            <Hash size={10} />
            {ch.name}
            <div className={`w-1.5 h-1.5 rounded-full ml-0.5 transition-colors duration-150 ${ch.connected ? 'bg-[var(--accent)]' : 'bg-white/20'}`} />
          </button>
        ))}
        <button
          type="button"
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] text-[var(--text-mute)] border border-dashed border-white/10 hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-all duration-150"
        >
          <Plus size={10} />
          Add channel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UploadZone
// ---------------------------------------------------------------------------

function UploadZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); onFiles(Array.from(e.dataTransfer.files)) }}
      onClick={() => fileInputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 h-28 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200
        ${dragging ? 'border-[var(--accent)] bg-[var(--accent)]/[0.06]' : 'border-white/10 hover:border-[var(--accent)]/40 hover:bg-white/[0.02]'}`}
    >
      <Upload size={22} className={`transition-colors duration-200 ${dragging ? 'text-[var(--accent)]' : 'text-[var(--text-mute)]'}`} />
      <div className="text-center">
        <p className="text-[12px] font-semibold text-[var(--text-lo)]">Drop files here or <span className="text-[var(--accent)]">browse</span></p>
        <p className="text-[10px] text-[var(--text-mute)] mt-0.5">Images, video, audio supported</p>
      </div>
      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" onChange={e => { onFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// URLInput
// ---------------------------------------------------------------------------

function URLInput({ onAdd }: { onAdd: (url: string) => void }) {
  const [val, setVal] = useState('')
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-[var(--accent)] transition-all">
        <Link2 size={13} className="text-[var(--text-mute)] flex-shrink-0" />
        <input
          type="url"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="Paste a media URL and press Enter…"
          className="flex-1 bg-transparent text-[12px] text-[var(--text-hi)] placeholder:text-[var(--text-mute)] outline-none"
          onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal('') } }}
        />
      </div>
      <button
        type="button"
        onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal('') } }}
        disabled={!val.trim()}
        className="px-3 py-2 rounded-xl text-[11px] font-semibold border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
      >
        Add
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ImportBin
// ---------------------------------------------------------------------------

export default function ImportBin({ onAddToNewPost }: Props) {
  const [expanded, setExpanded]         = useState(false)
  const [items, setItems]               = useState<ImportBinItem[]>(MOCK_BIN_ITEMS)
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [activeSource, setActiveSource] = useState<ImportSource>('discord')
  const [channels, setChannels]         = useState<DiscordChannel[]>(MOCK_DISCORD_CHANNELS)
  const [refreshing, setRefreshing]     = useState(false)
  const [beamingIds, setBeamingIds]     = useState<Set<string>>(new Set())
  const [beamActive, setBeamActive]     = useState(false)

  const selectedItems = items.filter(it => selectedIds.has(it.id))
  const selectedCount = selectedItems.length

  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleToggle   = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const handleDiscard  = useCallback((id: string) => {
    setItems(prev => prev.filter(it => it.id !== id))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }, [])

  const handleRefresh  = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 1200)
  }, [])

  const handleFiles    = useCallback((files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        setItems(prev => [{
          id: `upload-${Date.now()}-${Math.random()}`,
          src: ev.target?.result as string,
          mimeType: file.type || 'application/octet-stream',
          filename: file.name,
          timestamp: new Date(),
          source: 'upload',
        }, ...prev])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handleAddURL   = useCallback((url: string) => {
    setItems(prev => [{
      id: `url-${Date.now()}`,
      src: url,
      mimeType: 'image/jpeg',
      filename: url.split('/').pop() ?? 'media',
      timestamp: new Date(),
      source: 'url',
    }, ...prev])
  }, [])

  const handleAddToNewPost = useCallback(() => {
    if (!selectedCount) return
    const ids = new Set(selectedItems.map(it => it.id))

    // 1. Trigger beam animation on selected cards
    setBeamingIds(ids)
    setBeamActive(true)

    // 2. After animation settles, open modal and clear
    setTimeout(() => {
      onAddToNewPost(selectedItems)
      setItems(prev => prev.filter(it => !ids.has(it.id)))
      setSelectedIds(new Set())
      setBeamingIds(new Set())
      setBeamActive(false)
    }, 560)
  }, [selectedCount, selectedItems, onAddToNewPost])

  const toggleChannel  = useCallback((id: string) => {
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, connected: !ch.connected } : ch))
  }, [])

  const visibleItems = items.filter(it =>
    activeSource === 'url' ? it.source === 'url' :
    activeSource === 'upload' ? it.source === 'upload' :
    it.source === 'discord'
  )

  return (
    <div className="flex-shrink-0 select-none">

      {/* ═══════════════════════════════════════════════════════
          IMPORT BAY HERO
      ══════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden">
        {/* Radial glow behind heading */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-[480px] h-[180px] rounded-full blur-3xl opacity-[0.12]"
          style={{ background: 'radial-gradient(ellipse at center, var(--accent) 0%, transparent 70%)' }}
        />

        <div className="relative flex flex-col items-center justify-center pt-10 pb-6 px-6 text-center">
          {/* Eyebrow */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-[0.26em] text-[var(--accent)]">Media Staging Zone</span>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />
          </div>

          {/* Title */}
          <h2 className="text-[34px] font-bold tracking-tight text-[var(--text-hi)] leading-none">
            Import Bay
          </h2>
          <p className="mt-3 text-[13px] text-[var(--text-mute)] max-w-[300px] leading-relaxed">
            Stage, filter, and curate media before publishing to your Active Posts.
          </p>

          {/* Stats + controls row */}
          <div className="flex items-center gap-3 mt-5">
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.05] border border-white/10">
              <LayoutGrid size={11} className="text-[var(--text-mute)]" />
              <span className="text-[11px] font-semibold text-[var(--text-mid)] tabular-nums">{items.length} in bin</span>
            </div>
            {selectedCount > 0 && (
              <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                <CheckCircle2 size={11} className="text-[var(--accent)]" />
                <span className="text-[11px] font-semibold text-[var(--accent)] tabular-nums">{selectedCount} selected</span>
              </div>
            )}
          </div>

          {/* Open / Minimise toggle — unfolds the station */}
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Minimise import station' : 'Open import station'}
            className={`mt-5 flex items-center gap-2 px-6 py-2.5 rounded-full text-[12px] font-bold tracking-wide border transition-all duration-300
              ${expanded
                ? 'bg-white/[0.05] border-white/10 text-[var(--text-lo)] hover:text-[var(--text-hi)] hover:border-white/20'
                : 'bg-[var(--accent)] border-[var(--accent)] text-black hover:brightness-110 shadow-lg shadow-[var(--accent)]/30'
              }`}
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-300 ${expanded ? 'rotate-180' : 'rotate-0'}`}
            />
            {expanded ? 'Minimise' : 'Open Import Station'}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          FLOATING STATION WINDOW — grows/unfolds from the button
      ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          maxHeight: expanded ? '720px' : '0px',
          opacity: expanded ? 1 : 0,
          marginTop: expanded ? '32px' : '0px',
          marginBottom: expanded ? '20px' : '0px',
          overflow: 'hidden',
          pointerEvents: expanded ? 'auto' : 'none',
          transition: 'max-height 380ms cubic-bezier(0.34,1.36,0.64,1), opacity 280ms ease, margin 300ms ease-out',
        }}
      >
        {/* The centered floating card */}
        <div
          className="relative mx-auto max-w-4xl rounded-3xl overflow-hidden border border-white/[0.09]"
          style={{
            background: 'linear-gradient(160deg, oklch(0.145 0.03 165 / 0.6) 0%, oklch(0.125 0.025 180 / 0.85) 50%, oklch(0.11 0.02 190 / 0.92) 100%)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 0 0 1px rgba(0,170,111,0.1), 0 32px 64px rgba(0,0,0,0.5), 0 0 80px rgba(0,170,111,0.04)',
          }}
        >
          {/* Inner glow rim */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{ boxShadow: 'inset 0 1px 0 rgba(0,170,111,0.12), inset 0 -1px 0 rgba(0,0,0,0.35)' }}
          />

          <div className="p-6 flex flex-col gap-5">

            {/* ── Source tab switcher ── */}
            <div className="flex justify-center">
              <div className="flex items-center gap-0.5 p-1 rounded-2xl bg-black/40 border border-white/[0.08]">
                {SOURCE_TABS.map(tab => {
                  const Icon = tab.icon
                  const active = activeSource === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveSource(tab.id)}
                      className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-[12px] font-semibold transition-all duration-150
                        ${active
                          ? 'bg-white/[0.10] text-[var(--text-hi)] shadow-sm'
                          : 'text-[var(--text-mute)] hover:text-[var(--text-lo)]'
                        }`}
                    >
                      <Icon size={12} />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Source panel ── */}
            <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
              {activeSource === 'discord' && <DiscordPanel channels={channels} onToggle={toggleChannel} />}
              {activeSource === 'upload'  && <UploadZone onFiles={handleFiles} />}
              {activeSource === 'url'     && <URLInput onAdd={handleAddURL} />}
            </div>

            {/* ── Staged media grid ── */}
            {visibleItems.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-mute)]">
                    Staged&nbsp;
                    <span className="text-[var(--accent)] tabular-nums">{visibleItems.length}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRefresh}
                      className="flex items-center gap-1 text-[10px] text-[var(--text-mute)] hover:text-[var(--text-lo)] transition-colors"
                    >
                      <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                    {selectedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="flex items-center gap-1 text-[10px] text-[var(--text-mute)] hover:text-[var(--text-lo)] transition-colors"
                      >
                        <X size={10} />
                        Deselect all
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-1.5">
                  {visibleItems.map(item => (
                    <BinCard
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      beaming={beamingIds.has(item.id)}
                      onToggle={() => handleToggle(item.id)}
                      onDiscard={() => handleDiscard(item.id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed border-white/10 text-center gap-2">
                <ImageIcon size={24} className="text-[var(--text-mute)] opacity-50" />
                <p className="text-[11px] text-[var(--text-mute)]">
                  {activeSource === 'discord'
                    ? 'No captures yet — connect a channel to start syncing.'
                    : activeSource === 'upload'
                    ? 'No files uploaded yet.'
                    : 'Add a URL above to stage media.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          PIPELINE CONNECTOR — "Add to new post" attached here
      ══════════════════════════════════════════════════════════ */}
      <div className="relative flex flex-col items-center py-2">

        {/* "Add to new post" CTA — floats above the arrow */}
        <div
          className={`mb-3 transition-all duration-300 ${selectedCount > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
        >
          <button
            type="button"
            onClick={handleAddToNewPost}
            disabled={selectedCount === 0 || beamActive}
            className="flex items-center gap-2 px-7 py-2.5 rounded-full text-[12px] font-bold bg-[var(--accent)] text-black border border-[var(--accent)] shadow-lg shadow-[var(--accent)]/25 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
          >
            <Sparkles size={13} />
            Add {selectedCount > 0 ? selectedCount : ''} to new post
          </button>
        </div>

        {/* Beam pulse — animates down the arrow when beaming */}
        <div className="relative flex flex-col items-center">
          <div
            className="w-px bg-gradient-to-b from-[var(--accent)]/40 to-[var(--accent)]/10"
            style={{ height: beamActive ? '48px' : '24px', transition: 'height 0.3s ease' }}
          />
          {/* Beam traveling dot */}
          {beamActive && (
            <div
              aria-hidden
              className="absolute top-0 w-2 h-2 rounded-full bg-[var(--accent)] shadow-md shadow-[var(--accent)]/60"
              style={{ animation: 'beamDrop 0.52s ease-in forwards' }}
            />
          )}
          {/* Chevron circle */}
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-300 ${
              beamActive
                ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10 shadow-md shadow-[var(--accent)]/30'
                : 'border-[var(--accent)]/20 bg-[var(--surface-1)]'
            }`}
          >
            <ChevronsDown
              size={14}
              className={`transition-colors duration-300 ${beamActive ? 'text-[var(--accent)]' : 'text-[var(--accent)]/50'}`}
            />
          </div>
          <div className="w-px h-5 bg-gradient-to-b from-[var(--accent)]/10 to-transparent" />
        </div>
      </div>

      {/* keyframe for beam drop — injected via style tag */}
      <style>{`
        @keyframes beamDrop {
          0%   { transform: translateY(0);   opacity: 1; }
          80%  { transform: translateY(48px); opacity: 0.7; }
          100% { transform: translateY(52px); opacity: 0; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════
          ACTIVE POSTS SECTION HEADER
      ══════════════════════════════════════════════════════════ */}
      <div className="relative border-t border-[var(--border)]/60">
        <div className="flex flex-col items-center justify-center pt-7 pb-5 px-4 text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.26em] text-[var(--text-mute)] mb-2">
            Published Content
          </span>
          <h2 className="text-[26px] font-bold tracking-tight text-[var(--text-hi)] leading-none">
            Active Posts
          </h2>
        </div>
      </div>
    </div>
  )
}

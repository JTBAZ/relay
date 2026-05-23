'use client'

import { useState, useRef, useCallback } from 'react'
import {
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ImageIcon,
  Film,
  Music,
  FileText,
  Upload,
  Lock,
  Globe,
  Users,
  MessageCircle,
  MessageCircleOff,
  Eye,
  EyeOff,
  Layers,
} from 'lucide-react'
import type { ImportBinItem } from './ImportBin'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TierOption = {
  id: string
  label: string
  priceCents: number
}

type TierPreviewMode = 'full' | 'blur' | 'locked'

type TierPreviewConfig = {
  tierId: string
  mode: TierPreviewMode
  blurAmount: number        // 0-20
  teaser: string            // short CTA string shown over blur
}

const DEFAULT_TIERS: TierOption[] = [
  { id: 'public',    label: 'Everyone',  priceCents: 0 },
  { id: 'free',      label: 'Free Tier', priceCents: 0 },
  { id: 'supporter', label: 'Supporter', priceCents: 500 },
  { id: 'patron',    label: 'Patron',    priceCents: 1000 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mediaBadgeLabel(mimeType: string) {
  if (mimeType.startsWith('video/')) return { label: 'VIDEO', icon: Film }
  if (mimeType.startsWith('audio/')) return { label: 'AUDIO', icon: Music }
  if (mimeType.startsWith('text/'))  return { label: 'TEXT',  icon: FileText }
  return { label: 'IMAGE', icon: ImageIcon }
}

function priceFmt(cents: number) {
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(2)}/mo`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MediaThumb({ item, onRemove }: { item: ImportBinItem; onRemove: () => void }) {
  const { icon: Icon } = mediaBadgeLabel(item.mimeType)
  return (
    <div className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group/thumb">
      {item.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.src} alt={item.filename} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Icon size={20} className="text-[var(--text-mute)]" />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-150"
        aria-label={`Remove ${item.filename}`}
      >
        <Trash2 size={14} className="text-[var(--destructive)]" />
      </button>
    </div>
  )
}

function TierPreviewRow({
  tier,
  config,
  onChange,
}: {
  tier: TierOption
  config: TierPreviewConfig
  onChange: (c: TierPreviewConfig) => void
}) {
  const previewModes: { id: TierPreviewMode; label: string; icon: React.ElementType }[] = [
    { id: 'full',   label: 'Full',   icon: Eye },
    { id: 'blur',   label: 'Blur',   icon: EyeOff },
    { id: 'locked', label: 'Locked', icon: Lock },
  ]

  return (
    <div className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0">
      {/* Tier label */}
      <div className="w-28 flex-shrink-0 pt-0.5">
        <p className="text-[11px] font-semibold text-[var(--text-hi)]">{tier.label}</p>
        <p className="text-[9px] text-[var(--text-mute)]">{priceFmt(tier.priceCents)}</p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-1">
        {previewModes.map(m => {
          const Icon = m.icon
          const active = config.mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange({ ...config, mode: m.id })}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all duration-100 border
                ${active
                  ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--primary-foreground)]'
                  : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-lo)] hover:text-[var(--text-hi)] hover:border-[var(--border-mid)]'
                }`}
            >
              <Icon size={10} />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Blur controls (only shown in blur mode) */}
      {config.mode === 'blur' && (
        <div className="flex-1 flex flex-col gap-1">
          <input
            type="range"
            min={2}
            max={20}
            value={config.blurAmount}
            onChange={e => onChange({ ...config, blurAmount: Number(e.target.value) })}
            className="w-full h-1 accent-[var(--accent)]"
          />
          <input
            type="text"
            value={config.teaser}
            onChange={e => onChange({ ...config, teaser: e.target.value })}
            placeholder="CTA text (e.g. Subscribe to see this)"
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[10px] text-[var(--text-hi)] placeholder:text-[var(--text-mute)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      )}

      {/* Locked controls */}
      {config.mode === 'locked' && (
        <input
          type="text"
          value={config.teaser}
          onChange={e => onChange({ ...config, teaser: e.target.value })}
          placeholder="CTA text (e.g. Patron-only — join to unlock)"
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[10px] text-[var(--text-hi)] placeholder:text-[var(--text-mute)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

type Props = {
  open: boolean
  initialMedia: ImportBinItem[]
  onClose: () => void
  onPublish: (data: PostDraft) => void
}

export type PostDraft = {
  title: string
  tags: string[]
  collectionIds: string[]
  tierId: string
  commentsEnabled: boolean
  media: ImportBinItem[]
  tierPreviews: TierPreviewConfig[]
}

const MOCK_COLLECTIONS = [
  { id: 'col-1', label: 'Fan Favorites' },
  { id: 'col-2', label: 'Portrait Studies' },
  { id: 'col-3', label: 'Autumn Series' },
]

export default function CreatePostModal({ open, initialMedia, onClose, onPublish }: Props) {
  const [title, setTitle] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [collectionIds, setCollectionIds] = useState<string[]>([])
  const [tierId, setTierId] = useState('public')
  const [commentsEnabled, setCommentsEnabled] = useState(true)
  const [media, setMedia] = useState<ImportBinItem[]>(initialMedia)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [tierPreviews, setTierPreviews] = useState<TierPreviewConfig[]>(
    DEFAULT_TIERS.map(t => ({
      tierId: t.id,
      mode: t.id === 'public' ? 'blur' : 'full',
      blurAmount: 12,
      teaser: t.id === 'public' ? 'Become a Free member to see this' : '',
    }))
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens with new media
  const handleOpen = useCallback(() => {
    setMedia(initialMedia)
    setTitle('')
    setTags([])
    setTagInput('')
    setCollectionIds([])
    setTierId('public')
    setCommentsEnabled(true)
    setAdvancedOpen(false)
  }, [initialMedia])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { if (open) handleOpen() })

  const addTag = useCallback((raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (!t || tags.includes(t)) return
    setTags(prev => [...prev, t])
    setTagInput('')
  }, [tags])

  const removeTag = useCallback((t: string) => setTags(prev => prev.filter(x => x !== t)), [])

  const removeMedia = useCallback((id: string) => setMedia(prev => prev.filter(m => m.id !== id)), [])

  const handleAddFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setMedia(prev => [...prev, {
          id: `modal-${Date.now()}-${Math.random()}`,
          src: ev.target?.result as string,
          mimeType: file.type,
          filename: file.name,
          timestamp: new Date(),
          source: 'upload',
        }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }, [])

  const handlePublish = useCallback(() => {
    onPublish({ title, tags, collectionIds, tierId, commentsEnabled, media, tierPreviews })
    onClose()
  }, [title, tags, collectionIds, tierId, commentsEnabled, media, tierPreviews, onPublish, onClose])

  const toggleCollection = useCallback((id: string) => {
    setCollectionIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }, [])

  const selectedTier = DEFAULT_TIERS.find(t => t.id === tierId)!

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create new post"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border-mid)] bg-[var(--surface-0)] shadow-2xl shadow-black/60 overflow-hidden">

        {/* ── Modal header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--accent)]" />
            <span className="text-[13px] font-semibold text-[var(--text-hi)] tracking-tight">New Post</span>
            <span className="text-[10px] text-[var(--text-mute)] uppercase tracking-widest ml-1">
              {media.length} asset{media.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-mute)] hover:text-[var(--text-hi)] transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Media strip */}
          <section>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-mute)] mb-2">
              Media
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {media.map(item => (
                <MediaThumb key={item.id} item={item} onRemove={() => removeMedia(item.id)} />
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 w-20 h-20 rounded-lg border border-dashed border-[var(--border-mid)] flex flex-col items-center justify-center gap-1 text-[var(--text-mute)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all duration-150"
                aria-label="Add more media"
              >
                <Upload size={14} />
                <span className="text-[9px] font-medium">Add more</span>
              </button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" onChange={handleAddFiles} />
            </div>
          </section>

          {/* Title */}
          <section>
            <label htmlFor="post-title" className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-mute)] mb-2">
              Title
            </label>
            <input
              id="post-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Give your post a title…"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-hi)] placeholder:text-[var(--text-mute)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all"
            />
          </section>

          {/* Tags */}
          <section>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-mute)] mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(t => (
                <span
                  key={t}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text-mid)]"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-[var(--text-mute)] hover:text-[var(--destructive)] transition-colors"
                    aria-label={`Remove tag ${t}`}
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
                if (e.key === 'Backspace' && !tagInput && tags.length > 0) removeTag(tags[tags.length - 1]!)
              }}
              placeholder="Add a tag, press Enter"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] text-[var(--text-hi)] placeholder:text-[var(--text-mute)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all"
            />
          </section>

          {/* Collections */}
          <section>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-mute)] mb-2">
              Collections
            </label>
            <div className="flex flex-wrap gap-2">
              {MOCK_COLLECTIONS.map(col => {
                const active = collectionIds.includes(col.id)
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => toggleCollection(col.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-100
                      ${active
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-lo)] hover:border-[var(--border-mid)] hover:text-[var(--text-hi)]'
                      }`}
                  >
                    <Layers size={10} />
                    {col.label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Access Tier */}
          <section>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-mute)] mb-2">
              Access Tier
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_TIERS.map(t => {
                const active = tierId === t.id
                const Icon = t.id === 'public' ? Globe : t.priceCents === 0 ? Users : Lock
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTierId(t.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all duration-100
                      ${active
                        ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text-hi)]'
                        : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-lo)] hover:border-[var(--border-mid)] hover:text-[var(--text-hi)]'
                      }`}
                  >
                    <Icon size={13} className={active ? 'text-[var(--accent)]' : 'text-[var(--text-mute)]'} />
                    <div>
                      <p className="text-[12px] font-semibold leading-none">{t.label}</p>
                      <p className="text-[10px] text-[var(--text-mute)] mt-0.5">{priceFmt(t.priceCents)}</p>
                    </div>
                    {active && (
                      <div className="ml-auto w-2 h-2 rounded-full bg-[var(--accent)]" />
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Comments */}
          <section>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--text-mute)] mb-2">
              Comments
            </label>
            <div className="flex gap-2">
              {[
                { val: true,  label: 'Enabled',  Icon: MessageCircle },
                { val: false, label: 'Disabled', Icon: MessageCircleOff },
              ].map(({ val, label, Icon }) => {
                const active = commentsEnabled === val
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCommentsEnabled(val)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11px] font-medium transition-all duration-100
                      ${active
                        ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text-hi)]'
                        : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-lo)] hover:border-[var(--border-mid)]'
                      }`}
                  >
                    <Icon size={12} className={active ? 'text-[var(--accent)]' : 'text-[var(--text-mute)]'} />
                    {label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Advanced — collapsible tier preview settings */}
          <section className="border border-[var(--border)] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors duration-100"
            >
              <div className="flex items-center gap-2">
                <Eye size={12} className="text-[var(--text-mute)]" />
                <span className="text-[11px] font-semibold text-[var(--text-lo)] uppercase tracking-widest">
                  Advanced — Tier Previews
                </span>
              </div>
              {advancedOpen ? (
                <ChevronUp size={13} className="text-[var(--text-mute)]" />
              ) : (
                <ChevronDown size={13} className="text-[var(--text-mute)]" />
              )}
            </button>

            {advancedOpen && (
              <div className="px-4 pb-3 border-t border-[var(--border)] pt-3">
                <p className="text-[10px] text-[var(--text-mute)] mb-3 leading-relaxed">
                  Control what each audience tier sees before gaining access. Blur the image with a CTA to invite upgrades, or fully lock it.
                </p>
                {DEFAULT_TIERS.map(tier => {
                  const config = tierPreviews.find(tp => tp.tierId === tier.id)!
                  return (
                    <TierPreviewRow
                      key={tier.id}
                      tier={tier}
                      config={config}
                      onChange={updated =>
                        setTierPreviews(prev => prev.map(tp => tp.tierId === tier.id ? updated : tp))
                      }
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface-0)] flex-shrink-0">
          <p className="text-[10px] text-[var(--text-mute)]">
            Visible to: <span className="text-[var(--text-mid)] font-medium">{selectedTier.label}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-[12px] font-medium text-[var(--text-lo)] hover:text-[var(--text-hi)] hover:border-[var(--border-mid)] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={!title.trim() && media.length === 0}
              className="px-5 py-2 rounded-lg text-[12px] font-semibold bg-[var(--accent)] text-[var(--primary-foreground)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-[var(--accent)]/30"
            >
              Publish Post
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

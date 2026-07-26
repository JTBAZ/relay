'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X,
  Image as ImageIcon,
  Link2,
  AtSign,
  Bell,
  Send,
  BarChart2,
  Plus,
  Trash2,
  Shuffle,
  PenLine,
  Clock,
} from 'lucide-react'

interface UpdateComposerProps {
  onClose: () => void
  onPublish: (update: UpdateData) => void
}

export interface PollOption {
  id: string
  label: string
}

export interface PollData {
  question: string
  options: PollOption[]
  voteType: 'single' | 'multiple'
  durationDays: number | null  // null = no expiry
  allowWriteIn: boolean
  shuffleOptions: boolean
}

export interface UpdateData {
  body: string
  mediaUrl?: string
  ctaLabel?: string
  ctaUrl?: string
  tiers: string[]
  notify: boolean
  poll?: PollData
}

const TIER_OPTIONS = [
  { id: 'public',  label: 'Public',       color: 'text-text-mid'  },
  { id: 'basic',   label: 'Basic',        color: 'text-accent'    },
  { id: 'tier2',   label: 'Tier 2',       color: 'text-gold'      },
  { id: 'inner',   label: 'Inner Circle', color: 'text-select'    },
]

const DURATION_OPTIONS: { label: string; value: number | null }[] = [
  { label: '1d',    value: 1    },
  { label: '3d',    value: 3    },
  { label: '7d',    value: 7    },
  { label: 'Open',  value: null },
]

function genId() {
  return Math.random().toString(36).slice(2, 8)
}

function defaultPoll(): PollData {
  return {
    question: '',
    options: [
      { id: genId(), label: '' },
      { id: genId(), label: '' },
    ],
    voteType: 'single',
    durationDays: 3,
    allowWriteIn: false,
    shuffleOptions: false,
  }
}

export function UpdateComposer({ onClose, onPublish }: UpdateComposerProps) {
  const [body, setBody]                     = useState('')
  const [selectedTiers, setSelectedTiers]   = useState<string[]>(['public'])
  const [showMediaInput, setShowMediaInput] = useState(false)
  const [showCtaInput, setShowCtaInput]     = useState(false)
  const [mediaUrl, setMediaUrl]             = useState('')
  const [ctaLabel, setCtaLabel]             = useState('')
  const [ctaUrl, setCtaUrl]                 = useState('')
  const [notify, setNotify]                 = useState(false)
  const [pollMode, setPollMode]             = useState(false)
  const [poll, setPoll]                     = useState<PollData>(defaultPoll)

  const optionRefs = useRef<(HTMLInputElement | null)[]>([])

  // Focus new option on add
  useEffect(() => {
    const last = optionRefs.current[poll.options.length - 1]
    if (last) last.focus()
  }, [poll.options.length])

  const togglePollMode = () => {
    if (!pollMode) {
      // Entering poll mode: disable incompatible tools
      setShowMediaInput(false)
      setShowCtaInput(false)
    }
    setPollMode(p => !p)
  }

  const toggleTier = (tierId: string) => {
    setSelectedTiers(prev =>
      prev.includes(tierId) ? prev.filter(t => t !== tierId) : [...prev, tierId]
    )
  }

  // Poll helpers
  const updateOption = (id: string, label: string) => {
    setPoll(p => ({ ...p, options: p.options.map(o => o.id === id ? { ...o, label } : o) }))
  }

  const addOption = () => {
    if (poll.options.length >= 6) return
    setPoll(p => ({ ...p, options: [...p.options, { id: genId(), label: '' }] }))
  }

  const removeOption = (id: string) => {
    if (poll.options.length <= 2) return
    setPoll(p => ({ ...p, options: p.options.filter(o => o.id !== id) }))
  }

  const handleOptionKeyDown = (e: React.KeyboardEvent, id: string, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (idx === poll.options.length - 1 && poll.options.length < 6) addOption()
      else optionRefs.current[idx + 1]?.focus()
    }
    if (e.key === 'Backspace' && poll.options[idx].label === '' && poll.options.length > 2) {
      e.preventDefault()
      removeOption(id)
      setTimeout(() => optionRefs.current[Math.max(0, idx - 1)]?.focus(), 0)
    }
  }

  const pollValid = pollMode
    ? poll.question.trim().length > 0 && poll.options.filter(o => o.label.trim()).length >= 2
    : true

  const hasContent = pollMode ? pollValid : body.trim().length > 0

  const handlePublish = () => {
    if (!hasContent) return
    onPublish({
      body: pollMode ? poll.question : body,
      mediaUrl: mediaUrl || undefined,
      ctaLabel: ctaLabel || undefined,
      ctaUrl: ctaUrl || undefined,
      tiers: selectedTiers,
      notify,
      poll: pollMode ? { ...poll, options: poll.options.filter(o => o.label.trim()) } : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Composer Panel */}
      <div className="relative w-full max-w-lg bg-surface-1 rounded-2xl border border-border shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-text-hi">Post Update</h2>
            {/* Poll mode pill indicator */}
            {pollMode && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-select-soft text-select text-[11px] font-medium">
                <BarChart2 className="w-3 h-3" />
                Poll
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* ── POLL MODE ── */}
          {pollMode ? (
            <div className="space-y-3">
              {/* Question field */}
              <textarea
                value={poll.question}
                onChange={e => setPoll(p => ({ ...p, question: e.target.value }))}
                placeholder="Ask your community a question..."
                className="w-full h-20 bg-surface-2 rounded-xl px-4 py-3 text-sm text-text-hi placeholder:text-text-mute resize-none focus:outline-none focus:ring-1 focus:ring-select"
                autoFocus
              />

              {/* Vote type toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-mute flex-shrink-0">Vote type:</span>
                <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
                  <button
                    onClick={() => setPoll(p => ({ ...p, voteType: 'single' }))}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      poll.voteType === 'single'
                        ? 'bg-surface-4 text-text-hi shadow-sm'
                        : 'text-text-mute hover:text-text-lo'
                    }`}
                  >
                    Single choice
                  </button>
                  <button
                    onClick={() => setPoll(p => ({ ...p, voteType: 'multiple' }))}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      poll.voteType === 'multiple'
                        ? 'bg-surface-4 text-text-hi shadow-sm'
                        : 'text-text-mute hover:text-text-lo'
                    }`}
                  >
                    Multiple choice
                  </button>
                </div>
              </div>

              {/* Options list */}
              <div className="space-y-2">
                {poll.options.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2 group">
                    {/* Choice indicator */}
                    <div className={`w-4 h-4 flex-shrink-0 border border-border-strong ${
                      poll.voteType === 'single' ? 'rounded-full' : 'rounded'
                    }`} />
                    <input
                      ref={el => { optionRefs.current[idx] = el }}
                      type="text"
                      value={opt.label}
                      onChange={e => updateOption(opt.id, e.target.value)}
                      onKeyDown={e => handleOptionKeyDown(e, opt.id, idx)}
                      placeholder={`Option ${idx + 1}`}
                      maxLength={80}
                      className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-mute focus:outline-none focus:ring-1 focus:ring-select"
                    />
                    <button
                      onClick={() => removeOption(opt.id)}
                      disabled={poll.options.length <= 2}
                      className="w-6 h-6 flex items-center justify-center rounded text-text-mute opacity-0 group-hover:opacity-100 hover:text-text-hi transition-all disabled:cursor-not-allowed disabled:opacity-0"
                      aria-label="Remove option"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add option */}
                {poll.options.length < 6 && (
                  <button
                    onClick={addOption}
                    className="flex items-center gap-2 text-xs text-text-mute hover:text-text-lo transition-colors px-6 py-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add option
                    <span className="text-text-mute/50">{poll.options.length}/6</span>
                  </button>
                )}
              </div>

              {/* QoL row: duration + write-in + shuffle */}
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border">
                {/* Duration */}
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-text-mute" />
                  <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5">
                    {DURATION_OPTIONS.map(d => (
                      <button
                        key={d.label}
                        onClick={() => setPoll(p => ({ ...p, durationDays: d.value }))}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          poll.durationDays === d.value
                            ? 'bg-surface-4 text-text-hi'
                            : 'text-text-mute hover:text-text-lo'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="w-px h-4 bg-border" />

                {/* Write-in */}
                <button
                  onClick={() => setPoll(p => ({ ...p, allowWriteIn: !p.allowWriteIn }))}
                  className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                    poll.allowWriteIn ? 'text-select' : 'text-text-mute hover:text-text-lo'
                  }`}
                  title="Allow voters to add their own answer"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  Write-in
                </button>

                {/* Shuffle */}
                <button
                  onClick={() => setPoll(p => ({ ...p, shuffleOptions: !p.shuffleOptions }))}
                  className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                    poll.shuffleOptions ? 'text-select' : 'text-text-mute hover:text-text-lo'
                  }`}
                  title="Randomize option order for each voter"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Shuffle
                </button>

                {/* Trash — clear entire poll */}
                <button
                  onClick={() => setPoll(defaultPoll())}
                  className="ml-auto flex items-center gap-1.5 text-[11px] text-text-mute hover:text-destructive transition-colors"
                  title="Reset poll"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>

          ) : (
            /* ── TEXT MODE ── */
            <>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Share an update with your audience..."
                className="w-full h-32 bg-surface-2 rounded-xl px-4 py-3 text-sm text-text-hi placeholder:text-text-mute resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />

              {showMediaInput && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={mediaUrl}
                    onChange={e => setMediaUrl(e.target.value)}
                    placeholder="Paste image URL..."
                    className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-mute focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button onClick={() => { setShowMediaInput(false); setMediaUrl('') }} className="text-text-mute hover:text-text-lo">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {showCtaInput && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ctaLabel}
                    onChange={e => setCtaLabel(e.target.value)}
                    placeholder="Button label"
                    className="w-28 bg-surface-2 rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-mute focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    type="text"
                    value={ctaUrl}
                    onChange={e => setCtaUrl(e.target.value)}
                    placeholder="Button URL"
                    className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm text-text-hi placeholder:text-text-mute focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button onClick={() => { setShowCtaInput(false); setCtaLabel(''); setCtaUrl('') }} className="text-text-mute hover:text-text-lo">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}

          {/* Toolbar row — shared */}
          <div className="flex items-center gap-1">
            {/* Poll toggle */}
            <button
              onClick={togglePollMode}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                pollMode ? 'bg-select-soft text-select ring-1 ring-select-border' : 'text-text-lo hover:text-text-hi hover:bg-surface-2'
              }`}
              title="Add poll"
            >
              <BarChart2 className="w-4 h-4" />
            </button>

            {/* Media — disabled in poll mode */}
            <button
              onClick={() => !pollMode && setShowMediaInput(!showMediaInput)}
              disabled={pollMode}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                pollMode
                  ? 'text-text-mute/30 cursor-not-allowed'
                  : showMediaInput
                    ? 'bg-accent text-primary-foreground'
                    : 'text-text-lo hover:text-text-hi hover:bg-surface-2'
              }`}
              title={pollMode ? 'Not available with polls' : 'Add image'}
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            {/* CTA — disabled in poll mode */}
            <button
              onClick={() => !pollMode && setShowCtaInput(!showCtaInput)}
              disabled={pollMode}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                pollMode
                  ? 'text-text-mute/30 cursor-not-allowed'
                  : showCtaInput
                    ? 'bg-accent text-primary-foreground'
                    : 'text-text-lo hover:text-text-hi hover:bg-surface-2'
              }`}
              title={pollMode ? 'Not available with polls' : 'Add button'}
            >
              <Link2 className="w-4 h-4" />
            </button>

            {/* Mention */}
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
              title="Mention"
            >
              <AtSign className="w-4 h-4" />
            </button>

            <div className="flex-1" />

            {/* Notify */}
            <button
              onClick={() => setNotify(!notify)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                notify ? 'bg-gold-soft text-gold' : 'text-text-mute hover:text-text-lo hover:bg-surface-2'
              }`}
              title="Notify tagged tiers"
            >
              <Bell className="w-3.5 h-3.5" />
              Notify
            </button>
          </div>

          {/* Tier targeting */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-mute">Visible to:</span>
            {TIER_OPTIONS.map(tier => (
              <button
                key={tier.id}
                onClick={() => toggleTier(tier.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedTiers.includes(tier.id)
                    ? 'bg-surface-3 text-text-hi ring-1 ring-border-strong'
                    : 'bg-surface-2 text-text-mute hover:text-text-lo'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-surface-0/50">
          <p className="text-xs text-text-mute">
            {pollMode
              ? poll.durationDays ? `Poll closes in ${poll.durationDays}d` : 'Poll runs until closed'
              : 'Replaces your current billboard update.'}
          </p>
          <button
            onClick={handlePublish}
            disabled={!hasContent}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              hasContent
                ? pollMode
                  ? 'bg-select text-white hover:opacity-90'
                  : 'bg-accent text-primary-foreground hover:opacity-90'
                : 'bg-surface-2 text-text-mute cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            {pollMode ? 'Launch Poll' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}

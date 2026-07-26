'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  RefreshCw,
  MessageCircle,
  Heart,
  ExternalLink,
  Clock,
  Users,
  BarChart2,
  CheckSquare,
  Circle,
} from 'lucide-react'
import type { UpdateData, PollOption } from './update-composer'

// ── Mock vote data for preview ──
const MOCK_VOTES: Record<number, number> = { 0: 41, 1: 28, 2: 19, 3: 12 }

function PollDisplay({ poll }: { poll: NonNullable<UpdateData['poll']> }) {
  const [voted, setVoted] = useState<Set<number>>(new Set())
  const totalVotes = Object.values(MOCK_VOTES).reduce((a, b) => a + b, 0)
  const hasVoted = voted.size > 0

  const handleVote = (idx: number) => {
    if (poll.voteType === 'single') {
      setVoted(new Set([idx]))
    } else {
      setVoted(prev => {
        const next = new Set(prev)
        next.has(idx) ? next.delete(idx) : next.add(idx)
        return next
      })
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Poll meta */}
      <div className="flex items-center gap-2 text-[11px] text-text-mute">
        <BarChart2 className="w-3.5 h-3.5" />
        <span>{poll.voteType === 'single' ? 'Single choice' : 'Multiple choice'}</span>
        {poll.durationDays && (
          <>
            <span>·</span>
            <Clock className="w-3 h-3" />
            <span>{poll.durationDays}d remaining</span>
          </>
        )}
        {hasVoted && (
          <>
            <span>·</span>
            <span>{totalVotes + voted.size} votes</span>
          </>
        )}
      </div>

      {/* Options */}
      <div className="space-y-2">
        {poll.options.map((opt: PollOption, idx: number) => {
          const pct = hasVoted ? Math.round(((MOCK_VOTES[idx] ?? 0) / (totalVotes + 1)) * 100) : 0
          const isVoted = voted.has(idx)
          return (
            <button
              key={opt.id}
              onClick={() => handleVote(idx)}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left overflow-hidden transition-colors ${
                isVoted
                  ? 'border-accent bg-accent-soft text-text-hi'
                  : 'border-border bg-surface-2 hover:bg-surface-3 text-text-mid'
              }`}
            >
              {/* Bar fill */}
              {hasVoted && (
                <div
                  className="absolute inset-0 bg-accent/10 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              )}
              {/* Indicator */}
              <div className={`relative w-4 h-4 flex-shrink-0 border ${
                poll.voteType === 'single' ? 'rounded-full' : 'rounded'
              } flex items-center justify-center ${
                isVoted ? 'border-accent bg-accent' : 'border-border-strong'
              }`}>
                {isVoted && poll.voteType === 'single' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                {isVoted && poll.voteType === 'multiple' && <div className="w-2.5 h-2.5 text-white flex items-center justify-center"><svg viewBox="0 0 10 10" className="w-2.5 h-2.5 stroke-white fill-none stroke-2"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg></div>}
              </div>
              {/* Label */}
              <span className="relative text-sm flex-1">{opt.label}</span>
              {/* Pct */}
              {hasVoted && (
                <span className="relative text-xs text-text-mute font-mono">{pct}%</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Vote / change vote */}
      {hasVoted && (
        <button
          onClick={() => setVoted(new Set())}
          className="text-xs text-text-mute hover:text-text-lo transition-colors"
        >
          Change vote
        </button>
      )}
    </div>
  )
}

interface UpdateCardProps {
  update: UpdateData & { timestamp: string; author: string }
  isEditing: boolean
  onEdit?: () => void
  onReplace?: () => void
}

export function UpdateCard({ update, isEditing, onEdit, onReplace }: UpdateCardProps) {
  const [expanded, setExpanded] = useState(false)

  const tierLabels: Record<string, { label: string; color: string }> = {
    public: { label: 'Public', color: 'bg-surface-3 text-text-mid' },
    basic: { label: 'Basic', color: 'bg-accent-soft text-accent' },
    tier2: { label: 'Tier 2', color: 'bg-gold-soft text-gold' },
    inner: { label: 'Inner Circle', color: 'bg-select-soft text-select' },
  }

  // Truncate for collapsed view
  const isLong = update.body.length > 120
  const previewText = isLong && !expanded 
    ? update.body.slice(0, 120) + '...' 
    : update.body

  return (
    <div className="bg-surface-1 rounded-2xl border border-border overflow-hidden">
      {/* Main content */}
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center text-sm font-semibold text-text-lo flex-shrink-0">
              EA
            </div>
            <div>
              <p className="text-sm font-medium text-text-hi">{update.author}</p>
              <div className="flex items-center gap-2 text-xs text-text-mute">
                <Clock className="w-3 h-3" />
                <span>{update.timestamp}</span>
              </div>
            </div>
          </div>

          {/* Tier badges */}
          <div className="flex items-center gap-1.5">
            {update.tiers.slice(0, 2).map(tierId => {
              const tier = tierLabels[tierId]
              return tier ? (
                <span
                  key={tierId}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${tier.color}`}
                >
                  {tier.label}
                </span>
              ) : null
            })}
            {update.tiers.length > 2 && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-2 text-text-mute">
                +{update.tiers.length - 2}
              </span>
            )}
          </div>
        </div>

        {/* Body text — question when poll */}
        <p className="text-sm text-text-mid leading-relaxed">
          {previewText}
        </p>

        {/* Poll */}
        {update.poll && <PollDisplay poll={update.poll} />}

        {/* Media (if expanded or short) */}
        {update.mediaUrl && (expanded || !isLong) && (
          <div className="mt-4 rounded-xl overflow-hidden bg-surface-2 h-48 flex items-center justify-center">
            <span className="text-xs text-text-mute">Media billboard</span>
          </div>
        )}

        {/* CTA button */}
        {update.ctaLabel && update.ctaUrl && (expanded || !isLong) && (
          <a
            href={update.ctaUrl}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-accent text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {update.ctaLabel}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        {/* Engagement hints (expanded only) */}
        {expanded && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
            <span className="flex items-center gap-1.5 text-xs text-text-mute">
              <Heart className="w-3.5 h-3.5" />
              24 likes
            </span>
            <span className="flex items-center gap-1.5 text-xs text-text-mute">
              <MessageCircle className="w-3.5 h-3.5" />
              8 comments
            </span>
            <span className="flex items-center gap-1.5 text-xs text-text-mute">
              <Users className="w-3.5 h-3.5" />
              Reached 412
            </span>
          </div>
        )}
      </div>

      {/* Footer: expand/collapse + edit controls */}
      <div className="flex items-center justify-between px-5 py-3 bg-surface-0/50 border-t border-border">
        {/* Expand/Collapse */}
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-text-lo hover:text-text-mid transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Read more
              </>
            )}
          </button>
        )}
        {!isLong && <div />}

        {/* Edit controls (creator mode only) */}
        {isEditing && (
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-lo hover:text-text-hi hover:bg-surface-2 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={onReplace}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent hover:bg-accent-soft transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Replace
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* Older Updates row */
export function OlderUpdatesRow({ count, onClick }: { count: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-surface-1/50 border border-dashed border-border text-xs text-text-mute hover:text-text-lo hover:bg-surface-1 transition-colors"
    >
      <Clock className="w-3.5 h-3.5" />
      {count} older update{count !== 1 ? 's' : ''} in journal
      <ChevronDown className="w-3.5 h-3.5" />
    </button>
  )
}

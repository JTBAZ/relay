'use client'

import { ACTION_COLORS, ACTION_LABELS, type ScheduleEvent } from "@/lib/schedule-rail-data";
import { formatInstantInTimeZone } from "@/lib/goal-cycle-schedule-local";

interface DayOverflowListProps {
  day: number
  /** e.g. "July 14" — falls back to day number */
  heading?: string
  events: ScheduleEvent[]
  timeZone?: string
  onSelect: (event: ScheduleEvent) => void
  onClose: () => void
}

export function DayOverflowList({
  day,
  heading,
  events,
  timeZone = "UTC",
  onSelect,
  onClose,
}: DayOverflowListProps) {
  return (
    <div className="animate-popover-in w-[248px] overflow-hidden rounded-2xl border border-[#242a27] bg-[#0e100f] shadow-2xl shadow-black/60 ring-1 ring-white/5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1f1f1f] px-4 py-3">
        <span className="text-[12px] font-medium tabular-nums text-[#e8e8e8]">
          {heading ?? `Day ${day}`}
        </span>
        <button
          onClick={onClose}
          className="text-[#555] hover:text-[#aaa] transition-colors"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Event list */}
      <div className="py-1">
        {events.map((evt) => {
          const color = ACTION_COLORS[evt.action]
          const time = formatInstantInTimeZone(evt.at, timeZone, {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
          return (
            <button
              key={evt.id}
              onClick={() => onSelect(evt)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#161616] transition-colors text-left group"
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: color,
                  opacity: evt.status === 'done' ? 0.35 : 1,
                }}
              />
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span
                  className={`text-[11.5px] font-medium leading-snug truncate ${
                    evt.status === 'done' ? 'text-[#555]' : 'text-[#ccc] group-hover:text-[#e8e8e8]'
                  }`}
                >
                  {evt.title}
                </span>
                <span className="text-[10.5px] tabular-nums text-[#555]">
                  {time} · {ACTION_LABELS[evt.action]}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

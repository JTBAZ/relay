'use client'

import { useState } from 'react'
import {
  ACTION_COLORS,
  DEST_LABELS,
  type Destination,
  type ScheduleEvent,
  type ReadyItem,
  type ScheduleRailDestinationChild,
} from "@/lib/schedule-rail-data";
import type { StagedMediaDragItem } from "@/lib/staged-media-dnd";
import {
  datetimeLocalFromIso,
  formatInstantInTimeZone,
  isoFromDatetimeLocal,
} from "@/lib/goal-cycle-schedule-local";
import { EventMediaDropBin, eventMediaIncomplete, eventShowsMediaBin } from "./EventMediaDropBin";

type EventItem = ScheduleEvent | ReadyItem

interface EventPopoverProps {
  event: EventItem
  /** Creator / display IANA timezone for day + clock formatting. */
  timeZone?: string
  onDone: (id: string) => void
  onDelete: (id: string) => void
  onNotifyToggle: (id: string, val: boolean) => void
  onEditTime?: (id: string, scheduledForIso: string) => void | Promise<void>
  /** Phase 8 / VS8: drop → replace media on event post. */
  onMediaCommit?: (event: EventItem, mediaIds: string[]) => void | Promise<void>
  /** VS8: clear/remove attached media. */
  onMediaClear?: (event: EventItem) => void | Promise<void>
  onClose: () => void
  mediaCommitLabel?: string
  mediaCommitBusy?: boolean
  mediaCommitError?: string | null
  onPrepareOccurrence?: (occurrenceId: string) => void | Promise<void>
}

function isScheduleEvent(e: EventItem): e is ScheduleEvent {
  return 'at' in e
}

function destChildren(event: EventItem): ScheduleRailDestinationChild[] {
  if (event.destinations && event.destinations.length > 0) {
    return event.destinations
  }
  return [
    {
      destination: event.destination,
      task_id: event.task_id ?? event.id,
      variant_id: event.variant_id ?? "",
      status: event.status,
      publish_confirm_path: event.publish_confirm_path ?? null,
    },
  ]
}

function statusChipClass(status: ScheduleRailDestinationChild["status"]): string {
  if (status === "done") return "text-[#9bf0c4]/80 border-[#2a3a32]"
  if (status === "overdue") return "text-[#f0b86a] border-[#3a3020]"
  return "text-[#aaa] border-[#2a2a2a]"
}

export function EventPopover({
  event,
  timeZone = "UTC",
  onDone,
  onDelete,
  onNotifyToggle,
  onEditTime,
  onMediaCommit,
  onMediaClear,
  onClose,
  mediaCommitLabel = "Attach media",
  mediaCommitBusy = false,
  mediaCommitError = null,
  onPrepareOccurrence,
}: EventPopoverProps) {
  const [deleteHover, setDeleteHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [mediaFilled, setMediaFilled] = useState<StagedMediaDragItem[]>([])
  const [editValue, setEditValue] = useState(() => {
    if (!isScheduleEvent(event)) return ''
    return datetimeLocalFromIso(event.at, timeZone)
  })
  const color = ACTION_COLORS[event.action]
  const children = destChildren(event)
  const multiDest = children.length > 1
  const isDone = event.status === 'done'
  const showMediaDrop = eventShowsMediaBin(event)
  const mediaIncomplete = eventMediaIncomplete(event)
  const taskKind = event.task_kind ?? null
  const isBoundedNonPublish =
    taskKind === "social_upkeep" || taskKind === "active_rest" ||
    event.action === "repost" || event.action === "pin_comment" ||
    (taskKind !== "publish" && event.action === "schedule")
  const doneLabel = isDone
    ? "Completed"
    : isBoundedNonPublish
      ? taskKind === "active_rest"
        ? "Mark rest done"
        : "Mark upkeep done"
      : "Done"

  const formattedDay = isScheduleEvent(event)
    ? formatInstantInTimeZone(event.at, timeZone, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "When ready"

  const formattedClock = isScheduleEvent(event)
    ? formatInstantInTimeZone(event.at, timeZone, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null

  const openLinkLabel =
    event.destination == null ? "Open link" : "Open post"

  const primaryTaskId = event.task_id ?? event.id

  return (
    <div
      className="animate-popover-in flex w-[280px] flex-col overflow-hidden rounded-2xl border border-[#242a27] bg-[#0e100f] shadow-2xl shadow-black/60 ring-1 ring-white/5"
      role="dialog"
      aria-modal="false"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: color }}
          />
          <span className="text-[13px] font-medium leading-snug text-[#e8e8e8] truncate">
            {event.title}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isScheduleEvent(event) && event.link && (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#666] hover:text-[#aaa] transition-colors"
              aria-label={openLinkLabel}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path d="M7.5 1.5H11.5V5.5M11.5 1.5L6 7M5 2.5H2.5C1.948 2.5 1.5 2.948 1.5 3.5V10.5C1.5 11.052 1.948 11.5 2.5 11.5H9.5C10.052 11.5 10.5 11.052 10.5 10.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          )}
          <button
            onClick={onClose}
            className="text-[#666] hover:text-[#aaa] transition-colors p-0.5"
            aria-label="Close"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M2 2L11 11M11 2L2 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Rationale */}
      {event.rationale && (
        <p className="px-4 pb-3 text-[11.5px] leading-relaxed text-[#888]">
          {event.rationale}
        </p>
      )}

      {event.series_id ? (
        <div className="flex items-center justify-between gap-2 px-4 pb-3" data-testid="series-badge">
          <a
            href="/studio/autopost/routines"
            className="rounded-full border border-[#2a3a32] bg-[#121a16] px-2 py-0.5 text-[10px] font-medium text-[#9bf0c4] hover:bg-[#18241e]"
          >
            Routine{event.series_cadence ? ` · ${event.series_cadence}` : ""}
          </a>
          {event.source === "recurrence_occurrence" && onPrepareOccurrence ? (
            <button
              type="button"
              className="text-[11px] font-medium text-[#9bf0c4] hover:text-[#b8f5d4]"
              onClick={() => void onPrepareOccurrence(event.id)}
              data-testid="prepare-occurrence"
            >
              Prepare now
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Divider */}
      <div className="mx-4 border-t border-[#1f1f1f]" />

      {/* Metadata rows: destination → day → time */}
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {/* Destination (+ open link) */}
        <div className="flex items-start gap-2">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-[#666] flex-shrink-0 mt-0.5" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M6.5 2C6.5 2 4 4.5 4 6.5C4 8.5 6.5 11 6.5 11C6.5 11 9 8.5 9 6.5C9 4.5 6.5 2 6.5 2Z" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M2 6.5H11" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {children.map((child) => {
              const label = child.destination
                ? DEST_LABELS[child.destination as NonNullable<Destination>]
                : "No destination"
              const childDone = child.status === "done"
              return (
                <div
                  key={child.task_id}
                  className="flex items-center gap-1.5"
                  data-task-id={child.task_id}
                >
                  <span
                    className={`text-[11px] tabular-nums bg-[#1a1a1a] border rounded px-1.5 py-0.5 ${statusChipClass(child.status)}`}
                  >
                    {label}
                    {multiDest ? ` · ${child.status}` : ""}
                  </span>
                  {multiDest ? (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        disabled={childDone}
                        onClick={() => onDone(child.task_id)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                          childDone
                            ? "cursor-default text-[#555]"
                            : "text-[#9bf0c4] hover:bg-[#9bf0c4]/10"
                        }`}
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(child.task_id)}
                        className="rounded px-1.5 py-0.5 text-[10px] text-[#555] hover:text-red-400"
                      >
                        Dismiss
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {isScheduleEvent(event) && event.link ? (
              <a
                href={event.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#9bf0c4] hover:text-[#b8f5d4] transition-colors flex items-center gap-1"
              >
                {openLinkLabel}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M5.5 1H9V4.5M9 1L4.5 5.5M3.5 1.5H1.5C1.22 1.5 1 1.72 1 2V8C1 8.28 1.22 8.5 1.5 8.5H7.5C7.78 8.5 8 8.28 8 8V6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            ) : null}
          </div>
        </div>

        {/* Day */}
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-[#666] flex-shrink-0" aria-hidden="true">
            <rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M1.5 5.5H11.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M4 1.5V3.5M9 1.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span className="text-[11px] tabular-nums text-[#aaa]">{formattedDay}</span>
        </div>

        {/* Time */}
        {formattedClock ? (
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-[#666] flex-shrink-0" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6.5 4V6.5L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[11px] tabular-nums text-[#aaa]">{formattedClock}</span>
          </div>
        ) : null}
      </div>

      {/* Bounded upkeep / active-rest instructions (VS8-T03) */}
      {isBoundedNonPublish && (event.instructions || event.rationale) ? (
        <>
          <div className="mx-4 border-t border-[#1f1f1f]" />
          <div className="px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">
              {taskKind === "active_rest" ? "Active rest" : "Social upkeep"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#aaa]">
              {event.instructions || event.rationale}
            </p>
          </div>
        </>
      ) : null}

      {/* Media drop — pending publish posts (attach / replace) */}
      {showMediaDrop ? (
        <>
          <div className="mx-4 border-t border-[#1f1f1f]" />
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#555]">
              Media
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[#666]">
              {mediaIncomplete
                ? "Drop Import Bay media here to attach to this event."
                : "Media attached — drop to replace, or clear to remove."}
            </p>
            {event.draft_id ? (
              <a
                href={`/studio/autopost?draft_id=${encodeURIComponent(event.draft_id)}`}
                className="mt-1.5 inline-block text-[10px] font-medium text-[#9bf0c4] hover:underline"
              >
                {mediaIncomplete ? "Continue in Autopost" : "Open in Autopost"}
              </a>
            ) : null}
            {event.media_state ? (
              <p className="mt-1 text-[10px] tabular-nums text-[#777]" role="status">
                State: {event.media_state}
                {typeof event.media_count === "number" ? ` · ${event.media_count}` : ""}
              </p>
            ) : null}
          </div>
          <EventMediaDropBin
            filled={mediaFilled}
            onFilledChange={setMediaFilled}
            attachedCount={event.media_count ?? 0}
            readinessErrors={event.readiness_errors ?? []}
            onClearAttached={() => {
              void (async () => {
                try {
                  await onMediaClear?.(event)
                  setMediaFilled([])
                } catch {
                  /* host surfaces mediaCommitError */
                }
              })()
            }}
            onCommit={(mediaIds) => {
              void (async () => {
                try {
                  await onMediaCommit?.(event, mediaIds)
                  setMediaFilled([])
                  onClose()
                } catch {
                  /* host surfaces mediaCommitError; keep bin filled */
                }
              })()
            }}
            commitLabel={mediaCommitBusy ? "Saving…" : mediaCommitLabel}
            commitDisabled={mediaCommitBusy}
          />
          {mediaCommitError ? (
            <p className="px-4 pb-2 text-[10px] leading-snug text-red-400/90">{mediaCommitError}</p>
          ) : null}
          {!mediaIncomplete && event.publish_confirm_path ? (
            <div className="px-4 pb-3">
              <a
                href={event.publish_confirm_path}
                className="block w-full rounded-lg border border-[#2a2a2a] bg-[#121212] py-2 text-center text-[11px] font-medium text-[#9bf0c4] hover:border-[#9bf0c4]/40"
              >
                Confirm publish in Studio
              </a>
              <p className="mt-1 text-[9px] leading-snug text-[#555]">
                Opens the existing handoff flow — Relay never publishes for you.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Divider */}
      <div className="mx-4 border-t border-[#1f1f1f]" />

      {/* Notify toggle */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-[11.5px] text-[#aaa]">Notify me</span>
        <button
          role="switch"
          aria-checked={event.notify}
          onClick={() => onNotifyToggle(primaryTaskId, !event.notify)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9bf0c4]/50 ${
            event.notify ? 'bg-[#9bf0c4]' : 'bg-[#2a2a2a]'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#050706] transition-transform ${
              event.notify ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Plan one-liner */}
      {event.plan_label && event.plan_index && event.plan_total && (
        <>
          <div className="mx-4 border-t border-[#1f1f1f]" />
          <div className="px-4 py-2.5">
            <span className="text-[11px] text-[#666]">
              Part of:{' '}
              <span className="text-[#888]">{event.plan_label}</span>
              {' · '}
              <span className="tabular-nums text-[#666]">{event.plan_index} of {event.plan_total}</span>
            </span>
          </div>
        </>
      )}

      {/* Divider */}
      <div className="mx-4 border-t border-[#1f1f1f]" />

      {/* Done button — single-dest; multi uses per-row Done */}
      {!multiDest ? (
        <div className="px-4 pt-3 pb-2">
          <button
            onClick={() => onDone(primaryTaskId)}
            disabled={isDone}
            className={`w-full py-2 rounded-lg text-[12.5px] font-medium transition-all ${
              isDone
                ? 'bg-[#1a1a1a] text-[#555] cursor-default'
                : 'bg-[#9bf0c4] text-[#050706] hover:bg-[#b8f5d4] active:scale-[0.98]'
            }`}
          >
            {doneLabel}
          </button>
        </div>
      ) : (
        <div className="px-4 pt-2 pb-1">
          <p className="text-[10px] leading-snug text-[#555]">
            Mark each destination Done when published. Partial success stays on the calendar.
          </p>
        </div>
      )}

      {/* Edit / Delete */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        {editing && onEditTime && isScheduleEvent(event) ? (
          <div className="flex flex-col gap-1.5">
            <input
              type="datetime-local"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded border border-[#2a2a2a] bg-[#121212] px-2 py-1 text-[11px] text-[#e8e8e8]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-[11px] text-[#666]"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-[11px] text-[#9bf0c4]"
                onClick={() => {
                  const iso = isoFromDatetimeLocal(editValue, timeZone)
                  void onEditTime(primaryTaskId, iso)
                  setEditing(false)
                  onClose()
                }}
              >
                Save time
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={!onEditTime || !isScheduleEvent(event)}
            onClick={() => setEditing(true)}
            className="text-[12px] text-[#888] hover:text-[#e8e8e8] transition-colors py-1 px-2 -ml-2 rounded disabled:opacity-40"
          >
            Edit
          </button>
          {!multiDest ? (
            <button
              type="button"
              onMouseEnter={() => setDeleteHover(true)}
              onMouseLeave={() => setDeleteHover(false)}
              onClick={() => onDelete(primaryTaskId)}
              className={`text-[12px] transition-colors py-1 px-2 -mr-2 rounded ${
                deleteHover ? 'text-red-400' : 'text-[#555]'
              }`}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

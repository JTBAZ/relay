"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect, type DragEvent } from "react";
import {
  ACTION_COLORS,
  railItemDestLabels,
  railItemMatchesId,
  type ScheduleData,
  type ScheduleEvent,
  type ReadyItem,
} from "@/lib/schedule-rail-data";
import { RELAY_STAGED_MEDIA_MIME } from "@/lib/staged-media-dnd";
import { resolveScheduleDisplayTimeZone } from "@/lib/goal-cycle-schedule-local";
import { EventPopover } from "./EventPopover";
import { DayOverflowList } from "./DayOverflowList";
import { DropAssetsCard, type DropAssetsFilledItem, type DropScheduleTarget } from "./DropAssetsCard";
import { AddEventPopover, type CreateEventPayload, type MissingPlatformLinkState } from "./AddEventPopover";
import { RepeatEventPrompt, type RepeatEventSeed } from "./RepeatEventPrompt";
import {
  FollowUpPlaybookPrompt,
  type PlaybookEventSeed,
} from "./FollowUpPlaybookPrompt";
import { eventNeedsMediaDrop, eventShowsMediaBin } from "./EventMediaDropBin";
import LibraryEmptyState from "@/app/components/studio/LibraryEmptyState";
import { Lab2IntakeBand } from "@/app/components/studio-lab2/Lab2IntakeBand";
import type { ApplySocialPlaybookBody } from "@/lib/social-playbooks-api";
import {
  computeScheduleRailPopoverFit,
  SCHEDULE_RAIL_POPOVER_ESTIMATED_HEIGHT_PX,
} from "@/lib/schedule-rail-popover-fit";
import { formatInstantInTimeZone } from "@/lib/goal-cycle-schedule-local";
import {
  MediaAttachReceipt,
  type MediaAttachReceiptData,
} from "./MediaAttachReceipt";

/** Expanded Scheduler width (v0 `/2` panel). */
export const SCHEDULE_RAIL_WIDTH_PX = 224;
/** Lab Library — modestly wider right column (resize only). */
export const SCHEDULE_RAIL_LAB_WIDTH_PX = 280;
/** Lab2 fused Studio — wider rail for drop ritual + choice surface. */
export const SCHEDULE_RAIL_LAB2_WIDTH_PX = 304;

const DAY_ROW_PX = 34;
const DAY_ROW_LAB_PX = 38;

const SET_GOAL_HREF = "/studio/analytics";

function dayOfEvent(event: ScheduleEvent | ReadyItem, timeZone: string): number | null {
  if (!("at" in event) || !event.at) return null;
  const day = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(new Date(event.at))
  );
  return Number.isFinite(day) ? day : null;
}

interface ScheduleRailProps {
  data: ScheduleData;
  onDataChange: (data: ScheduleData) => void;
  remindersGlobal: boolean;
  onRemindersToggle: (val: boolean) => void;
  /** When true, Drop Assets shows planned destination chips from the live cue. */
  armed?: boolean;
  presentDestinations?: string[];
  missingDestinations?: string[];
  dropFilled?: DropAssetsFilledItem[];
  onDropFilledChange?: (items: DropAssetsFilledItem[]) => void;
  onDropCommit?: (mediaIds: string[]) => void;
  /** Lab2: magnetic drop ritual + decisive AutoPost / Schedule panel. */
  dropPresentation?: "default" | "ritual";
  /** Creator id for media thumb URLs in event popovers. */
  creatorId?: string;
  /** Phase 8 — attach media to scheduled post event. */
  onEventMediaCommit?: (
    event: ScheduleEvent | ReadyItem,
    mediaIds: string[]
  ) => void | Promise<void>;
  onEventMediaClear?: (event: ScheduleEvent | ReadyItem) => void | Promise<void>;
  mediaCommitBusy?: boolean;
  mediaCommitError?: string | null;
  onDelete?: (id: string) => void | Promise<void>;
  onEditTime?: (id: string, scheduledForIso: string) => void | Promise<void>;
  /** Create Event (manual social reminders + optional draft). */
  allowAddScheduledPost?: boolean;
  onAddScheduledPost?: (
    payload: CreateEventPayload
  ) => void | Promise<void | boolean | ScheduleEvent>;
  addScheduledPostBusy?: boolean;
  addScheduledPostError?: string | null;
  addEventLocked?: boolean;
  addEventUpgradeHref?: string;
  addEventMissingLink?: MissingPlatformLinkState | null;
  onClearAddEventMissingLink?: () => void;
  /** Autopost gate for post-create routine / playbook prompts. */
  autopostAllowed?: boolean;
  /** Opens Schedule Rail Automations modal (dumb trigger — not a PopoverTarget). */
  onOpenAutomations?: () => void;
  /** Open shared AutomationApprovalOverlay for awaiting-review rail events. */
  onOpenAutomationApproval?: (args: {
    automationId: string;
    runId: string;
    draftId?: string | null;
  }) => void;
  onCreateScheduleSeries?: (body: import("@/lib/autopost-routines-api").CreateScheduleSeriesBody) => void | Promise<void>;
  createSeriesBusy?: boolean;
  createSeriesError?: string | null;
  onApplySocialPlaybook?: (body: ApplySocialPlaybookBody) => void | Promise<void>;
  applyPlaybookBusy?: boolean;
  applyPlaybookError?: string | null;
  onPrepareOccurrence?: (occurrenceId: string) => void | Promise<void>;
  /** After create: scroll calendar to this event, pop-in animate, open popover. */
  focusEventId?: string | null;
  /** Additional event ids to highlight briefly (Goal Cycle multi-slot handoff). */
  highlightEventIds?: string[];
  onFocusEventConsumed?: () => void;
  /** Lab2: Import Bay is actively dragging — arm the intake corridor. */
  corridorArmed?: boolean;
  /** Override rail width (lab uses a modestly wider column). */
  widthPx?: number;
}

type PopoverTarget =
  | { kind: "event"; event: ScheduleEvent | ReadyItem }
  | { kind: "overflow"; day: number; events: ScheduleEvent[] }
  | { kind: "add" }
  | { kind: "playbook"; seed: PlaybookEventSeed }
  | { kind: "repeat"; seed: RepeatEventSeed }
  | null;

function groupByDay(events: ScheduleEvent[], timeZone: string): Record<number, ScheduleEvent[]> {
  const map: Record<number, ScheduleEvent[]> = {};
  for (const ev of events) {
    const d = Number(
      new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(new Date(ev.at))
    );
    if (!map[d]) map[d] = [];
    map[d].push(ev);
  }
  return map;
}

function sliceWidth(action: ScheduleEvent["action"]): string {
  if (action === "post" || action === "schedule") return "48px";
  if (action === "repost") return "32px";
  return "24px";
}

function monthParts(monthKey: string): { label: string; name: string } {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return { label: "MONTH", name: "Month" };
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return { label: `${name} ${y}`, name };
}

function isStagedMediaDrag(e: DragEvent): boolean {
  const types = [...e.dataTransfer.types];
  return types.includes(RELAY_STAGED_MEDIA_MIME) || types.includes("text/plain");
}

/** Prefer a hovered slice, else earliest incomplete post, else any attachable post that day. */
function pickMediaDropTarget(
  events: ScheduleEvent[],
  preferEventId?: string | null
): ScheduleEvent | null {
  if (preferEventId) {
    const preferred = events.find((e) => e.id === preferEventId && eventShowsMediaBin(e));
    if (preferred) return preferred;
  }
  return (
    events.find((e) => eventNeedsMediaDrop(e)) ??
    events.find((e) => eventShowsMediaBin(e)) ??
    null
  );
}

export function ScheduleRail({
  data,
  onDataChange,
  remindersGlobal,
  onRemindersToggle,
  dropFilled = [],
  onDropFilledChange,
  onDropCommit,
  dropPresentation = "default",
  creatorId,
  onEventMediaCommit,
  onEventMediaClear,
  mediaCommitBusy = false,
  mediaCommitError = null,
  onDelete,
  onEditTime,
  allowAddScheduledPost = false,
  onAddScheduledPost,
  addScheduledPostBusy = false,
  addScheduledPostError = null,
  addEventLocked = false,
  addEventUpgradeHref = "/studio/settings/billing?feature=studio_core",
  addEventMissingLink = null,
  onClearAddEventMissingLink,
  autopostAllowed = false,
  onOpenAutomations,
  onOpenAutomationApproval,
  onCreateScheduleSeries,
  createSeriesBusy = false,
  createSeriesError = null,
  onApplySocialPlaybook,
  applyPlaybookBusy = false,
  applyPlaybookError = null,
  onPrepareOccurrence,
  focusEventId = null,
  highlightEventIds = [],
  onFocusEventConsumed,
  corridorArmed = false,
  widthPx,
}: ScheduleRailProps) {
  const railWidth = widthPx ?? SCHEDULE_RAIL_WIDTH_PX;
  const isRitual = dropPresentation === "ritual";
  const dayRowPx = isRitual
    ? 28
    : railWidth >= SCHEDULE_RAIL_LAB_WIDTH_PX
      ? DAY_ROW_LAB_PX
      : DAY_ROW_PX;
  const [popover, setPopover] = useState<PopoverTarget>(null);
  const [popoverTopPx, setPopoverTopPx] = useState(96);
  const [popoverMaxHeightPx, setPopoverMaxHeightPx] = useState(
    SCHEDULE_RAIL_POPOVER_ESTIMATED_HEIGHT_PX
  );
  const [popoverNeedsScroll, setPopoverNeedsScroll] = useState(false);
  const [popSliceId, setPopSliceId] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [pulseDay, setPulseDay] = useState<number | null>(null);
  /** Day row currently catching an Import Bay media drag. */
  const [mediaDragDay, setMediaDragDay] = useState<number | null>(null);
  const [mediaDragSliceId, setMediaDragSliceId] = useState<string | null>(null);
  const [rowDropError, setRowDropError] = useState<string | null>(null);
  const [attachReceipt, setAttachReceipt] = useState<MediaAttachReceiptData | null>(null);
  const [postDetailsOpen, setPostDetailsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dayListRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const dayRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const preferredPopoverTopRef = useRef(96);
  const snoozed = !remindersGlobal;

  /** Unclamped preferred top (anchor-aligned); fit logic shifts/caps afterward. */
  const measurePreferredTop = useCallback((anchor: HTMLElement | null | undefined): number => {
    const root = rootRef.current;
    if (!root || !anchor) return 96;
    const rootRect = root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return Math.max(8, anchorRect.top - rootRect.top);
  }, []);

  const applyPopoverFit = useCallback((preferredTop: number, contentHeight?: number) => {
    const root = rootRef.current;
    if (!root) return;
    preferredPopoverTopRef.current = preferredTop;
    const rootRect = root.getBoundingClientRect();
    const fit = computeScheduleRailPopoverFit({
      rootTop: rootRect.top,
      rootHeight: rootRect.height,
      preferredTopInRoot: preferredTop,
      contentHeight: contentHeight ?? SCHEDULE_RAIL_POPOVER_ESTIMATED_HEIGHT_PX,
      viewportHeight: window.innerHeight,
    });
    setPopoverTopPx((prev) => (prev === fit.topPx ? prev : fit.topPx));
    setPopoverMaxHeightPx((prev) => (prev === fit.maxHeightPx ? prev : fit.maxHeightPx));
    setPopoverNeedsScroll((prev) => (prev === fit.needsScroll ? prev : fit.needsScroll));
  }, []);

  const displayTimeZone = resolveScheduleDisplayTimeZone(data.timezone);

  const openPopover = useCallback(
    (next: NonNullable<PopoverTarget>, anchorDay?: number) => {
      let preferred = 96;
      if (next.kind === "add" || next.kind === "repeat" || next.kind === "playbook") {
        preferred = measurePreferredTop(addButtonRef.current);
      } else if (next.kind === "overflow") {
        preferred = measurePreferredTop(dayRowRefs.current.get(next.day));
      } else if (next.kind === "event") {
        const day =
          anchorDay ??
          dayOfEvent(next.event, displayTimeZone) ??
          undefined;
        preferred =
          day != null ? measurePreferredTop(dayRowRefs.current.get(day)) : 96;
      }
      applyPopoverFit(preferred);
      setPopover(next);
    },
    [applyPopoverFit, displayTimeZone, measurePreferredTop]
  );

  const clearMediaDrag = useCallback(() => {
    setMediaDragDay(null);
    setMediaDragSliceId(null);
  }, []);

  const mediaDragCloseTimerRef = useRef(0);
  const popoverLayerRef = useRef<HTMLDivElement>(null);

  const cancelMediaDragClose = useCallback(() => {
    if (mediaDragCloseTimerRef.current) {
      window.clearTimeout(mediaDragCloseTimerRef.current);
      mediaDragCloseTimerRef.current = 0;
    }
  }, []);

  /** Open the event popover while dragging Import Bay media (attach or replace). */
  const openEventForMediaDrag = useCallback(
    (event: ScheduleEvent, day: number) => {
      cancelMediaDragClose();
      setMediaDragDay(day);
      setMediaDragSliceId(event.id);
      setRowDropError(null);
      applyPopoverFit(measurePreferredTop(dayRowRefs.current.get(day)));
      setPopover((prev) => {
        if (prev?.kind === "event" && prev.event.id === event.id) return prev;
        return { kind: "event", event };
      });
    },
    [applyPopoverFit, cancelMediaDragClose, measurePreferredTop]
  );

  const scheduleMediaDragClose = useCallback(() => {
    cancelMediaDragClose();
    mediaDragCloseTimerRef.current = window.setTimeout(() => {
      clearMediaDrag();
      setPopover((prev) => (prev?.kind === "event" ? null : prev));
      mediaDragCloseTimerRef.current = 0;
    }, 160);
  }, [cancelMediaDragClose, clearMediaDrag]);

  const todayDay = data.today_day && data.today_day > 0 ? data.today_day : 0;
  const daysInMonth = Math.max(28, Math.min(31, data.days_in_month ?? 31));
  const byDay = groupByDay(data.events, displayTimeZone);
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );
  const { label, name: monthName } = monthParts(data.month);

  const scheduleDropTargets = useMemo((): DropScheduleTarget[] => {
    return data.events
      .filter((ev) => eventShowsMediaBin(ev) && Boolean(ev.at))
      .slice()
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        at: ev.at,
        needsMedia: eventNeedsMediaDrop(ev),
      }));
  }, [data.events]);

  const showAttachReceipt = useCallback(
    (event: ScheduleEvent | ReadyItem) => {
      if (!("at" in event) || !event.at) return;
      const platformCount = Math.max(
        1,
        event.destinations?.length ?? (event.destination ? 1 : 1)
      );
      setAttachReceipt({
        eventId: event.task_id ?? event.id,
        scheduledLabel: formatInstantInTimeZone(event.at, displayTimeZone, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        platformCount,
        remind: event.notify !== false,
      });
    },
    [displayTimeZone]
  );

  const handleScheduleDropAttach = useCallback(
    async (eventId: string, mediaIds: string[]) => {
      const event = data.events.find((ev) => ev.id === eventId);
      if (!event) throw new Error("Event not found on this month’s rail.");
      await onEventMediaCommit?.(event, mediaIds);
      onDropFilledChange?.([]);
      showAttachReceipt(event);
      const day = dayOfEvent(event, displayTimeZone);
      if (day != null) {
        openEventForMediaDrag(event, day);
      } else {
        openPopover({ kind: "event", event });
      }
    },
    [
      data.events,
      displayTimeZone,
      onDropFilledChange,
      onEventMediaCommit,
      openEventForMediaDrag,
      openPopover,
      showAttachReceipt,
    ]
  );

  const focusConsumedRef = useRef(onFocusEventConsumed);
  focusConsumedRef.current = onFocusEventConsumed;
  /** One-shot: land the day list on today when the rail first mounts (not on soft reloads). */
  const scrolledToTodayRef = useRef(false);

  useEffect(() => {
    if (scrolledToTodayRef.current) return;
    if (!todayDay || todayDay < 1) return;
    // Create-focus owns the initial scroll when present.
    if (focusEventId) {
      scrolledToTodayRef.current = true;
      return;
    }

    let attempts = 0;
    let timer = 0;
    const tryScroll = () => {
      if (scrolledToTodayRef.current) return;
      const row = dayRowRefs.current.get(todayDay);
      if (row) {
        scrolledToTodayRef.current = true;
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts < 8) {
        attempts += 1;
        timer = window.setTimeout(tryScroll, 40);
      }
    };
    timer = window.setTimeout(tryScroll, 40);

    return () => window.clearTimeout(timer);
  }, [todayDay, focusEventId, daysInMonth]);

  useEffect(() => {
    if (!focusEventId) return;
    const event =
      data.events.find((e) => railItemMatchesId(e, focusEventId)) ??
      data.ready.find((e) => railItemMatchesId(e, focusEventId)) ??
      null;
    if (!event) return;

    const reduced =
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const paintMs = reduced ? 0 : 40;
    const openPopoverMs = reduced ? 0 : 280;
    const clearMs = reduced ? 400 : 1400;
    const scrollBehavior: ScrollBehavior = reduced ? "auto" : "smooth";

    let day: number | null = null;
    if ("at" in event && event.at) {
      day = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: displayTimeZone,
          day: "numeric",
        }).format(new Date(event.at))
      );
    }

    let clearTimer = 0;
    let openTimer = 0;
    // Allow the soft-reloaded event list to paint before scrolling; measure after scroll settles.
    const startTimer = window.setTimeout(() => {
      if (day != null && Number.isFinite(day)) {
        const row = dayRowRefs.current.get(day);
        row?.scrollIntoView({ behavior: scrollBehavior, block: "center" });
        setPulseDay(day);
      }
      setPopSliceId(event.id);
      const batch = new Set(
        [focusEventId, ...highlightEventIds].map((id) => id.trim()).filter(Boolean)
      );
      setHighlightIds(batch);
      openTimer = window.setTimeout(() => {
        // Don't steal post-create playbook / routine handoffs.
        setPopover((prev) => {
          if (prev?.kind === "playbook" || prev?.kind === "repeat") return prev;
          return { kind: "event", event };
        });
        if (day != null && Number.isFinite(day)) {
          applyPopoverFit(measurePreferredTop(dayRowRefs.current.get(day)));
        }
      }, openPopoverMs);
      clearTimer = window.setTimeout(() => {
        setPopSliceId(null);
        setPulseDay(null);
        setHighlightIds(new Set());
        focusConsumedRef.current?.();
      }, clearMs);
    }, paintMs);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(openTimer);
      window.clearTimeout(clearTimer);
    };
    // Intentionally keyed on focusEventId + event presence in data, not callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusConsumedRef / openPopover
  }, [
    focusEventId,
    highlightEventIds,
    data.events,
    data.ready,
    displayTimeZone,
    openPopover,
    applyPopoverFit,
    measurePreferredTop,
  ]);

  /** After layout, refit using real popover height so tall panels (media bin) stay on screen. */
  useLayoutEffect(() => {
    if (!popover) return;
    const layer = popoverLayerRef.current;
    const root = rootRef.current;
    if (!layer || !root) return;

    const refit = () => {
      // Measure intrinsic height without the scroll clamp (scrollHeight can lag).
      const prevMax = layer.style.maxHeight;
      const prevOverflow = layer.style.overflowY;
      layer.style.maxHeight = "none";
      layer.style.overflowY = "visible";
      const contentHeight = Math.max(layer.getBoundingClientRect().height, layer.scrollHeight, 160);
      layer.style.maxHeight = prevMax;
      layer.style.overflowY = prevOverflow;
      applyPopoverFit(preferredPopoverTopRef.current, contentHeight);
    };

    refit();
    const ro = new ResizeObserver(() => {
      refit();
    });
    ro.observe(layer);
    window.addEventListener("resize", refit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", refit);
    };
  }, [popover, applyPopoverFit]);

  /** Keep open event popover in sync after attach / unmount reloads rail media fields. */
  useEffect(() => {
    if (popover?.kind !== "event") return;
    const id = popover.event.id;
    const fresh =
      data.events.find((e) => railItemMatchesId(e, id)) ??
      data.ready.find((e) => railItemMatchesId(e, id));
    if (!fresh) return;
    const prev = popover.event;
    const sameMedia =
      prev.needs_media === fresh.needs_media &&
      prev.media_count === fresh.media_count &&
      prev.media_state === fresh.media_state &&
      (prev.media_ids ?? []).join("\0") === (fresh.media_ids ?? []).join("\0");
    if (sameMedia) return;
    setPopover({ kind: "event", event: fresh });
  }, [data.events, data.ready, popover]);

  const handleDelete = useCallback(
    (id: string) => {
      if (onDelete) {
        void onDelete(id);
        setPopover(null);
        return;
      }
      onDataChange({
        ...data,
        events: data.events.filter((e) => e.id !== id),
        ready: data.ready.filter((e) => e.id !== id),
      });
      setPopover(null);
    },
    [data, onDataChange, onDelete]
  );

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 overflow-visible">
      {popover !== null ? (
        <div
          ref={popoverLayerRef}
          className={`pointer-events-auto absolute right-full z-[70] mr-2 overscroll-contain ${
            popoverNeedsScroll ? "overflow-y-auto" : "overflow-visible"
          }`}
          style={{
            top: `${popoverTopPx}px`,
            ...(popoverNeedsScroll
              ? { maxHeight: `${popoverMaxHeightPx}px` }
              : { height: "auto", maxHeight: "none" }),
          }}
          data-schedule-rail-popover-layer
          onDragEnter={(e) => {
            if (!isStagedMediaDrag(e)) return;
            e.preventDefault();
            cancelMediaDragClose();
          }}
          onDragOver={(e) => {
            if (!isStagedMediaDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            cancelMediaDragClose();
          }}
          onDragLeave={(e) => {
            if (!isStagedMediaDrag(e)) return;
            const next = e.relatedTarget as Node | null;
            if (next && e.currentTarget.contains(next)) return;
            // Leaving popover toward a catching day row — that row will cancel close.
            scheduleMediaDragClose();
          }}
        >
          {popover.kind === "event" ? (
            <EventPopover
              key={popover.event.id}
              event={popover.event}
              creatorId={creatorId}
              timeZone={displayTimeZone}
              onDelete={handleDelete}
              onEditTime={onEditTime}
              onMediaCommit={async (ev, mediaIds) => {
                clearMediaDrag();
                await onEventMediaCommit?.(ev, mediaIds);
                showAttachReceipt(ev);
              }}
              onMediaClear={async (ev) => {
                clearMediaDrag();
                await onEventMediaClear?.(ev);
              }}
              mediaCommitBusy={mediaCommitBusy}
              mediaCommitError={mediaCommitError ?? rowDropError}
              mediaCommitLabel="Save media"
              onPrepareOccurrence={onPrepareOccurrence}
              onOpenAutomationApproval={onOpenAutomationApproval}
              postDetailsOpen={postDetailsOpen}
              onPostDetailsOpenChange={setPostDetailsOpen}
              onPostDetailsSaved={(patch) => {
                const apply = <T extends ScheduleEvent | ReadyItem>(item: T): T => {
                  if (!railItemMatchesId(item, popover.event.id) &&
                      !railItemMatchesId(item, popover.event.task_id ?? "")) {
                    return item;
                  }
                  return {
                    ...item,
                    title: patch.title,
                    post_description: patch.description,
                    post_tags: patch.tags,
                    post_details_state: patch.post_details_state,
                  };
                };
                onDataChange({
                  ...data,
                  events: data.events.map(apply),
                  ready: data.ready.map(apply),
                });
                setPopover((prev) =>
                  prev?.kind === "event"
                    ? {
                        kind: "event",
                        event: {
                          ...prev.event,
                          title: patch.title,
                          post_description: patch.description,
                          post_tags: patch.tags,
                          post_details_state: patch.post_details_state,
                        },
                      }
                    : prev
                );
              }}
              onClose={() => {
                clearMediaDrag();
                setPostDetailsOpen(false);
                setPopover(null);
              }}
            />
          ) : null}
          {popover.kind === "overflow" ? (
            <DayOverflowList
              day={popover.day}
              heading={`${monthName} ${popover.day}`}
              events={popover.events}
              timeZone={displayTimeZone}
              onSelect={(ev) => openPopover({ kind: "event", event: ev })}
              onClose={() => setPopover(null)}
            />
          ) : null}
          {popover.kind === "add" ? (
            <AddEventPopover
              busy={addScheduledPostBusy}
              error={addScheduledPostError}
              locked={addEventLocked}
              upgradeHref={addEventUpgradeHref}
              missingLink={addEventMissingLink}
              timeZone={displayTimeZone}
              onClearMissingLink={onClearAddEventMissingLink}
              onClose={() => {
                onClearAddEventMissingLink?.();
                setPopover(null);
              }}
              onAdd={async (payload) => {
                const created = await onAddScheduledPost?.(payload);
                // Host returns false / undefined-with-missing-link to keep the sheet open.
                if (created === false) return;
                const createdEvent =
                  created && typeof created === "object" && "id" in created
                    ? (created as ScheduleEvent)
                    : null;
                if (
                  createdEvent &&
                  payload.event_type === "make_post" &&
                  payload.target_mode === "new_post" &&
                  payload.create_relay_draft !== false
                ) {
                  const handoffSeed = {
                    payload,
                    created: {
                      id: createdEvent.id,
                      post_id: createdEvent.post_id ?? null,
                      draft_id: createdEvent.draft_id ?? null,
                      due_at: createdEvent.at || payload.due_at,
                    },
                    timeZone: displayTimeZone,
                    autopostAllowed,
                    upgradeHref: "/studio/settings/billing?feature=autopost",
                  };
                  openPopover({
                    kind: "playbook",
                    seed: handoffSeed,
                  });
                  return;
                }
                setPopover(null);
              }}
            />
          ) : null}
          {popover.kind === "playbook" ? (
            <FollowUpPlaybookPrompt
              seed={popover.seed}
              busy={applyPlaybookBusy}
              error={applyPlaybookError}
              onSkip={() => {
                openPopover({ kind: "repeat", seed: popover.seed });
              }}
              onApply={async (body) => {
                await onApplySocialPlaybook?.(body);
                openPopover({ kind: "repeat", seed: popover.seed });
              }}
            />
          ) : null}
          {popover.kind === "repeat" ? (
            <RepeatEventPrompt
              seed={popover.seed}
              busy={createSeriesBusy}
              error={createSeriesError}
              onOnce={() => {
                const createdId = popover.seed.created.id;
                const dueAt = popover.seed.created.due_at || popover.seed.payload.due_at;
                const match =
                  data.events.find((e) => railItemMatchesId(e, createdId)) ??
                  ({
                    id: createdId,
                    action: "post" as const,
                    title: popover.seed.payload.title,
                    destination: popover.seed.payload.destination,
                    at: dueAt,
                    notify: popover.seed.payload.remind_me,
                    status: "pending" as const,
                    post_id: popover.seed.created.post_id ?? undefined,
                    draft_id: popover.seed.created.draft_id ?? null,
                    source: "postbot_task" as const,
                    event_type: "make_post" as const,
                  } satisfies ScheduleEvent);
                openPopover({ kind: "event", event: match });
              }}
              onCreateSeries={async (body) => {
                await onCreateScheduleSeries?.(body);
                setPopover(null);
              }}
            />
          ) : null}
        </div>
      ) : null}

      <aside
        ref={railRef}
        aria-label="Scheduler"
        data-drop-presentation={dropPresentation}
        data-corridor-armed={corridorArmed ? "true" : undefined}
        className={`flex h-full min-h-0 flex-shrink-0 flex-col select-none border-l ${
          isRitual
            ? corridorArmed
              ? "border-[#111] bg-[#070c09]"
              : "border-[#111] bg-[#070a08]"
            : "border-[#1c211f] bg-[#080a09]"
        }`}
        style={{ width: railWidth }}
      >
        {/* Corridor intake — flush with Import Bay (76px) */}
        {isRitual ? (
          <Lab2IntakeBand
            armed={corridorArmed}
            filled={dropFilled}
            onAccept={(items) => onDropFilledChange?.(items)}
          />
        ) : null}

        {/* Header */}
        {isRitual ? (
          <header className="flex flex-shrink-0 items-center justify-between border-b border-[#0d0d0d] px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#404a44]">
                Scheduler
              </span>
              <span className="text-[10px] text-[#2e3a32]">{label}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                role="switch"
                aria-checked={!snoozed}
                aria-label={
                  snoozed
                    ? "Notifications snoozed — click to resume reminders"
                    : "Reminders on — click to snooze"
                }
                title={snoozed ? "Resume reminders" : "Snooze reminders"}
                onClick={() => onRemindersToggle(!remindersGlobal)}
                className={`flex h-6 w-6 items-center justify-center rounded-md border transition-all duration-150 active:scale-95 ${
                  !snoozed
                    ? "border-[#2a4a34] bg-[#0f1e16] text-[#5fb98f]"
                    : "border-[#161e18] bg-transparent text-[#364540] hover:border-[#2a3a2e] hover:text-[#5fb98f]"
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M4.3 6.6a2.7 2.7 0 1 1 5.4 0c0 3.4 1.3 3.6 1.3 3.6H3s1.3-.2 1.3-3.6Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5.8 11.4a1.2 1.2 0 0 0 2.4 0"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                  {!snoozed ? <circle cx="10.5" cy="3.5" r="2" fill="#5fb98f" /> : null}
                </svg>
              </button>
              {onOpenAutomations ? (
                <button
                  type="button"
                  onClick={onOpenAutomations}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[#161e18] bg-transparent text-[#364540] transition-all duration-150 hover:border-[#2a3a2e] hover:text-[#5fb98f] active:scale-95"
                  aria-label="Open Automations"
                  title="Automations"
                  data-testid="schedule-rail-automations-open"
                >
                  <svg width="9" height="11" viewBox="0 0 10 13" fill="none" aria-hidden="true">
                    <path
                      d="M6 1L2 7.5h3.5L4 12L8.5 5.5H5L6 1Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
              <button
                ref={addButtonRef}
                type="button"
                disabled={!allowAddScheduledPost}
                onClick={() => {
                  if (!allowAddScheduledPost) return;
                  openPopover({ kind: "add" });
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-[#161e18] bg-transparent text-[#364540] transition-all duration-150 hover:border-[#2a3a2e] hover:text-[#5fb98f] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Add scheduled post"
                title="Add scheduled post"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path
                    d="M5 1.5V8.5M1.5 5H8.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>
        ) : (
          <header className="flex flex-col items-center border-b border-[#1c211f] px-4 pb-4 pt-6">
            <p className="text-center text-[9px] font-semibold uppercase leading-none tracking-[0.22em] text-[#6f7773]">
              {label}
            </p>
            <h2
              className={`mt-2 text-center font-semibold leading-none tracking-[-0.04em] text-[#edf2ef] ${
                railWidth >= SCHEDULE_RAIL_LAB_WIDTH_PX ? "text-[24px]" : "text-[22px]"
              }`}
              style={{ fontFamily: "var(--font-display), Fraunces, Georgia, serif" }}
            >
              Scheduler
            </h2>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={!snoozed}
                aria-label={
                  snoozed
                    ? "Notifications snoozed — click to resume reminders"
                    : "Reminders on — click to snooze"
                }
                title={snoozed ? "Resume reminders" : "Snooze reminders"}
                onClick={() => onRemindersToggle(!remindersGlobal)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${
                  !snoozed
                    ? "border-[#9bf0c43d] bg-[#9bf0c414] text-[#9bf0c4]"
                    : "border-[#242a27] bg-[#ffffff08] text-[#69716d] hover:border-[#9bf0c43d] hover:text-[#9bf0c4]"
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M4.3 6.6a3.7 3.7 0 1 1 7.4 0c0 4 1.5 4.2 1.5 4.2H2.8s1.5-.2 1.5-4.2Z"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M6.6 12.7a1.6 1.6 0 0 0 2.8 0"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {onOpenAutomations ? (
                <button
                  type="button"
                  onClick={onOpenAutomations}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#242a27] bg-[#ffffff08] text-[#69716d] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9bf0c43d] hover:bg-[#9bf0c414] hover:text-[#9bf0c4] active:scale-95"
                  aria-label="Open Automations"
                  title="Automations"
                  data-testid="schedule-rail-automations-open"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3 4.5h4.5M8.5 4.5H13M3 8h10M3 11.5h6.5"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                    />
                    <circle cx="6.2" cy="4.5" r="1.1" fill="currentColor" />
                    <circle cx="11.2" cy="11.5" r="1.1" fill="currentColor" />
                  </svg>
                </button>
              ) : null}
              <button
                ref={addButtonRef}
                type="button"
                disabled={!allowAddScheduledPost}
                onClick={() => {
                  if (!allowAddScheduledPost) return;
                  openPopover({ kind: "add" });
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#242a27] bg-[#ffffff08] text-[#69716d] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9bf0c43d] hover:bg-[#9bf0c414] hover:text-[#9bf0c4] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                aria-label="Add scheduled post"
                title="Add scheduled post"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M7 2V12M2 7H12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>
        )}

        {/* Drop bin — classic rail always; ritual only when assets are filled (choice). */}
        {!isRitual || dropFilled.length > 0 ? (
          <div
            className={
              isRitual
                ? "relative z-20 mx-2 mt-2 flex flex-col"
                : "flex flex-col border-b border-[#1c211f] px-4 py-4"
            }
          >
            <DropAssetsCard
              filled={dropFilled}
              onFilledChange={(items) => onDropFilledChange?.(items)}
              onAutopost={(ids) => onDropCommit?.(ids)}
              scheduleTargets={scheduleDropTargets}
              onScheduleAttach={handleScheduleDropAttach}
              attachBusy={mediaCommitBusy}
              timeZone={displayTimeZone}
              presentation={dropPresentation}
            />
          </div>
        ) : null}

        {/* Monthly Goal — classic rail only (v0 /4 has no goal block) */}
        {!isRitual ? (
          <div className="border-b border-[#1c211f] px-5 py-4">
            <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#68706c]">
              Monthly Goal
            </p>
            {data.monthly_goal?.excerpt?.trim() ? (
              <Link
                href={SET_GOAL_HREF}
                className="mt-2 block text-[12px] leading-snug tracking-[-0.01em] text-[#c8d0cb] transition-colors hover:text-[#edf2ef]"
                title="Edit goal in Analytics"
              >
                <span className="line-clamp-3">{data.monthly_goal.excerpt.trim()}</span>
              </Link>
            ) : (
              <Link
                href={SET_GOAL_HREF}
                className="mt-2 inline-block text-[12px] italic text-[#9bf0c4] transition-colors hover:text-[#b8f5d4]"
              >
                set goal
              </Link>
            )}
          </div>
        ) : null}

        {/* Month axis */}
        <div ref={dayListRef} className={`min-h-0 flex-1 overflow-y-auto ${isRitual ? "px-3 py-2" : "px-2 py-3"}`}>
          {!isRitual ? (
            <div className="flex items-center justify-between px-3 pb-3">
              <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#68706c]">
                {monthName} timeline
              </span>
              <span className="text-[9px] text-[#4f5753]">
                {snoozed ? "Snoozed" : `${daysInMonth} days`}
              </span>
            </div>
          ) : null}

          {data.events.length === 0 ? (
            <LibraryEmptyState
              variant="no_month_events"
              dashed
              className="mx-1 mb-3 border-[#2a302d] bg-[#ffffff05] py-4 [&>p:first-child]:text-[11px] [&>p:first-child]:text-[#aeb7b2] [&>p:last-of-type]:text-[9px] [&>p:last-of-type]:text-[#545c58]"
            />
          ) : null}

          {days.map((day) => {
            const eventsForDay = byDay[day] ?? [];
            const isToday = todayDay > 0 && day === todayDay;
            const isPast = todayDay > 0 && day < todayDay;
            const isPulsingDay = pulseDay === day;
            const CLUSTER_THRESHOLD = isRitual ? 4 : 2;
            const visibleSlices = eventsForDay.slice(0, CLUSTER_THRESHOLD);
            const overflowCount = eventsForDay.length - CLUSTER_THRESHOLD;
            const highlightInOverflow =
              (Boolean(popSliceId) || highlightIds.size > 0) &&
              eventsForDay.some(
                (e) =>
                  e.id === popSliceId ||
                  [...highlightIds].some((hid) => railItemMatchesId(e, hid))
              ) &&
              !visibleSlices.some(
                (e) =>
                  e.id === popSliceId ||
                  [...highlightIds].some((hid) => railItemMatchesId(e, hid))
              );
            const leadTitle = eventsForDay[0]?.title;
            const acceptsMedia =
              Boolean(onEventMediaCommit) && eventsForDay.some((e) => eventShowsMediaBin(e));
            const openEventId =
              popover?.kind === "event" ? popover.event.id : null;
            const isMediaCatching =
              mediaDragDay === day &&
              acceptsMedia &&
              (mediaDragSliceId != null ||
                (openEventId != null &&
                  eventsForDay.some((e) => e.id === openEventId && eventShowsMediaBin(e))));

            const dayDragProps = {
              onDragEnterCapture: (e: DragEvent) => {
                if (!acceptsMedia || mediaCommitBusy || !isStagedMediaDrag(e)) return;
                e.preventDefault();
                cancelMediaDragClose();
                const target = pickMediaDropTarget(eventsForDay, mediaDragSliceId);
                if (!target) return;
                openEventForMediaDrag(target, day);
              },
              onDragOverCapture: (e: DragEvent) => {
                if (!acceptsMedia || mediaCommitBusy || !isStagedMediaDrag(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                cancelMediaDragClose();
              },
              onDragLeaveCapture: (e: DragEvent) => {
                if (!acceptsMedia) return;
                const next = e.relatedTarget as Node | null;
                if (next && e.currentTarget.contains(next)) return;
                if (next && popoverLayerRef.current?.contains(next)) {
                  cancelMediaDragClose();
                  return;
                }
                if (mediaDragDay === day) scheduleMediaDragClose();
              },
              onDropCapture: (e: DragEvent) => {
                if (!acceptsMedia || !isStagedMediaDrag(e)) return;
                e.preventDefault();
              }
            };

            if (isRitual) {
              return (
                <div
                  key={day}
                  ref={(el) => {
                    if (el) dayRowRefs.current.set(day, el);
                    else dayRowRefs.current.delete(day);
                  }}
                  {...dayDragProps}
                  className={`flex items-center gap-2 rounded-lg px-2 py-[5px] transition-colors ${
                    isMediaCatching
                      ? "border border-dashed border-[#9bf0c4] bg-[#9bf0c422]"
                      : isPulsingDay
                        ? "bg-[#9bf0c4]/18"
                        : isToday
                          ? "bg-[#9bf0c40f]"
                          : "hover:bg-[#ffffff05]"
                  }`}
                >
                  <span
                    className={`w-5 flex-shrink-0 text-right text-[9.5px] tabular-nums leading-none ${
                      isToday || isMediaCatching
                        ? "font-bold text-[#9bf0c4]"
                        : isPast
                          ? "text-[#2a2a2a]"
                          : "text-[#3a4a3e]"
                    }`}
                  >
                    {day}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    {isMediaCatching ? (
                      <span className="text-[9px] font-medium tracking-wide text-[#9bf0c4]/90">
                        Open → drop in Media
                      </span>
                    ) : null}
                    {!isMediaCatching && isToday ? (
                      <span className="text-[9px] font-medium tracking-wide text-[#9bf0c4]">
                        Today
                      </span>
                    ) : null}
                    {!isMediaCatching
                      ? visibleSlices.map((ev) => {
                          const color = ACTION_COLORS[ev.action];
                          const isActive =
                            popover?.kind === "event" && popover.event.id === ev.id;
                          const isPopping = popSliceId === ev.id;
                          const isHighlighted = [...highlightIds].some((hid) =>
                            railItemMatchesId(ev, hid)
                          );
                          const sliceNeedsMedia = eventNeedsMediaDrop(ev);
                          const destLabels = railItemDestLabels(ev);
                          const destAria =
                            destLabels.length > 0 ? ` · ${destLabels.join(", ")}` : "";
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => {
                                if (isActive) setPopover(null);
                                else openPopover({ kind: "event", event: ev }, day);
                              }}
                              onDragEnter={(e) => {
                                if (!eventShowsMediaBin(ev) || !isStagedMediaDrag(e)) return;
                                e.preventDefault();
                                openEventForMediaDrag(ev, day);
                              }}
                              title={sliceNeedsMedia ? `${ev.title} · needs media` : ev.title}
                              aria-label={`${ev.title}${destAria} on day ${day}${
                                sliceNeedsMedia
                                  ? " — needs media; drag from Import Bay to attach"
                                  : ""
                              }`}
                              data-highlighted={
                                isHighlighted || isPopping ? "true" : undefined
                              }
                              className={`group/ev relative flex max-w-full items-center gap-1 overflow-hidden rounded-md border px-1.5 py-[3px] transition-all ${
                                isActive || isPopping || isHighlighted
                                  ? "border-[#1e2e22] bg-[#0a0f0b]"
                                  : "border-transparent hover:border-[#1e2e22] hover:bg-[#0a0f0b]"
                              } ${isPopping || isHighlighted ? "schedule-slice-pop" : ""}`}
                            >
                              <span
                                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                style={{
                                  backgroundColor: color,
                                  opacity: ev.status === "done" ? 0.3 : 0.8
                                }}
                              />
                              <span className="max-w-[130px] truncate text-[9.5px] text-[#4a5a50] group-hover/ev:text-[#7a9a84]">
                                {ev.title}
                              </span>
                              {sliceNeedsMedia && ev.status === "pending" ? (
                                <span
                                  className="h-1 w-1 flex-shrink-0 rounded-full bg-[#f0b86a] opacity-60"
                                  title="Needs media"
                                />
                              ) : null}
                            </button>
                          );
                        })
                      : null}

                    {!isMediaCatching && overflowCount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          openPopover({ kind: "overflow", day, events: eventsForDay })
                        }
                        className={`flex h-4 flex-shrink-0 items-center rounded-full border px-1 text-[8px] tabular-nums leading-none transition-colors ${
                          highlightInOverflow
                            ? "schedule-slice-pop border-[#9bf0c4]/50 bg-[#9bf0c4]/15 text-[#9bf0c4]"
                            : "border-[#1e2a22] bg-[#0a100c] text-[#3a4a3e] hover:text-[#9bf0c4]"
                        }`}
                      >
                        +{overflowCount}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={day}
                ref={(el) => {
                  if (el) dayRowRefs.current.set(day, el);
                  else dayRowRefs.current.delete(day);
                }}
                {...dayDragProps}
                className={`group relative mx-0 flex min-h-[34px] items-center rounded-xl px-2.5 transition-all duration-200 ${
                  isMediaCatching
                    ? "z-[1] min-h-[44px] scale-[1.02] border border-dashed border-[#9bf0c4] bg-[#9bf0c422] shadow-[0_0_0_1px_rgba(155,240,196,0.25)]"
                    : isPulsingDay
                      ? "bg-[#9bf0c4]/18"
                      : isToday
                        ? "bg-[#9bf0c418]"
                        : "hover:bg-[#ffffff08]"
                }`}
                style={{ height: isMediaCatching ? 44 : dayRowPx }}
              >
                {isToday && !isMediaCatching ? (
                  <span className="pointer-events-none absolute left-[7px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#9bf0c4]" />
                ) : null}

                <span
                  className={`mr-3 w-6 flex-shrink-0 text-right text-[11px] tabular-nums leading-none ${
                    isMediaCatching || isToday || isPulsingDay
                      ? "font-semibold text-[#9bf0c4]"
                      : "text-[#59605d]"
                  }`}
                >
                  {day}
                </span>

                {isMediaCatching ? (
                  <span className="pointer-events-none absolute inset-x-10 top-1/2 -translate-y-1/2 truncate text-center text-[9px] font-medium tracking-wide text-[#9bf0c4]/90">
                    Open → drop in Media
                  </span>
                ) : isToday ? (
                  <span className="pointer-events-none absolute right-2 text-[9px] font-medium tracking-wide text-[#9bf0c4]">
                    Today
                  </span>
                ) : null}

                <div className="flex min-w-0 flex-1 items-center gap-[3px] py-1.5">
                  {visibleSlices.map((ev) => {
                    const color = ACTION_COLORS[ev.action];
                    const isActive =
                      popover?.kind === "event" && popover.event.id === ev.id;
                    const isPopping = popSliceId === ev.id;
                    const isHighlighted = [...highlightIds].some((hid) =>
                      railItemMatchesId(ev, hid)
                    );
                    const sliceNeedsMedia = eventNeedsMediaDrop(ev);
                    const destLabels = railItemDestLabels(ev);
                    const destAria =
                      destLabels.length > 0 ? ` · ${destLabels.join(", ")}` : "";
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => {
                          if (isActive) {
                            setPopover(null);
                          } else {
                            openPopover({ kind: "event", event: ev }, day);
                          }
                        }}
                        onDragEnter={(e) => {
                          if (!eventShowsMediaBin(ev) || !isStagedMediaDrag(e)) return;
                          e.preventDefault();
                          openEventForMediaDrag(ev, day);
                        }}
                        style={{
                          width: sliceWidth(ev.action),
                          backgroundColor: color,
                          opacity:
                            ev.status === "done"
                              ? 0.18
                              : isActive || isPopping || isHighlighted || (isMediaCatching && isActive)
                                ? 1
                                : 0.65,
                          boxShadow:
                            isActive || isPopping || isHighlighted || (isMediaCatching && isActive)
                              ? `0 0 10px 2px ${color}80`
                              : "none",
                        }}
                        className={`h-2 flex-shrink-0 rounded-full transition-all duration-200 hover:scale-y-125 hover:opacity-100 ${
                          isPopping || isHighlighted || (isMediaCatching && isActive)
                            ? "schedule-slice-pop scale-y-150"
                            : ""
                        } ${
                          sliceNeedsMedia
                            ? "ring-1 ring-[#9bf0c4]/55 ring-offset-1 ring-offset-[#0a0c0b]"
                            : ""
                        }`}
                        data-highlighted={isHighlighted || isPopping ? "true" : undefined}
                        title={sliceNeedsMedia ? `${ev.title} · needs media` : ev.title}
                        aria-label={`${ev.title}${destAria} on day ${day}${
                          sliceNeedsMedia ? " — needs media; drag from Import Bay to attach" : ""
                        }`}
                      />
                    );
                  })}

                  {leadTitle && !isToday && !isMediaCatching ? (
                    <span className="ml-1 min-w-0 truncate text-[9px] text-[#707874] transition-colors group-hover:text-[#a8afab]">
                      {leadTitle}
                    </span>
                  ) : null}

                  {overflowCount > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        openPopover({ kind: "overflow", day, events: eventsForDay })
                      }
                      className={`flex h-4 flex-shrink-0 items-center rounded-full border px-1 text-[8px] tabular-nums leading-none transition-colors ${
                        highlightInOverflow
                          ? "schedule-slice-pop border-[#9bf0c4]/50 bg-[#9bf0c4]/15 text-[#9bf0c4]"
                          : "border-[#282828] bg-[#181818] text-[#555] hover:text-[#9bf0c4]"
                      }`}
                    >
                      +{overflowCount}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {rowDropError || mediaCommitError ? (
          <div className="border-t border-[#1a1a1a] px-3 py-2">
            <p className="text-[9.5px] leading-snug text-red-400/90">
              {rowDropError || mediaCommitError}
            </p>
          </div>
        ) : null}

        {snoozed ? (
          <div className="border-t border-[#1a1a1a] px-3 py-2.5">
            <p className="text-[9.5px] leading-relaxed text-[#555]">Reminders paused</p>
          </div>
        ) : null}
      </aside>

      {attachReceipt ? (
        <MediaAttachReceipt
          receipt={attachReceipt}
          onDismiss={() => setAttachReceipt(null)}
          onAddPostDetails={() => {
            const eventId = attachReceipt.eventId;
            setAttachReceipt(null);
            setPostDetailsOpen(true);
            const match =
              data.events.find((e) => railItemMatchesId(e, eventId)) ??
              data.ready.find((e) => railItemMatchesId(e, eventId));
            if (match) {
              const day = dayOfEvent(match, displayTimeZone);
              openPopover({ kind: "event", event: match }, day ?? undefined);
            }
          }}
        />
      ) : null}

      <style>{`
        @keyframes scheduleSlicePop {
          0% { transform: scaleX(0.15) scaleY(0.6); opacity: 0; }
          55% { transform: scaleX(1.12) scaleY(1.8); opacity: 1; }
          100% { transform: scaleX(1) scaleY(1); opacity: 1; }
        }
        .schedule-slice-pop {
          animation: scheduleSlicePop 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both;
          transform-origin: left center;
        }
      `}</style>
    </div>
  );
}

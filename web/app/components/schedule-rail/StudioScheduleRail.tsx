"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import { INITIAL_DATA, railItemMatchesId, type ReadyItem, type ScheduleData, type ScheduleEvent } from "@/lib/schedule-rail-data";
import {
  attachScheduleRailMedia,
  createManualScheduleEvent,
  MissingPlatformLinkApiError,
  patchManualScheduleEvent,
  fetchScheduleRail,
} from "@/lib/schedule-rail-api";
import {
  createScheduleSeries,
  materializeScheduleOccurrence,
  type CreateScheduleSeriesBody,
} from "@/lib/autopost-routines-api";
import {
  applySocialPlaybookRun,
  type ApplySocialPlaybookBody,
} from "@/lib/social-playbooks-api";
import {
  fetchCreatorPlanAccess,
  patchDistributionVariant,
  patchPostbotTask,
  putCreatorPostingGoal,
  type CreatorCapabilityWire,
} from "@/lib/relay-api";
import { ScheduleRail, SCHEDULE_RAIL_WIDTH_PX } from "./ScheduleRail";
import type { DropAssetsFilledItem } from "./DropAssetsCard";
import type { CreateEventPayload, MissingPlatformLinkState } from "./AddEventPopover";

/** Room for event/add popovers anchored left of the rail (popover ~280px + gap). */
const SCHEDULE_RAIL_POPOVER_GUTTER_PX = 300;

type StudioScheduleRailProps = {
  /** Top Drop Assets → Autopost (compose-now path). */
  onCommitMedia?: (mediaIds: string[]) => void;
};

export type StudioScheduleRailHandle = {
  /** Refresh rail data, then focus/highlight persisted event ids (VS7). No-op when empty. */
  refreshAndHighlight: (opts: {
    focusEventId: string | null;
    highlightEventIds: string[];
  }) => Promise<void>;
};

/**
 * Studio Library host for the Schedule Rail — live feed + Phase 5 remind + Create Event.
 */
const StudioScheduleRail = forwardRef<StudioScheduleRailHandle, StudioScheduleRailProps>(
  function StudioScheduleRail({ onCommitMedia }, ref) {
  const [data, setData] = useState<ScheduleData>(INITIAL_DATA);
  const [remindersOn, setRemindersOn] = useState(true);
  const [dropFilled, setDropFilled] = useState<DropAssetsFilledItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** After first paint, keep ScheduleRail mounted — soft reloads must not flash-unmount. */
  const [bootstrapped, setBootstrapped] = useState(false);
  const bootstrappedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [presentDestinations, setPresentDestinations] = useState<string[]>([]);
  const [missingDestinations, setMissingDestinations] = useState<string[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [missingLink, setMissingLink] = useState<MissingPlatformLinkState | null>(null);
  const [studioCoreCap, setStudioCoreCap] = useState<CreatorCapabilityWire | null>(null);
  const [autopostAllowed, setAutopostAllowed] = useState(false);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [playbookBusy, setPlaybookBusy] = useState(false);
  const [playbookError, setPlaybookError] = useState<string | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const [highlightEventIds, setHighlightEventIds] = useState<string[]>([]);
  const monthRef = useRef(data.month);
  monthRef.current = data.month;

  const loadRail = useCallback(async (month?: string) => {
    // Only gate the full rail on the initial fetch. Mutations refresh in place.
    if (!bootstrappedRef.current) setLoading(true);
    setError(null);
    try {
      const rail = await fetchScheduleRail(month ? { month } : undefined);
      setData(rail);
      setRemindersOn(rail.remind_me_global);
      setArmed(Boolean(rail.armed));
      setPresentDestinations(rail.cue?.present_destinations ?? []);
      setMissingDestinations(rail.cue?.missing_destinations ?? []);
      bootstrappedRef.current = true;
      setBootstrapped(true);
      return rail;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      refreshAndHighlight: async ({ focusEventId: focusId, highlightEventIds: ids }) => {
        const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
        // Never animate ghost events — only after a persisted receipt with real ids.
        if (!focusId && unique.length === 0) {
          await loadRail(monthRef.current);
          return;
        }
        await loadRail(monthRef.current);
        setHighlightEventIds(unique);
        setFocusEventId(focusId ?? unique[0] ?? null);
      }
    }),
    [loadRail]
  );

  useEffect(() => {
    void loadRail();
  }, [loadRail]);

  useEffect(() => {
    void fetchCreatorPlanAccess()
      .then((access) => {
        setStudioCoreCap(access.capabilities.studio_core);
        setAutopostAllowed(Boolean(access.capabilities.autopost?.allowed));
      })
      .catch(() => {
        setStudioCoreCap(null);
      });
  }, []);

  const findItem = useCallback(
    (id: string) =>
      data.events.find((e) => railItemMatchesId(e, id)) ??
      data.ready.find((e) => railItemMatchesId(e, id)) ??
      null,
    [data]
  );

  const resolveTaskId = useCallback(
    (id: string) => {
      const item = findItem(id);
      if (!item) return id;
      if (item.destinations?.some((d) => d.task_id === id)) return id;
      return item.task_id ?? id;
    },
    [findItem]
  );

  const handleRemindersToggle = useCallback(
    async (val: boolean) => {
      setRemindersOn(val);
      try {
        await putCreatorPostingGoal({ remind_me_global: val });
        await loadRail(data.month);
      } catch (err) {
        setRemindersOn(!val);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [data.month, loadRail]
  );

  const handleDone = useCallback(
    async (id: string) => {
      const item = findItem(id);
      try {
        if (item?.source === "manual_event") {
          await patchManualScheduleEvent(item.id, { status: "done" });
        } else {
          const taskId = resolveTaskId(id);
          await patchPostbotTask(taskId, { status: "done" });
        }
        await loadRail(data.month);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [data.month, findItem, loadRail, resolveTaskId]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const item = findItem(id);
      try {
        if (item?.source === "manual_event") {
          await patchManualScheduleEvent(item.id, { status: "dismissed" });
        } else {
          const taskId = resolveTaskId(id);
          await patchPostbotTask(taskId, { status: "dismissed" });
        }
        await loadRail(data.month);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [data.month, findItem, loadRail, resolveTaskId]
  );

  const handleNotifyToggle = useCallback(
    async (id: string, val: boolean) => {
      const item = findItem(id);
      try {
        if (item?.source === "manual_event") {
          await patchManualScheduleEvent(item.id, { remind_me: val });
        } else {
          const taskId = resolveTaskId(id);
          const variantId =
            item?.destinations?.find((d) => d.task_id === taskId)?.variant_id ??
            item?.variant_id;
          if (taskId) {
            await patchPostbotTask(taskId, { remind_me: val });
          } else if (variantId) {
            await patchDistributionVariant(variantId, { remind_me: val });
          } else {
            return;
          }
        }
        await loadRail(data.month);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [data.month, findItem, loadRail, resolveTaskId]
  );

  const handleEditTime = useCallback(
    async (id: string, scheduledForIso: string) => {
      const item = findItem(id);
      if (!item) return;
      try {
        if (item.source === "manual_event") {
          await patchManualScheduleEvent(item.id, { due_at: scheduledForIso });
        } else {
          const variantIds = [
            ...new Set(
              (item.destinations?.map((d) => d.variant_id).filter(Boolean) as string[]) ??
                (item.variant_id ? [item.variant_id] : [])
            ),
          ];
          if (variantIds.length === 0) return;
          await Promise.all(
            variantIds.map((variantId) =>
              patchDistributionVariant(variantId, { scheduled_for: scheduledForIso })
            )
          );
        }
        await loadRail(data.month);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [data.month, findItem, loadRail]
  );

  const handleAddEvent = useCallback(
    async (payload: CreateEventPayload): Promise<boolean | ScheduleEvent> => {
      setAddBusy(true);
      setAddError(null);
      try {
        const created = await createManualScheduleEvent({
          event_type: payload.event_type,
          destination: payload.destination,
          destinations: payload.destinations,
          due_at: payload.due_at,
          title: payload.title,
          note: payload.note || undefined,
          remind_me: payload.remind_me,
          post_id: payload.post_id,
          external_url: payload.external_url,
          target_mode: payload.target_mode,
          create_relay_draft: payload.create_relay_draft,
          planned_format: payload.planned_format,
        });
        setMissingLink(null);
        await loadRail(data.month);
        const childIds = created.destinations?.map((d) => d.task_id) ?? [];
        setHighlightEventIds([created.id, ...childIds]);
        // Post → New Relay draft: ScheduleRail owns playbook then routine handoffs.
        // Focusing the event here would open EventPopover and clobber those prompts.
        const deferFocusForRepeatPrompt =
          payload.event_type === "make_post" &&
          payload.target_mode === "new_post" &&
          payload.create_relay_draft !== false;
        if (!deferFocusForRepeatPrompt) {
          setFocusEventId(created.id);
        }
        return created;
      } catch (err) {
        if (err instanceof MissingPlatformLinkApiError) {
          setMissingLink({
            post_id: err.post_id,
            destination: err.destination,
            message: err.message,
          });
          setAddError(err.message);
          return false;
        }
        setAddError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setAddBusy(false);
      }
    },
    [data.month, loadRail]
  );

  const handleCreateSeries = useCallback(
    async (body: CreateScheduleSeriesBody) => {
      setSeriesBusy(true);
      setSeriesError(null);
      try {
        await createScheduleSeries(body);
        await loadRail(data.month);
      } catch (err) {
        setSeriesError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setSeriesBusy(false);
      }
    },
    [data.month, loadRail]
  );

  const handleApplyPlaybook = useCallback(
    async (body: ApplySocialPlaybookBody) => {
      setPlaybookBusy(true);
      setPlaybookError(null);
      try {
        await applySocialPlaybookRun(body);
        await loadRail(data.month);
      } catch (err) {
        setPlaybookError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setPlaybookBusy(false);
      }
    },
    [data.month, loadRail]
  );

  const handlePrepareOccurrence = useCallback(
    async (occurrenceId: string) => {
      setAttachBusy(true);
      setAttachError(null);
      try {
        const occ = await materializeScheduleOccurrence(occurrenceId);
        await loadRail(data.month);
        if (occ.draft_id) {
          window.location.href = `/studio/autopost?draft_id=${encodeURIComponent(occ.draft_id)}`;
        }
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setAttachBusy(false);
      }
    },
    [data.month, loadRail]
  );

  const handleEventMediaCommit = useCallback(
    async (event: ScheduleEvent | ReadyItem, mediaIds: string[]) => {
      if (event.source === "manual_event") return;
      const taskId = event.task_id ?? event.id;
      setAttachBusy(true);
      setAttachError(null);
      try {
        await attachScheduleRailMedia(taskId, mediaIds, { mode: "replace" });
        await loadRail(data.month);
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setAttachBusy(false);
      }
    },
    [data.month, loadRail]
  );

  const handleEventMediaClear = useCallback(
    async (event: ScheduleEvent | ReadyItem) => {
      if (event.source === "manual_event") return;
      const taskId = event.task_id ?? event.id;
      setAttachBusy(true);
      setAttachError(null);
      try {
        await attachScheduleRailMedia(taskId, [], { mode: "remove" });
        await loadRail(data.month);
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setAttachBusy(false);
      }
    },
    [data.month, loadRail]
  );

  const handleFocusEventConsumed = useCallback(() => {
    setFocusEventId(null);
    setHighlightEventIds([]);
  }, []);

  const createLocked = studioCoreCap != null && studioCoreCap.allowed === false;

  return (
    <>
      <div
        className="hidden shrink-0 lg:block"
        style={{ width: SCHEDULE_RAIL_WIDTH_PX }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed bottom-0 right-0 top-14 z-[60] hidden min-h-0 lg:block"
        style={{ width: SCHEDULE_RAIL_WIDTH_PX + SCHEDULE_RAIL_POPOVER_GUTTER_PX }}
      >
        <div
          className="pointer-events-auto relative ml-auto flex h-full min-h-0 flex-col overflow-visible bg-[#080808]"
          style={{ width: SCHEDULE_RAIL_WIDTH_PX }}
        >
          {loading && !bootstrapped ? (
            <div className="flex flex-1 items-start justify-center border-l border-[#1a1a1a] px-2 pt-4">
              <p className="text-[10px] text-[#555]">Loading schedule…</p>
            </div>
          ) : null}
          {bootstrapped ? (
            <ScheduleRail
              data={data}
              onDataChange={setData}
              remindersGlobal={remindersOn}
              onRemindersToggle={(val) => {
                void handleRemindersToggle(val);
              }}
              armed={armed}
              presentDestinations={presentDestinations}
              missingDestinations={missingDestinations}
              dropFilled={dropFilled}
              onDropFilledChange={setDropFilled}
              onDropCommit={(mediaIds) => {
                onCommitMedia?.(mediaIds);
                setDropFilled([]);
              }}
              onEventMediaCommit={handleEventMediaCommit}
              onEventMediaClear={handleEventMediaClear}
              mediaCommitBusy={attachBusy}
              mediaCommitError={attachError}
              onDone={handleDone}
              onDelete={handleDelete}
              onNotifyToggle={handleNotifyToggle}
              onEditTime={handleEditTime}
              allowAddScheduledPost
              onAddScheduledPost={handleAddEvent}
              addScheduledPostBusy={addBusy}
              addScheduledPostError={addError}
              addEventLocked={createLocked}
              addEventUpgradeHref="/studio/settings/billing?feature=studio_core"
              addEventMissingLink={missingLink}
              onClearAddEventMissingLink={() => setMissingLink(null)}
              autopostAllowed={autopostAllowed}
              onCreateScheduleSeries={handleCreateSeries}
              createSeriesBusy={seriesBusy}
              createSeriesError={seriesError}
              onApplySocialPlaybook={handleApplyPlaybook}
              applyPlaybookBusy={playbookBusy}
              applyPlaybookError={playbookError}
              onPrepareOccurrence={handlePrepareOccurrence}
              focusEventId={focusEventId}
              highlightEventIds={highlightEventIds}
              onFocusEventConsumed={handleFocusEventConsumed}
            />
          ) : null}
          {error ? (
            <div className="absolute bottom-2 left-2 right-2 z-10 rounded border border-amber-500/30 bg-black/80 px-2 py-1.5 text-[10px] text-amber-200/90">
              {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => void loadRail(data.month)}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
});

export default StudioScheduleRail;

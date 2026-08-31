"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Lab3Overlay } from "@/app/components/studio-lab3/Lab3Overlay";
import CommandStageComposer from "@/app/components/studio/command/CommandStageComposer";
import { monthMatrix, shiftMonth } from "@/app/components/studio-lab2/Lab2ScheduleLens";
import {
  dayKey,
  dueAtOnLocalDay,
  monthKeyFromIso,
  occupancyByDay,
  planSlotConflicts,
  unscheduledPostIds,
  utcMonthKey,
  type CommandPlanSlotClient
} from "@/lib/command-plan-workbench";
import type { CommandSelectionProposalClient } from "@/lib/relay-api";
import type { ScheduleEvent } from "@/lib/schedule-rail-data";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type PlanState = NonNullable<CommandSelectionProposalClient["plan"]>;

type Props = {
  open: boolean;
  proposal: CommandSelectionProposalClient | null;
  plan: PlanState | null;
  slots: CommandPlanSlotClient[];
  occupancy?: ScheduleEvent[];
  timeZone?: string;
  railOpen?: boolean;
  applyEnabled?: boolean;
  applyBusy?: boolean;
  error?: string | null;
  onClose: () => void;
  onMoveSlot?: (postId: string, dueAt: string) => void;
  onApprovePlan?: () => void;
  onVisibleMonthChange?: (month: string) => void;
  onRefine?: (instruction: string) => void;
  refineBusy?: boolean;
  refineSummary?: string | null;
};

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(y, (m ?? 1) - 1, 1)));
}

export default function PlanWorkbench({
  open,
  proposal,
  plan,
  slots,
  occupancy = [],
  timeZone,
  railOpen = false,
  applyEnabled = false,
  applyBusy = false,
  error = null,
  onClose,
  onMoveSlot,
  onApprovePlan,
  onVisibleMonthChange,
  onRefine,
  refineBusy = false,
  refineSummary = null
}: Props) {
  const zone = timeZone || plan?.time_zone || "UTC";
  const firstSlotMonth = slots[0] ? monthKeyFromIso(slots[0].due_at, zone) : utcMonthKey();
  const [month, setMonth] = useState(firstSlotMonth);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const monthSeeded = useRef(false);
  useEffect(() => {
    if (monthSeeded.current || !slots[0]) return;
    monthSeeded.current = true;
    setMonth(monthKeyFromIso(slots[0].due_at, zone));
  }, [slots, zone]);
  useEffect(() => {
    onVisibleMonthChange?.(month);
  }, [month, onVisibleMonthChange]);
  useEffect(() => {
    if (refineSummary) setRefineText("");
  }, [refineSummary]);
  const [y, m] = month.split("-").map(Number);
  const weeks = useMemo(() => monthMatrix(y, m), [y, m]);
  const titles = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of proposal?.records ?? []) map.set(row.post_id, row.title);
    return map;
  }, [proposal]);
  const byDay = useMemo(() => {
    const map: Record<string, CommandPlanSlotClient[]> = {};
    for (const slot of slots) {
      const key = dayKey(slot.due_at, zone);
      if (!map[key]) map[key] = [];
      map[key].push(slot);
    }
    return map;
  }, [slots, zone]);
  const occupied = occupancyByDay(occupancy, zone);
  const conflicts = planSlotConflicts(slots, occupancy, zone);
  const conflictDays = new Set(conflicts.map((row) => row.day_key));
  const unscheduled = unscheduledPostIds(
    proposal?.frozen_post_ids ?? [],
    slots,
    plan?.exclude_post_ids ?? []
  );
  const frozenCount = proposal?.frozen_post_ids.length ?? 0;

  const movePostToDay = (postId: string, sourceDue: string, day: number) => {
    if (!onMoveSlot) return;
    onMoveSlot(postId, dueAtOnLocalDay(sourceDue, y, m, day, zone));
    setSelectedPostId(null);
  };

  const dropSelectedOnDay = (day: number) => {
    const source = selectedPostId ? slots.find((slot) => slot.post_id === selectedPostId) : null;
    if (!source) return;
    movePostToDay(source.post_id, source.due_at, day);
  };

  const submitRefine = () => {
    const text = refineText.trim();
    if (!text || !onRefine || refineBusy || applyBusy) return;
    onRefine(text);
  };

  return (
    <Lab3Overlay
      open={open && Boolean(proposal) && Boolean(plan)}
      title="Weekly plan"
      onClose={onClose}
      size="workbench"
      testId="plan"
    >
      {proposal && plan ? (
        <div
          className="flex min-h-0 flex-1 flex-col"
          data-plan-workbench=""
          data-plan-calendar-open="true"
          data-lab3-rail-closed={railOpen ? "false" : "true"}
        >
          {onRefine ? (
            <div
              className="shrink-0 space-y-2 border-b border-[var(--lab3-hairline,#1c211f)] px-4 py-2.5"
              data-plan-composer=""
            >
              <CommandStageComposer
                id="plan-workbench-refine"
                label="Refine schedule"
                placeholder="Change the drops to every Saturday."
                value={refineText}
                onChange={setRefineText}
                onSubmit={submitRefine}
                disabled={refineBusy || applyBusy}
                submitLabel="Preview plan change"
              />
              {refineSummary ? (
                <p className="text-[11px] text-[var(--lab3-mint,#9bf0c4)]" data-plan-refine-summary="">
                  {refineSummary}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
          <aside
            className="w-full shrink-0 space-y-3 lg:w-56"
            data-plan-selection-squash=""
          >
            <p className="text-[13px] font-medium text-[var(--lab3-text-strong,#e8e8e8)]">
              Pieces confirmed
            </p>
            <p className="text-[12px] text-[var(--lab3-text-muted,#6a736e)]">
              {frozenCount} pieces frozen. Confirm weekly chronological drops, then confirm the
              schedule. Gallery and rail stay unchanged until you confirm.
            </p>
            <ol className="space-y-1 text-[12px] text-[var(--lab3-text,#d0ddd4)]">
              {proposal.frozen_post_ids.map((id) => (
                <li key={id} className="truncate">
                  {titles.get(id) ?? id}
                </li>
              ))}
            </ol>
            {unscheduled.length > 0 ? (
              <div data-plan-unscheduled="">
                <p className="text-[11px] text-[#f3d27a]">Unscheduled</p>
                <ul className="text-[12px] text-[#f3d27a]">
                  {unscheduled.map((id) => (
                    <li key={id}>{titles.get(id) ?? id}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {conflicts.length > 0 ? (
              <p className="text-[11px] text-[#f3d27a]" data-plan-conflicts="" role="status">
                {conflicts.length} day{conflicts.length === 1 ? "" : "s"} already have rail events.
                Confirm will not overwrite them.
              </p>
            ) : null}
            {error ? (
              <p className="text-[11px] text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            {onApprovePlan ? (
              <button
                type="button"
                disabled={!applyEnabled || applyBusy || slots.length === 0}
                onClick={onApprovePlan}
                className="h-9 w-full rounded-md bg-[var(--lab3-mint,#9bf0c4)] px-3 text-[12px] font-medium text-[#04120a] disabled:opacity-40"
              >
                Confirm schedule
              </button>
            ) : (
              <p className="text-[11px] text-[var(--lab3-text-muted,#6a736e)]">
                Apply is off. You can still reshape the plan.
              </p>
            )}
          </aside>
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonth((value) => shiftMonth(value, -1))}
                aria-label="Previous month"
                className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--lab3-text-muted,#6a736e)] hover:bg-[#ffffff08]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <p className="text-[13px] font-medium text-[var(--lab3-text,#d0ddd4)]">{monthLabel(month)}</p>
              <button
                type="button"
                onClick={() => setMonth((value) => shiftMonth(value, 1))}
                aria-label="Next month"
                className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--lab3-text-muted,#6a736e)] hover:bg-[#ffffff08]"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label) => (
                <span
                  key={label}
                  className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--lab3-text-dim,#545c58)]"
                >
                  {label}
                </span>
              ))}
              {weeks.flat().map((day, idx) => {
                if (day == null) return <span key={`empty-${idx}`} className="min-h-[4.5rem]" />;
                const key = `${month}-${String(day).padStart(2, "0")}`;
                const daySlots = byDay[key] ?? [];
                const existing = occupied[key] ?? [];
                const conflict = conflictDays.has(key);
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    aria-label={`Drop on ${key}`}
                    data-plan-day={key}
                    data-plan-day-conflict={conflict ? "true" : undefined}
                    onClick={() => dropSelectedOnDay(day)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      dropSelectedOnDay(day);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const postId = event.dataTransfer.getData("text/post-id");
                      const sourceDue =
                        event.dataTransfer.getData("text/due-at") ||
                        daySlots[0]?.due_at ||
                        slots[0]?.due_at;
                      if (!postId || !sourceDue) return;
                      movePostToDay(postId, sourceDue, day);
                    }}
                    className={`min-h-[4.5rem] rounded-md border px-1 py-1 text-left ${
                      conflict
                        ? "border-[#f3d27a66] bg-[#f3d27a0f]"
                        : "border-[var(--lab3-hairline,#1c211f)]"
                    }`}
                  >
                    <p className="text-[11px] tabular-nums text-[var(--lab3-text-muted,#6a736e)]">{day}</p>
                    {existing.map((event) => (
                      <p
                        key={event.id}
                        className="truncate text-[10px] text-[#f3d27a]"
                        data-plan-occupancy=""
                      >
                        {event.title}
                      </p>
                    ))}
                    {daySlots.map((slot) => {
                      const title = titles.get(slot.post_id) ?? slot.post_id;
                      return (
                        <button
                          key={slot.post_id}
                          type="button"
                          draggable
                          aria-pressed={selectedPostId === slot.post_id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPostId(slot.post_id);
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/post-id", slot.post_id);
                            event.dataTransfer.setData("text/due-at", slot.due_at);
                          }}
                          aria-label={`Move ${title}`}
                          className={`mt-0.5 w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-[var(--lab3-mint,#9bf0c4)] ${
                            selectedPostId === slot.post_id
                              ? "bg-[#9bf0c44d] ring-1 ring-[#9bf0c4]"
                              : "bg-[#9bf0c41f]"
                          }`}
                          data-plan-slot={slot.post_id}
                        >
                          {title}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </div>
      ) : null}
    </Lab3Overlay>
  );
}

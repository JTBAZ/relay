import type { ScheduleEvent } from "@/lib/schedule-rail-data";

export type CommandPlanSlotClient = {
  post_id: string;
  due_at: string;
};

export type CommandPlanConflict = {
  post_id: string;
  due_at: string;
  day_key: string;
  event_ids: string[];
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function utcMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function monthKeyFromIso(iso: string, timeZone = "UTC"): string {
  const parts = localParts(iso, timeZone);
  return `${parts.year}-${pad(parts.month)}`;
}

export function localParts(
  iso: string,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false
  });
  const bits = fmt.formatToParts(new Date(iso));
  const read = (type: string) => bits.find((p) => p.type === type)?.value ?? "0";
  const weekdayName = read("weekday");
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")) % 24,
    minute: Number(read("minute")),
    weekday: map[weekdayName] ?? 0
  };
}

export function dayKey(iso: string, timeZone = "UTC"): string {
  const p = localParts(iso, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function localToUtcMs(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string
): number {
  if (timeZone === "UTC") {
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  }
  let utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  for (let i = 0; i < 4; i += 1) {
    const seen = localParts(new Date(utcMs).toISOString(), timeZone);
    const asUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, 0);
    const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const delta = desired - asUtc;
    if (delta === 0) break;
    utcMs += delta;
  }
  return utcMs;
}

/** Keep the slot's local time; move it to another calendar day in the same zone. */
export function dueAtOnLocalDay(
  existingDueAt: string,
  year: number,
  month: number,
  day: number,
  timeZone: string
): string {
  const current = localParts(existingDueAt, timeZone);
  return new Date(
    localToUtcMs({ year, month, day, hour: current.hour, minute: current.minute }, timeZone)
  ).toISOString();
}

export function occupancyByDay(
  events: readonly ScheduleEvent[],
  timeZone: string
): Record<string, ScheduleEvent[]> {
  const map: Record<string, ScheduleEvent[]> = {};
  for (const event of events) {
    const key = dayKey(event.at, timeZone);
    if (!map[key]) map[key] = [];
    map[key].push(event);
  }
  return map;
}

export function planSlotConflicts(
  slots: readonly CommandPlanSlotClient[],
  events: readonly ScheduleEvent[],
  timeZone: string
): CommandPlanConflict[] {
  const byDay = occupancyByDay(events, timeZone);
  const out: CommandPlanConflict[] = [];
  for (const slot of slots) {
    const key = dayKey(slot.due_at, timeZone);
    const hits = (byDay[key] ?? []).filter((event) => event.post_id !== slot.post_id);
    if (hits.length === 0) continue;
    out.push({
      post_id: slot.post_id,
      due_at: slot.due_at,
      day_key: key,
      event_ids: hits.map((event) => event.id)
    });
  }
  return out;
}

export function unscheduledPostIds(
  frozenIds: readonly string[],
  slots: readonly CommandPlanSlotClient[],
  excludeIds: readonly string[] = []
): string[] {
  const scheduled = new Set(slots.map((slot) => slot.post_id));
  const excluded = new Set(excludeIds);
  return frozenIds.filter((id) => !scheduled.has(id) && !excluded.has(id));
}

export function isSchedulePlanPreview(preview?: {
  write_layer?: string | null;
  lens_hint?: string | null;
  ops?: ReadonlyArray<{ capability?: string }>;
} | null): boolean {
  if (!preview) return false;
  if (preview.write_layer === "schedule_rail" || preview.lens_hint === "schedule") return true;
  return (preview.ops ?? []).some(
    (op) => op.capability === "materialize_schedule" || op.capability === "create_release_plan"
  );
}

export function shouldOpenPlanWorkbench(input: {
  schedulePlanEnabled: boolean;
  surface: "lab2" | "lab3" | "studio";
  writeLayer?: string | null;
  lensHint?: string | null;
  ops?: ReadonlyArray<{ capability?: string }>;
}): boolean {
  if (!input.schedulePlanEnabled || input.surface !== "lab3") return false;
  return isSchedulePlanPreview({
    write_layer: input.writeLayer,
    lens_hint: input.lensHint,
    ops: input.ops
  });
}

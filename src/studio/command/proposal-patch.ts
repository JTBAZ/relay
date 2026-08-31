/**
 * Versioned plan ProposalPatch (RC-P9-T02).
 * Chat and drag/drop share this shape. Shaping writes the proposal only — no rail rows.
 */
import { randomUUID } from "node:crypto";
import { CommandContractError, type CommandChangeSetOp } from "./contracts.js";
import {
  assertIanaTimeZone,
  compileFinitePlan,
  parseDueAtIso,
  parseFinitePlanIntervalDays,
  parseFinitePlanWeekday,
  weekdayFromStartLocal,
  type CommandFinitePlanState,
  type FinitePlanSlot
} from "./finite-plan-compiler.js";
import {
  getSelectionProposal,
  getSelectionProposalStore,
  type CommandSelectionProposal,
  type CommandSelectionProposalStore
} from "./proposal-types.js";

export const COMMAND_PLAN_PATCH_OPS = [
  "set_weekday",
  "set_interval_days",
  "set_start",
  "move_slot",
  "exclude_post_id",
  "restore_post_id"
] as const;
export type CommandPlanPatchOp = (typeof COMMAND_PLAN_PATCH_OPS)[number];

export const COMMAND_PLAN_FORBIDDEN_OPS = ["add_post_id", "publish_external", "set_write_layer"] as const;

export type { CommandFinitePlanState };

export type ApplyPlanPatchInput = {
  creator_id: string;
  proposal_id: string;
  op: string;
  expected_version?: number;
  weekday?: number | string;
  interval_days?: number;
  start_local?: string;
  time_zone?: string;
  post_id?: string;
  due_at?: string;
};

export const DEFAULT_FINITE_PLAN_TIME_ZONE = "America/New_York";
export const DEFAULT_FINITE_PLAN_WEEKDAY = 6;
export const DEFAULT_FINITE_PLAN_INTERVAL_DAYS = 7;
export const DEFAULT_FINITE_PLAN_LOCAL_TIME = "19:00:00";

export function isCommandPlanPatchOp(value: string): value is CommandPlanPatchOp {
  return (COMMAND_PLAN_PATCH_OPS as readonly string[]).includes(value);
}

export function parseFinitePlanState(raw: unknown): CommandFinitePlanState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.time_zone !== "string" || typeof row.start_local !== "string") return null;
  if (typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 0) return null;
  const overrides: Record<string, string> = {};
  if (row.slot_overrides && typeof row.slot_overrides === "object" && !Array.isArray(row.slot_overrides)) {
    for (const [key, value] of Object.entries(row.slot_overrides as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) overrides[key] = value.trim();
    }
  }
  try {
    return {
      version: row.version,
      time_zone: assertIanaTimeZone(row.time_zone),
      weekday: parseFinitePlanWeekday(row.weekday as number | string),
      interval_days: parseFinitePlanIntervalDays(
        typeof row.interval_days === "number" ? row.interval_days : DEFAULT_FINITE_PLAN_INTERVAL_DAYS
      ),
      start_local: row.start_local.trim(),
      exclude_post_ids: Array.isArray(row.exclude_post_ids)
        ? row.exclude_post_ids.filter((id): id is string => typeof id === "string")
        : [],
      skip_post_ids: Array.isArray(row.skip_post_ids)
        ? row.skip_post_ids.filter((id): id is string => typeof id === "string")
        : [],
      slot_overrides: overrides
    };
  } catch {
    return null;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localYmdInZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

function nextWeekdayStartLocal(now: Date, timeZone: string, weekday: number): string {
  const tz = assertIanaTimeZone(timeZone);
  let cursor = localYmdInZone(now, tz);
  for (let i = 0; i < 7; i += 1) {
    const utcNoon = Date.UTC(cursor.year, cursor.month - 1, cursor.day, 12, 0, 0);
    const dow = new Date(utcNoon).getUTCDay();
    if (dow === weekday) {
      return `${cursor.year}-${pad(cursor.month)}-${pad(cursor.day)}T${DEFAULT_FINITE_PLAN_LOCAL_TIME}`;
    }
    const next = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day + 1, 12, 0, 0));
    cursor = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  }
  return `${cursor.year}-${pad(cursor.month)}-${pad(cursor.day)}T${DEFAULT_FINITE_PLAN_LOCAL_TIME}`;
}

export function defaultFinitePlanState(input?: {
  time_zone?: string;
  weekday?: number | string;
  interval_days?: number;
  start_local?: string;
  skip_post_ids?: readonly string[];
  now?: Date;
}): CommandFinitePlanState {
  const timeZone = assertIanaTimeZone(input?.time_zone?.trim() || DEFAULT_FINITE_PLAN_TIME_ZONE);
  const weekday = parseFinitePlanWeekday(input?.weekday ?? DEFAULT_FINITE_PLAN_WEEKDAY);
  const intervalDays = parseFinitePlanIntervalDays(input?.interval_days ?? DEFAULT_FINITE_PLAN_INTERVAL_DAYS);
  const startLocal =
    input?.start_local?.trim() || nextWeekdayStartLocal(input?.now ?? new Date(), timeZone, weekday);
  return {
    version: 0,
    time_zone: timeZone,
    weekday,
    interval_days: intervalDays,
    start_local: startLocal,
    exclude_post_ids: [],
    skip_post_ids: uniqueStrings(input?.skip_post_ids ?? []),
    slot_overrides: {}
  };
}

function uniqueStrings(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function compilePlanState(proposal: CommandSelectionProposal, plan: CommandFinitePlanState): FinitePlanSlot[] {
  return compileFinitePlan({
    frozen_post_ids: proposal.frozen_post_ids,
    skip_post_ids: plan.skip_post_ids,
    exclude_post_ids: plan.exclude_post_ids,
    time_zone: plan.time_zone,
    weekday: plan.weekday,
    interval_days: plan.interval_days,
    start_local: plan.start_local,
    slot_overrides: plan.slot_overrides
  });
}

function requireFrozenProposal(proposal: CommandSelectionProposal): void {
  if (proposal.stage !== "selection_approved" && proposal.stage !== "plan_shaping") {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Plan patches require an approved selection.",
      [{ field: "stage", issue: proposal.stage }]
    );
  }
  if (proposal.frozen_post_ids.length === 0 || !proposal.frozen_revision) {
    throw new CommandContractError("COMMAND_VALIDATION", "Frozen selection is empty.", [
      { field: "frozen_post_ids", issue: "empty" }
    ]);
  }
}

function requireFrozenPost(proposal: CommandSelectionProposal, postId: string, field: string): string {
  const id = postId.trim();
  if (!id) {
    throw new CommandContractError("COMMAND_VALIDATION", "post_id is required.", [
      { field, issue: "empty" }
    ]);
  }
  if (!proposal.frozen_post_ids.includes(id)) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Plan patches cannot admit posts outside the frozen selection.",
      [{ field, issue: id }]
    );
  }
  return id;
}

function bump(plan: CommandFinitePlanState, patch: Partial<CommandFinitePlanState>): CommandFinitePlanState {
  return {
    ...plan,
    ...patch,
    version: plan.version + 1
  };
}

/**
 * GET-safe derived preview. Does not mutate the proposal.
 */
export function previewFinitePlan(
  proposal: CommandSelectionProposal,
  overrides?: {
    time_zone?: string;
    weekday?: number | string;
    interval_days?: number;
    start_local?: string;
    now?: Date;
  }
): { plan: CommandFinitePlanState; slots: FinitePlanSlot[]; persisted: boolean } {
  requireFrozenProposal(proposal);
  const plan = proposal.plan
    ? proposal.plan
    : defaultFinitePlanState({
        time_zone: overrides?.time_zone,
        weekday: overrides?.weekday,
        interval_days: overrides?.interval_days,
        start_local: overrides?.start_local,
        now: overrides?.now
      });
  return {
    plan,
    slots: compilePlanState(proposal, plan),
    persisted: Boolean(proposal.plan)
  };
}

export function applyPlanPatch(
  input: ApplyPlanPatchInput,
  store: CommandSelectionProposalStore = getSelectionProposalStore()
): { proposal: CommandSelectionProposal; plan: CommandFinitePlanState; slots: FinitePlanSlot[] } {
  const existing = getSelectionProposal(input.proposal_id, input.creator_id, store);
  requireFrozenProposal(existing);
  const opRaw = input.op.trim();
  if ((COMMAND_PLAN_FORBIDDEN_OPS as readonly string[]).includes(opRaw)) {
    throw new CommandContractError(
      "COMMAND_FORBIDDEN",
      "Plan patches cannot add library posts, publish, or choose a write layer.",
      [{ field: "op", issue: opRaw }]
    );
  }
  if (!isCommandPlanPatchOp(opRaw)) {
    throw new CommandContractError("COMMAND_VALIDATION", "Unknown plan patch op.", [
      { field: "op", issue: opRaw || "empty" }
    ]);
  }

  const current = existing.plan ?? defaultFinitePlanState({ skip_post_ids: [] });
  if (input.expected_version !== undefined && input.expected_version !== current.version) {
    throw new CommandContractError(
      "COMMAND_STALE_SELECTION",
      "Plan revision no longer matches the expected version.",
      [{ field: "expected_version", issue: "stale" }]
    );
  }

  let nextPlan: CommandFinitePlanState = current;
  if (opRaw === "set_weekday") {
    if (input.weekday === undefined) {
      throw new CommandContractError("COMMAND_VALIDATION", "weekday is required.", [
        { field: "weekday", issue: "empty" }
      ]);
    }
    nextPlan = bump(current, { weekday: parseFinitePlanWeekday(input.weekday) });
  } else if (opRaw === "set_interval_days") {
    if (input.interval_days === undefined) {
      throw new CommandContractError("COMMAND_VALIDATION", "interval_days is required.", [
        { field: "interval_days", issue: "empty" }
      ]);
    }
    nextPlan = bump(current, { interval_days: parseFinitePlanIntervalDays(input.interval_days) });
  } else if (opRaw === "set_start") {
    const startLocal = input.start_local?.trim() ?? "";
    if (!startLocal) {
      throw new CommandContractError("COMMAND_VALIDATION", "start_local is required.", [
        { field: "start_local", issue: "empty" }
      ]);
    }
    const timeZone = input.time_zone?.trim()
      ? assertIanaTimeZone(input.time_zone)
      : current.time_zone;
    const weekday =
      input.weekday !== undefined ? parseFinitePlanWeekday(input.weekday) : weekdayFromStartLocal(startLocal);
    nextPlan = bump(current, { start_local: startLocal, time_zone: timeZone, weekday });
  } else if (opRaw === "move_slot") {
    const postId = requireFrozenPost(existing, input.post_id ?? "", "post_id");
    const dueAt = parseDueAtIso(input.due_at ?? "", "due_at");
    nextPlan = bump(current, {
      slot_overrides: { ...current.slot_overrides, [postId]: dueAt }
    });
  } else if (opRaw === "exclude_post_id") {
    const postId = requireFrozenPost(existing, input.post_id ?? "", "post_id");
    const exclude_post_ids = uniqueStrings([...current.exclude_post_ids, postId]);
    const remaining = existing.frozen_post_ids.filter(
      (id) => !nextSkipOrExclude(current.skip_post_ids, exclude_post_ids).has(id)
    );
    if (remaining.length === 0) {
      throw new CommandContractError("COMMAND_VALIDATION", "Cannot empty a frozen plan.", [
        { field: "exclude_post_ids", issue: "empty" }
      ]);
    }
    const slot_overrides = { ...current.slot_overrides };
    delete slot_overrides[postId];
    nextPlan = bump(current, { exclude_post_ids, slot_overrides });
  } else {
    const postId = requireFrozenPost(existing, input.post_id ?? "", "post_id");
    if (!current.exclude_post_ids.includes(postId)) {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "restore_post_id applies only to posts excluded from this plan.",
        [{ field: "post_id", issue: postId }]
      );
    }
    nextPlan = bump(current, {
      exclude_post_ids: current.exclude_post_ids.filter((id) => id !== postId)
    });
  }

  compilePlanState(existing, nextPlan);
  const nextProposal: CommandSelectionProposal = {
    ...existing,
    stage: "plan_shaping",
    plan: nextPlan,
    updated_at: new Date().toISOString()
  };
  const stored = store.put(nextProposal);
  return {
    proposal: stored,
    plan: nextPlan,
    slots: compilePlanState(stored, nextPlan)
  };
}

function nextSkipOrExclude(skip: readonly string[], exclude: readonly string[]): Set<string> {
  return new Set([...skip, ...exclude]);
}

export const FINITE_PLAN_APPLY_KINDS = [
  "materialize_schedule",
  "create_release_plan",
  "prepare_destination_drafts",
  "approve_plan"
] as const;

export function isFinitePlanApplyKind(value: string): boolean {
  return (FINITE_PLAN_APPLY_KINDS as readonly string[]).includes(value);
}

export function compileFinitePlanChangeSet(proposal: CommandSelectionProposal): {
  ops: CommandChangeSetOp[];
  resolved_post_ids: string[];
  write_layer: "schedule_rail";
} {
  requireFrozenProposal(proposal);
  if (!proposal.plan || proposal.plan.version < 1) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Schedule apply requires a shaped finite plan.",
      [{ field: "plan", issue: "missing" }]
    );
  }
  const slots = compilePlanState(proposal, proposal.plan);
  if (slots.length === 0) {
    throw new CommandContractError("COMMAND_VALIDATION", "Finite plan has no slots.", [
      { field: "slots", issue: "empty" }
    ]);
  }
  const postIds = slots.map((slot) => slot.post_id);
  return {
    ops: [
      {
        op_id: `op_materialize_schedule_${randomUUID().slice(0, 8)}`,
        capability: "materialize_schedule",
        risk_class: "execute_undo",
        target_ids: postIds,
        payload: {
          post_ids: postIds,
          due_ats: slots.map((slot) => slot.due_at),
          destination: "x",
          time_zone: proposal.plan.time_zone,
          start_local: proposal.plan.start_local,
          weekday: proposal.plan.weekday,
          interval_days: proposal.plan.interval_days,
          skipped_post_ids: proposal.plan.skip_post_ids,
          exclude_post_ids: proposal.plan.exclude_post_ids
        }
      }
    ],
    resolved_post_ids: postIds,
    write_layer: "schedule_rail"
  };
}

/**
 * Conversational refinement of an approved finite plan (P9).
 * Deterministic weekday/cadence phrases first; planner may only emit validated plan ops.
 * Shaping writes the proposal only — no rail rows.
 */
import { getRelayCommandFeatureFlags } from "./flags.js";
import { COMMAND_ERROR_CODES, CommandContractError, type CommandErrorCode } from "./contracts.js";
import { FINITE_PLAN_WEEKDAYS, parseFinitePlanWeekday } from "./finite-plan-compiler.js";
import {
  planCommandSelection,
  type CommandPlannerGenerateFn
} from "./command-semantic-planner.js";
import {
  applyPlanPatch,
  isCommandPlanPatchOp,
  type ApplyPlanPatchInput,
  type CommandFinitePlanState
} from "./proposal-patch.js";
import {
  getSelectionProposal,
  type CommandSelectionProposal,
  type CommandSelectionProposalStore
} from "./proposal-types.js";
import type { FinitePlanSlot } from "./finite-plan-compiler.js";
import type { CommandLibraryItem } from "./selection.js";

export const PLAN_REFINE_NL_OPS = ["set_weekday", "set_interval_days", "set_start"] as const;
export type PlanRefineNlOp = (typeof PLAN_REFINE_NL_OPS)[number];

export const PLAN_REFINE_UNAVAILABLE =
  "Say a weekday, interval, or start date. Drag still moves a single drop.";

export const PLAN_REFINE_NEW_SELECTION_MESSAGE =
  "That looks like a new selection. Type it in Studio Command if you want to replace this set.";

const WEEKDAY_PHRASE = new RegExp(`\\b(${FINITE_PLAN_WEEKDAYS.join("|")})s?\\b`, "i");
const INTERVAL_PHRASE = /\bevery\s+(\d+)\s+days\b/i;
const START_PHRASE =
  /\b(?:start(?:ing)?(?:\s+on)?|from)\s+(\d{4}-\d{2}-\d{2})(?:[t\s](\d{2}:\d{2}(?::\d{2})?))?/i;

export type ParsedPlanRefine = {
  op: PlanRefineNlOp;
  weekday?: number;
  interval_days?: number;
  start_local?: string;
};

export type RefineCommandPlanInput = {
  creatorId: string;
  proposalId: string;
  instruction: string;
  items: readonly CommandLibraryItem[];
  generate?: CommandPlannerGenerateFn;
  plannerEnabled?: boolean;
  store?: CommandSelectionProposalStore;
};

export type RefineCommandPlanResult = {
  proposal: CommandSelectionProposal;
  plan: CommandFinitePlanState;
  slots: FinitePlanSlot[];
  summary: string;
  op: PlanRefineNlOp;
};

function isPlanRefineNlOp(value: string): value is PlanRefineNlOp {
  return (PLAN_REFINE_NL_OPS as readonly string[]).includes(value);
}

function weekdayLabel(weekday: number): string {
  return FINITE_PLAN_WEEKDAYS[weekday] ?? `weekday ${weekday}`;
}

export function parsePlanRefineInstruction(
  instruction: string,
  currentStartLocal?: string
): ParsedPlanRefine | null {
  const text = instruction.trim();
  if (!text) return null;

  const interval = text.match(INTERVAL_PHRASE);
  if (interval) {
    const interval_days = Number(interval[1]);
    if (!Number.isInteger(interval_days) || interval_days < 1) return null;
    return { op: "set_interval_days", interval_days };
  }

  const start = text.match(START_PHRASE);
  if (start) {
    const time = start[2]?.length === 5 ? `${start[2]}:00` : start[2] || "19:00:00";
    const fromCurrent = currentStartLocal?.match(/T(\d{2}:\d{2}(?::\d{2})?)/);
    const clock = start[2] ? time : fromCurrent?.[1] || "19:00:00";
    return { op: "set_start", start_local: `${start[1]}T${clock}` };
  }

  const weekday = text.match(WEEKDAY_PHRASE);
  if (weekday) {
    try {
      return { op: "set_weekday", weekday: parseFinitePlanWeekday(weekday[1]!) };
    } catch {
      return null;
    }
  }
  return null;
}

export function summarizePlanRefine(input: {
  op: PlanRefineNlOp;
  plan: CommandFinitePlanState;
}): string {
  if (input.op === "set_weekday") {
    const name = weekdayLabel(input.plan.weekday);
    return `Drops now land every ${name}.`;
  }
  if (input.op === "set_interval_days") {
    return `Drops now repeat every ${input.plan.interval_days} days.`;
  }
  return `Start moved to ${input.plan.start_local}.`;
}

function applyParsed(
  existing: CommandSelectionProposal,
  parsed: ParsedPlanRefine,
  store?: CommandSelectionProposalStore
): RefineCommandPlanResult {
  const patched = applyPlanPatch(
    {
      creator_id: existing.creator_id,
      proposal_id: existing.proposal_id,
      op: parsed.op,
      expected_version: existing.plan?.version,
      weekday: parsed.weekday,
      interval_days: parsed.interval_days,
      start_local: parsed.start_local,
      time_zone: existing.plan?.time_zone
    } satisfies ApplyPlanPatchInput,
    store
  );
  return {
    ...patched,
    summary: summarizePlanRefine({ op: parsed.op, plan: patched.plan }),
    op: parsed.op
  };
}

export async function refineCommandPlan(
  input: RefineCommandPlanInput
): Promise<RefineCommandPlanResult> {
  const creatorId = input.creatorId.trim();
  const proposalId = input.proposalId.trim();
  const instruction = input.instruction.trim();
  if (!instruction) {
    throw new CommandContractError("COMMAND_VALIDATION", "Type a plan change first.", [
      { field: "instruction", issue: "empty" }
    ]);
  }
  const existing = getSelectionProposal(proposalId, creatorId, input.store);
  const parsed = parsePlanRefineInstruction(instruction, existing.plan?.start_local);
  if (parsed) {
    return applyParsed(existing, parsed, input.store);
  }

  const plannerOn =
    typeof input.plannerEnabled === "boolean"
      ? input.plannerEnabled
      : getRelayCommandFeatureFlags().planner_enabled;
  if (!plannerOn && !input.generate) {
    throw new CommandContractError("COMMAND_VALIDATION", PLAN_REFINE_UNAVAILABLE, [
      { field: "planner", issue: "off" }
    ]);
  }

  const plan = await planCommandSelection({
    instruction,
    creatorId,
    items: input.items,
    generate: input.generate,
    activeProposal: existing
  });
  if (!plan.ok) {
    if (plan.skipped) {
      throw new CommandContractError("COMMAND_VALIDATION", PLAN_REFINE_UNAVAILABLE, [
        { field: "planner", issue: "skipped" }
      ]);
    }
    const code = (COMMAND_ERROR_CODES as readonly string[]).includes(plan.code)
      ? (plan.code as CommandErrorCode)
      : "COMMAND_VALIDATION";
    throw new CommandContractError(code, plan.message, [{ field: "instruction", issue: plan.code }]);
  }
  if (plan.output.kind !== "plan_patch") {
    throw new CommandContractError("COMMAND_VALIDATION", PLAN_REFINE_NEW_SELECTION_MESSAGE, [
      { field: "kind", issue: plan.output.kind }
    ]);
  }
  if (!isPlanRefineNlOp(plan.output.op) || !isCommandPlanPatchOp(plan.output.op)) {
    throw new CommandContractError("COMMAND_VALIDATION", PLAN_REFINE_UNAVAILABLE, [
      { field: "op", issue: plan.output.op }
    ]);
  }
  return applyParsed(
    existing,
    {
      op: plan.output.op,
      weekday:
        plan.output.weekday === undefined
          ? undefined
          : parseFinitePlanWeekday(plan.output.weekday),
      interval_days: plan.output.interval_days,
      start_local: plan.output.start_local
    },
    input.store
  );
}

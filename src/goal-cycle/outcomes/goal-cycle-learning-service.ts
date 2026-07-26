/**
 * Goal Cycle reflection + confirmed learning proposals (VS9-T03).
 * Rejection leaves no creator preference residue; only accepted proposals seed later cycles.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  GoalCycleContractError,
  isGoalCycleLearningChangeField,
  type GoalCycleLearningChange,
  type GoalCycleLearningProposal,
  type GoalCycleLearningProposalStatus
} from "../contracts.js";
import { findGoalCycleForCreator, type GoalCycleRow } from "../goal-cycle-store.js";
import {
  getGoalCycleOutcomeSnapshot,
  refreshGoalCycleOutcomeSnapshot,
  type GoalCycleOutcomeSnapshot
} from "./goal-cycle-outcome-service.js";

export const GOAL_CYCLE_LEARNING_PROPOSAL_VERSION = 1 as const;
export const GOAL_CYCLE_REFLECTION_MAX_CHARS = 2000;

export type GoalCycleLearningSeed = {
  proposal_version: typeof GOAL_CYCLE_LEARNING_PROPOSAL_VERSION;
  source_cycle_id: string;
  proposal_id: string;
  accepted_at: string;
  explanation: string;
  changes: GoalCycleLearningChange[];
  /** Set when a later cycle explicitly consumes this seed. */
  consumed_at: string | null;
};

type OutcomeBag = {
  snapshot?: GoalCycleOutcomeSnapshot;
  summary?: unknown;
  learning?: GoalCycleLearningProposal | null;
  seed?: GoalCycleLearningSeed | null;
};

function asBag(value: unknown): OutcomeBag {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as OutcomeBag;
}

function assertAllowedChanges(changes: GoalCycleLearningChange[]): void {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Learning proposal must include at least one allowed change.",
      [{ field: "changes", issue: "required" }]
    );
  }
  if (changes.length > 5) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Learning proposal exceeds change cap (5).",
      [{ field: "changes", issue: "too_many" }]
    );
  }
  for (const change of changes) {
    if (!isGoalCycleLearningChangeField(change.field)) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_PLAN_INVALID",
        `Learning change field '${String(change.field)}' is not allowed.`,
        [{ field: "changes.field", issue: "invalid" }]
      );
    }
  }
}

export function normalizeGoalCycleReflection(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > GOAL_CYCLE_REFLECTION_MAX_CHARS) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      `Reflection exceeds ${GOAL_CYCLE_REFLECTION_MAX_CHARS} characters.`,
      [{ field: "reflection", issue: "too_long" }]
    );
  }
  return trimmed;
}

/**
 * Pure proposal builder from an outcome snapshot (+ optional reflection).
 * Does not write preferences; estimated lift never drives a "met target" suggestion.
 */
export function buildLearningProposalFromSnapshot(
  snapshot: GoalCycleOutcomeSnapshot,
  opts: { reflection?: string | null; now?: Date; proposalId?: string } = {}
): GoalCycleLearningProposal {
  const now = opts.now ?? new Date();
  const changes: GoalCycleLearningChange[] = [];
  const evidence_refs = [
    ...snapshot.source_links,
    `cycle:${snapshot.cycle_id}:outcome`,
    `outcome:completion:${snapshot.completion.kind}`
  ];
  const parts: string[] = [];
  const target = snapshot.target.value;
  const actual = snapshot.actual.deterministic_value;

  if (snapshot.goal_kind === "engagement" || snapshot.goal_kind === "views") {
    if (target != null && actual != null && actual >= target && !snapshot.stale) {
      const nextTarget = Math.max(target + 1, Math.ceil(target * 1.1));
      changes.push({ field: "target", from: target, to: nextTarget });
      changes.push({ field: "cadence", from: "current", to: "hold" });
      parts.push(
        `Deterministic ${snapshot.target.label} met (${actual} ≥ ${target}). ` +
          `Suggest raising the next target to ${nextTarget} while holding cadence.`
      );
    } else if (target != null) {
      const nextTarget =
        actual != null
          ? Math.max(1, Math.floor(Math.min(target, Math.max(actual, 1)) * 0.9))
          : Math.max(1, Math.floor(target * 0.8));
      changes.push({ field: "target", from: target, to: nextTarget });
      changes.push({ field: "cadence", from: "current", to: "lighter" });
      parts.push(
        `Target was not fully met (actual ${actual ?? "unavailable"} vs ${target}). ` +
          `Suggest a lighter cadence and a next target of ${nextTarget}.`
      );
    }
  } else if (snapshot.goal_kind === "paid_support") {
    if (
      target != null &&
      actual != null &&
      actual >= target &&
      snapshot.coverage !== "unavailable" &&
      !snapshot.stale
    ) {
      const nextTarget = Math.max(target + 1, Math.ceil(target * 1.1));
      changes.push({ field: "target", from: target, to: nextTarget });
      parts.push(
        `Deterministic paid-support target met (${actual} ≥ ${target}). ` +
          `Suggest raising the next target to ${nextTarget}.`
      );
    } else if (snapshot.actual.estimated_value != null && actual == null) {
      changes.push({
        field: "destination_mix",
        from: "current",
        to: "prefer_linked_paid_destinations"
      });
      parts.push(
        "Only estimated lift was available — never treated as deterministic. " +
          "Suggest reviewing destination mix toward linked paid destinations before raising targets."
      );
    } else {
      changes.push({ field: "cadence", from: "current", to: "lighter" });
      if (target != null) {
        changes.push({
          field: "target",
          from: target,
          to: Math.max(1, Math.floor(target * 0.8))
        });
      }
      parts.push(
        "Deterministic paid-support target was not met. Suggest a lighter cadence and a more modest next target."
      );
    }
  } else if (snapshot.goal_kind === "break") {
    if (snapshot.break_mode === "complete_silence") {
      changes.push({ field: "goal", from: "break", to: "engagement" });
      changes.push({ field: "cadence", from: "silence", to: "gentle_return" });
      parts.push(
        "Silence interval completed. Suggest returning to an engagement goal with a gentle cadence."
      );
    } else if (snapshot.break_mode === "social_upkeep") {
      changes.push({ field: "goal", from: "break", to: "engagement" });
      changes.push({ field: "cadence", from: "upkeep", to: "hold_or_lighter" });
      parts.push(
        "Social upkeep tasks finished. Suggest returning to an engagement goal without increasing cadence."
      );
    } else {
      changes.push({ field: "goal", from: "break", to: "engagement" });
      changes.push({ field: "format_mix", from: "active_rest", to: "low_energy_first" });
      parts.push(
        "Active-rest slots finished. Suggest returning to engagement with a low-energy-first format mix."
      );
    }
  }

  if (changes.length === 0) {
    changes.push({ field: "cadence", from: "current", to: "hold" });
    parts.push("Insufficient outcome signal for a strong adjustment — suggest holding cadence.");
  }

  const reflection = normalizeGoalCycleReflection(opts.reflection ?? null);
  if (reflection) {
    parts.push(
      "Creator reflection was recorded and is shown with this proposal (not used as hidden bias)."
    );
    evidence_refs.push(`cycle:${snapshot.cycle_id}:reflection`);
  }

  assertAllowedChanges(changes);

  return {
    proposal_id: opts.proposalId ?? `glp_${snapshot.cycle_id}_${now.getTime()}`,
    source_cycle_id: snapshot.cycle_id,
    explanation: parts.join(" "),
    evidence_refs,
    changes,
    status: "suggested"
  };
}

async function loadOutcomeRow(prisma: PrismaClient, cycleId: string) {
  return prisma.creatorGoalCycleOutcome.findUnique({ where: { cycleId } });
}

async function writeOutcomeBag(
  prisma: PrismaClient,
  cycleId: string,
  mutate: (bag: OutcomeBag) => OutcomeBag,
  extra: { reflection?: string | null } = {}
): Promise<OutcomeBag> {
  const existing = await loadOutcomeRow(prisma, cycleId);
  const bag = mutate(asBag(existing?.targetJson));
  const data = {
    cycleId,
    targetJson: bag as unknown as Prisma.InputJsonValue,
    confidence: existing?.confidence ?? "unknown",
    suggestedCompletion: existing?.suggestedCompletion ?? false,
    ...(extra.reflection !== undefined ? { reflection: extra.reflection } : {})
  };
  await prisma.creatorGoalCycleOutcome.upsert({
    where: { cycleId },
    create: data,
    update: {
      targetJson: bag as unknown as Prisma.InputJsonValue,
      ...(extra.reflection !== undefined ? { reflection: extra.reflection } : {})
    }
  });
  return bag;
}

function assertCycleAllowsLearning(row: GoalCycleRow): void {
  const state = row.state;
  if (state !== "completed" && state !== "completion_suggested") {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "Reflection and learning require completion_suggested or completed.",
      [{ field: "state", issue: state }]
    );
  }
}

/** Persist optional bounded reflection on the cycle outcome. */
export async function saveGoalCycleReflection(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  reflectionRaw: string | null
): Promise<{ reflection: string | null }> {
  const row = await findGoalCycleForCreator(prisma, creatorId.trim(), cycleId.trim());
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }
  assertCycleAllowsLearning(row);
  const reflection = normalizeGoalCycleReflection(reflectionRaw);
  await writeOutcomeBag(prisma, row.id, (bag) => bag, { reflection });
  return { reflection };
}

export async function getGoalCycleLearningProposal(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleLearningProposal | null> {
  const row = await findGoalCycleForCreator(prisma, creatorId.trim(), cycleId.trim());
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }
  const outcome = await loadOutcomeRow(prisma, row.id);
  const learning = asBag(outcome?.targetJson).learning;
  return learning && typeof learning === "object" ? learning : null;
}

/** Generate and persist a suggested learning proposal from outcome facts. */
export async function proposeGoalCycleLearning(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  opts: { now?: Date; refresh?: boolean } = {}
): Promise<GoalCycleLearningProposal> {
  const row = await findGoalCycleForCreator(prisma, creatorId.trim(), cycleId.trim());
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }
  assertCycleAllowsLearning(row);

  const existing = await loadOutcomeRow(prisma, row.id);
  const existingLearning = asBag(existing?.targetJson).learning;
  if (existingLearning?.status === "accepted") {
    return existingLearning;
  }

  const snapshot =
    opts.refresh === false
      ? ((await getGoalCycleOutcomeSnapshot(prisma, creatorId, row.id)) ??
        (await refreshGoalCycleOutcomeSnapshot(prisma, creatorId, row.id, { now: opts.now })))
      : await refreshGoalCycleOutcomeSnapshot(prisma, creatorId, row.id, { now: opts.now });

  const proposal = buildLearningProposalFromSnapshot(snapshot, {
    reflection: existing?.reflection ?? null,
    now: opts.now
  });

  await writeOutcomeBag(prisma, row.id, (bag) => ({
    ...bag,
    snapshot,
    learning: proposal,
    // Never leave a stale seed on a fresh suggestion
    seed: null
  }));

  return proposal;
}

async function setLearningStatus(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  status: Exclude<GoalCycleLearningProposalStatus, "suggested">
): Promise<GoalCycleLearningProposal> {
  const row = await findGoalCycleForCreator(prisma, creatorId.trim(), cycleId.trim());
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }
  assertCycleAllowsLearning(row);

  const existing = await loadOutcomeRow(prisma, row.id);
  const bag = asBag(existing?.targetJson);
  const learning = bag.learning;
  if (!learning || learning.status !== "suggested") {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "Learning accept/reject requires a suggested proposal.",
      [{ field: "learning.status", issue: learning?.status ?? "missing" }]
    );
  }
  assertAllowedChanges(learning.changes);

  const next: GoalCycleLearningProposal = { ...learning, status };
  const seed: GoalCycleLearningSeed | null =
    status === "accepted"
      ? {
          proposal_version: GOAL_CYCLE_LEARNING_PROPOSAL_VERSION,
          source_cycle_id: row.id,
          proposal_id: learning.proposal_id,
          accepted_at: new Date().toISOString(),
          explanation: learning.explanation,
          changes: learning.changes,
          consumed_at: null
        }
      : null;

  await writeOutcomeBag(prisma, row.id, (prev) => ({
    ...prev,
    learning: next,
    seed
  }));

  return next;
}

export async function acceptGoalCycleLearning(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleLearningProposal> {
  return setLearningStatus(prisma, creatorId, cycleId, "accepted");
}

export async function rejectGoalCycleLearning(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleLearningProposal> {
  return setLearningStatus(prisma, creatorId, cycleId, "rejected");
}

/**
 * Peek the newest unconsumed accepted learning seed for a creator.
 * Does not mutate preferences; rejection paths never appear here.
 */
export async function peekAcceptedLearningSeed(
  prisma: PrismaClient,
  creatorId: string
): Promise<GoalCycleLearningSeed | null> {
  const id = creatorId.trim();
  const cycles = await prisma.creatorGoalCycle.findMany({
    where: { creatorId: id, state: "completed" },
    orderBy: { completedAt: "desc" },
    take: 12,
    select: { id: true }
  });
  for (const cycle of cycles) {
    const outcome = await loadOutcomeRow(prisma, cycle.id);
    const seed = asBag(outcome?.targetJson).seed;
    if (seed && seed.consumed_at == null && seed.proposal_id) {
      return seed;
    }
  }
  return null;
}

/**
 * Mark an accepted seed consumed when a later cycle explicitly applies it.
 * No-op preference writes — only stamps consumed_at on the source outcome bag.
 */
export async function consumeAcceptedLearningSeed(
  prisma: PrismaClient,
  creatorId: string,
  sourceCycleId: string,
  proposalId: string
): Promise<GoalCycleLearningSeed | null> {
  const row = await findGoalCycleForCreator(prisma, creatorId.trim(), sourceCycleId.trim());
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }
  const existing = await loadOutcomeRow(prisma, row.id);
  const bag = asBag(existing?.targetJson);
  const seed = bag.seed;
  if (!seed || seed.proposal_id !== proposalId) return null;
  if (seed.consumed_at) return seed;
  const next: GoalCycleLearningSeed = {
    ...seed,
    consumed_at: new Date().toISOString()
  };
  await writeOutcomeBag(prisma, row.id, (prev) => ({ ...prev, seed: next }));
  return next;
}

/**
 * Goal Cycle persistence helpers (VS1).
 */

import type { CreatorGoalCycle, Prisma, PrismaClient } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import type {
  GoalCycleBreakMode,
  GoalCycleDetail,
  GoalCycleGoalKind,
  GoalCycleLearningProposal,
  GoalCyclePhase,
  GoalCycleProgressEvent,
  GoalCycleState,
  GoalCycleSummary
} from "./contracts.js";
import {
  isGoalCycleBreakMode,
  isGoalCycleGoalKind,
  isGoalCycleLearningChangeField,
  isGoalCyclePhase,
  isGoalCycleState
} from "./contracts.js";

export const GOAL_CYCLE_ACTIVE_SCOPE = "active" as const;

export type GoalCycleRow = CreatorGoalCycle;

export type GoalCycleTx = Prisma.TransactionClient;

export function mapGoalCycleSummary(row: GoalCycleRow): GoalCycleSummary {
  return {
    cycle_id: row.id,
    state: row.state as GoalCycleState,
    phase: row.phase as GoalCyclePhase,
    goal_kind: row.goalKind as GoalCycleGoalKind,
    break_mode: (row.breakMode as GoalCycleBreakMode | null) ?? null,
    version: row.version,
    period_key: row.periodKey,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

export function asContextRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseLearningProposal(value: unknown): GoalCycleLearningProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.proposal_id !== "string" || typeof o.source_cycle_id !== "string") return null;
  if (typeof o.explanation !== "string") return null;
  if (!Array.isArray(o.evidence_refs) || !Array.isArray(o.changes)) return null;
  if (o.status !== "suggested" && o.status !== "accepted" && o.status !== "rejected") {
    return null;
  }
  const changes = [];
  for (const raw of o.changes) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    if (!isGoalCycleLearningChangeField(c.field)) return null;
    changes.push({ field: c.field, from: c.from, to: c.to });
  }
  return {
    proposal_id: o.proposal_id,
    source_cycle_id: o.source_cycle_id,
    explanation: o.explanation,
    evidence_refs: o.evidence_refs.filter((r): r is string => typeof r === "string"),
    changes,
    status: o.status
  };
}

export async function findActiveGoalCycle(
  prisma: PrismaClient | GoalCycleTx,
  creatorId: string
): Promise<GoalCycleRow | null> {
  return prisma.creatorGoalCycle.findFirst({
    where: { creatorId, activeScope: GOAL_CYCLE_ACTIVE_SCOPE }
  });
}

export async function findGoalCycleByIdempotency(
  prisma: PrismaClient | GoalCycleTx,
  creatorId: string,
  startIdempotencyKey: string
): Promise<GoalCycleRow | null> {
  return prisma.creatorGoalCycle.findFirst({
    where: { creatorId, startIdempotencyKey }
  });
}

export async function findGoalCycleForCreator(
  prisma: PrismaClient | GoalCycleTx,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleRow | null> {
  return prisma.creatorGoalCycle.findFirst({
    where: { id: cycleId, creatorId }
  });
}

export async function insertGoalCycle(
  tx: GoalCycleTx,
  data: {
    creatorId: string;
    state: GoalCycleState;
    phase: GoalCyclePhase;
    goalKind: GoalCycleGoalKind;
    breakMode: GoalCycleBreakMode | null;
    periodKey: string;
    timeZone: string;
    contextJson: Record<string, unknown>;
    startIdempotencyKey: string | null;
  }
): Promise<GoalCycleRow> {
  return tx.creatorGoalCycle.create({
    data: {
      creatorId: data.creatorId,
      state: data.state,
      phase: data.phase,
      goalKind: data.goalKind,
      breakMode: data.breakMode,
      periodKey: data.periodKey,
      timeZone: data.timeZone,
      contextJson: data.contextJson as PrismaNS.InputJsonValue,
      activeScope: GOAL_CYCLE_ACTIVE_SCOPE,
      version: 1,
      startIdempotencyKey: data.startIdempotencyKey,
      checkpoint: {
        create: {
          phase: data.phase,
          stateJson: {
            phase: data.phase,
            state: data.state,
            context: data.contextJson
          } as PrismaNS.InputJsonValue,
          version: 1
        }
      },
      outcome: {
        create: {
          targetJson: {
            goal_kind: data.goalKind,
            break_mode: data.breakMode
          } as PrismaNS.InputJsonValue,
          confidence: "unknown",
          suggestedCompletion: false
        }
      }
    }
  });
}

export async function hydrateGoalCycleDetail(
  prisma: PrismaClient | GoalCycleTx,
  row: GoalCycleRow
): Promise<GoalCycleDetail> {
  const [checkpoint, progressRows, latestRevision, receiptRow, outcomeRow] = await Promise.all([
    prisma.creatorGoalCycleCheckpoint.findUnique({ where: { cycleId: row.id } }),
    prisma.creatorGoalCycleProgress.findMany({
      where: { cycleId: row.id },
      orderBy: { sequence: "asc" }
    }),
    prisma.creatorGoalCycleRevision.findFirst({
      where: { cycleId: row.id },
      orderBy: { ordinal: "desc" }
    }),
    prisma.creatorGoalCycleMaterializationReceipt.findFirst({
      where: { cycleId: row.id },
      orderBy: { materializedAt: "desc" }
    }),
    prisma.creatorGoalCycleOutcome.findUnique({ where: { cycleId: row.id } })
  ]);

  const progress: GoalCycleProgressEvent[] = (progressRows ?? []).map((p) => ({
    sequence: p.sequence,
    phase: p.phase as GoalCyclePhase,
    message_code: p.messageCode,
    occurred_at: p.createdAt.toISOString(),
    retryable: Boolean(asContextRecord(p.metadataJson).retryable)
  }));

  const plan =
    latestRevision?.planJson &&
    typeof latestRevision.planJson === "object" &&
    !Array.isArray(latestRevision.planJson)
      ? (latestRevision.planJson as GoalCycleDetail["plan"])
      : null;

  const materialization =
    receiptRow &&
    receiptRow.receiptJson &&
    typeof receiptRow.receiptJson === "object" &&
    !Array.isArray(receiptRow.receiptJson)
      ? {
          cycle_id: String((receiptRow.receiptJson as Record<string, unknown>).cycle_id ?? row.id),
          approval_key: receiptRow.approvalKey,
          status: "materialized" as const,
          materialized_at: receiptRow.materializedAt.toISOString()
        }
      : null;

  let outcome: GoalCycleDetail["outcome"] = null;
  let reflection: string | null = outcomeRow?.reflection?.trim() ? outcomeRow.reflection : null;
  let learning: GoalCycleLearningProposal | null = null;
  if (outcomeRow?.targetJson && typeof outcomeRow.targetJson === "object") {
    const bag = outcomeRow.targetJson as Record<string, unknown>;
    learning = parseLearningProposal(bag.learning);
    const summary = bag.summary;
    if (summary && typeof summary === "object" && !Array.isArray(summary)) {
      const s = summary as Record<string, unknown>;
      const conf = s.confidence;
      const attr = s.attribution;
      outcome = {
        target_label: typeof s.target_label === "string" ? s.target_label : "Target",
        actual_label: typeof s.actual_label === "string" ? s.actual_label : null,
        confidence:
          conf === "high" || conf === "medium" || conf === "low" || conf === "unknown"
            ? conf
            : "unknown",
        attribution:
          attr === "deterministic" ||
          attr === "estimated" ||
          attr === "insufficient" ||
          attr === "n_a"
            ? attr
            : null,
        freshness_seconds:
          typeof s.freshness_seconds === "number" ? s.freshness_seconds : outcomeRow.freshnessSeconds
      };
    } else {
      const conf = outcomeRow.confidence;
      outcome = {
        target_label: row.goalKind,
        actual_label: null,
        confidence:
          conf === "high" || conf === "medium" || conf === "low" || conf === "unknown"
            ? conf
            : "unknown",
        attribution: null,
        freshness_seconds: outcomeRow.freshnessSeconds
      };
    }
  }

  return {
    ...mapGoalCycleSummary(row),
    time_zone: row.timeZone,
    context: asContextRecord(row.contextJson),
    plan,
    progress,
    credit: null,
    evidence: [],
    outcome,
    reflection,
    learning,
    materialization,
    // checkpoint version is authoritative for optimistic concurrency alongside cycle.version
    ...(checkpoint ? {} : {})
  };
}

export function assertKnownEnums(row: Pick<GoalCycleRow, "state" | "phase" | "goalKind" | "breakMode">): void {
  if (!isGoalCycleState(row.state)) {
    throw new Error(`Corrupt Goal Cycle state: ${row.state}`);
  }
  if (!isGoalCyclePhase(row.phase)) {
    throw new Error(`Corrupt Goal Cycle phase: ${row.phase}`);
  }
  if (!isGoalCycleGoalKind(row.goalKind)) {
    throw new Error(`Corrupt Goal Cycle goalKind: ${row.goalKind}`);
  }
  if (row.breakMode != null && !isGoalCycleBreakMode(row.breakMode)) {
    throw new Error(`Corrupt Goal Cycle breakMode: ${row.breakMode}`);
  }
}

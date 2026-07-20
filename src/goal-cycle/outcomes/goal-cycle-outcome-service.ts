/**
 * Goal Cycle outcome snapshots + completion eligibility (VS9-T01 / T02).
 * Does not terminalize — only suggests; creator confirms via goal-cycle-service.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { getPaidSupportFacts } from "../../analytics/goal-cycle-paid-support-facts.js";
import {
  GoalCycleContractError,
  type GoalCycleBreakMode,
  type GoalCycleGoalKind,
  type GoalCycleOutcomeSummary
} from "../contracts.js";
import {
  asContextRecord,
  findGoalCycleForCreator,
  type GoalCycleRow
} from "../goal-cycle-store.js";

export const GOAL_CYCLE_OUTCOME_SNAPSHOT_VERSION = 1 as const;

export type OutcomeCoverage = "complete" | "partial" | "unavailable";
export type OutcomeConfidence = "high" | "medium" | "low" | "unknown";

export type GoalCycleCompletionKind = "complete" | "review" | "none";

export type GoalCycleTaskCompletionFacts = {
  required: number;
  done: number;
  skipped: number;
  pending: number;
  /** done + skipped === required when required > 0, or valid zero-task plan. */
  all_terminal: boolean;
  /** At least one publish/post-style task is done (active rest). */
  any_publish_done: boolean;
};

export type GoalCycleOutcomeSnapshot = {
  snapshot_version: typeof GOAL_CYCLE_OUTCOME_SNAPSHOT_VERSION;
  cycle_id: string;
  goal_kind: GoalCycleGoalKind;
  break_mode: GoalCycleBreakMode | null;
  window: {
    label: string;
    started_at: string | null;
    ends_at: string | null;
  };
  target: {
    label: string;
    value: number | null;
    unit: string | null;
  };
  actual: {
    deterministic_label: string | null;
    deterministic_value: number | null;
    estimated_label: string | null;
    estimated_value: number | null;
  };
  baseline: Record<string, unknown>;
  coverage: OutcomeCoverage;
  freshness_seconds: number | null;
  confidence: OutcomeConfidence;
  stale: boolean;
  stale_after_seconds: number;
  task_completion: GoalCycleTaskCompletionFacts;
  publish_completion: {
    planned: number;
    published: number;
  };
  completion: {
    eligible: boolean;
    kind: GoalCycleCompletionKind;
    reason: string;
  };
  source_links: string[];
  calculated_at: string;
};

const DEFAULT_STALE_AFTER_SECONDS = 48 * 3600;

function numFromContext(ctx: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = ctx[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function strFromContext(ctx: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = ctx[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function outcomeSummaryFromSnapshot(
  snapshot: GoalCycleOutcomeSnapshot
): GoalCycleOutcomeSummary {
  const attribution =
    snapshot.goal_kind === "paid_support"
      ? snapshot.actual.estimated_value != null && snapshot.actual.deterministic_value == null
        ? "estimated"
        : snapshot.coverage === "unavailable"
          ? "insufficient"
          : snapshot.actual.deterministic_value != null
            ? "deterministic"
            : "insufficient"
      : snapshot.goal_kind === "break"
        ? "n_a"
        : null;

  return {
    target_label: snapshot.target.label,
    actual_label:
      snapshot.actual.deterministic_label ?? snapshot.actual.estimated_label ?? null,
    confidence: snapshot.confidence,
    attribution,
    freshness_seconds: snapshot.freshness_seconds
  };
}

/**
 * Pure completion rules (VS9 exit contract). Does not mutate state.
 */
export function evaluateCompletionEligibility(
  snapshot: Omit<GoalCycleOutcomeSnapshot, "completion"> & {
    completion?: GoalCycleOutcomeSnapshot["completion"];
  },
  opts: { planEnded: boolean; now?: Date } = { planEnded: false }
): GoalCycleOutcomeSnapshot["completion"] {
  const kindGoal = snapshot.goal_kind;
  const breakMode = snapshot.break_mode;
  const tasks = snapshot.task_completion;
  const target = snapshot.target.value;
  const actual = snapshot.actual.deterministic_value;
  const stale = snapshot.stale;

  if (kindGoal === "engagement" || kindGoal === "views") {
    if (stale) {
      return {
        eligible: false,
        kind: "review",
        reason: "Metric source is stale — review evidence; do not auto-complete."
      };
    }
    if (target != null && actual != null && actual >= target && snapshot.coverage !== "unavailable") {
      return {
        eligible: true,
        kind: "complete",
        reason: `${snapshot.target.label} met (${actual} ≥ ${target}).`
      };
    }
    if (opts.planEnded) {
      return {
        eligible: true,
        kind: "review",
        reason: "Plan window ended with incomplete metric — suggest review, not completion."
      };
    }
    return {
      eligible: false,
      kind: "none",
      reason: "Target not yet met."
    };
  }

  if (kindGoal === "paid_support") {
    if (stale) {
      return {
        eligible: false,
        kind: "review",
        reason: "Paid-support source is stale — review evidence."
      };
    }
    if (
      target != null &&
      actual != null &&
      actual >= target &&
      snapshot.coverage !== "unavailable"
    ) {
      return {
        eligible: true,
        kind: "complete",
        reason: `Deterministic paid support met (${actual} ≥ ${target}).`
      };
    }
    if (snapshot.actual.estimated_value != null) {
      return {
        eligible: true,
        kind: "review",
        reason: "Estimated lift only — suggest review evidence, never completion."
      };
    }
    if (opts.planEnded) {
      return {
        eligible: true,
        kind: "review",
        reason: "Plan window ended without deterministic paid-support target."
      };
    }
    return {
      eligible: false,
      kind: "none",
      reason: "Deterministic paid-support target not met."
    };
  }

  if (kindGoal === "break" && breakMode === "complete_silence") {
    const endsAt = snapshot.window.ends_at ? new Date(snapshot.window.ends_at) : null;
    const now = opts.now ?? new Date();
    if (endsAt && !Number.isNaN(endsAt.getTime()) && now.getTime() >= endsAt.getTime()) {
      return {
        eligible: true,
        kind: "complete",
        reason: "Silence interval elapsed."
      };
    }
    return {
      eligible: false,
      kind: "none",
      reason: "Silence interval still active."
    };
  }

  if (kindGoal === "break" && breakMode === "social_upkeep") {
    if (tasks.required === 0 || tasks.all_terminal) {
      return {
        eligible: true,
        kind: "complete",
        reason:
          tasks.required === 0
            ? "Valid zero-task upkeep Plan — all required work terminal."
            : "Every required upkeep task is completed or skipped."
      };
    }
    if (opts.planEnded) {
      return {
        eligible: true,
        kind: "review",
        reason: "Plan ended with pending upkeep tasks — review."
      };
    }
    return {
      eligible: false,
      kind: "none",
      reason: "Upkeep tasks still pending."
    };
  }

  if (kindGoal === "break" && breakMode === "active_rest") {
    if (tasks.any_publish_done && tasks.all_terminal) {
      return {
        eligible: true,
        kind: "complete",
        reason: "At least one active-rest slot done and all remaining slots terminal."
      };
    }
    if (opts.planEnded) {
      return {
        eligible: true,
        kind: "review",
        reason: "Plan ended with incomplete active-rest slots — review."
      };
    }
    return {
      eligible: false,
      kind: "none",
      reason: "Active-rest completion criteria not met."
    };
  }

  return {
    eligible: false,
    kind: "none",
    reason: "No completion rule matched."
  };
}

async function loadTaskCompletionFacts(
  prisma: PrismaClient,
  cycleId: string
): Promise<GoalCycleTaskCompletionFacts> {
  const campaignKey = `gc_camp_${cycleId}`;
  const tasks = await prisma.postbotTask.findMany({
    where: {
      OR: [
        { goalCycleCampaignKey: campaignKey },
        { plan: { goalCycleCampaignKey: campaignKey } }
      ]
    },
    select: { status: true, action: true }
  });

  let done = 0;
  let skipped = 0;
  let pending = 0;
  let anyPublishDone = false;
  for (const t of tasks) {
    if (t.status === "done") {
      done += 1;
      if (t.action === "post" || t.action === "schedule") anyPublishDone = true;
    } else if (t.status === "dismissed") {
      skipped += 1;
    } else {
      pending += 1;
    }
  }
  const required = tasks.length;
  return {
    required,
    done,
    skipped,
    pending,
    all_terminal: required === 0 || pending === 0,
    any_publish_done: anyPublishDone
  };
}

async function loadPublishCompletion(
  prisma: PrismaClient,
  cycleId: string
): Promise<{ planned: number; published: number }> {
  const slots = await prisma.creatorGoalCycleSlot.findMany({
    where: { cycleId },
    select: { downstreamPostId: true }
  });
  const postIds = slots
    .map((s) => s.downstreamPostId?.trim())
    .filter((id): id is string => Boolean(id));
  if (postIds.length === 0) return { planned: slots.length, published: 0 };
  const published = await prisma.post.count({
    where: {
      id: { in: postIds },
      publishState: "published"
    }
  });
  return { planned: slots.length, published };
}

function silenceWindowFromContext(
  ctx: Record<string, unknown>,
  row: GoalCycleRow
): { started_at: string | null; ends_at: string | null } {
  const started =
    strFromContext(ctx, ["silence_started_at", "reminder_suppression_started_at"]) ??
    row.materializedAt?.toISOString() ??
    row.createdAt.toISOString();
  const ends =
    strFromContext(ctx, ["silence_ends_at", "reminder_suppression_ends_at"]) ?? null;
  const days = numFromContext(ctx, ["silence_days", "interval_days"]);
  if (!ends && started && days != null && days > 0) {
    const startMs = new Date(started).getTime();
    if (!Number.isNaN(startMs)) {
      return {
        started_at: started,
        ends_at: new Date(startMs + days * 86_400_000).toISOString()
      };
    }
  }
  return { started_at: started, ends_at: ends };
}

/**
 * Assemble + persist a versioned outcome snapshot for a cycle.
 */
export async function refreshGoalCycleOutcomeSnapshot(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  opts: { now?: Date; planEnded?: boolean } = {}
): Promise<GoalCycleOutcomeSnapshot> {
  const id = creatorId.trim();
  const cid = cycleId.trim();
  const now = opts.now ?? new Date();
  const row = await findGoalCycleForCreator(prisma, id, cid);
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }

  const ctx = asContextRecord(row.contextJson);
  const goalKind = row.goalKind as GoalCycleGoalKind;
  const breakMode = (row.breakMode as GoalCycleBreakMode | null) ?? null;
  const staleAfter =
    numFromContext(ctx, ["stale_after_seconds"]) ?? DEFAULT_STALE_AFTER_SECONDS;

  const [taskCompletion, publishCompletion] = await Promise.all([
    loadTaskCompletionFacts(prisma, row.id),
    loadPublishCompletion(prisma, row.id)
  ]);

  let targetLabel = strFromContext(ctx, ["target_label", "goal_label"]) ?? "";
  let targetValue = numFromContext(ctx, ["target_value", "target_threshold", "target"]);
  let targetUnit = strFromContext(ctx, ["target_unit"]) ?? null;
  let deterministicLabel: string | null = null;
  let deterministicValue: number | null = null;
  let estimatedLabel: string | null = null;
  let estimatedValue: number | null = null;
  let coverage: OutcomeCoverage = "partial";
  let confidence: OutcomeConfidence = "unknown";
  let freshnessSeconds: number | null = null;
  let baseline: Record<string, unknown> = {};
  const sourceLinks: string[] = ["/studio/analytics"];

  if (goalKind === "paid_support") {
    const facts = await getPaidSupportFacts(prisma, id, row.id, {
      targetLabel: targetLabel || "Paid support events",
      targetThreshold: targetValue,
      now
    });
    targetLabel = facts.target.label;
    targetValue = facts.target.threshold;
    targetUnit = "events";
    deterministicValue = facts.deterministic.count;
    deterministicLabel =
      facts.outcome_summary.actual_label ??
      (facts.attribution === "zero" ? "0 deterministic events" : null);
    if (facts.estimated?.status === "estimated") {
      estimatedValue = facts.estimated.lift_count;
      estimatedLabel = `Estimated lift ${facts.estimated.lift_count}`;
    }
    coverage = facts.coverage;
    confidence = facts.confidence;
    freshnessSeconds = facts.freshness_seconds;
    baseline = { caveat: facts.caveat, attribution: facts.attribution };
    sourceLinks.push(`/studio/analytics?focus=paid_support&cycle=${row.id}`);
  } else if (goalKind === "views") {
    targetLabel = targetLabel || "Views / impressions";
    targetUnit = targetUnit || "views";
    if (targetValue == null) targetValue = 1000;
    // Prefer creator-supplied actuals in context (fixtures/tests); else mark unavailable.
    deterministicValue = numFromContext(ctx, ["actual_views", "actual_value"]);
    deterministicLabel =
      deterministicValue != null ? `${deterministicValue} views` : null;
    coverage = deterministicValue != null ? "partial" : "unavailable";
    confidence = deterministicValue != null ? "medium" : "unknown";
    freshnessSeconds = numFromContext(ctx, ["metric_freshness_seconds"]);
  } else if (goalKind === "engagement") {
    targetLabel = targetLabel || "Engagement";
    targetUnit = targetUnit || "engagements";
    if (targetValue == null) targetValue = 100;
    deterministicValue = numFromContext(ctx, ["actual_engagement", "actual_value"]);
    deterministicLabel =
      deterministicValue != null ? `${deterministicValue} engagements` : null;
    coverage = deterministicValue != null ? "partial" : "unavailable";
    confidence = deterministicValue != null ? "medium" : "unknown";
    freshnessSeconds = numFromContext(ctx, ["metric_freshness_seconds"]);
  } else if (goalKind === "break") {
    targetLabel =
      breakMode === "complete_silence"
        ? "Complete silence interval"
        : breakMode === "social_upkeep"
          ? "Social upkeep tasks"
          : "Active rest slots";
    targetValue =
      breakMode === "complete_silence"
        ? 1
        : taskCompletion.required;
    targetUnit = breakMode === "complete_silence" ? "interval" : "tasks";
    deterministicValue =
      breakMode === "complete_silence"
        ? null
        : taskCompletion.done + taskCompletion.skipped;
    deterministicLabel =
      breakMode === "complete_silence"
        ? null
        : `${taskCompletion.done} done · ${taskCompletion.skipped} skipped · ${taskCompletion.pending} pending`;
    coverage = "complete";
    confidence = "high";
    freshnessSeconds = 0;
  }

  if (!targetLabel) targetLabel = `${goalKind} target`;

  const silenceWindow =
    goalKind === "break" && breakMode === "complete_silence"
      ? silenceWindowFromContext(ctx, row)
      : {
          started_at: row.materializedAt?.toISOString() ?? row.createdAt.toISOString(),
          ends_at: strFromContext(ctx, ["plan_ends_at", "window_ends_at"])
        };

  const stale =
    freshnessSeconds != null ? freshnessSeconds > staleAfter : coverage === "unavailable";

  const planEnded =
    opts.planEnded === true ||
    (() => {
      const ends = silenceWindow.ends_at ? new Date(silenceWindow.ends_at) : null;
      return Boolean(ends && !Number.isNaN(ends.getTime()) && now.getTime() >= ends.getTime());
    })();

  const base = {
    snapshot_version: GOAL_CYCLE_OUTCOME_SNAPSHOT_VERSION,
    cycle_id: row.id,
    goal_kind: goalKind,
    break_mode: breakMode,
    window: {
      label: row.periodKey,
      started_at: silenceWindow.started_at,
      ends_at: silenceWindow.ends_at
    },
    target: { label: targetLabel, value: targetValue, unit: targetUnit },
    actual: {
      deterministic_label: deterministicLabel,
      deterministic_value: deterministicValue,
      estimated_label: estimatedLabel,
      estimated_value: estimatedValue
    },
    baseline,
    coverage,
    freshness_seconds: freshnessSeconds,
    confidence,
    stale,
    stale_after_seconds: staleAfter,
    task_completion: taskCompletion,
    publish_completion: publishCompletion,
    source_links: sourceLinks,
    calculated_at: now.toISOString()
  } satisfies Omit<GoalCycleOutcomeSnapshot, "completion">;

  const completion = evaluateCompletionEligibility(base, { planEnded, now });
  const snapshot: GoalCycleOutcomeSnapshot = { ...base, completion };

  const summary = outcomeSummaryFromSnapshot(snapshot);
  await prisma.creatorGoalCycleOutcome.upsert({
    where: { cycleId: row.id },
    create: {
      cycleId: row.id,
      targetJson: {
        snapshot,
        summary
      } as unknown as Prisma.InputJsonValue,
      actualJson: snapshot.actual as unknown as Prisma.InputJsonValue,
      confidence: snapshot.confidence,
      freshnessSeconds: snapshot.freshness_seconds,
      suggestedCompletion: false
    },
    update: {
      targetJson: {
        snapshot,
        summary
      } as unknown as Prisma.InputJsonValue,
      actualJson: snapshot.actual as unknown as Prisma.InputJsonValue,
      confidence: snapshot.confidence,
      freshnessSeconds: snapshot.freshness_seconds
    }
  });

  return snapshot;
}

export async function getGoalCycleOutcomeSnapshot(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleOutcomeSnapshot | null> {
  const row = await findGoalCycleForCreator(prisma, creatorId.trim(), cycleId.trim());
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }
  const outcome = await prisma.creatorGoalCycleOutcome.findUnique({
    where: { cycleId: row.id }
  });
  if (!outcome?.targetJson || typeof outcome.targetJson !== "object") return null;
  const bag = outcome.targetJson as Record<string, unknown>;
  const snap = bag.snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  return snap as GoalCycleOutcomeSnapshot;
}

/**
 * Suggest completion only when eligibility kind is `complete`, or `review` when
 * `allowReview` (creator-requested review / plan-ended review).
 */
export function assertCanSuggestCompletion(
  snapshot: GoalCycleOutcomeSnapshot,
  opts: { allowReview?: boolean; force?: boolean } = {}
): void {
  if (opts.force) return;
  if (snapshot.completion.kind === "complete" && snapshot.completion.eligible) return;
  if (opts.allowReview && snapshot.completion.kind === "review") return;
  throw new GoalCycleContractError(
    "GOAL_CYCLE_INVALID_STATE",
    snapshot.completion.reason || "Completion cannot be suggested yet.",
    [{ field: "completion", issue: snapshot.completion.kind }]
  );
}

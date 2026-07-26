/**
 * Goal Cycle bounded planner — initial question + Plan flow (VS5-T03).
 * Credit reservation, progress, one AI call (or fallback), idempotent retries.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { generateText } from "../../ai/ai-service.js";
import {
  getPaidSupportFacts,
  type PaidSupportFacts
} from "../../analytics/goal-cycle-paid-support-facts.js";
import {
  shouldReserveCoachPlanCredit,
  reserveCoachPlanCreditForCycle,
  CoachPlanCreditError
} from "../../usage/coach-plan-credit-service.js";
import {
  GoalCycleContractError,
  GOAL_CYCLE_BOUNDED_TEXT_MAX,
  GOAL_CYCLE_MAX_AI_REVISIONS,
  GOAL_CYCLE_MAX_QUESTIONS,
  GOAL_CYCLE_QUESTION_OPTION_MAX,
  GOAL_CYCLE_QUESTION_OPTION_MIN,
  getGoalCycleFeatureFlags,
  type GoalCycleBreakMode,
  type GoalCycleDetail,
  type GoalCycleGoalKind,
  type GoalCyclePhase,
  type GoalCyclePlan,
  type GoalCycleQuestion,
  type GoalCycleState
} from "../contracts.js";
import {
  GoalCycleNotFoundError,
  getGoalCycle,
  isTerminalGoalCycleState,
  patchGoalCycleCheckpoint
} from "../goal-cycle-service.js";
import {
  asContextRecord,
  assertKnownEnums,
  findGoalCycleForCreator,
  type GoalCycleRow
} from "../goal-cycle-store.js";
import {
  buildGoalCycleFactPack,
  buildGoalCycleFactPackFromDreamFixture,
  GOAL_CYCLE_FACT_PACK_VERSION,
  type GoalCycleFactPack
} from "./goal-cycle-fact-pack.js";
import { buildDeterministicPlanFallback } from "./deterministic-plan-fallback.js";
import {
  parsePlannerAiOutput,
  validatePlannerPlan
} from "./plan-schema.js";
import { syncSlotScheduledUtc } from "./schedule-local.js";
import {
  buildPlannerQuestionSystemPrompt,
  buildPlannerRevisionSystemPrompt,
  buildPlannerRevisionUserPayload,
  buildPlannerSystemPrompt,
  buildPlannerUserPayload,
  GOAL_CYCLE_PLANNER_PROMPT_VERSION
} from "./planner-prompts.js";

export const PLANNER_PROGRESS_CODES = [
  "credit_reserved",
  "facts_loaded",
  "research_complete",
  "questions_ready",
  "generating_plan",
  "plan_ready",
  "revision_started",
  "revision_ready",
  "fallback_ready",
  "planner_failed"
] as const;
export type PlannerProgressCode = (typeof PLANNER_PROGRESS_CODES)[number];

function isPlannerProgressCode(value: string): value is PlannerProgressCode {
  return (PLANNER_PROGRESS_CODES as readonly string[]).includes(value);
}

function sanitizeProgressMeta(meta?: Record<string, unknown>): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = typeof v === "string" ? v.slice(0, 120) : v;
    }
  }
  return out;
}

export async function appendPlannerProgress(
  prisma: PrismaClient,
  cycleId: string,
  code: PlannerProgressCode,
  phase: GoalCyclePhase,
  meta?: Record<string, unknown>
): Promise<void> {
  if (!isPlannerProgressCode(code)) {
    throw new Error(`invalid_planner_progress_code:${code}`);
  }
  const last = await prisma.creatorGoalCycleProgress.findFirst({
    where: { cycleId },
    orderBy: { sequence: "desc" }
  });
  const sequence = (last?.sequence ?? 0) + 1;
  await prisma.creatorGoalCycleProgress.create({
    data: {
      cycleId,
      sequence,
      phase,
      messageCode: code,
      metadataJson: {
        retryable: code === "planner_failed",
        ...sanitizeProgressMeta(meta)
      } as Prisma.InputJsonValue
    }
  });
}

function mapCreditError(err: unknown): never {
  if (err instanceof CoachPlanCreditError) {
    throw new GoalCycleContractError(
      err.code === "GOAL_CYCLE_NO_CREDIT" ? "GOAL_CYCLE_NO_CREDIT" : "GOAL_CYCLE_INVALID_STATE",
      err.message,
      err.details
    );
  }
  throw err;
}

export async function ensurePlannerCreditReserved(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    cycle: GoalCycleRow;
    idempotencyKey: string;
    now?: Date;
  }
): Promise<{ reserved: boolean; idempotent: boolean }> {
  const needs = shouldReserveCoachPlanCredit({
    goal_kind: args.cycle.goalKind,
    break_mode: args.cycle.breakMode
  });
  if (!needs) return { reserved: false, idempotent: true };

  try {
    const result = await reserveCoachPlanCreditForCycle(prisma, {
      creatorId: args.creatorId,
      cycleId: args.cycle.id,
      idempotencyKey: args.idempotencyKey.slice(0, 128),
      now: args.now
    });
    if (!args.cycle.reservationRef && result.reservation?.reservation_key) {
      await prisma.creatorGoalCycle.update({
        where: { id: args.cycle.id },
        data: { reservationRef: result.reservation.reservation_key }
      });
    }
    return { reserved: true, idempotent: result.idempotent };
  } catch (err) {
    mapCreditError(err);
  }
}

type RevisionRow = {
  id: string;
  cycleId: string;
  ordinal: number;
  kind: string;
  requestSummary: unknown;
  responseSummary: unknown;
  planJson: unknown;
};

function requestSummaryRecord(value: unknown): Record<string, unknown> {
  return asContextRecord(value);
}

export async function findRevisionByPlannerIdempotency(
  prisma: PrismaClient,
  cycleId: string,
  idempotencyKey: string
): Promise<RevisionRow | null> {
  const key = idempotencyKey.trim();
  if (!key) return null;
  const rows = await prisma.creatorGoalCycleRevision.findMany({
    where: { cycleId },
    orderBy: { ordinal: "asc" },
    take: 20
  });
  for (const row of rows) {
    const summary = requestSummaryRecord(row.requestSummary);
    if (summary.idempotency_key === key) {
      return row as RevisionRow;
    }
  }
  return null;
}

export async function insertInitialPlanRevision(
  prisma: PrismaClient,
  args: {
    cycleId: string;
    idempotencyKey: string;
    plan: GoalCyclePlan;
    aiUsed: boolean;
    fallback: boolean;
    factPackVersion: string;
    promptVersion: string;
  }
): Promise<{ revision_id: string; ordinal: number }> {
  return insertPlanRevision(prisma, {
    cycleId: args.cycleId,
    kind: "initial",
    idempotencyKey: args.idempotencyKey,
    plan: args.plan,
    requestSummary: {
      fact_pack_version: args.factPackVersion,
      prompt_version: args.promptVersion,
      operation: "generate_initial_plan"
    },
    responseSummary: {
      ai_used: args.aiUsed,
      fallback: args.fallback
    }
  });
}

export async function insertPlanRevision(
  prisma: PrismaClient,
  args: {
    cycleId: string;
    kind: "initial" | "ai_revision" | "manual_edit";
    idempotencyKey: string;
    plan: GoalCyclePlan;
    requestSummary?: Record<string, unknown>;
    responseSummary?: Record<string, unknown>;
  }
): Promise<{ revision_id: string; ordinal: number }> {
  const last = await prisma.creatorGoalCycleRevision.findFirst({
    where: { cycleId: args.cycleId },
    orderBy: { ordinal: "desc" }
  });
  const ordinal = (last?.ordinal ?? 0) + 1;
  const row = await prisma.creatorGoalCycleRevision.create({
    data: {
      cycleId: args.cycleId,
      ordinal,
      kind: args.kind,
      requestSummary: {
        idempotency_key: args.idempotencyKey.slice(0, 128),
        ...(args.requestSummary ?? {})
      } as Prisma.InputJsonValue,
      responseSummary: (args.responseSummary ?? {}) as Prisma.InputJsonValue,
      planJson: args.plan as unknown as Prisma.InputJsonValue
    }
  });
  return { revision_id: row.id, ordinal };
}

export async function getLatestValidPlan(
  prisma: PrismaClient,
  cycleId: string
): Promise<{ plan: GoalCyclePlan; revision: RevisionRow } | null> {
  const row = await prisma.creatorGoalCycleRevision.findFirst({
    where: { cycleId },
    orderBy: { ordinal: "desc" }
  });
  if (!row?.planJson || typeof row.planJson !== "object" || Array.isArray(row.planJson)) {
    return null;
  }
  return {
    plan: row.planJson as GoalCyclePlan,
    revision: row as RevisionRow
  };
}

export async function countAiRevisionRounds(
  prisma: PrismaClient,
  cycleId: string
): Promise<number> {
  const rows = await prisma.creatorGoalCycleRevision.findMany({
    where: { cycleId, kind: "ai_revision" },
    select: { id: true }
  });
  return rows.length;
}

/**
 * Deterministic clarification questions (0–2) from fact-pack gaps — no model required.
 */
export function buildDeterministicPlannerQuestions(
  pack: GoalCycleFactPack
): GoalCycleQuestion[] {
  if (pack.goal_kind === "break" && pack.break_mode === "complete_silence") {
    return [];
  }
  const questions: GoalCycleQuestion[] = [];
  const linked = pack.linked_destinations.filter((d) => d.readiness !== "unavailable");

  if (linked.length > 1) {
    const isActiveRest = pack.goal_kind === "break" && pack.break_mode === "active_rest";
    // Active rest leans on light formats; Text / Poll are first-class lead choices.
    const formatOptions = isActiveRest
      ? [
          "Single image",
          "Carousel / multi-panel",
          "Short process clip",
          "Text",
          "Poll",
          "Sketch / journal"
        ]
      : ["Single image", "Carousel / multi-panel", "Short process clip", "Text", "Poll"];
    questions.push({
      id: "q_lead_format",
      prompt: "Which format should lead this Plan?",
      options: formatOptions.slice(0, GOAL_CYCLE_QUESTION_OPTION_MAX),
      bounded_text: null,
      answer: null
    });
  }

  if (pack.goal_kind === "paid_support" || pack.goal_kind === "engagement") {
    questions.push({
      id: "q_caption_energy",
      prompt: "How energetic should the captions feel?",
      options: ["Soft / quiet", "Warm / friendly", "Hype / launch"],
      bounded_text: null,
      answer: null
    });
  }

  return questions.slice(0, GOAL_CYCLE_MAX_QUESTIONS).map((q) => {
    if (
      q.options.length < GOAL_CYCLE_QUESTION_OPTION_MIN ||
      q.options.length > GOAL_CYCLE_QUESTION_OPTION_MAX
    ) {
      throw new Error("deterministic_question_options_out_of_bounds");
    }
    return q;
  });
}

function readStoredQuestions(context: Record<string, unknown>): GoalCycleQuestion[] {
  const raw = context.planner_questions;
  if (!Array.isArray(raw)) return [];
  const out: GoalCycleQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const q = item as Record<string, unknown>;
    if (typeof q.id !== "string" || typeof q.prompt !== "string" || !Array.isArray(q.options)) {
      continue;
    }
    out.push({
      id: q.id,
      prompt: q.prompt,
      options: q.options.map(String),
      bounded_text: typeof q.bounded_text === "string" ? q.bounded_text : null,
      answer: typeof q.answer === "string" ? q.answer : null
    });
  }
  return out.slice(0, GOAL_CYCLE_MAX_QUESTIONS);
}

export async function loadFactPackForCycle(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  options: { factPack?: GoalCycleFactPack } = {}
): Promise<GoalCycleFactPack> {
  if (options.factPack) return options.factPack;

  const cycle = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!cycle) throw new GoalCycleNotFoundError();
  assertKnownEnums(cycle);

  const context = asContextRecord(cycle.contextJson);
  // Align with Dream-flow / Library UI defaults when start context omitted linked set.
  const linkedRaw = Array.isArray(context.linked_destinations)
    ? context.linked_destinations.map(String)
    : ["patreon", "x", "bluesky"];
  const unlinkedRaw = Array.isArray(context.unlinked_destinations)
    ? context.unlinked_destinations.map(String)
    : ["deviantart"];

  let paid_support: PaidSupportFacts | null = null;
  if (cycle.goalKind === "paid_support") {
    try {
      paid_support = await getPaidSupportFacts(prisma, creatorId, cycleId);
    } catch {
      paid_support = null;
    }
  }

  return buildGoalCycleFactPack({
    cycle_id: cycle.id,
    goal_kind: cycle.goalKind as GoalCycleGoalKind,
    break_mode: (cycle.breakMode as GoalCycleBreakMode | null) ?? null,
    time_zone: cycle.timeZone,
    creator_context: context,
    linked_destinations: linkedRaw.map((id) => ({
      id,
      readiness: "ready" as const,
      label: id
    })),
    unlinked_destination_ids: unlinkedRaw,
    paid_support,
    computed_at: new Date()
  });
}

export type ProposePlannerQuestionsInput = {
  creatorId: string;
  cycleId: string;
  idempotencyKey: string;
  expectedVersion?: number;
  factPack?: GoalCycleFactPack;
  /** When true, skip AI and use deterministic questions only. */
  deterministicOnly?: boolean;
};

export type ProposePlannerQuestionsResult = {
  questions: GoalCycleQuestion[];
  cycle: GoalCycleDetail;
  idempotent: boolean;
};

export async function proposePlannerQuestions(
  prisma: PrismaClient,
  input: ProposePlannerQuestionsInput
): Promise<ProposePlannerQuestionsResult> {
  const creatorId = input.creatorId.trim();
  const cycleId = input.cycleId.trim();
  let cycle = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!cycle) throw new GoalCycleNotFoundError();
  assertKnownEnums(cycle);
  if (isTerminalGoalCycleState(cycle.state as GoalCycleState)) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "Cannot propose questions on a terminal Goal Cycle.",
      [{ field: "state", issue: "terminal" }]
    );
  }

  const context = asContextRecord(cycle.contextJson);
  const existing = readStoredQuestions(context);
  if (existing.length > 0) {
    const detail = await getGoalCycle(prisma, creatorId, cycleId);
    return { questions: existing, cycle: detail, idempotent: true };
  }

  const creditKey = `planner_q_credit:${input.idempotencyKey}`.slice(0, 128);
  await ensurePlannerCreditReserved(prisma, {
    creatorId,
    cycle,
    idempotencyKey: creditKey
  });
  cycle = (await findGoalCycleForCreator(prisma, creatorId, cycleId)) ?? cycle;
  if (shouldReserveCoachPlanCredit({ goal_kind: cycle.goalKind, break_mode: cycle.breakMode })) {
    await appendPlannerProgress(prisma, cycleId, "credit_reserved", "questions", {
      source: "propose_questions"
    });
  }

  const factPack = await loadFactPackForCycle(prisma, creatorId, cycleId, {
    factPack: input.factPack
  });
  await appendPlannerProgress(prisma, cycleId, "facts_loaded", "questions");

  let questions = buildDeterministicPlannerQuestions(factPack);

  const flags = getGoalCycleFeatureFlags();
  if (
    !input.deterministicOnly &&
    flags.ai_enabled &&
    !(cycle.goalKind === "break" && cycle.breakMode === "complete_silence")
  ) {
    const ai = await generateText({
      tier: "cheap",
      system: buildPlannerQuestionSystemPrompt(),
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            prompt_version: GOAL_CYCLE_PLANNER_PROMPT_VERSION,
            fact_pack: factPack,
            goal_kind: cycle.goalKind,
            break_mode: cycle.breakMode
          })
        }
      ],
      maxOutputTokens: 600,
      temperature: 0.3,
      metadata: { feature: "goal_cycle_planner_questions", creatorId }
    });
    if (ai.ok) {
      try {
        const parsed = JSON.parse(ai.text) as { questions?: unknown };
        if (Array.isArray(parsed.questions)) {
          const built = buildDeterministicPlannerQuestions(factPack);
          // Prefer AI only when shape is usable; otherwise keep deterministic.
          const candidate = parsed.questions
            .slice(0, GOAL_CYCLE_MAX_QUESTIONS)
            .map((q, i) => {
              if (!q || typeof q !== "object") return null;
              const row = q as Record<string, unknown>;
              if (typeof row.prompt !== "string" || !Array.isArray(row.options)) return null;
              const options = row.options.map(String).filter(Boolean);
              if (
                options.length < GOAL_CYCLE_QUESTION_OPTION_MIN ||
                options.length > GOAL_CYCLE_QUESTION_OPTION_MAX
              ) {
                return null;
              }
              return {
                id: typeof row.id === "string" ? row.id : `q_ai_${i + 1}`,
                prompt: row.prompt,
                options,
                bounded_text: null,
                answer: null
              } as GoalCycleQuestion;
            })
            .filter((q): q is GoalCycleQuestion => q != null);
          if (candidate.length > 0) questions = candidate;
          else questions = built;
        }
      } catch {
        // keep deterministic
      }
    }
  }

  const expected = input.expectedVersion ?? cycle.version;
  const detail = await patchGoalCycleCheckpoint(prisma, creatorId, cycleId, {
    expected_version: expected,
    phase: "questions",
    state: "questions",
    context: {
      ...context,
      planner_questions: questions,
      planner_questions_idempotency_key: input.idempotencyKey.slice(0, 128)
    },
    progress_message_code: "questions_ready"
  });

  return { questions, cycle: detail, idempotent: false };
}

export type AnswerPlannerQuestionsInput = {
  creatorId: string;
  cycleId: string;
  expectedVersion: number;
  answers: Array<{ id: string; answer: string }>;
};

export async function answerPlannerQuestions(
  prisma: PrismaClient,
  input: AnswerPlannerQuestionsInput
): Promise<GoalCycleDetail> {
  const creatorId = input.creatorId.trim();
  const cycleId = input.cycleId.trim();
  const cycle = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!cycle) throw new GoalCycleNotFoundError();
  assertKnownEnums(cycle);

  const context = asContextRecord(cycle.contextJson);
  const questions = readStoredQuestions(context);
  if (questions.length === 0) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "No planner questions are pending.",
      [{ field: "planner_questions", issue: "missing" }]
    );
  }

  const answerMap = new Map(input.answers.map((a) => [a.id, a.answer.trim()]));
  const updated = questions.map((q) => {
    const answer = answerMap.get(q.id);
    if (answer == null || !answer) {
      throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "Each question needs an answer.", [
        { field: `answers.${q.id}`, issue: "required" }
      ]);
    }
    if (!q.options.includes(answer) && q.bounded_text == null) {
      // Allow option match only for closed questions.
      if (q.options.length > 0 && !q.options.includes(answer)) {
        throw new GoalCycleContractError(
          "GOAL_CYCLE_PLAN_INVALID",
          "Answer must match one of the provided options.",
          [{ field: `answers.${q.id}`, issue: "not_in_options" }]
        );
      }
    }
    return { ...q, answer };
  });

  return patchGoalCycleCheckpoint(prisma, creatorId, cycleId, {
    expected_version: input.expectedVersion,
    phase: "revisions",
    state: cycle.state === "questions" ? "review" : (cycle.state as GoalCycleState),
    context: {
      ...context,
      planner_questions: updated
    }
  });
}

export type GenerateInitialPlanInput = {
  creatorId: string;
  cycleId: string;
  idempotencyKey: string;
  expectedVersion?: number;
  factPack?: GoalCycleFactPack;
  /** Force deterministic fallback (tests / kill switch). */
  forceFallback?: boolean;
  /** Skip the questions gate and generate immediately. */
  skipQuestions?: boolean;
};

export type GenerateInitialPlanResult = {
  plan: GoalCyclePlan;
  ai_used: boolean;
  fallback: boolean;
  cycle: GoalCycleDetail;
  idempotent: boolean;
};

async function callModelForInitialPlan(args: {
  creatorId: string;
  factPack: GoalCycleFactPack;
  goalKind: GoalCycleGoalKind;
  breakMode: GoalCycleBreakMode | null;
  answeredQuestions: GoalCycleQuestion[];
}): Promise<GoalCyclePlan | null> {
  const flags = getGoalCycleFeatureFlags();
  if (!flags.ai_enabled) return null;

  const result = await generateText({
    tier: "cheap",
    system: buildPlannerSystemPrompt({
      goal_kind: args.goalKind,
      break_mode: args.breakMode
    }),
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          buildPlannerUserPayload({
            factPack: args.factPack,
            goal_kind: args.goalKind,
            break_mode: args.breakMode,
            answered_questions: args.answeredQuestions
          })
        )
      }
    ],
    maxOutputTokens: 2500,
    temperature: 0.4,
    metadata: { feature: "goal_cycle_planner", creatorId: args.creatorId }
  });

  if (!result.ok) return null;
  const parsed = parsePlannerAiOutput(result.text);
  if (!parsed) return null;
  try {
    return validatePlannerPlan(parsed, {
      factPack: args.factPack,
      goal_kind: args.goalKind,
      break_mode: args.breakMode
    });
  } catch {
    return null;
  }
}

/**
 * Generate the initial Plan for a cycle (one AI attempt + deterministic fallback).
 * Retries with the same idempotency key return the stored revision.
 */
export async function generateInitialGoalCyclePlan(
  prisma: PrismaClient,
  input: GenerateInitialPlanInput
): Promise<GenerateInitialPlanResult> {
  const creatorId = input.creatorId.trim();
  const cycleId = input.cycleId.trim();
  const idempotencyKey = input.idempotencyKey.trim().slice(0, 128);
  if (!idempotencyKey) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "idempotency_key is required.", [
      { field: "idempotency_key", issue: "required" }
    ]);
  }

  let cycle = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!cycle) throw new GoalCycleNotFoundError();
  assertKnownEnums(cycle);
  if (isTerminalGoalCycleState(cycle.state as GoalCycleState)) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "Cannot generate a Plan on a terminal Goal Cycle.",
      [{ field: "state", issue: "terminal" }]
    );
  }

  const existing = await findRevisionByPlannerIdempotency(prisma, cycleId, idempotencyKey);
  if (existing?.planJson && typeof existing.planJson === "object") {
    const detail = await getGoalCycle(prisma, creatorId, cycleId);
    return {
      plan: existing.planJson as GoalCyclePlan,
      ai_used: Boolean(asContextRecord(existing.responseSummary).ai_used),
      fallback: Boolean(asContextRecord(existing.responseSummary).fallback),
      cycle: detail,
      idempotent: true
    };
  }

  const goalKind = cycle.goalKind as GoalCycleGoalKind;
  const breakMode = (cycle.breakMode as GoalCycleBreakMode | null) ?? null;
  const silence = goalKind === "break" && breakMode === "complete_silence";

  try {
    if (!silence) {
      const credit = await ensurePlannerCreditReserved(prisma, {
        creatorId,
        cycle,
        idempotencyKey: `planner_plan_credit:${idempotencyKey}`.slice(0, 128)
      });
      if (credit.reserved) {
        await appendPlannerProgress(prisma, cycleId, "credit_reserved", "revisions", {
          source: "generate_initial_plan"
        });
      }
      cycle = (await findGoalCycleForCreator(prisma, creatorId, cycleId)) ?? cycle;
    }

    const factPack =
      input.factPack ??
      (await loadFactPackForCycle(prisma, creatorId, cycleId));

    const pack: GoalCycleFactPack = silence
      ? buildGoalCycleFactPack({
          cycle_id: cycleId,
          goal_kind: "break",
          break_mode: "complete_silence",
          time_zone: cycle.timeZone,
          linked_destinations: [],
          creator_context: asContextRecord(cycle.contextJson),
          history_posts: [],
          computed_at: new Date()
        })
      : factPack;

    await appendPlannerProgress(prisma, cycleId, "facts_loaded", silence ? "logistics" : "revisions", {
      fact_pack_version: GOAL_CYCLE_FACT_PACK_VERSION
    });

    const context = asContextRecord(cycle.contextJson);
    const storedQuestions = readStoredQuestions(context);
    const unanswered = storedQuestions.filter((q) => !q.answer);
    if (!input.skipQuestions && !silence && unanswered.length > 0) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_INVALID_STATE",
        "Answer pending clarification questions before generating a Plan.",
        [{ field: "planner_questions", issue: "unanswered" }]
      );
    }

    let plan: GoalCyclePlan;
    let aiUsed = false;
    let fallback = false;

    if (silence || input.forceFallback) {
      plan = buildDeterministicPlanFallback({
        factPack: pack,
        goal_kind: goalKind,
        break_mode: breakMode
      });
      fallback = true;
      await appendPlannerProgress(prisma, cycleId, "fallback_ready", "revisions", {
        reason: silence ? "complete_silence" : "force_fallback"
      });
    } else {
      await appendPlannerProgress(prisma, cycleId, "generating_plan", "revisions");
      const fromAi = await callModelForInitialPlan({
        creatorId,
        factPack: pack,
        goalKind,
        breakMode,
        answeredQuestions: storedQuestions.filter((q) => Boolean(q.answer))
      });
      if (fromAi) {
        plan = fromAi;
        aiUsed = true;
        await appendPlannerProgress(prisma, cycleId, "plan_ready", "revisions", {
          ai_used: true
        });
      } else {
        plan = buildDeterministicPlanFallback({
          factPack: pack,
          goal_kind: goalKind,
          break_mode: breakMode
        });
        fallback = true;
        await appendPlannerProgress(prisma, cycleId, "fallback_ready", "revisions", {
          reason: "ai_unavailable_or_invalid"
        });
      }
    }

    await insertInitialPlanRevision(prisma, {
      cycleId,
      idempotencyKey,
      plan,
      aiUsed,
      fallback,
      factPackVersion: GOAL_CYCLE_FACT_PACK_VERSION,
      promptVersion: GOAL_CYCLE_PLANNER_PROMPT_VERSION
    });

    const expected = input.expectedVersion ?? cycle.version;
    const detail = await patchGoalCycleCheckpoint(prisma, creatorId, cycleId, {
      expected_version: expected,
      phase: silence ? "logistics" : "revisions",
      state: "review",
      context: {
        ...context,
        last_plan_idempotency_key: idempotencyKey
      }
    });

    return {
      plan,
      ai_used: aiUsed,
      fallback,
      cycle: detail,
      idempotent: false
    };
  } catch (err) {
    if (err instanceof GoalCycleContractError || err instanceof GoalCycleNotFoundError) {
      throw err;
    }
    await appendPlannerProgress(prisma, cycleId, "planner_failed", "revisions", {
      reason: err instanceof Error ? err.message.slice(0, 80) : "unknown"
    }).catch(() => undefined);
    throw err;
  }
}

/** Test helper — Dream pack for engagement initial flow. */
export function dreamFactPackForPlannerTests(): GoalCycleFactPack {
  return buildGoalCycleFactPackFromDreamFixture();
}

export type ReviseGoalCyclePlanInput = {
  creatorId: string;
  cycleId: string;
  idempotencyKey: string;
  expectedVersion?: number;
  /** Creator note describing the requested change (bounded). */
  revision_note: string;
  factPack?: GoalCycleFactPack;
  /** Test/kill-switch: produce a validated local revision without calling the model. */
  forceFallback?: boolean;
};

export type ReviseGoalCyclePlanResult = {
  plan: GoalCyclePlan;
  ai_used: boolean;
  fallback: boolean;
  ai_revision_count: number;
  cycle: GoalCycleDetail;
  idempotent: boolean;
};

function applyDeterministicRevision(
  prior: GoalCyclePlan,
  note: string,
  nextCount: number,
  factPack: GoalCycleFactPack,
  goalKind: GoalCycleGoalKind,
  breakMode: GoalCycleBreakMode | null
): GoalCyclePlan {
  const draft: GoalCyclePlan = {
    ...prior,
    version: Math.max(1, prior.version + 1),
    ai_revision_count: nextCount,
    rationale: `${prior.rationale} Revised: ${note.slice(0, 160)}`.slice(0, 500),
    evidence_summary: prior.evidence_summary,
    warnings: [
      ...prior.warnings.filter((w) => !/deterministic revision/i.test(w)),
      "Deterministic revision applied (no model output)."
    ]
  };
  return validatePlannerPlan(draft, {
    factPack,
    goal_kind: goalKind,
    break_mode: breakMode
  });
}

async function callModelForRevision(args: {
  creatorId: string;
  factPack: GoalCycleFactPack;
  goalKind: GoalCycleGoalKind;
  breakMode: GoalCycleBreakMode | null;
  answeredQuestions: GoalCycleQuestion[];
  priorPlan: GoalCyclePlan;
  revisionNote: string;
  nextCount: number;
}): Promise<GoalCyclePlan | null> {
  const flags = getGoalCycleFeatureFlags();
  if (!flags.ai_enabled) return null;

  const result = await generateText({
    tier: "cheap",
    system: buildPlannerRevisionSystemPrompt({
      goal_kind: args.goalKind,
      break_mode: args.breakMode,
      next_ai_revision_count: args.nextCount
    }),
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          buildPlannerRevisionUserPayload({
            factPack: args.factPack,
            goal_kind: args.goalKind,
            break_mode: args.breakMode,
            answered_questions: args.answeredQuestions,
            prior_plan: args.priorPlan,
            revision_note: args.revisionNote,
            next_ai_revision_count: args.nextCount
          })
        )
      }
    ],
    maxOutputTokens: 2500,
    temperature: 0.4,
    metadata: { feature: "goal_cycle_planner_revision", creatorId: args.creatorId }
  });

  if (!result.ok) return null;
  const parsed = parsePlannerAiOutput(result.text);
  if (!parsed) return null;
  try {
    const plan = validatePlannerPlan(parsed, {
      factPack: args.factPack,
      goal_kind: args.goalKind,
      break_mode: args.breakMode
    });
    // Enforce revision counter even if the model mis-sets it.
    return {
      ...plan,
      ai_revision_count: args.nextCount
    };
  } catch {
    return null;
  }
}

/**
 * Apply one AI revision against the latest valid Plan.
 * Rejects a third AI revision without charging. Failed AI attempts do not consume a round.
 */
export async function reviseGoalCyclePlan(
  prisma: PrismaClient,
  input: ReviseGoalCyclePlanInput
): Promise<ReviseGoalCyclePlanResult> {
  const creatorId = input.creatorId.trim();
  const cycleId = input.cycleId.trim();
  const idempotencyKey = input.idempotencyKey.trim().slice(0, 128);
  const revisionNote = input.revision_note.trim().slice(0, GOAL_CYCLE_BOUNDED_TEXT_MAX);
  if (!idempotencyKey) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "idempotency_key is required.", [
      { field: "idempotency_key", issue: "required" }
    ]);
  }
  if (!revisionNote) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "revision_note is required.", [
      { field: "revision_note", issue: "required" }
    ]);
  }

  const cycle = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!cycle) throw new GoalCycleNotFoundError();
  assertKnownEnums(cycle);
  if (isTerminalGoalCycleState(cycle.state as GoalCycleState)) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "Cannot revise a terminal Goal Cycle.",
      [{ field: "state", issue: "terminal" }]
    );
  }

  const existing = await findRevisionByPlannerIdempotency(prisma, cycleId, idempotencyKey);
  if (existing?.planJson && typeof existing.planJson === "object") {
    const detail = await getGoalCycle(prisma, creatorId, cycleId);
    const plan = existing.planJson as GoalCyclePlan;
    return {
      plan,
      ai_used: Boolean(asContextRecord(existing.responseSummary).ai_used),
      fallback: Boolean(asContextRecord(existing.responseSummary).fallback),
      ai_revision_count: plan.ai_revision_count,
      cycle: detail,
      idempotent: true
    };
  }

  const latest = await getLatestValidPlan(prisma, cycleId);
  if (!latest) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "Generate an initial Plan before requesting a revision.",
      [{ field: "plan", issue: "missing" }]
    );
  }

  const aiRounds = await countAiRevisionRounds(prisma, cycleId);
  const priorCount = Math.max(latest.plan.ai_revision_count, aiRounds);
  if (priorCount >= GOAL_CYCLE_MAX_AI_REVISIONS || aiRounds >= GOAL_CYCLE_MAX_AI_REVISIONS) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_LIMIT_EXCEEDED",
      `At most ${GOAL_CYCLE_MAX_AI_REVISIONS} AI revisions are allowed.`,
      [{ field: "ai_revision_count", issue: "max_exceeded" }]
    );
  }

  const nextCount = priorCount + 1;
  const goalKind = cycle.goalKind as GoalCycleGoalKind;
  const breakMode = (cycle.breakMode as GoalCycleBreakMode | null) ?? null;
  const factPack = await loadFactPackForCycle(prisma, creatorId, cycleId, {
    factPack: input.factPack
  });
  const answered = readStoredQuestions(asContextRecord(cycle.contextJson)).filter((q) =>
    Boolean(q.answer)
  );

  await appendPlannerProgress(prisma, cycleId, "revision_started", "revisions", {
    next_ai_revision_count: nextCount
  });

  let plan: GoalCyclePlan;
  let aiUsed = false;
  let fallback = false;

  try {
    if (input.forceFallback) {
      plan = applyDeterministicRevision(
        latest.plan,
        revisionNote,
        nextCount,
        factPack,
        goalKind,
        breakMode
      );
      fallback = true;
    } else {
      const fromAi = await callModelForRevision({
        creatorId,
        factPack,
        goalKind,
        breakMode,
        answeredQuestions: answered,
        priorPlan: latest.plan,
        revisionNote,
        nextCount
      });
      if (fromAi) {
        plan = fromAi;
        aiUsed = true;
      } else {
        // Do not consume an AI round on model failure — surface for retry.
        await appendPlannerProgress(prisma, cycleId, "planner_failed", "revisions", {
          reason: "revision_ai_unavailable_or_invalid"
        });
        throw new GoalCycleContractError(
          "GOAL_CYCLE_PLAN_INVALID",
          "AI revision failed validation; retry with the same idempotency key or adjust the note.",
          [{ field: "plan", issue: "revision_failed" }]
        );
      }
    }

    await insertPlanRevision(prisma, {
      cycleId,
      kind: "ai_revision",
      idempotencyKey,
      plan,
      requestSummary: {
        fact_pack_version: GOAL_CYCLE_FACT_PACK_VERSION,
        prompt_version: GOAL_CYCLE_PLANNER_PROMPT_VERSION,
        operation: "ai_revision",
        revision_note: revisionNote.slice(0, 160),
        prior_ordinal: latest.revision.ordinal
      },
      responseSummary: {
        ai_used: aiUsed,
        fallback,
        ai_revision_count: nextCount
      }
    });

    await appendPlannerProgress(prisma, cycleId, "revision_ready", "revisions", {
      ai_revision_count: nextCount,
      fallback
    });

    const expected = input.expectedVersion ?? cycle.version;
    const detail = await patchGoalCycleCheckpoint(prisma, creatorId, cycleId, {
      expected_version: expected,
      phase: "revisions",
      state: cycle.state === "draft" || cycle.state === "questions" ? "review" : (cycle.state as GoalCycleState),
      context: {
        ...asContextRecord(cycle.contextJson),
        last_revision_idempotency_key: idempotencyKey
      }
    });

    return {
      plan,
      ai_used: aiUsed,
      fallback,
      ai_revision_count: nextCount,
      cycle: detail,
      idempotent: false
    };
  } catch (err) {
    if (err instanceof GoalCycleContractError || err instanceof GoalCycleNotFoundError) {
      throw err;
    }
    await appendPlannerProgress(prisma, cycleId, "planner_failed", "revisions", {
      reason: err instanceof Error ? err.message.slice(0, 80) : "unknown"
    }).catch(() => undefined);
    throw err;
  }
}

export type ManualEditGoalCyclePlanInput = {
  creatorId: string;
  cycleId: string;
  idempotencyKey: string;
  expectedVersion?: number;
  /** Full Plan candidate (validated server-side). */
  plan: unknown;
  factPack?: GoalCycleFactPack;
};

export type ManualEditGoalCyclePlanResult = {
  plan: GoalCyclePlan;
  cycle: GoalCycleDetail;
  idempotent: boolean;
};

/**
 * Persist a creator manual Plan edit. Does not increment ai_revision_count or charge credits.
 */
export async function applyManualPlanEdit(
  prisma: PrismaClient,
  input: ManualEditGoalCyclePlanInput
): Promise<ManualEditGoalCyclePlanResult> {
  const creatorId = input.creatorId.trim();
  const cycleId = input.cycleId.trim();
  const idempotencyKey = input.idempotencyKey.trim().slice(0, 128);
  if (!idempotencyKey) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "idempotency_key is required.", [
      { field: "idempotency_key", issue: "required" }
    ]);
  }

  const cycle = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!cycle) throw new GoalCycleNotFoundError();
  assertKnownEnums(cycle);
  if (isTerminalGoalCycleState(cycle.state as GoalCycleState)) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "Cannot edit a terminal Goal Cycle Plan.",
      [{ field: "state", issue: "terminal" }]
    );
  }

  const existing = await findRevisionByPlannerIdempotency(prisma, cycleId, idempotencyKey);
  if (existing?.planJson && typeof existing.planJson === "object") {
    const detail = await getGoalCycle(prisma, creatorId, cycleId);
    return {
      plan: existing.planJson as GoalCyclePlan,
      cycle: detail,
      idempotent: true
    };
  }

  const latest = await getLatestValidPlan(prisma, cycleId);
  const goalKind = cycle.goalKind as GoalCycleGoalKind;
  const breakMode = (cycle.breakMode as GoalCycleBreakMode | null) ?? null;
  const factPack = await loadFactPackForCycle(prisma, creatorId, cycleId, {
    factPack: input.factPack
  });

  const priorCount = latest?.plan.ai_revision_count ?? 0;
  const candidate =
    input.plan && typeof input.plan === "object" && !Array.isArray(input.plan)
      ? {
          ...(input.plan as Record<string, unknown>),
          // Manual edits never consume AI revision budget.
          ai_revision_count: priorCount
        }
      : input.plan;

  const plan = validatePlannerPlan(candidate, {
    factPack,
    goal_kind: goalKind,
    break_mode: breakMode
  });

  // Logistics may edit scheduled_local only — keep scheduled_utc aligned for rail materialization.
  const planWithSyncedTimes: GoalCyclePlan = {
    ...plan,
    slots: plan.slots.map((slot) => syncSlotScheduledUtc(slot, plan.logistics.time_zone))
  };

  await insertPlanRevision(prisma, {
    cycleId,
    kind: "manual_edit",
    idempotencyKey,
    plan: planWithSyncedTimes,
    requestSummary: {
      operation: "manual_edit",
      fact_pack_version: GOAL_CYCLE_FACT_PACK_VERSION,
      prior_ordinal: latest?.revision.ordinal ?? null
    },
    responseSummary: {
      ai_used: false,
      ai_revision_count: plan.ai_revision_count
    }
  });

  const expected = input.expectedVersion ?? cycle.version;
  const detail = await patchGoalCycleCheckpoint(prisma, creatorId, cycleId, {
    expected_version: expected,
    phase: "revisions",
    state:
      cycle.state === "draft" || cycle.state === "questions"
        ? "review"
        : (cycle.state as GoalCycleState),
    context: {
      ...asContextRecord(cycle.contextJson),
      last_manual_edit_idempotency_key: idempotencyKey
    }
  });

  return { plan: planWithSyncedTimes, cycle: detail, idempotent: false };
}

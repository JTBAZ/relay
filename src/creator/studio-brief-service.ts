/**
 * @fileoverview Creator-scoped studio brief (Insights Action Hub Edit brief).
 * Persists PostingAssistantContext fields at creator scope for Coach / Autopost reuse.
 */

import type { PrismaClient } from "@prisma/client";
import type { AssistantGoal, PostingAssistantContext } from "../distribution/posting-assistant-service.js";

export const STUDIO_BRIEF_MAX_GOALS = 2;

export const ASSISTANT_GOAL_IDS = [
  "engagement_optimization",
  "new_audience_testing",
  "format_optimization",
  "language_outreach",
  "trend_riding"
] as const satisfies readonly AssistantGoal[];

export type StudioBriefWire = {
  creator_id: string;
  goals: AssistantGoal[];
  user_notes: string | null;
  locale: string | null;
  trend_note: string | null;
  updated_at: string | null;
};

export class StudioBriefValidationError extends Error {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "StudioBriefValidationError";
  }
}

function isAssistantGoal(value: unknown): value is AssistantGoal {
  return (
    typeof value === "string" &&
    (ASSISTANT_GOAL_IDS as readonly string[]).includes(value)
  );
}

export function normalizeStudioBriefGoals(raw: unknown): AssistantGoal[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new StudioBriefValidationError("goals must be an array of assistant goal ids.");
  }
  const out: AssistantGoal[] = [];
  for (const item of raw) {
    if (!isAssistantGoal(item)) {
      throw new StudioBriefValidationError(`Unknown assistant goal: ${String(item)}`);
    }
    if (!out.includes(item)) out.push(item);
  }
  if (out.length > STUDIO_BRIEF_MAX_GOALS) {
    throw new StudioBriefValidationError(
      `At most ${STUDIO_BRIEF_MAX_GOALS} synergistic goals are allowed.`
    );
  }
  return out;
}

function trimNullable(value: unknown, field: string, maxLen: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new StudioBriefValidationError(`${field} must be a string or null.`);
  }
  const t = value.trim();
  if (!t) return null;
  if (t.length > maxLen) {
    throw new StudioBriefValidationError(`${field} must be at most ${maxLen} characters.`);
  }
  return t;
}

function parseGoalsColumn(raw: unknown): AssistantGoal[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantGoal[] = [];
  for (const item of raw) {
    if (isAssistantGoal(item) && !out.includes(item)) out.push(item);
  }
  return out.slice(0, STUDIO_BRIEF_MAX_GOALS);
}

function emptyWire(creatorId: string): StudioBriefWire {
  return {
    creator_id: creatorId,
    goals: [],
    user_notes: null,
    locale: null,
    trend_note: null,
    updated_at: null
  };
}

function rowToWire(
  creatorId: string,
  row: {
    goals: unknown;
    userNotes: string | null;
    locale: string | null;
    trendNote: string | null;
    updatedAt: Date;
  }
): StudioBriefWire {
  return {
    creator_id: creatorId,
    goals: parseGoalsColumn(row.goals),
    user_notes: row.userNotes,
    locale: row.locale,
    trend_note: row.trendNote,
    updated_at: row.updatedAt.toISOString()
  };
}

export async function getCreatorStudioBrief(
  prisma: PrismaClient,
  creatorId: string
): Promise<StudioBriefWire> {
  const id = creatorId.trim();
  if (!id) throw new StudioBriefValidationError("creator_id is required.");
  const row = await prisma.creatorStudioBrief.findUnique({ where: { creatorId: id } });
  if (!row) return emptyWire(id);
  return rowToWire(id, row);
}

export type PatchCreatorStudioBriefInput = {
  goals?: unknown;
  user_notes?: unknown;
  locale?: unknown;
  trend_note?: unknown;
};

export async function patchCreatorStudioBrief(
  prisma: PrismaClient,
  creatorId: string,
  input: PatchCreatorStudioBriefInput
): Promise<StudioBriefWire> {
  const id = creatorId.trim();
  if (!id) throw new StudioBriefValidationError("creator_id is required.");

  const existing = await prisma.creatorStudioBrief.findUnique({ where: { creatorId: id } });

  const goals =
    input.goals !== undefined
      ? normalizeStudioBriefGoals(input.goals)
      : parseGoalsColumn(existing?.goals ?? []);

  const userNotes =
    input.user_notes !== undefined
      ? trimNullable(input.user_notes, "user_notes", 4000)
      : (existing?.userNotes ?? null);

  const locale =
    input.locale !== undefined
      ? trimNullable(input.locale, "locale", 32)
      : (existing?.locale ?? null);

  const trendNote =
    input.trend_note !== undefined
      ? trimNullable(input.trend_note, "trend_note", 2000)
      : (existing?.trendNote ?? null);

  const row = await prisma.creatorStudioBrief.upsert({
    where: { creatorId: id },
    create: {
      creatorId: id,
      goals,
      userNotes,
      locale,
      trendNote
    },
    update: {
      goals,
      userNotes,
      locale,
      trendNote
    }
  });

  return rowToWire(id, row);
}

/** Map wire/DB brief into PostingAssistantContext for Coach propose / Autopost. */
export function studioBriefToAssistantContext(brief: StudioBriefWire): PostingAssistantContext {
  return {
    goals: brief.goals.length ? brief.goals : undefined,
    user_notes: brief.user_notes,
    locale: brief.locale,
    trend_note: brief.trend_note
  };
}

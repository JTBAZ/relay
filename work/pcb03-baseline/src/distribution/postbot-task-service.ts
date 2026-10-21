import type { PostbotTaskAction, PostbotTaskStatus, PrismaClient } from "@prisma/client";
import {
  getCreatorStudioBrief
} from "../creator/studio-brief-service.js";
import { mergeAssistantContextWithStudioBrief } from "../creator/studio-mounted-context.js";
import type { PostingAssistantContext } from "./posting-assistant-service.js";
import type { DistributionDestination } from "./platform-destinations.js";

export type PostbotTaskWire = {
  task_id: string;
  creator_id: string;
  post_id: string;
  plan_id: string | null;
  variant_id: string;
  destination: DistributionDestination;
  action: PostbotTaskAction;
  rationale: string;
  suggested_time: string | null;
  link: string | null;
  status: PostbotTaskStatus;
  created_at: string;
  updated_at: string;
};

export class PostbotTaskNotFoundError extends Error {
  public override readonly name = "PostbotTaskNotFoundError";
}

export class PostbotTaskValidationError extends Error {
  public override readonly name = "PostbotTaskValidationError";
}

type PostbotTaskInput = {
  action: PostbotTaskAction;
  rationale: string;
  suggestedTime?: Date | null;
  link?: string | null;
};

function parseSuggestedTime(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rationaleFromAdvice(advice: Record<string, unknown>): string {
  const raw = advice.rationale;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "PostBot recommends publishing this variant when you're ready.";
}

export function buildPostbotTasksForVariant(args: {
  advice: Record<string, unknown>;
  goals?: PostingAssistantContext["goals"];
  destination: DistributionDestination;
  /** Optional studio brief notes — appended to post rationale only when present. */
  brief_notes?: string | null;
}): PostbotTaskInput[] {
  const tasks: PostbotTaskInput[] = [];
  let rationale = rationaleFromAdvice(args.advice);
  const notes = args.brief_notes?.trim();
  if (notes) {
    rationale = `${rationale} Studio brief: ${notes.slice(0, 180)}`;
  }
  tasks.push({ action: "post", rationale });

  const suggestedTime = parseSuggestedTime(args.advice.suggested_post_time);
  if (suggestedTime) {
    tasks.push({
      action: "schedule",
      rationale: "PostBot recommends scheduling this post based on your own posting history.",
      suggestedTime
    });
  }

  const goals = args.goals ?? [];
  if (goals.includes("engagement_optimization") && args.destination === "x") {
    tasks.push({
      action: "pin_comment",
      rationale: "After posting on X, pin a short follow-up comment with a clear call to action."
    });
  }
  if (goals.includes("new_audience_testing")) {
    tasks.push({
      action: "repost",
      rationale: "Re-share or quote this post later in the week to reach followers who missed it."
    });
  }

  return tasks;
}

function mapRow(row: {
  id: string;
  creatorId: string;
  postId: string;
  planId: string | null;
  variantId: string;
  destination: string;
  action: PostbotTaskAction;
  rationale: string;
  suggestedTime: Date | null;
  link: string | null;
  status: PostbotTaskStatus;
  createdAt: Date;
  updatedAt: Date;
}): PostbotTaskWire {
  return {
    task_id: row.id,
    creator_id: row.creatorId,
    post_id: row.postId,
    plan_id: row.planId,
    variant_id: row.variantId,
    destination: row.destination as DistributionDestination,
    action: row.action,
    rationale: row.rationale,
    suggested_time: row.suggestedTime?.toISOString() ?? null,
    link: row.link,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

export async function persistPostbotTasksForPlan(
  prisma: Pick<PrismaClient, "postbotTask" | "creatorStudioBrief">,
  args: {
    creatorId: string;
    postId: string;
    planId: string;
    variants: Array<{
      id: string;
      destination: string;
      assistantEnabled: boolean;
      advice: unknown;
    }>;
    assistantContext: PostingAssistantContext;
  }
): Promise<PostbotTaskWire[]> {
  const created: PostbotTaskWire[] = [];
  // Merge durable Insights studio brief when plan context omitted goals/notes
  // (no fact_pack rebuild — brief is creator-scoped persistence only).
  let assistantContext = args.assistantContext;
  try {
    const brief = await getCreatorStudioBrief(prisma as PrismaClient, args.creatorId);
    assistantContext = mergeAssistantContextWithStudioBrief(args.assistantContext, brief);
  } catch {
    // Brief load failure must not block plan finalize / PostBot persistence.
  }
  const goals = assistantContext.goals ?? [];
  const briefNotes =
    typeof assistantContext.user_notes === "string" ? assistantContext.user_notes : null;

  for (const variant of args.variants) {
    if (!variant.assistantEnabled) continue;
    const advice =
      variant.advice && typeof variant.advice === "object" && !Array.isArray(variant.advice)
        ? (variant.advice as Record<string, unknown>)
        : {};
    const inputs = buildPostbotTasksForVariant({
      advice,
      goals,
      destination: variant.destination as DistributionDestination,
      brief_notes: briefNotes
    });

    for (const input of inputs) {
      const row = await prisma.postbotTask.create({
        data: {
          creatorId: args.creatorId,
          postId: args.postId,
          planId: args.planId,
          variantId: variant.id,
          destination: variant.destination,
          action: input.action,
          rationale: input.rationale,
          suggestedTime: input.suggestedTime ?? null,
          link: input.link ?? null
        }
      });
      created.push(mapRow(row));
    }
  }

  return created;
}

export async function updatePostbotTaskStatus(
  prisma: PrismaClient,
  creatorId: string,
  taskId: string,
  status: PostbotTaskStatus
): Promise<PostbotTaskWire> {
  if (status !== "done" && status !== "dismissed") {
    throw new PostbotTaskValidationError("Status must be done or dismissed.");
  }

  const existing = await prisma.postbotTask.findFirst({
    where: { id: taskId.trim(), creatorId: creatorId.trim() }
  });
  if (!existing) throw new PostbotTaskNotFoundError(`Postbot task not found: ${taskId}`);

  const row = await prisma.postbotTask.update({
    where: { id: existing.id },
    data: {
      status,
      ...(status === "done" ? { reminderSentAt: new Date() } : {})
    }
  });
  return mapRow(row);
}

export async function updatePostbotTaskRemindMe(
  prisma: PrismaClient,
  creatorId: string,
  taskId: string,
  remindMe: boolean
): Promise<PostbotTaskWire> {
  const existing = await prisma.postbotTask.findFirst({
    where: { id: taskId.trim(), creatorId: creatorId.trim() }
  });
  if (!existing) throw new PostbotTaskNotFoundError(`Postbot task not found: ${taskId}`);

  const row = await prisma.postbotTask.update({
    where: { id: existing.id },
    data: { remindMe }
  });

  // Mirror onto variant so rail/legacy readers stay consistent.
  await prisma.postDistributionVariant.updateMany({
    where: { id: existing.variantId, creatorId: creatorId.trim() },
    data: { remindMe }
  });

  return mapRow(row);
}

export function mapPostbotTaskRow(row: Parameters<typeof mapRow>[0]): PostbotTaskWire {
  return mapRow(row);
}

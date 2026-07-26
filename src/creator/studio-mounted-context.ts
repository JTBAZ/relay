/**
 * @fileoverview Insights-mounted context for Autopost / PostBot (read-only).
 * Loads creator studio brief + optional coach_review checkpoint proposal.
 * Does **not** call buildCoachFactPack — refresh only on explicit Coach review.
 */

import type { PrismaClient } from "@prisma/client";
import type { PostingAssistantContext } from "../distribution/posting-assistant-service.js";
import {
  getCreatorStudioBrief,
  studioBriefToAssistantContext,
  type StudioBriefWire
} from "./studio-brief-service.js";

export const COACH_REVIEW_ASSISTANT_MODE = "coach_review";

/** Compact, prompt-safe snippet of a mounted Coach report (no live metrics search). */
export type MountedCoachReportSnippet = {
  post_id: string;
  path_id: string | null;
  finding_labels: string[];
  reason_codes: string[];
  updated_at: string | null;
};

export type StudioMountedContext = {
  brief: StudioBriefWire;
  assistant_context: PostingAssistantContext;
  mounted_report: MountedCoachReportSnippet | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function extractMountedReportFromAssistantPlan(
  postId: string,
  assistantPlan: unknown,
  updatedAt: Date | null
): MountedCoachReportSnippet | null {
  const plan = asRecord(assistantPlan);
  if (!plan) return null;
  const proposal = asRecord(plan.proposal);
  if (!proposal) return null;

  const findings = asRecord(proposal.findings);
  const chipsRaw = findings?.chips;
  const finding_labels: string[] = [];
  if (Array.isArray(chipsRaw)) {
    for (const chip of chipsRaw) {
      const row = asRecord(chip);
      if (row && typeof row.label === "string" && row.label.trim()) {
        finding_labels.push(row.label.trim());
      }
    }
  }

  const reason_codes: string[] = [];
  const factPack = asRecord(proposal.fact_pack);
  const codes = factPack?.reason_codes;
  if (Array.isArray(codes)) {
    for (const code of codes) {
      if (typeof code === "string" && code.trim()) reason_codes.push(code.trim());
    }
  }

  if (finding_labels.length === 0 && reason_codes.length === 0) return null;

  return {
    post_id: postId,
    path_id: typeof proposal.path_id === "string" ? proposal.path_id : null,
    finding_labels: finding_labels.slice(0, 8),
    reason_codes: reason_codes.slice(0, 12),
    updated_at: updatedAt?.toISOString() ?? null
  };
}

/**
 * Prefer an explicit post's coach_review checkpoint; otherwise the creator's
 * most recently updated active coach_review stub (0 variants not required —
 * proposal may still exist on stub only).
 */
export async function loadMountedCoachReport(
  prisma: PrismaClient,
  creatorId: string,
  postId?: string | null
): Promise<MountedCoachReportSnippet | null> {
  const id = creatorId.trim();
  if (!id) return null;

  if (postId?.trim()) {
    const plan = await prisma.postDistributionPlan.findFirst({
      where: {
        creatorId: id,
        postId: postId.trim(),
        status: "active",
        assistantMode: COACH_REVIEW_ASSISTANT_MODE
      },
      orderBy: { updatedAt: "desc" }
    });
    if (!plan) return null;
    return extractMountedReportFromAssistantPlan(plan.postId, plan.assistantPlan, plan.updatedAt);
  }

  const plan = await prisma.postDistributionPlan.findFirst({
    where: {
      creatorId: id,
      status: "active",
      assistantMode: COACH_REVIEW_ASSISTANT_MODE
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!plan) return null;
  return extractMountedReportFromAssistantPlan(plan.postId, plan.assistantPlan, plan.updatedAt);
}

/** Merge request/plan context with durable studio brief (request fields win when set). */
export function mergeAssistantContextWithStudioBrief(
  existing: PostingAssistantContext | null | undefined,
  brief: StudioBriefWire
): PostingAssistantContext {
  const fromBrief = studioBriefToAssistantContext(brief);
  const base = existing ?? {};
  const goals =
    base.goals && base.goals.length > 0
      ? base.goals
      : fromBrief.goals && fromBrief.goals.length > 0
        ? fromBrief.goals
        : undefined;

  return {
    ...fromBrief,
    ...base,
    goals,
    user_notes:
      base.user_notes != null && String(base.user_notes).trim()
        ? base.user_notes
        : fromBrief.user_notes,
    locale:
      base.locale != null && String(base.locale).trim() ? base.locale : fromBrief.locale,
    trend_note:
      base.trend_note != null && String(base.trend_note).trim()
        ? base.trend_note
        : fromBrief.trend_note,
    accepted_copy_by_destination: base.accepted_copy_by_destination
  };
}

export async function loadStudioMountedContext(
  prisma: PrismaClient,
  creatorId: string,
  opts?: { postId?: string | null }
): Promise<StudioMountedContext> {
  const brief = await getCreatorStudioBrief(prisma, creatorId);
  const mounted_report = await loadMountedCoachReport(prisma, creatorId, opts?.postId ?? null);
  return {
    brief,
    assistant_context: studioBriefToAssistantContext(brief),
    mounted_report
  };
}

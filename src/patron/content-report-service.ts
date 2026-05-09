/**
 * @fileoverview Patron experience module content-report-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
/**
 * PE-E — patron-submitted reports on a comment, post, or account. The creator (or future
 * platform admin) resolves the queue from the studio moderation surface; resolution writes a
 * paired ModerationAction row.
 *
 * Validation is deliberately permissive on `reasonCode` (free-form short string) so product
 * can iterate on the in-app menu without DB migrations.
 */

import type {
  ContentReportStatus,
  ContentReportTargetKind,
  PrismaClient
} from "@prisma/client";

import { recordModerationAction } from "./moderation-action-log.js";

export const REPORT_REASON_MAX = 64;
export const REPORT_BODY_MAX = 1_000;

export class ContentReportValidationError extends Error {
  public constructor(public readonly field: string, public readonly issue: string) {
    super(`Invalid ${field}: ${issue}`);
    this.name = "ContentReportValidationError";
  }
}

export interface CreateReportInput {
  reporterAccountId: string;
  relayCreatorId?: string;
  targetKind: ContentReportTargetKind;
  targetId: string;
  reasonCode: string;
  body?: string | null;
}

export async function createContentReport(
  prisma: PrismaClient,
  input: CreateReportInput
): Promise<{ id: string }> {
  const reason = String(input.reasonCode ?? "").trim();
  if (!reason) {
    throw new ContentReportValidationError("reason_code", "must be non-empty");
  }
  if (reason.length > REPORT_REASON_MAX) {
    throw new ContentReportValidationError("reason_code", `<= ${REPORT_REASON_MAX} chars`);
  }
  const body = input.body ? String(input.body).trim() : null;
  if (body && body.length > REPORT_BODY_MAX) {
    throw new ContentReportValidationError("body", `<= ${REPORT_BODY_MAX} chars`);
  }
  const targetId = String(input.targetId ?? "").trim();
  if (!targetId) {
    throw new ContentReportValidationError("target_id", "must be non-empty");
  }
  const created = await prisma.contentReport.create({
    data: {
      reporterAccountId: input.reporterAccountId,
      relayCreatorId: input.relayCreatorId ?? "",
      targetKind: input.targetKind,
      targetId,
      reasonCode: reason,
      body,
      status: "open"
    },
    select: { id: true }
  });
  return created;
}

export interface ListReportsInput {
  relayCreatorId?: string;
  status?: ContentReportStatus;
  limit?: number;
  cursor?: string;
}

export async function listContentReports(
  prisma: PrismaClient,
  input: ListReportsInput
): Promise<{
  items: {
    id: string;
    reporterAccountId: string;
    targetKind: ContentReportTargetKind;
    targetId: string;
    reasonCode: string;
    body: string | null;
    status: ContentReportStatus;
    createdAt: Date;
  }[];
  nextCursor?: string;
}> {
  const take = Math.max(1, Math.min(input.limit ?? 25, 100));
  const rows = await prisma.contentReport.findMany({
    where: {
      ...(input.relayCreatorId ? { relayCreatorId: input.relayCreatorId } : {}),
      ...(input.status ? { status: input.status } : {})
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
  });
  const items = rows.slice(0, take).map((r) => ({
    id: r.id,
    reporterAccountId: r.reporterAccountId,
    targetKind: r.targetKind,
    targetId: r.targetId,
    reasonCode: r.reasonCode,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt
  }));
  const nextCursor = rows.length > take ? rows[take].id : undefined;
  return { items, nextCursor };
}

/**
 * Resolve a report. `outcome = "actioned"` indicates moderator took action on the target
 * (separately, via the comment / account services). `outcome = "dismissed"` closes it as no-op.
 * Either path appends to the ModerationAction log so the audit trail is complete.
 */
export async function resolveContentReport(
  prisma: PrismaClient,
  args: {
    reportId: string;
    resolverAccountId: string;
    outcome: "actioned" | "dismissed";
  }
): Promise<void> {
  const report = await prisma.contentReport.findUnique({ where: { id: args.reportId } });
  if (!report) throw new ContentReportValidationError("report_id", "not found");
  if (report.status !== "open") return;
  await prisma.contentReport.update({
    where: { id: args.reportId },
    data: {
      status: args.outcome,
      resolvedByAccountId: args.resolverAccountId,
      resolvedAt: new Date()
    }
  });
  await recordModerationAction(prisma, {
    relayCreatorId: report.relayCreatorId,
    actorKind: "creator",
    actorAccountId: args.resolverAccountId,
    kind: args.outcome === "actioned" ? "report_action" : "report_dismiss",
    targetKind: report.targetKind === "post" ? "post" : report.targetKind === "account" ? "account" : "comment",
    targetId: report.targetId,
    payload: { reportId: report.id, reasonCode: report.reasonCode }
  });
}

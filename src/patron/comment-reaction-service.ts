/**
 * @fileoverview Patron experience module comment-reaction-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 */
/**
 * PE-E (D12) — toggle reactions on a comment. One row per (comment, account, kind).
 *
 * Aggregation is read-time `groupBy(kind)` — we don't denormalize counts onto Comment.
 * Easy to add later if hot post traffic shows the per-comment query is too expensive.
 */

import type { CommentReactionKind, PrismaClient } from "@prisma/client";

import { emitCommentReactionAddedEvent } from "./notification-event-emit.js";

export interface ReactionAggregate {
  kind: CommentReactionKind;
  count: number;
  /** Whether the calling viewer has this reaction toggled. */
  viewerReacted: boolean;
}

export interface ToggleResult {
  /** True after the toggle the reaction now exists; false if it was removed. */
  active: boolean;
}

export async function toggleCommentReaction(
  prisma: PrismaClient,
  args: { commentId: string; accountId: string; kind: CommentReactionKind }
): Promise<ToggleResult> {
  const existing = await prisma.commentReaction.findUnique({
    where: {
      commentId_accountId_kind: {
        commentId: args.commentId,
        accountId: args.accountId,
        kind: args.kind
      }
    }
  });
  if (existing) {
    await prisma.commentReaction.delete({ where: { id: existing.id } });
    return { active: false };
  }
  await prisma.commentReaction.create({
    data: { commentId: args.commentId, accountId: args.accountId, kind: args.kind }
  });
  // PE-G — emit only on the toggle-ON edge so we don't notify on un-react. Resolve the
  // comment's relayCreatorId for tenant-scoping; fall back to "" if the comment vanished.
  const comment = await prisma.comment.findUnique({
    where: { id: args.commentId },
    select: { relayCreatorId: true }
  });
  await emitCommentReactionAddedEvent(prisma, {
    commentId: args.commentId,
    relayCreatorId: comment?.relayCreatorId ?? "",
    accountId: args.accountId,
    kind: args.kind
  });
  return { active: true };
}

export async function aggregateReactions(
  prisma: PrismaClient,
  args: { commentIds: string[]; viewerAccountId?: string | null }
): Promise<Map<string, ReactionAggregate[]>> {
  if (args.commentIds.length === 0) return new Map();
  const grouped = await prisma.commentReaction.groupBy({
    by: ["commentId", "kind"],
    where: { commentId: { in: args.commentIds } },
    _count: { _all: true }
  });
  const viewerRows = args.viewerAccountId
    ? await prisma.commentReaction.findMany({
        where: { commentId: { in: args.commentIds }, accountId: args.viewerAccountId },
        select: { commentId: true, kind: true }
      })
    : [];
  const viewerSet = new Set(viewerRows.map((r) => `${r.commentId}\0${r.kind}`));
  const out = new Map<string, ReactionAggregate[]>();
  for (const row of grouped) {
    const list = out.get(row.commentId) ?? [];
    list.push({
      kind: row.kind,
      count: row._count._all,
      viewerReacted: viewerSet.has(`${row.commentId}\0${row.kind}`)
    });
    out.set(row.commentId, list);
  }
  return out;
}

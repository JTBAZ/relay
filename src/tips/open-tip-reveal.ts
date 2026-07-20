/**
 * @fileoverview Open TipReveal lookup for view-access (MB-6). Export/zip must not call this.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

export async function hasOpenTipReveal(
  prisma: PrismaClient | Prisma.TransactionClient,
  args: { patronAccountId: string; postId: string; now?: Date }
): Promise<boolean> {
  const now = args.now ?? new Date();
  const row = await prisma.tipReveal.findFirst({
    where: {
      patronAccountId: args.patronAccountId.trim(),
      postId: args.postId.trim(),
      closedAt: null,
      expiresAt: { gt: now }
    },
    select: { id: true }
  });
  return row != null;
}

/** Bulk: returns Set of postIds with an open reveal for this account. */
export async function openTipRevealPostIds(
  prisma: PrismaClient | Prisma.TransactionClient,
  args: { patronAccountId: string; postIds: readonly string[]; now?: Date }
): Promise<Set<string>> {
  const now = args.now ?? new Date();
  const ids = [...new Set(args.postIds.map((p) => p.trim()).filter(Boolean))];
  if (!args.patronAccountId.trim() || ids.length === 0) return new Set();
  const rows = await prisma.tipReveal.findMany({
    where: {
      patronAccountId: args.patronAccountId.trim(),
      postId: { in: ids },
      closedAt: null,
      expiresAt: { gt: now }
    },
    select: { postId: true }
  });
  return new Set(rows.map((r) => r.postId));
}

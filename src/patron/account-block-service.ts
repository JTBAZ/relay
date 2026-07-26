/**
 * @fileoverview Patron experience module account-block-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
/**
 * PE-E (D14) — account-level block. Future-only semantics: a block hides content authored by
 * the blocked account AFTER the block timestamp; historical content is unaffected. This avoids
 * retroactively rewriting threads people have already seen and keeps the block primarily a
 * "stop hearing from this person going forward" tool.
 *
 * Read-side filtering lives in the comment / feed services -- they call `loadBlocksFor` to get
 * the edges and apply them at list time. We intentionally do NOT denormalize "is_blocked" onto
 * comments because a block can be added or cleared at any moment.
 */

import type { PrismaClient } from "@prisma/client";

import { recordModerationAction } from "./moderation-action-log.js";

export interface BlockEdge {
  blockedAccountId: string;
  createdAt: Date;
}

export async function blockAccount(
  prisma: PrismaClient,
  args: { blockerAccountId: string; blockedAccountId: string }
): Promise<{ created: boolean }> {
  if (args.blockerAccountId === args.blockedAccountId) {
    return { created: false };
  }
  const existing = await prisma.accountBlock.findUnique({
    where: {
      blockerAccountId_blockedAccountId: {
        blockerAccountId: args.blockerAccountId,
        blockedAccountId: args.blockedAccountId
      }
    }
  });
  if (existing) return { created: false };
  await prisma.accountBlock.create({
    data: { blockerAccountId: args.blockerAccountId, blockedAccountId: args.blockedAccountId }
  });
  await recordModerationAction(prisma, {
    actorKind: "patron_self",
    actorAccountId: args.blockerAccountId,
    kind: "account_block",
    targetKind: "account",
    targetId: args.blockedAccountId
  });
  return { created: true };
}

export async function unblockAccount(
  prisma: PrismaClient,
  args: { blockerAccountId: string; blockedAccountId: string }
): Promise<{ removed: boolean }> {
  const existing = await prisma.accountBlock.findUnique({
    where: {
      blockerAccountId_blockedAccountId: {
        blockerAccountId: args.blockerAccountId,
        blockedAccountId: args.blockedAccountId
      }
    }
  });
  if (!existing) return { removed: false };
  await prisma.accountBlock.delete({ where: { id: existing.id } });
  await recordModerationAction(prisma, {
    actorKind: "patron_self",
    actorAccountId: args.blockerAccountId,
    kind: "account_unblock",
    targetKind: "account",
    targetId: args.blockedAccountId
  });
  return { removed: true };
}

export async function loadBlocksFor(
  prisma: PrismaClient,
  blockerAccountId: string
): Promise<BlockEdge[]> {
  const rows = await prisma.accountBlock.findMany({
    where: { blockerAccountId },
    select: { blockedAccountId: true, createdAt: true }
  });
  return rows.map((r) => ({ blockedAccountId: r.blockedAccountId, createdAt: r.createdAt }));
}

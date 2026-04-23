import type { PrismaClient } from "@prisma/client";

import { emitAccountFollowCreatedEvent } from "./notification-event-emit.js";

export type AccountFollowListItem = {
  followed_account_id: string;
  created_at: string;
};

export async function listAccountFollowsForAccount(
  prisma: PrismaClient,
  followerAccountId: string
): Promise<AccountFollowListItem[]> {
  const rows = await prisma.accountFollow.findMany({
    where: { followerAccountId },
    orderBy: { createdAt: "asc" },
    select: { followedAccountId: true, createdAt: true }
  });
  return rows.map((r) => ({
    followed_account_id: r.followedAccountId,
    created_at: r.createdAt.toISOString()
  }));
}

export async function addAccountFollowForAccount(
  prisma: PrismaClient,
  followerAccountId: string,
  followedAccountId: string
): Promise<
  | {
      followed_account_id: string;
      created: boolean;
      created_at: string;
    }
  | null
> {
  const follower = followerAccountId.trim();
  const followed = followedAccountId.trim();
  if (!follower || !followed || follower === followed) {
    return null;
  }

  const target = await prisma.account.findUnique({
    where: { id: followed },
    select: { id: true }
  });
  if (!target) {
    return null;
  }

  const existing = await prisma.accountFollow.findUnique({
    where: {
      followerAccountId_followedAccountId: {
        followerAccountId: follower,
        followedAccountId: followed
      }
    }
  });
  if (existing) {
    return {
      followed_account_id: followed,
      created: false,
      created_at: existing.createdAt.toISOString()
    };
  }

  const row = await prisma.accountFollow.create({
    data: { followerAccountId: follower, followedAccountId: followed }
  });
  // PE-G — emit OutboxEvent so the worker fans-out a `new_follower` notification to every
  // membership owned by the followed account. Idempotent on (event_name, tenant, primary, occurredAt).
  await emitAccountFollowCreatedEvent(prisma, {
    followerAccountId: follower,
    followedAccountId: followed
  });
  return {
    followed_account_id: followed,
    created: true,
    created_at: row.createdAt.toISOString()
  };
}

export async function removeAccountFollowForAccount(
  prisma: PrismaClient,
  followerAccountId: string,
  followedAccountId: string
): Promise<boolean> {
  const follower = followerAccountId.trim();
  const followed = followedAccountId.trim();
  if (!follower || !followed) return false;
  const r = await prisma.accountFollow.deleteMany({
    where: { followerAccountId: follower, followedAccountId: followed }
  });
  return r.count > 0;
}

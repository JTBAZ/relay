import type { PrismaClient } from "@prisma/client";

/**
 * MT-034: True when `Account.primaryRelayCreatorId` matches the studio scope string (after workspace provisioning).
 */
export async function accountOwnsRelayCreatorId(
  prisma: PrismaClient,
  accountId: string,
  relayCreatorId: string
): Promise<boolean> {
  const rid = relayCreatorId.trim();
  if (!rid) return false;
  const row = await prisma.account.findUnique({
    where: { id: accountId },
    select: { primaryRelayCreatorId: true }
  });
  return row?.primaryRelayCreatorId === rid;
}

/**
 * True when a `Tenant` row exists with `relayCreatorId === id` (case-sensitive, trimmed).
 * Used to reject opaque/typo `creator_id` values from clients (e.g. legacy `dev_creator`)
 * before they get persisted under the wrong key. Caller must guard `prisma` is non-null.
 */
export async function relayCreatorIdExists(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<boolean> {
  const rid = relayCreatorId.trim();
  if (!rid) return false;
  const row = await prisma.tenant.findFirst({
    where: { relayCreatorId: rid },
    select: { id: true }
  });
  return row !== null;
}

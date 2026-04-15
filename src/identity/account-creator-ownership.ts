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

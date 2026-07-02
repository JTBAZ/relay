/**
 * Resolve the studio owner's Account for a relay creator id (Option B creator inbox lane).
 */

import type { PrismaClient } from "@prisma/client";

export async function resolveCreatorAccountIdForRelayCreator(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<string | null> {
  const trimmed = relayCreatorId.trim();
  if (!trimmed) return null;
  const account = await prisma.account.findFirst({
    where: { primaryRelayCreatorId: trimmed },
    select: { id: true }
  });
  return account?.id ?? null;
}

export async function resolveAccountIdForMembership(
  prisma: PrismaClient,
  membershipId: string
): Promise<string | null> {
  const membership = await prisma.tenantMembership.findUnique({
    where: { id: membershipId },
    select: { accountId: true }
  });
  return membership?.accountId ?? null;
}

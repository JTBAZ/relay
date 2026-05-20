/**
 * Persist merged supplemental SubscribeStar GraphQL `data` on the studio creator profile row
 * (subscriptions/payments operation roots — schema follows operator env queries).
 */

import type { Prisma, PrismaClient } from "@prisma/client";

function snapshotToJson(snapshot: Record<string, unknown>): Prisma.InputJsonValue {
  return snapshot as Prisma.InputJsonValue;
}

export async function persistSubscribeStarProviderSnapshot(
  prisma: PrismaClient,
  creatorRelayId: string,
  snapshot: Record<string, unknown>
): Promise<void> {
  const id = creatorRelayId.trim();
  if (!id) return;

  await prisma.creatorProfile.updateMany({
    where: { tenant: { relayCreatorId: id } },
    data: {
      subscribestarProviderSnapshot: snapshotToJson(snapshot),
      subscribestarProviderSnapshotAt: new Date()
    }
  });
}

import { randomUUID } from "node:crypto";
import {
  IdentityAuthProvider,
  PrismaClient,
  PublicSlugSource,
  UserKind
} from "@prisma/client";
import { allocateUniquePublicSlug } from "./public-slug.js";

export type ProvisionCreatorWorkspaceResult = {
  relay_creator_id: string;
  account_id: string;
  /** True when this call created the tenant + creator user + profile (first time). */
  created: boolean;
  /** Public URL segment (`/patron/c/{public_slug}`). */
  public_slug: string;
};

function newRelayCreatorId(): string {
  return `cr_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Idempotent: ensures the account has an artist studio (`Tenant` + creator `User` + `CreatorProfile`)
 * and `Account.primaryRelayCreatorId` (MT-032). Assigns an opaque unique `public_slug` (`slugSource`
 * allocated); Patreon campaign vanity is applied later in `promoteSnapshotToProfile`.
 */
export async function provisionCreatorWorkspace(
  prisma: PrismaClient,
  accountId: string
): Promise<ProvisionCreatorWorkspaceResult> {
  const quick = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, primaryRelayCreatorId: true, emailNorm: true }
  });
  if (!quick) {
    throw new Error("Account not found.");
  }
  if (quick.primaryRelayCreatorId) {
    const prof = await prisma.creatorProfile.findFirst({
      where: { tenant: { relayCreatorId: quick.primaryRelayCreatorId } },
      select: { publicSlug: true }
    });
    return {
      relay_creator_id: quick.primaryRelayCreatorId,
      account_id: quick.id,
      created: false,
      public_slug: prof?.publicSlug ?? ""
    };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const acc = await tx.account.findUnique({
            where: { id: accountId },
            select: { id: true, primaryRelayCreatorId: true, emailNorm: true }
          });
          if (!acc) {
            throw new Error("Account not found.");
          }
          if (acc.primaryRelayCreatorId) {
            const prof = await tx.creatorProfile.findFirst({
              where: { tenant: { relayCreatorId: acc.primaryRelayCreatorId } },
              select: { publicSlug: true }
            });
            return {
              relay_creator_id: acc.primaryRelayCreatorId,
              account_id: acc.id,
              created: false,
              public_slug: prof?.publicSlug ?? ""
            };
          }

          const relayId = newRelayCreatorId();
          const publicSlug = await allocateUniquePublicSlug(tx, null);
          const tenant = await tx.tenant.create({
            data: { relayCreatorId: relayId }
          });
          const creatorUser = await tx.user.create({
            data: {
              tenantId: tenant.id,
              kind: UserKind.creator,
              identityAuthProvider: IdentityAuthProvider.independent,
              tierIds: []
            }
          });
          await tx.creatorProfile.create({
            data: {
              tenantId: tenant.id,
              userId: creatorUser.id,
              publicSlug,
              slugSource: PublicSlugSource.allocated
            }
          });
          await tx.account.update({
            where: { id: accountId },
            data: { primaryRelayCreatorId: relayId }
          });
          return {
            relay_creator_id: relayId,
            account_id: accountId,
            created: true,
            public_slug: publicSlug
          };
        },
        { isolationLevel: "Serializable" }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retry =
        msg.includes("could not serialize") ||
        msg.includes("Serialization failure") ||
        msg.includes("40001");
      if (retry && attempt < 2) {
        const again = await prisma.account.findUnique({
          where: { id: accountId },
          select: { id: true, primaryRelayCreatorId: true, emailNorm: true }
        });
        if (again?.primaryRelayCreatorId) {
          const prof = await prisma.creatorProfile.findFirst({
            where: { tenant: { relayCreatorId: again.primaryRelayCreatorId } },
            select: { publicSlug: true }
          });
          return {
            relay_creator_id: again.primaryRelayCreatorId,
            account_id: again.id,
            created: false,
            public_slug: prof?.publicSlug ?? ""
          };
        }
        continue;
      }
      throw e;
    }
  }

  const final = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, primaryRelayCreatorId: true }
  });
  if (final?.primaryRelayCreatorId) {
    const prof = await prisma.creatorProfile.findFirst({
      where: { tenant: { relayCreatorId: final.primaryRelayCreatorId } },
      select: { publicSlug: true }
    });
    return {
      relay_creator_id: final.primaryRelayCreatorId,
      account_id: final.id,
      created: false,
      public_slug: prof?.publicSlug ?? ""
    };
  }
  throw new Error("Failed to provision creator workspace after retries.");
}

/**
 * @fileoverview Meaningful supporter-activity signal (Unified Relay Identity).
 * @description Platform bootstrap memberships must not imply real supporter activity.
 * Feed remains available to every authenticated Account; this helper only answers
 * "does this account have non-platform patronage / follow / entitlement evidence?"
 * @see ./platform-tenant.js
 * @see ./active-role-available.js
 */

import type { PrismaClient } from "@prisma/client";
import { TenantRole } from "@prisma/client";
import { getPlatformRelayCreatorId } from "./platform-tenant.js";

/**
 * Count patron `TenantMembership` rows on non-platform tenants.
 * Excludes the reserved platform tenant used for account-first signup.
 */
export async function countMeaningfulPatronMemberships(
  prisma: PrismaClient,
  accountId: string
): Promise<number> {
  const platformId = getPlatformRelayCreatorId();
  return prisma.tenantMembership.count({
    where: {
      accountId,
      role: TenantRole.patron,
      tenant: {
        OR: [{ relayCreatorId: null }, { relayCreatorId: { not: platformId } }]
      }
    }
  });
}

/**
 * True when the account has real supporter-side activity outside the platform bootstrap tenant.
 * Checks non-platform patron memberships, then PatronFollow / entitlement snapshots as fallbacks
 * for rows that may exist without a paid membership yet.
 */
export async function hasMeaningfulSupporterActivity(
  prisma: PrismaClient,
  accountId: string
): Promise<boolean> {
  const membershipCount = await countMeaningfulPatronMemberships(prisma, accountId);
  if (membershipCount > 0) return true;

  const platformId = getPlatformRelayCreatorId();
  const memberships = await prisma.tenantMembership.findMany({
    where: { accountId, role: TenantRole.patron },
    select: {
      id: true,
      tenant: { select: { relayCreatorId: true } }
    }
  });
  const nonPlatformIds = memberships
    .filter((m) => m.tenant.relayCreatorId !== platformId)
    .map((m) => m.id);
  // Platform-only accounts: also allow follows/snapshots attached to any membership
  // only when the follow/snapshot targets a non-platform creator.
  const allMembershipIds = memberships.map((m) => m.id);
  if (allMembershipIds.length === 0) return false;

  const [followCount, snapshotCount] = await Promise.all([
    prisma.patronFollow.count({
      where: {
        patronMembershipId: { in: allMembershipIds },
        relayCreatorId: { not: platformId }
      }
    }),
    prisma.patronEntitlementSnapshot.count({
      where: {
        patronMembershipId: {
          in: nonPlatformIds.length > 0 ? nonPlatformIds : allMembershipIds
        },
        relayCreatorId: { not: platformId }
      }
    })
  ]);
  return followCount > 0 || snapshotCount > 0;
}

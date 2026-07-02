/**
 * @fileoverview Patron account content preferences (18+ opt-out).
 */
import type { PrismaClient } from "@prisma/client";
import { ensurePatronProfileForMembership } from "./patron-profile-service.js";

/**
 * Returns whether the patron has opted to hide Adult (18+) content from patron surfaces.
 */
export async function loadPatronHideMatureContent(
  prisma: PrismaClient,
  patronMembershipId: string
): Promise<boolean> {
  const row = await ensurePatronProfileForMembership(prisma, patronMembershipId);
  return row.hideMatureContent;
}

/**
 * Resolve hide-mature pref for an authenticated account (any patron membership on the account).
 */
export async function loadHideMatureContentForAccount(
  prisma: PrismaClient,
  accountId: string
): Promise<boolean> {
  const membership = await prisma.tenantMembership.findFirst({
    where: { accountId, role: "patron" },
    select: { id: true }
  });
  if (!membership) {
    return false;
  }
  return loadPatronHideMatureContent(prisma, membership.id);
}

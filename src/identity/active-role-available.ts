/**
 * PE-I (BO-P4-01) — resolve which roles an account is allowed to switch into.
 *
 * The `relay_active_role` cookie is a UI lens, never an authz signal (see GR-T0-2). But the
 * UI shouldn't offer a switch into a role the account can't legitimately occupy:
 *
 *   - "creator"  available iff the account owns a studio (`Account.primaryRelayCreatorId` set).
 *   - "supporter" available iff the account holds at least one TenantMembership.
 *
 * Either / both / neither is possible; defaultActiveRoleForAccount picks the landing role.
 */

import type { PrismaClient } from "@prisma/client";

import type { ActiveRole } from "./active-role-default.js";

export interface AvailableRoles {
  /** Roles the account may render. */
  roles: ActiveRole[];
  /** Convenience: account owns a studio workspace. */
  hasCreatorRole: boolean;
  /** Convenience: account has at least one supporter membership. */
  hasSupporterRole: boolean;
}

const EMPTY: AvailableRoles = {
  roles: [],
  hasCreatorRole: false,
  hasSupporterRole: false
};

/**
 * Resolve roles available to an account. Returns an empty list when prisma is unavailable
 * (file-backed identity stores can't enumerate memberships) -- the caller should treat that as
 * "no role switcher available" and let the legacy cookie path stand.
 */
export async function resolveAvailableRolesForAccount(
  prisma: PrismaClient | null | undefined,
  accountId: string
): Promise<AvailableRoles> {
  if (!prisma) return EMPTY;
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { primaryRelayCreatorId: true }
  });
  if (!account) return EMPTY;
  const membershipCount = await prisma.tenantMembership.count({
    where: { accountId }
  });
  const hasCreator = Boolean(account.primaryRelayCreatorId);
  const hasSupporter = membershipCount > 0;
  const roles: ActiveRole[] = [];
  if (hasCreator) roles.push("creator");
  if (hasSupporter) roles.push("supporter");
  return {
    roles,
    hasCreatorRole: hasCreator,
    hasSupporterRole: hasSupporter
  };
}

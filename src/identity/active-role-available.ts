/**
 * @fileoverview PE-I — which roles an account may switch into for UI (`relay_active_role` lens).
 * @description Never authz; filters the role switcher by DB-backed `Account` + membership counts.
 * @see ./active-role-default.js
 * @see src/jsdoc-core-entities.ts
 */

/**
 * PE-I (BO-P4-01) — resolve which roles an account is allowed to switch into.
 *
 * The `relay_active_role` cookie is a UI lens, never an authz signal (see GR-T0-2). But the
 * UI shouldn't offer a switch into a role the account can't legitimately occupy:
 *
 *   - "creator"  available iff the account owns a studio (`Account.primaryRelayCreatorId` set).
 *   - "supporter" available iff the account has meaningful non-platform supporter activity
 *     (platform bootstrap membership alone does not count).
 *
 * Either / both / neither is possible; defaultActiveRoleForAccount picks the landing role.
 * Feed remains available to every authenticated Account regardless of available_roles.
 */

import type { PrismaClient } from "@prisma/client";

import type { ActiveRole } from "./active-role-default.js";
import { hasMeaningfulSupporterActivity } from "./meaningful-supporter-signal.js";

export interface AvailableRoles {
  /** Roles the account may render. */
  roles: ActiveRole[];
  /** Convenience: account owns a studio workspace. */
  hasCreatorRole: boolean;
  /** Convenience: meaningful non-platform supporter activity. */
  hasSupporterRole: boolean;
}

const EMPTY: AvailableRoles = {
  roles: [],
  hasCreatorRole: false,
  hasSupporterRole: false
};

/**
 * @param {import("@prisma/client").PrismaClient | null | undefined} prisma
 * @param {string} accountId
 * @returns {Promise<AvailableRoles>}
 * @async
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
  const hasCreator = Boolean(account.primaryRelayCreatorId);
  const hasSupporter = await hasMeaningfulSupporterActivity(prisma, accountId);
  const roles: ActiveRole[] = [];
  if (hasCreator) roles.push("creator");
  if (hasSupporter) roles.push("supporter");
  return {
    roles,
    hasCreatorRole: hasCreator,
    hasSupporterRole: hasSupporter
  };
}

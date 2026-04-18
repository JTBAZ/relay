import type { PrismaClient } from "@prisma/client";
import type { Response } from "express";
import { defaultActiveRoleForAccount } from "./active-role-default.js";
import { getAccountIdForSession } from "./patron-auth-context.js";
import { setActiveRoleCookie } from "./session-cookie.js";
import type { SessionToken } from "./types.js";

/**
 * After minting an opaque session, set `relay_active_role` from DB-backed Account state.
 * No-op if Prisma is unavailable or the session cannot be mapped to an Account.
 */
export async function setActiveRoleCookieForNewSession(
  res: Response,
  prisma: PrismaClient | null | undefined,
  session: SessionToken,
  expiresAtIso: string
): Promise<void> {
  if (!prisma) return;
  const accountId = await getAccountIdForSession(prisma, session);
  if (!accountId) return;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { primaryRelayCreatorId: true }
  });
  if (!account) return;

  const membershipCount = await prisma.tenantMembership.count({
    where: { accountId }
  });

  const role = defaultActiveRoleForAccount({
    primaryRelayCreatorId: account.primaryRelayCreatorId,
    hasSupporterMemberships: membershipCount > 0
  });

  setActiveRoleCookie(res, role, { expiresAtIso });
}

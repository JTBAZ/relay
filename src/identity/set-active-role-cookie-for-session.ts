/**
 * @fileoverview Sets `relay_active_role` after session mint from DB-backed account state.
 * @description Pairs login responses with `defaultActiveRoleForAccount` membership/creator hints.
 * @see ./session-cookie.js
 */

import type { PrismaClient } from "@prisma/client";
import type { Response } from "express";
import { defaultActiveRoleForAccount } from "./active-role-default.js";
import { getAccountIdForSession } from "./patron-auth-context.js";
import { hasMeaningfulSupporterActivity } from "./meaningful-supporter-signal.js";
import { setActiveRoleCookie } from "./session-cookie.js";
import type { SessionToken } from "./types.js";

/**
 * @description Sets `relay_active_role` after login from `Account` + meaningful supporter activity.
 * Platform bootstrap membership alone does not force the supporter lens preference.
 * @param {import("express").Response} res
 * @param {import("@prisma/client").PrismaClient | null | undefined} prisma
 * @param {import("./types.js").SessionToken} session
 * @param {string} expiresAtIso
 * @returns {Promise<void>}
 * @async
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

  const hasSupporterMemberships = await hasMeaningfulSupporterActivity(prisma, accountId);

  const role = defaultActiveRoleForAccount({
    primaryRelayCreatorId: account.primaryRelayCreatorId,
    hasSupporterMemberships
  });

  setActiveRoleCookie(res, role, { expiresAtIso });
}

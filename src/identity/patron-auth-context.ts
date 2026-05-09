/**
 * @fileoverview Patron session auth context: multi-creator `relay_creator_id` allowlist from DB.
 * @description Maps opaque `TenantMembership` to `Account`-scoped patron memberships when Prisma is available.
 * @see src/jsdoc-core-entities.ts
 */

import type { PrismaClient } from "@prisma/client";
import { TenantRole } from "@prisma/client";
import type { SessionToken } from "./types.js";

/** Resolved from opaque patron Bearer session + optional DB memberships (MT-009). */
export type PatronAuthContext = {
  session: SessionToken;
  /** Present when `TenantMembership` rows were loaded from Postgres. */
  accountId: string | null;
  /** All `Tenant.relay_creator_id` values this account may access as a patron (multi-creator). */
  allowedRelayCreatorIds: readonly string[];
};

/**
 * @description Loads cross-creator patron allowlist from DB or falls back to `session.creator_id`.
 * @param {import("@prisma/client").PrismaClient | null | undefined} prisma
 * @param {import("./types.js").SessionToken} session
 * @returns {Promise<PatronAuthContext>}
 * @async
 */
export async function loadPatronAuthContext(
  prisma: PrismaClient | null | undefined,
  session: SessionToken
): Promise<PatronAuthContext> {
  if (!prisma) {
    return {
      session,
      accountId: null,
      allowedRelayCreatorIds: [session.creator_id]
    };
  }

  const m = await prisma.tenantMembership.findUnique({
    where: { id: session.user_id },
    select: { accountId: true, role: true }
  });
  if (!m || m.role !== TenantRole.patron) {
    return {
      session,
      accountId: null,
      allowedRelayCreatorIds: [session.creator_id]
    };
  }

  const rows = await prisma.tenantMembership.findMany({
    where: { accountId: m.accountId, role: TenantRole.patron },
    include: { tenant: true }
  });
  const ids = rows
    .map((r) => r.tenant.relayCreatorId)
    .filter((id): id is string => Boolean(id && id.length > 0));

  const allowedRelayCreatorIds = ids.length > 0 ? ids : [session.creator_id];

  return {
    session,
    accountId: m.accountId,
    allowedRelayCreatorIds
  };
}

/**
 * @param {PatronAuthContext} ctx
 * @param {string} relayCreatorId
 * @returns {boolean}
 */
export function patronMayAccessCreator(
  ctx: PatronAuthContext,
  relayCreatorId: string
): boolean {
  return ctx.allowedRelayCreatorIds.includes(relayCreatorId);
}

/**
 * @description Resolves `Account.id` for the membership row `session.user_id`.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {import("./types.js").SessionToken} session
 * @returns {Promise<string | null>}
 * @async
 */
export async function getAccountIdForSession(
  prisma: PrismaClient,
  session: SessionToken
): Promise<string | null> {
  const row = await prisma.tenantMembership.findUnique({
    where: { id: session.user_id },
    select: { accountId: true }
  });
  return row?.accountId ?? null;
}

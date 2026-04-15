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
 * From the session’s `TenantMembership` row, load every patron membership for the same `Account`
 * and collect `relay_creator_id` values. File-backed identity falls back to the single `session.creator_id`.
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

export function patronMayAccessCreator(
  ctx: PatronAuthContext,
  relayCreatorId: string
): boolean {
  return ctx.allowedRelayCreatorIds.includes(relayCreatorId);
}

/** Resolve `Account.id` for the session’s `TenantMembership` row (opaque `session.user_id`). */
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

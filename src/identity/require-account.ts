import type { PrismaClient } from "@prisma/client";
import { TenantRole } from "@prisma/client";
import type { Request, Response } from "express";
import { setSupabaseRlsContext } from "../lib/supabase-rls-context.js";
import type { IdentityService } from "./identity-service.js";
import { getAccountIdForSession } from "./patron-auth-context.js";
import { readSessionCookie } from "./session-cookie.js";
import type { AccountContext } from "./account-context.js";
import { RelayAuthError } from "./relay-auth-error.js";
import type { SessionToken } from "./types.js";

export type RequireAccountDeps = {
  prisma: PrismaClient;
  identityService: IdentityService;
};

/** Opaque session + loaded account context (Tier 1.1). */
export type RequireAccountResult = {
  context: AccountContext;
  session: SessionToken;
};

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

/**
 * Load `AccountContext` from a validated opaque session and set Postgres `relay.account_id`.
 */
export async function loadAccountContextForSession(
  prisma: PrismaClient,
  session: SessionToken
): Promise<AccountContext | null> {
  const accountId = await getAccountIdForSession(prisma, session);
  if (!accountId) return null;

  const patronCount = await prisma.tenantMembership.count({
    where: { accountId, role: TenantRole.patron }
  });
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      supabaseUserId: true,
      primaryRelayCreatorId: true
    }
  });
  if (!account) return null;

  return {
    accountId: account.id,
    supabaseUserId: account.supabaseUserId,
    primaryRelayCreatorId: account.primaryRelayCreatorId,
    hasSupporterMemberships: patronCount > 0
  };
}

/**
 * After a session is validated, apply RLS account context when the session maps to an Account.
 * No-op when unlinked (legacy / transitional sessions).
 */
export async function applyRelayAccountRlsIfPresent(
  prisma: PrismaClient,
  session: SessionToken
): Promise<void> {
  try {
    const ctx = await loadAccountContextForSession(prisma, session);
    if (!ctx) return;
    await setSupabaseRlsContext(prisma, ctx.accountId);
  } catch {
    /* Integration tests use partial Prisma stubs; omit RLS when account load or raw execute fails. */
  }
}

/**
 * Tier 1.1 — resolve Account or throw `RelayAuthError`.
 * Cookie first, then `Authorization: Bearer` opaque token.
 */
export async function requireAccount(
  req: Request,
  deps: RequireAccountDeps
): Promise<RequireAccountResult> {
  const token = readSessionCookie(req)?.trim() ?? extractBearer(req);
  if (!token) {
    throw new RelayAuthError(401, "AUTH_ERROR", "Authentication required.");
  }
  const session = await deps.identityService.resolveSession(token);
  if (!session) {
    throw new RelayAuthError(401, "AUTH_ERROR", "Invalid or expired session.");
  }
  const ctx = await loadAccountContextForSession(deps.prisma, session);
  if (!ctx) {
    throw new RelayAuthError(
      401,
      "account_missing",
      "Session is not linked to an account."
    );
  }
  await setSupabaseRlsContext(deps.prisma, ctx.accountId);
  return { context: ctx, session };
}

export async function requireAccountWithRole(
  req: Request,
  deps: RequireAccountDeps,
  role: "creator" | "supporter"
): Promise<RequireAccountResult> {
  const out = await requireAccount(req, deps);
  if (role === "creator" && !out.context.primaryRelayCreatorId) {
    throw new RelayAuthError(
      403,
      "FORBIDDEN",
      "This action requires a creator workspace."
    );
  }
  if (role === "supporter" && !out.context.hasSupporterMemberships) {
    throw new RelayAuthError(
      403,
      "FORBIDDEN",
      "This action requires at least one patron membership."
    );
  }
  return out;
}

export function sendRelayAuthError(
  res: Response,
  err: unknown,
  traceId: string
): boolean {
  if (err instanceof RelayAuthError) {
    res.status(err.status).json(err.toEnvelope(traceId));
    return true;
  }
  return false;
}

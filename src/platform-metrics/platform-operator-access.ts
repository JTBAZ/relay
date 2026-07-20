/**
 * PMD-070 — Platform operator access for cross-tenant analytics.
 * @see docs/platform-operator-access.md
 */
import type { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import type { IdentityService } from "../identity/identity-service.js";
import { getAccountIdForSession } from "../identity/patron-auth-context.js";
import { readSessionCookie } from "../identity/session-cookie.js";
import type { SessionToken } from "../identity/types.js";
import { errorEnvelope } from "../contracts/api.js";
import {
  PLATFORM_OPERATOR_AUDIT_ACTIONS,
  schedulePlatformOperatorAccessAudit
} from "./platform-operator-access-audit.js";
import { platformOperatorAccessEnforceFromEnv } from "../security/production-env-defaults.js";

function parseCsvSet(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw?.trim()) return out;
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value) out.add(value);
  }
  return out;
}

export type PlatformOperatorAccessPolicy = {
  enforce: boolean;
  accountIds: Set<string>;
  emailNorms: Set<string>;
};

export function platformOperatorAccessPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): PlatformOperatorAccessPolicy {
  return {
    enforce: platformOperatorAccessEnforceFromEnv(env),
    accountIds: parseCsvSet(env.RELAY_PLATFORM_OPERATOR_ACCOUNT_IDS),
    emailNorms: new Set(
      [...parseCsvSet(env.RELAY_PLATFORM_OPERATOR_EMAILS)].map((email) => email.toLowerCase())
    )
  };
}

export type PlatformOperatorAccessEvaluation = {
  allowed: boolean;
  reason:
    | "enforce_disabled"
    | "authentication_required"
    | "account_allowlist"
    | "email_allowlist"
    | "not_platform_operator";
  accountId: string | null;
};

export async function evaluatePlatformOperatorAccess(args: {
  prisma: PrismaClient | null | undefined;
  policy: PlatformOperatorAccessPolicy;
  accountId: string | null;
  emailNorm?: string | null;
}): Promise<PlatformOperatorAccessEvaluation> {
  if (!args.policy.enforce) {
    return {
      allowed: true,
      reason: "enforce_disabled",
      accountId: args.accountId
    };
  }

  if (!args.accountId) {
    return {
      allowed: false,
      reason: "authentication_required",
      accountId: null
    };
  }

  if (args.policy.accountIds.has(args.accountId)) {
    return {
      allowed: true,
      reason: "account_allowlist",
      accountId: args.accountId
    };
  }

  const emailNorm = args.emailNorm?.trim().toLowerCase() ?? null;
  if (emailNorm && args.policy.emailNorms.has(emailNorm)) {
    return {
      allowed: true,
      reason: "email_allowlist",
      accountId: args.accountId
    };
  }

  return {
    allowed: false,
    reason: "not_platform_operator",
    accountId: args.accountId
  };
}

export type PlatformOperatorRequestAccess = {
  accountId: string | null;
  session: SessionToken | null;
  accessReason: PlatformOperatorAccessEvaluation["reason"];
};

function auditDeniedAttempt(args: {
  prisma: PrismaClient | null | undefined;
  req: Request;
  traceId: string;
  reason: PlatformOperatorAccessEvaluation["reason"];
  accountId?: string | null;
}): void {
  if (!args.prisma) return;
  schedulePlatformOperatorAccessAudit({
    prisma: args.prisma,
    action: PLATFORM_OPERATOR_AUDIT_ACTIONS.registryRead,
    outcome: "denied",
    reason: args.reason,
    accountId: args.accountId ?? null,
    traceId: args.traceId,
    route: args.req.path,
    method: args.req.method
  });
}

export function auditAllowedPlatformMetricsRegistryRead(args: {
  prisma: PrismaClient | null | undefined;
  req: Request;
  traceId: string;
  accountId: string | null;
  reason: PlatformOperatorAccessEvaluation["reason"];
}): void {
  if (!args.prisma) return;
  schedulePlatformOperatorAccessAudit({
    prisma: args.prisma,
    action: PLATFORM_OPERATOR_AUDIT_ACTIONS.registryRead,
    outcome: "allowed",
    reason: args.reason,
    accountId: args.accountId,
    traceId: args.traceId,
    route: args.req.path,
    method: args.req.method
  });
}

export function auditAllowedTipBetaFunnelRead(args: {
  prisma: PrismaClient | null | undefined;
  req: Request;
  traceId: string;
  accountId: string | null;
  reason: PlatformOperatorAccessEvaluation["reason"];
}): void {
  if (!args.prisma) return;
  schedulePlatformOperatorAccessAudit({
    prisma: args.prisma,
    action: PLATFORM_OPERATOR_AUDIT_ACTIONS.tipBetaFunnelRead,
    outcome: "allowed",
    reason: args.reason,
    accountId: args.accountId,
    traceId: args.traceId,
    route: args.req.path,
    method: args.req.method
  });
}
function extractOpaqueSessionToken(req: Request): string {
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const fromCookie = readSessionCookie(req)?.trim() ?? "";
  return bearer || fromCookie;
}

export async function requirePlatformOperatorForRequest(args: {
  req: Request;
  res: Response;
  traceId: string;
  prisma: PrismaClient | null | undefined;
  identityService: IdentityService;
  policy: PlatformOperatorAccessPolicy;
}): Promise<PlatformOperatorRequestAccess | null> {
  if (!args.policy.enforce) {
    // [R-SEC-10 HIGH @security-review 2026-06] Dev default is enforce OFF; production default is ON
    // (see platformOperatorAccessEnforceFromEnv). When enforce is off, operator routes are open.
    return { accountId: null, session: null, accessReason: "enforce_disabled" };
  }

  const opaque = extractOpaqueSessionToken(args.req);
  if (!opaque) {
    auditDeniedAttempt({
      prisma: args.prisma,
      req: args.req,
      traceId: args.traceId,
      reason: "authentication_required"
    });
    args.res
      .status(401)
      .json(errorEnvelope("AUTH_ERROR", "Authentication required for platform metrics.", args.traceId));
    return null;
  }

  const session = await args.identityService.resolveSession(opaque);
  if (!session) {
    auditDeniedAttempt({
      prisma: args.prisma,
      req: args.req,
      traceId: args.traceId,
      reason: "authentication_required"
    });
    args.res
      .status(401)
      .json(errorEnvelope("AUTH_ERROR", "Invalid or expired session.", args.traceId));
    return null;
  }

  const accountId = args.prisma
    ? await getAccountIdForSession(args.prisma, session)
    : null;
  const emailNorm =
    args.prisma && accountId
      ? (
          await args.prisma.account.findUnique({
            where: { id: accountId },
            select: { emailNorm: true }
          })
        )?.emailNorm ?? null
      : null;

  const evaluation = await evaluatePlatformOperatorAccess({
    prisma: args.prisma,
    policy: args.policy,
    accountId,
    emailNorm
  });

  if (!evaluation.allowed) {
    auditDeniedAttempt({
      prisma: args.prisma,
      req: args.req,
      traceId: args.traceId,
      reason: evaluation.reason,
      accountId: evaluation.accountId
    });
    args.res.status(403).json(
      errorEnvelope(
        "FORBIDDEN",
        "Platform operator access required.",
        args.traceId
      )
    );
    return null;
  }

  return {
    accountId: evaluation.accountId,
    session,
    accessReason: evaluation.reason
  };
}

/**
 * PMD-071 — Append-only audit trail for privileged platform metrics access.
 * @see docs/platform-metrics-rls-review.md
 */
import type { PrismaClient } from "@prisma/client";

export const PLATFORM_OPERATOR_AUDIT_ACTIONS = {
  registryRead: "platform_metrics.registry.read",
  tipBetaFunnelRead: "platform_metrics.tip_beta_funnel.read"
} as const;

export type PlatformOperatorAuditOutcome = "allowed" | "denied";

export type RecordPlatformOperatorAccessAuditInput = {
  prisma: PrismaClient;
  action: string;
  outcome: PlatformOperatorAuditOutcome;
  reason: string;
  accountId?: string | null;
  traceId?: string | null;
  route?: string | null;
  method?: string | null;
};

export async function recordPlatformOperatorAccessAudit(
  input: RecordPlatformOperatorAccessAuditInput
): Promise<void> {
  await input.prisma.platformOperatorAccessAudit.create({
    data: {
      action: input.action,
      outcome: input.outcome,
      reason: input.reason,
      accountId: input.accountId ?? null,
      traceId: input.traceId ?? null,
      route: input.route ?? null,
      method: input.method ?? null
    }
  });
}

/**
 * Fire-and-forget audit write — never blocks or fails the operator route.
 */
export function schedulePlatformOperatorAccessAudit(
  input: RecordPlatformOperatorAccessAuditInput
): void {
  void recordPlatformOperatorAccessAudit(input).catch(() => undefined);
}

export async function getLatestPlatformOperatorAccessAuditAt(
  prisma: PrismaClient
): Promise<Date | null> {
  const row = await prisma.platformOperatorAccessAudit.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  return row?.createdAt ?? null;
}

export async function countPlatformOperatorAccessAudits(
  prisma: PrismaClient,
  args?: { since?: Date }
): Promise<number> {
  return prisma.platformOperatorAccessAudit.count({
    where: args?.since ? { createdAt: { gte: args.since } } : undefined
  });
}

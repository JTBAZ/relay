/**
 * @fileoverview Monthly free Tip grant sweep for tip beta (MB-5).
 * Retires when fan premium is enabled (MB-9) — paid plans grant via invoice.paid.
 * @see docs/TIP_BETA_BUILD_PLAN.md, docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import type { PrismaClient } from "@prisma/client";
import { isFanPremiumEnabled } from "../billing/fan-plan-config.js";
import { grantTips } from "../ledger/tip-ledger-service.js";
import { isTipsBetaEnabled, resolveTipsBetaConfig, tipPeriodKeyUtc } from "./config.js";

export const DEFAULT_TIP_GRANT_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MIN_TIP_GRANT_INTERVAL_MS = 60_000;

export type TipGrantAccountResult = {
  account_id: string;
  granted: boolean;
  idempotent: boolean;
  granted_balance: number;
};

export type TipGrantCycleResult = {
  cycle_started_at: string;
  period_key: string;
  accounts_scanned: number;
  grants_applied: number;
  accounts: TipGrantAccountResult[];
  skipped_reason?: string;
};

export type RunTipGrantOnceOptions = {
  accountId?: string;
  now?: Date;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
  env?: NodeJS.ProcessEnv;
};

export function tipGrantRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  if (!isTipsBetaEnabled(env)) return null;
  if (isFanPremiumEnabled(env)) return null;
  const raw = env.RELAY_TIP_GRANT_INTERVAL_MS?.trim();
  if (raw === "0" || raw === "off") return null;
  if (!raw) return DEFAULT_TIP_GRANT_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_TIP_GRANT_INTERVAL_MS) {
    return DEFAULT_TIP_GRANT_INTERVAL_MS;
  }
  return n;
}

/**
 * Grant the beta monthly allowance to patron accounts that hold ≥1 TenantMembership.
 * No-ops when fan premium is on (beta free grants retired; balances grandfathered).
 */
export async function runTipGrantOnce(
  prisma: PrismaClient,
  options: RunTipGrantOnceOptions = {}
): Promise<TipGrantCycleResult> {
  const now = options.now ?? new Date();
  const periodKey = tipPeriodKeyUtc(now);
  const env = options.env ?? process.env;
  const log = options.log ?? (() => undefined);

  if (isFanPremiumEnabled(env)) {
    log("tip-grant: skipped — fan premium enabled (beta grants retired)");
    return {
      cycle_started_at: now.toISOString(),
      period_key: periodKey,
      accounts_scanned: 0,
      grants_applied: 0,
      accounts: [],
      skipped_reason: "fan_premium_enabled"
    };
  }

  const cfg = resolveTipsBetaConfig();

  const memberships = await prisma.tenantMembership.findMany({
    where: options.accountId
      ? { accountId: options.accountId.trim() }
      : undefined,
    distinct: ["accountId"],
    select: { accountId: true },
    take: 5000
  });

  const accounts: TipGrantAccountResult[] = [];
  let grantsApplied = 0;

  for (const row of memberships) {
    const accountId = row.accountId;
    try {
      const result = await grantTips(prisma, {
        accountId,
        tips: cfg.monthlyGrant,
        periodKey,
        idempotencyKey: `grant:${accountId}:${periodKey}`
      });
      if (!result.idempotent) grantsApplied += 1;
      accounts.push({
        account_id: accountId,
        granted: true,
        idempotent: result.idempotent,
        granted_balance: result.wallet.granted_balance
      });
    } catch (err) {
      log("tip-grant: account failed", {
        accountId,
        error: err instanceof Error ? err.message : String(err)
      });
      accounts.push({
        account_id: accountId,
        granted: false,
        idempotent: false,
        granted_balance: 0
      });
    }
  }

  return {
    cycle_started_at: now.toISOString(),
    period_key: periodKey,
    accounts_scanned: memberships.length,
    grants_applied: grantsApplied,
    accounts
  };
}

/**
 * @fileoverview Fan plan Tip grants on Stripe invoice.paid (MB-9).
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import { FanPlan, type PrismaClient } from "@prisma/client";
import { grantTips, type TipLedgerMutationResult } from "../ledger/tip-ledger-service.js";
import { tipPeriodKeyUtc } from "../tips/config.js";
import { fanPlanParams, isPaidFanPlanId } from "./fan-plan-config.js";

/** Grant only on new cycle / first invoice — never mid-cycle upgrade prorations. */
export function shouldGrantTipsOnFanInvoice(
  billingReason: string | null | undefined
): boolean {
  return (
    billingReason === "subscription_create" || billingReason === "subscription_cycle"
  );
}

export function periodKeyFromUnixSeconds(
  unixSeconds: number | null | undefined,
  fallback: Date = new Date()
): string {
  if (typeof unixSeconds === "number" && Number.isFinite(unixSeconds) && unixSeconds > 0) {
    return tipPeriodKeyUtc(new Date(unixSeconds * 1000));
  }
  return tipPeriodKeyUtc(fallback);
}

export async function grantTipsForFanPlanInvoice(
  prisma: PrismaClient,
  args: {
    accountId: string;
    fanPlan: FanPlan | string;
    periodKey: string;
    invoiceId: string;
  }
): Promise<TipLedgerMutationResult | null> {
  if (!isPaidFanPlanId(args.fanPlan)) return null;
  const params = fanPlanParams(args.fanPlan);
  if (params.monthlyTips <= 0 || params.rolloverCap == null) return null;

  return grantTips(prisma, {
    accountId: args.accountId,
    tips: params.monthlyTips,
    periodKey: args.periodKey,
    idempotencyKey: `fan_grant:${args.accountId}:${args.periodKey}`,
    rolloverCap: params.rolloverCap
  });
}

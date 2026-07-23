/**
 * Entitlement state machine + issuance gate (EH-042).
 */

import type {
  ManagedVerifyBillingGateResult,
  ManagedVerifyBillingRecord,
  ManagedVerifyBillingState
} from "./types.js";

/** States that allow managed-verify assertion minting. */
export const ISSUANCE_ALLOWED_STATES: ReadonlySet<ManagedVerifyBillingState> =
  new Set(["active", "grace"]);

export function allowsManagedVerifyIssuance(
  state: ManagedVerifyBillingState
): boolean {
  return ISSUANCE_ALLOWED_STATES.has(state);
}

/**
 * After cancel or payment failure, compute last service date from period end
 * or now + graceDays.
 */
export function computeLastServiceDateIso(args: {
  currentPeriodEndIso: string | null;
  graceDays: number;
  nowMs?: number;
}): string {
  const now = args.nowMs ?? Date.now();
  if (args.currentPeriodEndIso) {
    const ms = Date.parse(args.currentPeriodEndIso);
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString();
    }
  }
  return new Date(now + args.graceDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * If record is in grace/past_due and lastServiceDate has passed → cancelled.
 */
export function refreshBillingStateForNow(
  record: ManagedVerifyBillingRecord,
  nowMs: number = Date.now()
): ManagedVerifyBillingRecord {
  if (record.state !== "grace" && record.state !== "past_due") {
    return record;
  }
  if (!record.lastServiceDateIso) return record;
  const end = Date.parse(record.lastServiceDateIso);
  if (!Number.isFinite(end) || nowMs <= end) return record;
  return {
    ...record,
    state: "cancelled",
    updatedAtIso: new Date(nowMs).toISOString()
  };
}

export function gateManagedVerifyIssuance(args: {
  enabled: boolean;
  record: ManagedVerifyBillingRecord | null;
  nowMs?: number;
}): ManagedVerifyBillingGateResult {
  if (!args.enabled) {
    return {
      ok: false,
      reason: "billing_feature_flag_off",
      state: "none",
      record: args.record
    };
  }
  const nowMs = args.nowMs ?? Date.now();
  const refreshed = args.record
    ? refreshBillingStateForNow(args.record, nowMs)
    : null;
  const state: ManagedVerifyBillingState = refreshed?.state ?? "none";
  if (!allowsManagedVerifyIssuance(state)) {
    return {
      ok: false,
      reason:
        state === "none"
          ? "billing_entitlement_missing"
          : state === "past_due"
            ? "billing_past_due"
            : state === "cancelled"
              ? "billing_cancelled_past_grace"
              : "billing_entitlement_denied",
      state,
      record: refreshed
    };
  }
  return { ok: true, state, record: refreshed };
}

/** Map Stripe subscription.status → our state (before grace overlay). */
export function mapStripeSubscriptionStatus(
  status: string | null | undefined
): ManagedVerifyBillingState {
  if (!status) return "none";
  const s = status.trim().toLowerCase();
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  if (s === "canceled" || s === "cancelled" || s === "incomplete_expired") {
    return "cancelled";
  }
  // incomplete / paused → not entitled
  return "none";
}

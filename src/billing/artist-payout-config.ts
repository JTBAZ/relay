/**
 * @fileoverview Artist tip payout rate + payout threshold (MB-10 / MB-12).
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 */

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Atlas default: $0.33 per Tip spent on a reveal. */
export function tipArtistPayoutCents(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInt(env.RELAY_TIP_ARTIST_PAYOUT_CENTS, 33);
}

/** Atlas default: $20 cash-out threshold. */
export function payoutThresholdCents(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInt(env.RELAY_PAYOUT_THRESHOLD_CENTS, 2000);
}

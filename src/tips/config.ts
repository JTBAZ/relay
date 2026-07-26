/**
 * @fileoverview Tip beta env config (Phase 2 MB-5).
 * @see docs/TIP_BETA_BUILD_PLAN.md
 */

export type TipsBetaConfig = {
  enabled?: boolean;
  monthlyGrant?: number;
  revealWindowDays?: number;
};

export type ResolvedTipsBetaConfig = {
  enabled: boolean;
  monthlyGrant: number;
  revealWindowDays: number;
};

function envTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveTipsBetaConfig(
  overrides: TipsBetaConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedTipsBetaConfig {
  const enabled =
    typeof overrides.enabled === "boolean" ? overrides.enabled : envTruthy(env.RELAY_TIPS_BETA);
  const monthlyGrant =
    typeof overrides.monthlyGrant === "number"
      ? Math.max(1, Math.floor(overrides.monthlyGrant))
      : parsePositiveInt(env.RELAY_TIPS_BETA_MONTHLY_GRANT, 3);
  const revealWindowDays =
    typeof overrides.revealWindowDays === "number"
      ? Math.max(1, Math.floor(overrides.revealWindowDays))
      : parsePositiveInt(env.RELAY_TIPS_REVEAL_WINDOW_DAYS, 14);
  return { enabled, monthlyGrant, revealWindowDays };
}

export function isTipsBetaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveTipsBetaConfig({}, env).enabled;
}

/** UTC calendar month key `YYYY-MM`. */
export function tipPeriodKeyUtc(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

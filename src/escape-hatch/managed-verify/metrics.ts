/**
 * Stub metrics + kill-switch helpers for managed Patreon verification (EH-041).
 * Honest health — no live Patreon probe.
 */

import type {
  ManagedVerifyHealth,
  ManagedVerifyMetricsSnapshot
} from "./types.js";

export type ManagedVerifyMetrics = {
  snapshot(): ManagedVerifyMetricsSnapshot;
  incr(
    key: keyof ManagedVerifyMetricsSnapshot,
    by?: number
  ): void;
};

export function createManagedVerifyMetrics(): ManagedVerifyMetrics {
  const counts: ManagedVerifyMetricsSnapshot = {
    assertionsIssued: 0,
    assertionsVerifiedOk: 0,
    assertionsRejected: 0,
    providerFailures: 0,
    tokenRefreshHooks: 0,
    revocations: 0
  };
  return {
    snapshot() {
      return { ...counts };
    },
    incr(key, by = 1) {
      counts[key] += by;
    }
  };
}

/**
 * Kill switch / feature flag.
 * ESCAPE_HATCH_RELAY_MANAGED_VERIFY_ENABLED=0 (or false/off) fails closed.
 * Unset defaults to enabled for in-process unit tests; HTTP mutating routes
 * still require an operator token (see routes.ts).
 */
export function isManagedVerifyEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw =
    env.ESCAPE_HATCH_RELAY_MANAGED_VERIFY_ENABLED ??
    env.RELAY_MANAGED_VERIFY_ENABLED;
  if (raw === undefined) return true;
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

/**
 * Operator token for mutating HTTP routes (register/complete/revoke/rotate).
 * When unset or placeholder, mutating routes fail closed (EH-041 security fix).
 */
export function resolveManagedVerifyOperatorToken(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const raw =
    env.ESCAPE_HATCH_RELAY_MANAGED_VERIFY_OPERATOR_TOKEN?.trim() ||
    env.RELAY_MANAGED_VERIFY_OPERATOR_TOKEN?.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (
    lower.includes("changeme") ||
    lower.includes("replace_me") ||
    lower.includes("your_") ||
    lower === "todo" ||
    lower === "xxx"
  ) {
    return null;
  }
  if (raw.length < 16) return null;
  return raw;
}

export function buildManagedVerifyHealth(args: {
  enabled: boolean;
  metrics: ManagedVerifyMetricsSnapshot;
  detail?: string;
}): ManagedVerifyHealth {
  if (!args.enabled) {
    return {
      ok: false,
      enabled: false,
      productionSafe: false,
      detail:
        args.detail ??
        "Managed Patreon verification kill switch is off — fail closed.",
      metrics: args.metrics
    };
  }
  return {
    ok: true,
    enabled: true,
    productionSafe: false,
    detail:
      args.detail ??
      "Relay-managed Patreon verification is preview_only (in-memory registry; mocked Patreon). Mutating HTTP routes require operator token. productionSafe remains false.",
    metrics: args.metrics
  };
}

/** Hook stub for token refresh / provider failure monitoring (EH-041 residual). */
export function noteProviderFailure(metrics: ManagedVerifyMetrics): void {
  metrics.incr("providerFailures");
}

export function noteTokenRefreshHook(metrics: ManagedVerifyMetrics): void {
  metrics.incr("tokenRefreshHooks");
}

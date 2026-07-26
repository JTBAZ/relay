/**
 * Relay-managed Patreon verification config (EH-041).
 * Fail-closed: kill switch, placeholders, incomplete env → not configured.
 */

import {
  isPlaceholderSecret,
  loadEnv,
  type SiteEnv
} from "../../env";
import {
  parseAssertionKeysJson,
  type RelayAssertionPublicKey
} from "./assertion";

export type RelayManagedConfig = {
  mode: "relay_managed";
  verifyBaseUrl: string;
  siteId: string;
  audience: string;
  issuer: string;
  keys: RelayAssertionPublicKey[];
  jwksUrl?: string;
  stateSecret: string;
  enabled: boolean;
};

function nonPlaceholder(value: string | undefined): string | undefined {
  if (!value || isPlaceholderSecret(value)) return undefined;
  return value;
}

/**
 * Kill switch: ESCAPE_HATCH_RELAY_VERIFY_ENABLED=0|false|off fails closed.
 * Unset → enabled when other relay_managed env is complete.
 */
export function isRelayVerifyKillSwitchOff(
  env: SiteEnv = loadEnv()
): boolean {
  const raw = env.ESCAPE_HATCH_RELAY_VERIFY_ENABLED;
  if (raw === undefined) return false;
  const v = raw.toLowerCase().trim();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

/**
 * True when relay_managed mode is selected and all required env is real.
 * Does not probe Relay network (CI-safe).
 */
export function isRelayManagedConfigured(env: SiteEnv = loadEnv()): boolean {
  if (env.ESCAPE_HATCH_PATREON_MODE?.toLowerCase() !== "relay_managed") {
    return false;
  }
  if (isRelayVerifyKillSwitchOff(env)) return false;
  const base = nonPlaceholder(env.ESCAPE_HATCH_RELAY_VERIFY_BASE_URL);
  const siteId = nonPlaceholder(env.ESCAPE_HATCH_RELAY_SITE_ID);
  const aud = nonPlaceholder(env.ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE);
  const iss = nonPlaceholder(env.ESCAPE_HATCH_RELAY_ASSERTION_ISSUER);
  const stateSecret = nonPlaceholder(
    env.ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET
  );
  if (!base || !siteId || !aud || !iss || !stateSecret) return false;
  if (stateSecret.length < 16) return false;
  try {
    const u = new URL(base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  } catch {
    return false;
  }
  const jwks = nonPlaceholder(env.ESCAPE_HATCH_RELAY_ASSERTION_JWKS_URL);
  const staticKeys = parseAssertionKeysJson(
    env.ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON
  );
  if (!jwks && staticKeys.length === 0) return false;
  return true;
}

export function loadRelayManagedConfig(
  env: SiteEnv = loadEnv()
): RelayManagedConfig {
  if (!isRelayManagedConfigured(env)) {
    throw new Error(
      "Relay-managed Patreon verification is not fully configured (missing/placeholder env or kill switch)."
    );
  }
  const jwks = nonPlaceholder(env.ESCAPE_HATCH_RELAY_ASSERTION_JWKS_URL);
  const keys = parseAssertionKeysJson(
    env.ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON
  );
  return {
    mode: "relay_managed",
    verifyBaseUrl: env.ESCAPE_HATCH_RELAY_VERIFY_BASE_URL!.replace(/\/$/, ""),
    siteId: env.ESCAPE_HATCH_RELAY_SITE_ID!.trim(),
    audience: env.ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE!.trim(),
    issuer: env.ESCAPE_HATCH_RELAY_ASSERTION_ISSUER!.trim(),
    keys,
    jwksUrl: jwks,
    stateSecret: env.ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET!.trim(),
    enabled: !isRelayVerifyKillSwitchOff(env)
  };
}

/**
 * Absolute callback URL the site registers with Relay (must match allowlist).
 */
export function resolveRelayCallbackUrl(env: SiteEnv = loadEnv()): string | null {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || isPlaceholderSecret(siteUrl)) return null;
  try {
    const base = new URL(siteUrl);
    return new URL("/api/patreon/relay/callback", base).toString();
  } catch {
    return null;
  }
}

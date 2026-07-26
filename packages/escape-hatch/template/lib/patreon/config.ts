/**
 * Patreon mode resolution (EH-040 creator_oauth + EH-041 relay_managed).
 * Fail-closed: placeholders and incomplete env → not configured.
 */

import {
  isPlaceholderSecret,
  loadEnv,
  type SiteEnv
} from "../env";
import { decodePatreonTokenKey } from "./crypto";
import { isRelayManagedConfigured } from "./relay-managed/config";

export type PatreonMode = "none" | "creator_oauth" | "relay_managed" | "stub";

export type CreatorOAuthConfig = {
  mode: "creator_oauth";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  campaignId: string;
  tokenKey: string;
  stateSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  identityUrl: string;
  scopes: string;
};

const DEFAULT_SCOPES = "identity identity[email] identity.memberships";

export const DEFAULT_AUTHORIZE_URL =
  "https://www.patreon.com/oauth2/authorize";
export const DEFAULT_TOKEN_URL =
  "https://www.patreon.com/api/oauth2/token";
export const DEFAULT_IDENTITY_URL =
  "https://www.patreon.com/api/oauth2/v2/identity";

function nonPlaceholder(value: string | undefined): string | undefined {
  if (!value || isPlaceholderSecret(value)) return undefined;
  return value;
}

/**
 * Resolve Patreon mode from env.
 * - unset / none / stub → stub path
 * - creator_oauth → creator path (may still be incomplete)
 * - relay_managed → relay path when configured; else stub
 */
export function resolvePatreonMode(env: SiteEnv = loadEnv()): PatreonMode {
  const raw = env.ESCAPE_HATCH_PATREON_MODE?.toLowerCase();
  if (!raw || raw === "none" || raw === "unset" || raw === "stub") {
    return "stub";
  }
  if (raw === "creator_oauth") return "creator_oauth";
  if (raw === "relay_managed") {
    return isRelayManagedConfigured(env) ? "relay_managed" : "stub";
  }
  return "stub";
}

/**
 * True when every creator_oauth credential is present and non-placeholder.
 * Does not probe the network (CI-safe).
 */
export function isCreatorOAuthConfigured(env: SiteEnv = loadEnv()): boolean {
  if (resolvePatreonMode(env) !== "creator_oauth") return false;
  const clientId = nonPlaceholder(env.PATREON_CLIENT_ID);
  const clientSecret = nonPlaceholder(env.PATREON_CLIENT_SECRET);
  const redirectUri = nonPlaceholder(env.PATREON_REDIRECT_URI);
  const campaignId = nonPlaceholder(env.PATREON_CAMPAIGN_ID);
  const tokenKey = nonPlaceholder(env.ESCAPE_HATCH_PATREON_TOKEN_KEY);
  const stateSecret = nonPlaceholder(
    env.ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET
  );
  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !campaignId ||
    !tokenKey ||
    !stateSecret
  ) {
    return false;
  }
  if (stateSecret.length < 16) return false;
  try {
    decodePatreonTokenKey(tokenKey);
  } catch {
    return false;
  }
  return true;
}

/**
 * Load creator OAuth config or throw. Call only after isCreatorOAuthConfigured.
 */
export function loadCreatorOAuthConfig(
  env: SiteEnv = loadEnv()
): CreatorOAuthConfig {
  if (!isCreatorOAuthConfigured(env)) {
    throw new Error(
      "Creator-owned Patreon OAuth is not fully configured (missing or placeholder env)."
    );
  }
  return {
    mode: "creator_oauth",
    clientId: env.PATREON_CLIENT_ID!.trim(),
    clientSecret: env.PATREON_CLIENT_SECRET!.trim(),
    redirectUri: env.PATREON_REDIRECT_URI!.trim(),
    campaignId: env.PATREON_CAMPAIGN_ID!.trim(),
    tokenKey: env.ESCAPE_HATCH_PATREON_TOKEN_KEY!.trim(),
    stateSecret: env.ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET!.trim(),
    authorizeUrl:
      nonPlaceholder(env.ESCAPE_HATCH_PATREON_AUTHORIZE_URL) ??
      DEFAULT_AUTHORIZE_URL,
    tokenUrl:
      nonPlaceholder(env.ESCAPE_HATCH_PATREON_TOKEN_URL) ?? DEFAULT_TOKEN_URL,
    identityUrl:
      nonPlaceholder(env.ESCAPE_HATCH_PATREON_IDENTITY_URL) ??
      DEFAULT_IDENTITY_URL,
    scopes: DEFAULT_SCOPES
  };
}

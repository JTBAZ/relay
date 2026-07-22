/**
 * Open-redirect / host allowlist guards for signed media redirects (EH-033).
 */

import type { SiteEnv } from "../env";
import { loadEnv } from "../env";

function hostnameOf(urlOrHost: string): string | null {
  try {
    if (urlOrHost.includes("://")) {
      return new URL(urlOrHost).hostname.toLowerCase();
    }
    return urlOrHost.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Build allowlisted redirect hosts from operator R2 env (names only in docs).
 * Never allow arbitrary absolute URLs.
 */
export function allowedSignedRedirectHosts(
  env: SiteEnv = loadEnv()
): Set<string> {
  const hosts = new Set<string>();
  // Fixture / mock signer host (CI + local mock).
  hosts.add("media.fixture.example");

  const endpointHost = env.R2_ENDPOINT
    ? hostnameOf(env.R2_ENDPOINT)
    : null;
  if (endpointHost) hosts.add(endpointHost);

  const publicHost = env.R2_PUBLIC_BASE_URL
    ? hostnameOf(env.R2_PUBLIC_BASE_URL)
    : null;
  if (publicHost) hosts.add(publicHost);

  return hosts;
}

/**
 * True when a signed GET URL may be used as a redirect Location.
 * Requires https (except localhost for local mocks) and allowlisted host.
 */
export function isSafeSignedRedirectUrl(
  url: string,
  env: SiteEnv = loadEnv()
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  const allowed = allowedSignedRedirectHosts(env);
  if (!allowed.has(host)) return false;

  if (parsed.protocol === "https:") return true;
  // Local/dev mock only
  if (
    parsed.protocol === "http:" &&
    (host === "localhost" || host === "127.0.0.1" || host === "media.fixture.example")
  ) {
    return true;
  }
  return false;
}

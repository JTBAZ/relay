import { NextResponse } from "next/server";
import { createSiteAdapters } from "@/lib/adapters";
import {
  isIdentityPathConfigured,
  loadEnv
} from "@/lib/env";
import { getServerAuthSession } from "@/lib/identity/session";
import { loadSite } from "@/lib/load-site";
import {
  isCreatorOAuthConfigured,
  loadCreatorOAuthConfig,
  normalizeReturnPath,
  verifyPatreonOAuthState
} from "@/lib/patreon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Patreon OAuth callback (EH-040).
 * Validates HMAC state (CSRF + account/site + PKCE verifier), exchanges code,
 * links membership, redirects to /account?patreon=linked|error — never puts
 * tokens in the URL.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const env = loadEnv();
  const site = loadSite();

  const fail = (reason: string, returnPath = "/account") => {
    const safe = normalizeReturnPath(returnPath, "/account");
    const dest = `${safe.split("?")[0]}?patreon=error&reason=${encodeURIComponent(reason)}`;
    return NextResponse.redirect(new URL(dest, url.origin), { status: 303 });
  };

  if (!isCreatorOAuthConfigured(env) || !isIdentityPathConfigured(env)) {
    return fail("not_configured");
  }

  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return fail("provider_denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return fail("missing_code_or_state");
  }

  const session = await getServerAuthSession(site.site_id);
  if (!session) {
    return fail("session_required");
  }

  let config;
  try {
    config = loadCreatorOAuthConfig(env);
  } catch {
    return fail("not_configured");
  }

  const verified = verifyPatreonOAuthState(state, config.stateSecret, {
    expectedAccountId: session.userId,
    expectedSiteId: site.site_id
  });
  if (!verified.ok) {
    return fail(verified.reason);
  }

  const adapters = createSiteAdapters();
  const result = await adapters.patreon.handleCallback({
    siteId: site.site_id,
    accountId: session.userId,
    code,
    codeVerifier: verified.payload.codeVerifier,
    returnPath: verified.payload.returnPath
  });

  return NextResponse.redirect(new URL(result.redirectTo, url.origin), {
    status: 303
  });
}

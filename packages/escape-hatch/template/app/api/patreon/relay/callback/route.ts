import { NextResponse } from "next/server";
import { createSiteAdapters } from "@/lib/adapters";
import {
  isIdentityPathConfigured,
  loadEnv
} from "@/lib/env";
import { getServerAuthSession } from "@/lib/identity/session";
import { loadSite } from "@/lib/load-site";
import { normalizeReturnPath } from "@/lib/patreon";
import { isRelayManagedConfigured } from "@/lib/patreon/relay-managed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Relay-managed assertion callback (EH-041).
 * Validates local HMAC state + signed assertion (iss/aud/sig/kid/exp/nonce/replay).
 * Adapter maps: code → assertion token, codeVerifier → HMAC state string.
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

  if (!isRelayManagedConfigured(env) || !isIdentityPathConfigured(env)) {
    return fail("not_configured");
  }

  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return fail("provider_denied");
  }

  const assertion = url.searchParams.get("assertion");
  const state = url.searchParams.get("state");
  if (!assertion || !state) {
    return fail("missing_assertion_or_state");
  }

  const session = await getServerAuthSession(site.site_id);
  if (!session) {
    return fail("session_required");
  }

  const adapters = createSiteAdapters();
  const result = await adapters.patreon.handleCallback({
    siteId: site.site_id,
    accountId: session.userId,
    code: assertion,
    codeVerifier: state
  });

  return NextResponse.redirect(new URL(result.redirectTo, url.origin), {
    status: 303
  });
}

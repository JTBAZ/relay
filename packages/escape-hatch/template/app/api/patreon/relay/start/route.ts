import { NextResponse } from "next/server";
import { createSiteAdapters } from "@/lib/adapters";
import {
  isIdentityPathConfigured,
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { getServerAuthSession } from "@/lib/identity/session";
import { loadSite } from "@/lib/load-site";
import { isSameOriginOAuthStart } from "@/lib/patreon/csrf";
import {
  isRelayManagedConfigured,
  normalizeReturnPath
} from "@/lib/patreon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start Relay-managed Patreon verification (EH-041).
 * POST only (HTTP verb hygiene + account-linking CSRF).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const env = loadEnv();
  const site = loadSite();

  if (!isSameOriginOAuthStart(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Cross-origin Relay verify start rejected.",
        production_safe: false
      },
      { status: 403 }
    );
  }

  if (!isRelayManagedConfigured(env)) {
    return NextResponse.redirect(
      new URL("/account?patreon=error&reason=not_configured", url.origin),
      { status: 303 }
    );
  }

  const mode = resolveIdentityProviderSafe(env);
  if (mode === "none" || mode === "invalid" || !isIdentityPathConfigured(env)) {
    return NextResponse.redirect(
      new URL("/login?next=/account", url.origin),
      { status: 303 }
    );
  }

  const session = await getServerAuthSession(site.site_id);
  if (!session) {
    return NextResponse.redirect(
      new URL("/login?next=/account", url.origin),
      { status: 303 }
    );
  }

  let returnPath = "/account";
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await request.formData();
      const next = form.get("next");
      if (typeof next === "string") {
        returnPath = normalizeReturnPath(next, "/account");
      }
    }
  } catch {
    // keep default
  }

  const adapters = createSiteAdapters();
  const built = await adapters.patreon.buildAuthorizeUrl({
    siteId: site.site_id,
    accountId: session.userId,
    returnPath
  });

  if (!built.ok) {
    return NextResponse.redirect(
      new URL(
        `/account?patreon=error&reason=${encodeURIComponent(built.reason)}`,
        url.origin
      ),
      { status: 303 }
    );
  }

  return NextResponse.redirect(built.url, { status: 303 });
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Relay-managed Patreon verify start requires POST (CSRF / verb hygiene).",
      production_safe: false
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}

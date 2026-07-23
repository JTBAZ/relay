import { NextResponse } from "next/server";
import { createSiteAdapters } from "@/lib/adapters";
import {
  resolvePortalCustomerId
} from "@/lib/billing/customer-map";
import { startCustomerPortal } from "@/lib/billing/hooks";
import {
  isIdentityPathConfigured,
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { getServerAuthSession } from "@/lib/identity/session";
import { loadSite } from "@/lib/load-site";
import { isSafeReturnPath, normalizeReturnPath } from "@/lib/patreon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start Stripe Customer Portal (EH-051).
 * POST JSON: { returnPath? } — when identity is configured, customer is resolved
 * server-side from the auth session mapping (client customerId is ignored).
 * Local preview (identity none): { customerId, returnPath? }.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const env = loadEnv();
  const site = loadSite();
  const mode = resolveIdentityProviderSafe(env);
  const identityConfigured =
    mode !== "none" && mode !== "invalid" && isIdentityPathConfigured(env);

  let authUserId: string | null = null;
  if (identityConfigured) {
    const session = await getServerAuthSession(site.site_id);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "auth_required", production_safe: false },
        { status: 401 }
      );
    }
    authUserId = session.userId;
  }

  let body: { customerId?: unknown; returnPath?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }

  if (
    body.returnPath !== undefined &&
    body.returnPath !== null &&
    body.returnPath !== "" &&
    (typeof body.returnPath !== "string" || !isSafeReturnPath(body.returnPath))
  ) {
    return NextResponse.json(
      { ok: false, error: "unsafe_return_path", production_safe: false },
      { status: 400 }
    );
  }

  const returnPath = normalizeReturnPath(
    typeof body.returnPath === "string" ? body.returnPath : undefined,
    "/account"
  );

  const resolved = await resolvePortalCustomerId({
    identityConfigured,
    siteId: site.site_id,
    authUserId,
    clientCustomerId:
      typeof body.customerId === "string" ? body.customerId : null
  });

  if (!resolved.ok) {
    const status =
      resolved.reason === "auth_required"
        ? 401
        : resolved.reason === "billing_customer_link_missing"
          ? 404
          : 400;
    return NextResponse.json(
      { ok: false, error: resolved.reason, production_safe: false },
      { status }
    );
  }

  const result = await startCustomerPortal({
    billing: createSiteAdapters().billing,
    customerId: resolved.customerId,
    returnUrl: new URL(returnPath, url.origin).toString()
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: result.value.id,
    url: result.value.url,
    production_safe: false
  });
}

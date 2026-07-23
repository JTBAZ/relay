import { NextResponse } from "next/server";
import { createSiteAdapters } from "@/lib/adapters";
import { resolveCheckoutCustomerId } from "@/lib/billing/customer-map";
import { startIndependentCheckout } from "@/lib/billing/hooks";
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
 * Start creator-owned Stripe Checkout (EH-051).
 * POST JSON: { priceId, tierIds?, successPath?, cancelPath? }
 * Session required when identity path is configured.
 * Client-supplied customerId is ignored when identity is configured —
 * server map lookup only (or omit so Stripe creates, then webhook maps).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const env = loadEnv();
  const site = loadSite();
  const mode = resolveIdentityProviderSafe(env);
  const identityConfigured =
    mode !== "none" && mode !== "invalid" && isIdentityPathConfigured(env);

  let body: {
    priceId?: unknown;
    tierIds?: unknown;
    successPath?: unknown;
    cancelPath?: unknown;
    customerId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }

  const priceId =
    typeof body.priceId === "string" ? body.priceId.trim() : "";
  if (!priceId) {
    return NextResponse.json(
      { ok: false, error: "missing_price_id", production_safe: false },
      { status: 400 }
    );
  }

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

  for (const key of ["successPath", "cancelPath"] as const) {
    const raw = body[key];
    if (
      raw !== undefined &&
      raw !== null &&
      raw !== "" &&
      (typeof raw !== "string" || !isSafeReturnPath(raw))
    ) {
      return NextResponse.json(
        { ok: false, error: "unsafe_return_path", production_safe: false },
        { status: 400 }
      );
    }
  }

  const successPath = normalizeReturnPath(
    typeof body.successPath === "string" ? body.successPath : undefined,
    "/account?billing=success"
  );
  const cancelPath = normalizeReturnPath(
    typeof body.cancelPath === "string" ? body.cancelPath : undefined,
    "/tiers?billing=cancelled"
  );

  const tierIds = Array.isArray(body.tierIds)
    ? body.tierIds.filter((t): t is string => typeof t === "string")
    : undefined;

  const resolved = await resolveCheckoutCustomerId({
    identityConfigured,
    siteId: site.site_id,
    authUserId,
    clientCustomerId:
      typeof body.customerId === "string" ? body.customerId : null
  });

  const result = await startIndependentCheckout({
    billing: createSiteAdapters().billing,
    priceId,
    siteId: site.site_id,
    successUrl: new URL(successPath, url.origin).toString(),
    cancelUrl: new URL(cancelPath, url.origin).toString(),
    authUserId,
    customerId: resolved.customerId,
    tierIds,
    mode: "hosted"
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
    mode: result.value.mode,
    production_safe: false
  });
}

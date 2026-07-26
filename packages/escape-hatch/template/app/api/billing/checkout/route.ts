import { NextResponse } from "next/server";
import { createSiteAdapters } from "@/lib/adapters";
import {
  assertNoDuplicateBilling,
  buildConversionSubjectFromSummary,
  getMappedPriceId,
  loadBillingTierMap
} from "@/lib/billing";
import { resolveCheckoutCustomerId } from "@/lib/billing/customer-map";
import { startIndependentCheckout } from "@/lib/billing/hooks";
import {
  isIdentityPathConfigured,
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { getServerAuthSession, loadOwnEntitlementSnapshot } from "@/lib/identity/session";
import { loadSite } from "@/lib/load-site";
import { isSafeReturnPath, normalizeReturnPath } from "@/lib/patreon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start independent Checkout (EH-051 / EH-054).
 * POST JSON: { priceId?, tierId?, tierIds?, successPath?, cancelPath? }
 * When tierId is set, priceId is resolved from data/billing-tier-map.json.
 * Duplicate-billing guard runs when the caller is signed in.
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
    tierId?: unknown;
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

  const tierId =
    typeof body.tierId === "string" ? body.tierId.trim() : "";
  const map = loadBillingTierMap(site.site_id);
  let priceId =
    typeof body.priceId === "string" ? body.priceId.trim() : "";
  if (!priceId && tierId) {
    priceId = getMappedPriceId(map, tierId) ?? "";
  }
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
    : tierId
      ? [tierId]
      : undefined;

  let duplicateGuard:
    | {
        tier: (typeof site.tiers)[number];
        catalog: typeof site.tiers;
        subject: ReturnType<typeof buildConversionSubjectFromSummary>;
      }
    | undefined;

  if (tierId && authUserId) {
    const tier = site.tiers.find((t) => t.tier_id === tierId);
    if (tier) {
      const snap = await loadOwnEntitlementSnapshot(site.site_id, authUserId);
      const tierIdsHeld = snap.ok ? [...snap.snapshot.tierIds] : [];
      const source = snap.ok ? snap.snapshot.source : null;
      duplicateGuard = {
        tier,
        catalog: site.tiers,
        subject: buildConversionSubjectFromSummary({
          signedIn: true,
          tierIds: tierIdsHeld,
          source
        })
      };
      const early = assertNoDuplicateBilling(duplicateGuard);
      if (!early.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: early.reason,
            detail: early.detail,
            production_safe: false
          },
          { status: 409 }
        );
      }
    }
  }

  const resolved = await resolveCheckoutCustomerId({
    identityConfigured,
    siteId: site.site_id,
    authUserId,
    // Discard client customerId by default — production route never enables client binding.
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
    mode: "hosted",
    duplicateGuard
  });

  if (!result.ok) {
    const forbidden =
      result.reason === "provider_policy_blocks_stripe" ||
      result.reason === "provider_policy_blocks_nowpayments" ||
      result.reason === "provider_policy_attestation_required" ||
      result.reason === "duplicate_billing_prevented";
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: forbidden ? (result.reason === "duplicate_billing_prevented" ? 409 : 403) : 503 }
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

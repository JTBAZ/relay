import { NextResponse } from "next/server";
import { createSiteAdapters } from "@/lib/adapters";
import { processVerifiedBillingWebhook } from "@/lib/billing/webhook-process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creator-owned Stripe webhook ingress (EH-051).
 * Requires raw body + Stripe-Signature. Fail closed on verify/normalize errors.
 * Entitlement apply uses process-local preview store until durable SQL store lands.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("stripe-signature") ??
    request.headers.get("Stripe-Signature");

  const billing = createSiteAdapters().billing;
  const result = await processVerifiedBillingWebhook({
    billing,
    rawBody,
    signatureHeader
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.reason,
        production_safe: false
      },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({
    ok: true,
    event_id: result.event.id,
    event_type: result.event.type,
    entitlement_applied:
      result.entitlement?.ok === true ? result.entitlement.applied : false,
    entitlement_duplicate:
      result.entitlement?.ok === true ? result.entitlement.duplicate : false,
    production_safe: false
  });
}

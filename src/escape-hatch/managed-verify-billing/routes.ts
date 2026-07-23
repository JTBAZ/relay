/**
 * HTTP routes for managed-verify billing entitlement (EH-042).
 * Mounted under /api/v1/escape-hatch/managed-verify-billing/*.
 *
 * Webhook MUST receive a raw Buffer body (express.raw) for HMAC verify —
 * mount createManagedVerifyBillingWebhookHandler before express.json(),
 * mirroring /api/v1/billing/webhook.
 */

import type { Application, Request, RequestHandler, Response } from "express";
import type { ManagedVerifyBillingService } from "./service.js";

export type RegisterManagedVerifyBillingRoutesDeps = {
  service: ManagedVerifyBillingService;
  isMounted?: () => boolean;
  /**
   * When false, skip POST /webhook (caller mounts raw-body handler separately).
   * Default true for unit tests that inject Buffer bodies.
   */
  registerWebhook?: boolean;
};

function traceId(req: Request): string {
  return (
    (req.header("x-trace-id") as string | undefined) ??
    `trace_eh042_${Date.now()}`
  );
}

function jsonError(
  res: Response,
  status: number,
  code: string,
  message: string,
  tid: string
): void {
  res.status(status).json({
    ok: false,
    error: { code, message },
    production_safe: false,
    trace_id: tid
  });
}

/**
 * Stripe-like webhook ingress. Requires Buffer raw body (express.raw).
 * Rejects parsed JSON objects — do not re-serialize for HMAC.
 */
export function createManagedVerifyBillingWebhookHandler(
  service: ManagedVerifyBillingService
): RequestHandler {
  return (req, res) => {
    const tid = traceId(req);
    if (!Buffer.isBuffer(req.body)) {
      jsonError(
        res,
        400,
        "MANAGED_VERIFY_BILLING_EXPECTED_RAW_BODY",
        "Webhook requires raw body (express.raw) for signature verification.",
        tid
      );
      return;
    }

    const result = service.handleWebhook({
      rawBody: req.body,
      signatureHeader:
        req.header("stripe-signature") ??
        req.header("x-relay-billing-signature") ??
        undefined
    });

    if (!result.ok) {
      jsonError(
        res,
        result.httpStatus,
        "MANAGED_VERIFY_BILLING_WEBHOOK_REJECTED",
        result.reason,
        tid
      );
      return;
    }

    res.status(200).json({
      ok: true,
      received: true,
      duplicate: result.duplicate,
      ignored: result.ignored,
      reason: result.reason ?? null,
      entitlement: result.record
        ? {
            site_id: result.record.siteId,
            state: result.record.state,
            last_service_date: result.record.lastServiceDateIso
          }
        : null,
      production_safe: false,
      trace_id: tid
    });
  };
}

export function registerManagedVerifyBillingRoutes(
  app: Application,
  deps: RegisterManagedVerifyBillingRoutesDeps
): void {
  const base = "/api/v1/escape-hatch/managed-verify-billing";
  const mounted = deps.isMounted ?? (() => true);

  const gate = (req: Request, res: Response): boolean => {
    if (!mounted()) {
      jsonError(
        res,
        503,
        "MANAGED_VERIFY_BILLING_UNMOUNTED",
        "Managed verify billing routes are not mounted.",
        traceId(req)
      );
      return false;
    }
    return true;
  };

  app.get(`${base}/product`, (req, res) => {
    if (!gate(req, res)) return;
    const p = deps.service.product();
    res.status(200).json({
      ok: true,
      product: {
        sku: p.sku,
        display_name: p.displayName,
        monthly_price_cents: p.monthlyPriceCents,
        currency: p.currency,
        stripe_price_id_configured: Boolean(p.stripePriceId),
        cost_coverage_notes: p.costCoverageNotes
      },
      billing_enabled: deps.service.isEnabled(),
      production_safe: false,
      trace_id: traceId(req)
    });
  });

  app.get(`${base}/entitlement/:siteId`, (req, res) => {
    if (!gate(req, res)) return;
    const siteId = String(req.params.siteId ?? "").trim();
    if (!siteId) {
      jsonError(
        res,
        400,
        "MANAGED_VERIFY_BILLING_BAD_REQUEST",
        "siteId is required.",
        traceId(req)
      );
      return;
    }
    const honesty = deps.service.honesty(siteId);
    const gateResult = deps.service.assertCanIssue({ siteId });
    res.status(200).json({
      ok: true,
      entitlement: honesty,
      can_issue_assertions: gateResult.ok,
      deny_reason: gateResult.ok ? null : gateResult.reason,
      production_safe: false,
      trace_id: traceId(req)
    });
  });

  if (deps.registerWebhook !== false) {
    app.post(
      `${base}/webhook`,
      createManagedVerifyBillingWebhookHandler(deps.service)
    );
  }
}

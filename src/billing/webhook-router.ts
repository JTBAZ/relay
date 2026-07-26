/**
 * @fileoverview Stripe SaaS billing webhook router (MB-1 + MB-2).
 * @see docs/BILLING_SPINE_BUILD_PLAN.md
 *
 * Signature verification + BillingWebhookEvent idempotency; MB-2 handlers process
 * checkout / subscription / invoice events after the idempotent insert.
 */

import type { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { resolveBillingConfig, type BillingServiceConfig } from "./config.js";
import { constructStripeWebhookEvent } from "./stripe-client.js";
import { handleBillingWebhookEvent } from "./webhook-handlers.js";

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.funds_withdrawn",
  "account.updated",
  "transfer.created",
  "transfer.failed",
  "transfer.reversed"
]);

export type BillingWebhookRouterDeps = {
  prisma: PrismaClient | null | undefined;
  env?: NodeJS.ProcessEnv;
  billingOverrides?: BillingServiceConfig;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/**
 * Express handler for `POST /api/v1/billing/webhook`.
 * Expects `express.raw` so `req.body` is a Buffer (Stripe signature needs the raw payload).
 */
export function createBillingWebhookHandler(deps: BillingWebhookRouterDeps) {
  const log = deps.log ?? (() => undefined);
  const env = deps.env ?? process.env;

  return async (req: Request, res: Response): Promise<void> => {
    const cfg = resolveBillingConfig(deps.billingOverrides ?? {}, env, () => undefined);
    if (!cfg.enabled) {
      res.status(404).json({ error: "billing_disabled" });
      return;
    }
    if (!deps.prisma) {
      res.status(503).json({ error: "database_unavailable" });
      return;
    }

    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      res.status(400).json({ error: "expected_raw_body" });
      return;
    }

    let event: Stripe.Event;
    try {
      event = await constructStripeWebhookEvent(
        raw,
        req.header("stripe-signature") ?? undefined,
        deps.billingOverrides,
        env
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log("relay-billing: webhook signature verification failed", { message });
      res.status(400).json({ error: "invalid_signature" });
      return;
    }

    try {
      await deps.prisma.billingWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type
        }
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
      throw err;
    }

    try {
      if (HANDLED_EVENT_TYPES.has(event.type)) {
        await handleBillingWebhookEvent(
          {
            prisma: deps.prisma,
            env,
            billingOverrides: deps.billingOverrides,
            log
          },
          event
        );
      } else {
        log("relay-billing: webhook unknown event type (ack)", {
          eventId: event.id,
          eventType: event.type
        });
      }
      res.status(200).json({ received: true, duplicate: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log("relay-billing: webhook handler failed", {
        eventId: event.id,
        eventType: event.type,
        message
      });
      // Drop the idempotency row so Stripe retries can reprocess.
      await deps.prisma.billingWebhookEvent
        .delete({ where: { stripeEventId: event.id } })
        .catch(() => undefined);
      res.status(500).json({ error: "handler_failed" });
    }
  };
}

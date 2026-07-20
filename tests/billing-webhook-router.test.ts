/**
 * @fileoverview Unit tests for Stripe billing webhook router (MB-1).
 */
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetBillingConfigLogGateForTests } from "../src/billing/config.js";
import {
  generateStripeTestWebhookHeader,
  resetStripeClientForTests
} from "../src/billing/stripe-client.js";
import { createBillingWebhookHandler } from "../src/billing/webhook-router.js";

const WEBHOOK_SECRET = "whsec_test_relay_billing_mb1";

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
  return res as typeof res & Response;
}

function makeEventPayload(id: string, type = "checkout.session.completed"): string {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2026-06-24.dahlia",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: { id: "cs_test_1", object: "checkout.session" } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null }
  });
}

describe("billing-webhook-router", () => {
  afterEach(() => {
    resetBillingConfigLogGateForTests();
    resetStripeClientForTests();
  });

  it("returns 404 when billing is disabled (default)", async () => {
    const handler = createBillingWebhookHandler({
      prisma: {} as PrismaClient,
      env: {},
      billingOverrides: { enabled: false }
    });
    const res = mockRes();
    await handler({ body: Buffer.from("{}") } as Request, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "billing_disabled" });
  });

  it("returns 400 on bad signature", async () => {
    const creates: unknown[] = [];
    const prisma = {
      billingWebhookEvent: {
        create: vi.fn(async (args: unknown) => {
          creates.push(args);
          return args;
        })
      }
    } as unknown as PrismaClient;

    const handler = createBillingWebhookHandler({
      prisma,
      env: {
        RELAY_BILLING_ENABLED: "1",
        STRIPE_SECRET_KEY: "sk_test_mb1",
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET
      }
    });

    const payload = makeEventPayload("evt_bad_sig");
    const res = mockRes();
    await handler(
      {
        body: Buffer.from(payload),
        header: () => "t=1,v1=notavalidsignature"
      } as unknown as Request,
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "invalid_signature" });
    expect(creates).toHaveLength(0);
  });

  it("accepts a valid signed event once, then no-ops on duplicate event id", async () => {
    const createdIds: string[] = [];
    const prisma = {
      billingWebhookEvent: {
        create: vi.fn(async (args: { data: { stripeEventId: string; eventType: string } }) => {
          const id = args.data.stripeEventId;
          if (createdIds.includes(id)) {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
              code: "P2002",
              clientVersion: "test",
              meta: { target: ["stripe_event_id"] }
            });
          }
          createdIds.push(id);
          return args.data;
        })
      }
    } as unknown as PrismaClient;

    const env = {
      RELAY_BILLING_ENABLED: "1",
      STRIPE_SECRET_KEY: "sk_test_mb1",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET
    };
    const handler = createBillingWebhookHandler({ prisma, env });

    const payload = makeEventPayload("evt_dup_test_1");
    const signature = await generateStripeTestWebhookHeader(payload, WEBHOOK_SECRET);

    const first = mockRes();
    await handler(
      {
        body: Buffer.from(payload),
        header: (name: string) => (name.toLowerCase() === "stripe-signature" ? signature : undefined)
      } as unknown as Request,
      first
    );
    expect(first.statusCode).toBe(200);
    expect(first.body).toEqual({ received: true, duplicate: false });
    expect(createdIds).toEqual(["evt_dup_test_1"]);

    const second = mockRes();
    await handler(
      {
        body: Buffer.from(payload),
        header: (name: string) => (name.toLowerCase() === "stripe-signature" ? signature : undefined)
      } as unknown as Request,
      second
    );
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(createdIds).toEqual(["evt_dup_test_1"]);
  });

  it("acks unknown event types with 200 after idempotent insert", async () => {
    const prisma = {
      billingWebhookEvent: {
        create: vi.fn(async (args: { data: { stripeEventId: string } }) => args.data)
      }
    } as unknown as PrismaClient;

    const env = {
      RELAY_BILLING_ENABLED: "1",
      STRIPE_SECRET_KEY: "sk_test_mb1",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET
    };
    const logs: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
    const handler = createBillingWebhookHandler({
      prisma,
      env,
      log: (msg, ctx) => logs.push({ msg, ctx })
    });

    const payload = makeEventPayload("evt_unknown_1", "radar.early_fraud_warning.created");
    const signature = await generateStripeTestWebhookHeader(payload, WEBHOOK_SECRET);
    const res = mockRes();
    await handler(
      {
        body: Buffer.from(payload),
        header: (name: string) => (name.toLowerCase() === "stripe-signature" ? signature : undefined)
      } as unknown as Request,
      res
    );
    expect(res.statusCode).toBe(200);
    expect(logs.some((l) => l.msg.includes("unknown event"))).toBe(true);
  });
});

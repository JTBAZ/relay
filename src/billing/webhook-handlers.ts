/**
 * @fileoverview Stripe webhook event handlers for creator SaaS + fan premium billing.
 * @see docs/BILLING_SPINE_BUILD_PLAN.md, docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import {
  PlatformRevenueEventKind,
  PlatformRevenueSourceLabel,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import type Stripe from "stripe";
import { purchaseTips } from "../ledger/tip-ledger-service.js";
import { scheduleUsageEvent } from "../usage/usage-events.js";
import type { BillingServiceConfig } from "./config.js";
import { RELOAD_PACK_TIPS } from "./fan-plan-config.js";
import {
  grantTipsForFanPlanInvoice,
  periodKeyFromUnixSeconds,
  shouldGrantTipsOnFanInvoice
} from "./fan-plan-grant-service.js";
import { getStripeClient } from "./stripe-client.js";
import {
  markSubscriptionPastDue,
  syncSubscriptionFromStripe
} from "./subscription-sync.js";
import { syncPayoutAccountFromStripe } from "../payouts/connect-onboarding-service.js";
import {
  markPayoutFailedFromTransfer,
  markPayoutSettled
} from "../payouts/payout-service.js";
import {
  clawbackFanSubscriptionRefund,
  clawbackReloadPackDispute
} from "../payouts/clawback-service.js";

export type BillingWebhookHandlerDeps = {
  prisma: PrismaClient;
  env?: NodeJS.ProcessEnv;
  billingOverrides?: BillingServiceConfig;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
};

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (
    invoice as Stripe.Invoice & {
      parent?: {
        subscription_details?: { subscription?: string | Stripe.Subscription | null } | null;
      } | null;
      subscription?: string | Stripe.Subscription | null;
    }
  ).parent?.subscription_details?.subscription;
  if (typeof parent === "string") return parent;
  if (parent && typeof parent === "object" && "id" in parent) return parent.id;

  const legacy = (invoice as { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object" && "id" in legacy) return legacy.id;
  return null;
}

async function writeRevenueEvent(
  prisma: PrismaClient,
  args: {
    eventKind: PlatformRevenueEventKind;
    creatorId?: string | null;
    subscriptionId?: string | null;
    checkoutId?: string | null;
    amountCents?: number | null;
    status?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await prisma.platformRevenueEvent.create({
    data: {
      eventKind: args.eventKind,
      sourceLabel: PlatformRevenueSourceLabel.relay_native,
      provider: "stripe",
      occurredAt: new Date(),
      creatorId: args.creatorId ?? null,
      checkoutId: args.checkoutId ?? null,
      subscriptionId: args.subscriptionId ?? null,
      amountCents: args.amountCents ?? null,
      netAmountCents: null,
      currency: "USD",
      status: args.status ?? null,
      payload: (args.payload ?? {}) as Prisma.InputJsonValue
    }
  });
}

async function retrieveSubscription(
  deps: BillingWebhookHandlerDeps,
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  try {
    const stripe = await getStripeClient(deps.billingOverrides, deps.env);
    if (!stripe) return null;
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    const log = deps.log ?? (() => undefined);
    log("relay-billing: subscription retrieve failed", {
      subscriptionId,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

function mergeSessionMetadataOntoSubscription(
  sub: Stripe.Subscription,
  session: Stripe.Checkout.Session
): Stripe.Subscription {
  if (!session.metadata?.relay_account_id) return sub;
  if (sub.metadata?.relay_account_id) return sub;
  const scope = session.metadata.scope === "fan" ? "fan" : "creator";
  return {
    ...sub,
    metadata: {
      ...sub.metadata,
      relay_account_id: session.metadata.relay_account_id,
      relay_creator_id: session.metadata.relay_creator_id ?? "",
      creator_plan: session.metadata.creator_plan ?? "",
      fan_plan: session.metadata.fan_plan ?? "",
      scope
    }
  };
}

async function fulfillReloadPack(
  deps: BillingWebhookHandlerDeps,
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<void> {
  const log = deps.log ?? (() => undefined);
  const accountId =
    session.metadata?.relay_account_id?.trim() ||
    (typeof session.client_reference_id === "string"
      ? session.client_reference_id.trim()
      : "");
  if (!accountId) {
    log("relay-billing: reload pack checkout missing account", { sessionId: session.id });
    return;
  }
  await purchaseTips(deps.prisma, {
    accountId,
    tips: RELOAD_PACK_TIPS,
    stripeRef: session.id,
    idempotencyKey: `purchase:reload:${session.id}`
  });
  await writeRevenueEvent(deps.prisma, {
    eventKind: PlatformRevenueEventKind.checkout_completed,
    checkoutId: session.id,
    amountCents: session.amount_total ?? null,
    status: "success",
    payload: {
      event_id: eventId,
      reload_pack: true,
      tips: RELOAD_PACK_TIPS,
      account_id: accountId
    }
  });
}

export async function handleBillingWebhookEvent(
  deps: BillingWebhookHandlerDeps,
  event: Stripe.Event
): Promise<void> {
  const log = deps.log ?? (() => undefined);
  const prisma = deps.prisma;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        if (session.metadata?.reload_pack === "1") {
          await fulfillReloadPack(deps, session, event.id);
        } else {
          log("relay-billing: checkout.session.completed payment — skip (not reload pack)", {
            sessionId: session.id
          });
        }
        return;
      }
      if (session.mode !== "subscription") {
        log("relay-billing: checkout.session.completed non-subscription — skip", {
          sessionId: session.id
        });
        return;
      }
      const subRef = session.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (!subId) {
        log("relay-billing: checkout.session.completed missing subscription", {
          sessionId: session.id
        });
        return;
      }
      let sub: Stripe.Subscription | null =
        typeof subRef === "object" && subRef && "status" in subRef
          ? (subRef as Stripe.Subscription)
          : null;
      if (!sub) {
        sub = await retrieveSubscription(deps, subId);
      }
      if (!sub) {
        log("relay-billing: could not load subscription for checkout", { subId });
        return;
      }
      sub = mergeSessionMetadataOntoSubscription(sub, session);
      const synced = await syncSubscriptionFromStripe(
        prisma,
        sub,
        deps.billingOverrides,
        deps.env
      );
      await writeRevenueEvent(prisma, {
        eventKind: PlatformRevenueEventKind.checkout_completed,
        creatorId: synced?.creatorId,
        subscriptionId: sub.id,
        checkoutId: session.id,
        amountCents: session.amount_total ?? null,
        status: "success",
        payload: { event_id: event.id, scope: synced?.scope ?? null }
      });
      if (synced?.plan) {
        await writeRevenueEvent(prisma, {
          eventKind: PlatformRevenueEventKind.subscription_created,
          creatorId: synced.creatorId,
          subscriptionId: sub.id,
          checkoutId: session.id,
          amountCents: session.amount_total ?? null,
          status: synced.status,
          payload: { event_id: event.id, plan: synced.plan }
        });
      }
      if (synced?.fanPlan) {
        await writeRevenueEvent(prisma, {
          eventKind: PlatformRevenueEventKind.subscription_created,
          subscriptionId: sub.id,
          checkoutId: session.id,
          amountCents: session.amount_total ?? null,
          status: synced.status,
          payload: {
            event_id: event.id,
            fan_plan: synced.fanPlan,
            scope: "fan",
            account_id: synced.accountId
          }
        });
      }
      return;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const prev = event.data.previous_attributes as
        | { items?: { data?: Array<{ price?: { id?: string } }> } }
        | undefined;
      const synced = await syncSubscriptionFromStripe(
        prisma,
        sub,
        deps.billingOverrides,
        deps.env
      );
      const prevPrice = prev?.items?.data?.[0]?.price?.id;
      const nextPrice = sub.items?.data?.[0]?.price?.id;
      if (prevPrice && nextPrice && prevPrice !== nextPrice) {
        await writeRevenueEvent(prisma, {
          eventKind: PlatformRevenueEventKind.subscription_upgraded,
          creatorId: synced?.creatorId,
          subscriptionId: sub.id,
          status: synced?.status ?? sub.status,
          payload: {
            event_id: event.id,
            prev_price: prevPrice,
            next_price: nextPrice,
            scope: synced?.scope ?? null,
            fan_plan: synced?.fanPlan ?? null
          }
        });
      }
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const synced = await syncSubscriptionFromStripe(
        prisma,
        { ...sub, status: "canceled" },
        deps.billingOverrides,
        deps.env
      );
      await writeRevenueEvent(prisma, {
        eventKind: PlatformRevenueEventKind.subscription_canceled,
        creatorId: synced?.creatorId,
        subscriptionId: sub.id,
        status: "canceled",
        payload: { event_id: event.id, scope: synced?.scope ?? null }
      });
      return;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoiceSubscriptionId(invoice);
      let creatorId: string | null = null;
      let fanAccountId: string | null = null;
      let fanPlan: string | null = null;

      if (subId) {
        let sub = await retrieveSubscription(deps, subId);
        if (sub) {
          const synced = await syncSubscriptionFromStripe(
            prisma,
            sub,
            deps.billingOverrides,
            deps.env
          );
          if (synced?.scope === "fan" && synced.fanPlan) {
            fanAccountId = synced.accountId;
            fanPlan = synced.fanPlan;
          }
          creatorId = synced?.creatorId ?? null;
        }
        if (!creatorId && !fanAccountId) {
          const local = await prisma.planSubscription.findUnique({
            where: { stripeSubscriptionId: subId }
          });
          if (local) {
            if (local.scope === "fan" && local.fanPlan) {
              fanAccountId = local.accountId;
              fanPlan = local.fanPlan;
            }
            const account = await prisma.account.findUnique({
              where: { id: local.accountId },
              select: { primaryRelayCreatorId: true }
            });
            creatorId = account?.primaryRelayCreatorId ?? null;
          }
        }
      }

      const amountCents = invoice.amount_paid ?? 0;
      const kind =
        invoice.billing_reason === "subscription_create"
          ? PlatformRevenueEventKind.subscription_created
          : PlatformRevenueEventKind.checkout_completed;
      await writeRevenueEvent(prisma, {
        eventKind: kind,
        creatorId,
        subscriptionId: subId,
        checkoutId: typeof invoice.id === "string" ? invoice.id : null,
        amountCents,
        status: "paid",
        payload: {
          event_id: event.id,
          billing_reason: invoice.billing_reason ?? null,
          fan_plan: fanPlan,
          account_id: fanAccountId
        }
      });
      scheduleUsageEvent(prisma, {
        relayCreatorId: creatorId,
        metric: "billing.invoice.paid",
        quantity: amountCents,
        meta: {
          stripe_event_id: event.id,
          invoice_id: invoice.id,
          subscription_id: subId
        }
      });

      if (
        fanAccountId &&
        fanPlan &&
        shouldGrantTipsOnFanInvoice(invoice.billing_reason)
      ) {
        const periodKey = periodKeyFromUnixSeconds(
          typeof invoice.period_start === "number" ? invoice.period_start : null
        );
        try {
          await grantTipsForFanPlanInvoice(prisma, {
            accountId: fanAccountId,
            fanPlan,
            periodKey,
            invoiceId: typeof invoice.id === "string" ? invoice.id : event.id
          });
        } catch (err) {
          log("relay-billing: fan tip grant failed", {
            accountId: fanAccountId,
            invoiceId: invoice.id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoiceSubscriptionId(invoice);
      if (subId) {
        await markSubscriptionPastDue(prisma, subId);
      }
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const meta = charge.metadata ?? {};
      if (meta.reload_pack === "1") {
        await clawbackReloadPackDispute(
          { prisma, env: deps.env, log },
          charge,
          event.id
        );
      } else {
        await clawbackFanSubscriptionRefund(
          { prisma, env: deps.env, log },
          charge,
          event.id
        );
      }
      return;
    }

    case "charge.dispute.funds_withdrawn": {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeRef = dispute.charge;
      const chargeId = typeof chargeRef === "string" ? chargeRef : chargeRef?.id;
      if (!chargeId) return;
      // Treat dispute like a reload pack clawback when metadata unknown — fan sub clawback is safer default.
      const fakeCharge = {
        id: chargeId,
        customer: null,
        metadata: {}
      } as Stripe.Charge;
      await clawbackFanSubscriptionRefund(
        { prisma, env: deps.env, log },
        fakeCharge,
        event.id
      );
      return;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await syncPayoutAccountFromStripe(prisma, account);
      return;
    }

    case "transfer.created": {
      const transfer = event.data.object as Stripe.Transfer;
      if (transfer.id) {
        await markPayoutSettled(prisma, transfer.id);
      }
      return;
    }

    case "transfer.reversed": {
      const transfer = event.data.object as Stripe.Transfer;
      if (transfer.id) {
        await markPayoutFailedFromTransfer(prisma, transfer.id, "transfer_reversed");
      }
      return;
    }

    default: {
      // Some Stripe API versions omit transfer.failed from the Event.type union.
      if ((event.type as string) === "transfer.failed") {
        const transfer = event.data.object as Stripe.Transfer;
        if (transfer.id) {
          await markPayoutFailedFromTransfer(prisma, transfer.id, "transfer_failed");
        }
        return;
      }
      log("relay-billing: webhook unknown event type (ack)", {
        eventId: event.id,
        eventType: event.type
      });
    }
  }
}

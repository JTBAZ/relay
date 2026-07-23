/**
 * Injectable Stripe Billing client surface (EH-051).
 * Production wraps the Stripe SDK; unit tests inject {@link createMemoryStripeBillingClient}.
 * Never log secret keys. Prefer restricted keys (rk_) over secret keys (sk_) when available.
 */

import type { BillingInterval, BillingSubscriptionStatus } from "./types";

export type StripeAccountSnapshot = {
  id: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  country: string | null;
  defaultCurrency: string | null;
};

export type StripeProductSnapshot = {
  id: string;
  name: string;
  active: boolean;
  metadata: Record<string, string>;
};

export type StripePriceSnapshot = {
  id: string;
  productId: string;
  currency: string;
  unitAmountCents: number;
  interval: BillingInterval;
  active: boolean;
  metadata: Record<string, string>;
};

export type StripeCheckoutSessionSnapshot = {
  id: string;
  url: string | null;
  mode: "hosted" | "embedded";
  clientSecret: string | null;
};

export type StripePortalSessionSnapshot = {
  id: string;
  url: string;
};

export type StripeCustomerSnapshot = {
  id: string;
  email: string | null;
  metadata: Record<string, string>;
};

export type StripeSubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: BillingSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEndUnix: number | null;
  priceIds: string[];
  metadata: Record<string, string>;
};

/**
 * Narrow client used by the BillingProvider adapter.
 * Omitting `payment_method_types` on checkout is mandatory (dynamic PMs).
 */
export type StripeBillingClient = {
  retrieveAccount(): Promise<StripeAccountSnapshot>;
  listProducts(): Promise<StripeProductSnapshot[]>;
  createProduct(input: {
    name: string;
    metadata?: Record<string, string>;
  }): Promise<StripeProductSnapshot>;
  updateProduct(input: {
    productId: string;
    name?: string;
    active?: boolean;
    metadata?: Record<string, string>;
  }): Promise<StripeProductSnapshot>;
  listPrices(productId?: string): Promise<StripePriceSnapshot[]>;
  createPrice(input: {
    productId: string;
    currency: string;
    unitAmountCents: number;
    interval: BillingInterval;
    metadata?: Record<string, string>;
  }): Promise<StripePriceSnapshot>;
  updatePrice(input: {
    priceId: string;
    active?: boolean;
  }): Promise<StripePriceSnapshot>;
  createCheckoutSession(input: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    customerId?: string | null;
    clientReferenceId?: string | null;
    metadata: Record<string, string>;
    mode: "hosted" | "embedded";
  }): Promise<StripeCheckoutSessionSnapshot>;
  createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<StripePortalSessionSnapshot>;
  listCustomers(limit?: number): Promise<StripeCustomerSnapshot[]>;
  listSubscriptions(limit?: number): Promise<StripeSubscriptionSnapshot[]>;
};

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * In-memory Stripe stand-in for CI sandbox lifecycle (no network, no secrets).
 */
export function createMemoryStripeBillingClient(opts?: {
  account?: Partial<StripeAccountSnapshot>;
}): StripeBillingClient & {
  products: Map<string, StripeProductSnapshot>;
  prices: Map<string, StripePriceSnapshot>;
  customers: Map<string, StripeCustomerSnapshot>;
  subscriptions: Map<string, StripeSubscriptionSnapshot>;
  checkoutSessions: Map<string, StripeCheckoutSessionSnapshot>;
} {
  const products = new Map<string, StripeProductSnapshot>();
  const prices = new Map<string, StripePriceSnapshot>();
  const customers = new Map<string, StripeCustomerSnapshot>();
  const subscriptions = new Map<string, StripeSubscriptionSnapshot>();
  const checkoutSessions = new Map<string, StripeCheckoutSessionSnapshot>();

  const account: StripeAccountSnapshot = {
    id: opts?.account?.id ?? "acct_memory_eh051",
    chargesEnabled: opts?.account?.chargesEnabled ?? true,
    detailsSubmitted: opts?.account?.detailsSubmitted ?? true,
    payoutsEnabled: opts?.account?.payoutsEnabled ?? true,
    country: opts?.account?.country ?? "US",
    defaultCurrency: opts?.account?.defaultCurrency ?? "usd"
  };

  return {
    products,
    prices,
    customers,
    subscriptions,
    checkoutSessions,

    async retrieveAccount() {
      return { ...account };
    },

    async listProducts() {
      return [...products.values()].map((p) => ({
        ...p,
        metadata: { ...p.metadata }
      }));
    },

    async createProduct(input) {
      const snap: StripeProductSnapshot = {
        id: id("prod"),
        name: input.name,
        active: true,
        metadata: { ...(input.metadata ?? {}) }
      };
      products.set(snap.id, snap);
      return { ...snap, metadata: { ...snap.metadata } };
    },

    async updateProduct(input) {
      const existing = products.get(input.productId);
      if (!existing) throw new Error("product_not_found");
      const next: StripeProductSnapshot = {
        ...existing,
        name: input.name ?? existing.name,
        active: input.active ?? existing.active,
        metadata: input.metadata
          ? { ...existing.metadata, ...input.metadata }
          : { ...existing.metadata }
      };
      products.set(next.id, next);
      return { ...next, metadata: { ...next.metadata } };
    },

    async listPrices(productId) {
      return [...prices.values()]
        .filter((p) => (productId ? p.productId === productId : true))
        .map((p) => ({ ...p, metadata: { ...p.metadata } }));
    },

    async createPrice(input) {
      if (!products.has(input.productId)) throw new Error("product_not_found");
      const snap: StripePriceSnapshot = {
        id: id("price"),
        productId: input.productId,
        currency: input.currency.toLowerCase(),
        unitAmountCents: input.unitAmountCents,
        interval: input.interval,
        active: true,
        metadata: { ...(input.metadata ?? {}) }
      };
      prices.set(snap.id, snap);
      return { ...snap, metadata: { ...snap.metadata } };
    },

    async updatePrice(input) {
      const existing = prices.get(input.priceId);
      if (!existing) throw new Error("price_not_found");
      const next: StripePriceSnapshot = {
        ...existing,
        active: input.active ?? existing.active
      };
      prices.set(next.id, next);
      return { ...next, metadata: { ...next.metadata } };
    },

    async createCheckoutSession(input) {
      if (!prices.has(input.priceId)) throw new Error("price_not_found");
      const snap: StripeCheckoutSessionSnapshot = {
        id: id("cs"),
        url:
          input.mode === "hosted"
            ? `https://checkout.stripe.test/c/pay/${id("cs_test")}`
            : null,
        mode: input.mode,
        clientSecret:
          input.mode === "embedded" ? `cs_test_secret_${id("emb")}` : null
      };
      checkoutSessions.set(snap.id, snap);
      return { ...snap };
    },

    async createPortalSession(input) {
      if (!customers.has(input.customerId)) {
        customers.set(input.customerId, {
          id: input.customerId,
          email: null,
          metadata: {}
        });
      }
      return {
        id: id("bps"),
        url: `https://billing.stripe.test/session/${id("portal")}?return=${encodeURIComponent(input.returnUrl)}`
      };
    },

    async listCustomers(limit = 100) {
      return [...customers.values()]
        .slice(0, limit)
        .map((c) => ({ ...c, metadata: { ...c.metadata } }));
    },

    async listSubscriptions(limit = 100) {
      return [...subscriptions.values()]
        .slice(0, limit)
        .map((s) => ({
          ...s,
          priceIds: [...s.priceIds],
          metadata: { ...s.metadata }
        }));
    }
  };
}

type StripeSdkLike = {
  account: {
    retrieve(): Promise<{
      id: string;
      charges_enabled?: boolean | null;
      details_submitted?: boolean | null;
      payouts_enabled?: boolean | null;
      country?: string | null;
      default_currency?: string | null;
    }>;
  };
  products: {
    list(params?: { limit?: number; active?: boolean }): Promise<{
      data: Array<{
        id: string;
        name: string;
        active: boolean;
        metadata?: Record<string, string> | null;
      }>;
    }>;
    create(params: {
      name: string;
      metadata?: Record<string, string>;
    }): Promise<{
      id: string;
      name: string;
      active: boolean;
      metadata?: Record<string, string> | null;
    }>;
    update(
      id: string,
      params: {
        name?: string;
        active?: boolean;
        metadata?: Record<string, string>;
      }
    ): Promise<{
      id: string;
      name: string;
      active: boolean;
      metadata?: Record<string, string> | null;
    }>;
  };
  prices: {
    list(params?: {
      limit?: number;
      product?: string;
      active?: boolean;
    }): Promise<{
      data: Array<{
        id: string;
        product: string | { id: string };
        currency: string;
        unit_amount: number | null;
        active: boolean;
        recurring?: { interval?: string } | null;
        metadata?: Record<string, string> | null;
      }>;
    }>;
    create(params: {
      product: string;
      currency: string;
      unit_amount: number;
      recurring: { interval: BillingInterval };
      metadata?: Record<string, string>;
    }): Promise<{
      id: string;
      product: string | { id: string };
      currency: string;
      unit_amount: number | null;
      active: boolean;
      recurring?: { interval?: string } | null;
      metadata?: Record<string, string> | null;
    }>;
    update(
      id: string,
      params: { active?: boolean }
    ): Promise<{
      id: string;
      product: string | { id: string };
      currency: string;
      unit_amount: number | null;
      active: boolean;
      recurring?: { interval?: string } | null;
      metadata?: Record<string, string> | null;
    }>;
  };
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{
        id: string;
        url?: string | null;
        client_secret?: string | null;
      }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: {
        customer: string;
        return_url: string;
      }): Promise<{ id: string; url: string }>;
    };
  };
  customers: {
    list(params?: { limit?: number }): Promise<{
      data: Array<{
        id: string;
        email?: string | null;
        metadata?: Record<string, string> | null;
      }>;
    }>;
  };
  subscriptions: {
    list(params?: { limit?: number; status?: string }): Promise<{
      data: Array<{
        id: string;
        customer: string | { id: string };
        status: string;
        cancel_at_period_end?: boolean;
        current_period_end?: number;
        items?: {
          data?: Array<{ price?: { id?: string } | null }>;
        };
        metadata?: Record<string, string> | null;
      }>;
    }>;
  };
};

function mapInterval(raw: string | undefined): BillingInterval {
  if (raw === "year" || raw === "week" || raw === "day") return raw;
  return "month";
}

function mapSubStatus(raw: string): BillingSubscriptionStatus {
  const s = raw.toLowerCase();
  if (s === "active" || s === "trialing") return s;
  if (s === "past_due" || s === "unpaid") return s;
  if (s === "canceled" || s === "cancelled") return "canceled";
  if (s === "paused") return "paused";
  return "incomplete";
}

function productIdOf(product: string | { id: string }): string {
  return typeof product === "string" ? product : product.id;
}

function customerIdOf(customer: string | { id: string }): string {
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Wrap a Stripe SDK instance. Callers construct Stripe with a restricted or
 * secret key from server env — never from the browser.
 */
export function wrapStripeSdk(stripe: StripeSdkLike): StripeBillingClient {
  return {
    async retrieveAccount() {
      const a = await stripe.account.retrieve();
      return {
        id: a.id,
        chargesEnabled: Boolean(a.charges_enabled),
        detailsSubmitted: Boolean(a.details_submitted),
        payoutsEnabled: Boolean(a.payouts_enabled),
        country: a.country ?? null,
        defaultCurrency: a.default_currency ?? null
      };
    },

    async listProducts() {
      const res = await stripe.products.list({ limit: 100 });
      return res.data.map((p) => ({
        id: p.id,
        name: p.name,
        active: p.active,
        metadata: { ...(p.metadata ?? {}) }
      }));
    },

    async createProduct(input) {
      const p = await stripe.products.create({
        name: input.name,
        metadata: input.metadata
      });
      return {
        id: p.id,
        name: p.name,
        active: p.active,
        metadata: { ...(p.metadata ?? {}) }
      };
    },

    async updateProduct(input) {
      const p = await stripe.products.update(input.productId, {
        name: input.name,
        active: input.active,
        metadata: input.metadata
      });
      return {
        id: p.id,
        name: p.name,
        active: p.active,
        metadata: { ...(p.metadata ?? {}) }
      };
    },

    async listPrices(productId) {
      const res = await stripe.prices.list({
        limit: 100,
        ...(productId ? { product: productId } : {})
      });
      return res.data.map((pr) => ({
        id: pr.id,
        productId: productIdOf(pr.product),
        currency: pr.currency,
        unitAmountCents: pr.unit_amount ?? 0,
        interval: mapInterval(pr.recurring?.interval),
        active: pr.active,
        metadata: { ...(pr.metadata ?? {}) }
      }));
    },

    async createPrice(input) {
      const pr = await stripe.prices.create({
        product: input.productId,
        currency: input.currency.toLowerCase(),
        unit_amount: input.unitAmountCents,
        recurring: { interval: input.interval },
        metadata: input.metadata
      });
      return {
        id: pr.id,
        productId: productIdOf(pr.product),
        currency: pr.currency,
        unitAmountCents: pr.unit_amount ?? 0,
        interval: mapInterval(pr.recurring?.interval),
        active: pr.active,
        metadata: { ...(pr.metadata ?? {}) }
      };
    },

    async updatePrice(input) {
      const pr = await stripe.prices.update(input.priceId, {
        active: input.active
      });
      return {
        id: pr.id,
        productId: productIdOf(pr.product),
        currency: pr.currency,
        unitAmountCents: pr.unit_amount ?? 0,
        interval: mapInterval(pr.recurring?.interval),
        active: pr.active,
        metadata: { ...(pr.metadata ?? {}) }
      };
    },

    async createCheckoutSession(input) {
      // Dynamic payment methods: never pass payment_method_types.
      const params: Record<string, unknown> = {
        mode: "subscription",
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: input.metadata,
        subscription_data: { metadata: input.metadata }
      };
      if (input.customerId) params.customer = input.customerId;
      if (input.clientReferenceId) {
        params.client_reference_id = input.clientReferenceId;
      }
      if (input.mode === "embedded") {
        params.ui_mode = "embedded";
        params.return_url = input.successUrl;
        delete params.success_url;
        delete params.cancel_url;
      }

      const session = await stripe.checkout.sessions.create(params);
      return {
        id: session.id,
        url: session.url ?? null,
        mode: input.mode,
        clientSecret: session.client_secret ?? null
      };
    },

    async createPortalSession(input) {
      const session = await stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl
      });
      return { id: session.id, url: session.url };
    },

    async listCustomers(limit = 100) {
      const res = await stripe.customers.list({ limit });
      return res.data.map((c) => ({
        id: c.id,
        email: c.email ?? null,
        metadata: { ...(c.metadata ?? {}) }
      }));
    },

    async listSubscriptions(limit = 100) {
      const res = await stripe.subscriptions.list({ limit });
      return res.data.map((s) => ({
        id: s.id,
        customerId: customerIdOf(s.customer),
        status: mapSubStatus(s.status),
        cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
        currentPeriodEndUnix: s.current_period_end ?? null,
        priceIds: (s.items?.data ?? [])
          .map((it) => it.price?.id)
          .filter((x): x is string => typeof x === "string"),
        metadata: { ...(s.metadata ?? {}) }
      }));
    }
  };
}

/**
 * Construct a live Stripe SDK client from a server secret/restricted key.
 * Returns null when the `stripe` package cannot be loaded (tests without dep).
 */
export async function createLiveStripeBillingClient(
  secretKey: string
): Promise<StripeBillingClient | null> {
  try {
    const mod = (await import("stripe")) as unknown as {
      default: new (key: string, opts?: object) => StripeSdkLike;
    };
    const StripeCtor = mod.default;
    const stripe = new StripeCtor(secretKey, {
      // Pin to skill-recommended API version when the installed SDK accepts it.
      apiVersion: "2026-06-24.dahlia"
    });
    return wrapStripeSdk(stripe);
  } catch {
    try {
      const mod = (await import("stripe")) as unknown as {
        default: new (key: string, opts?: object) => StripeSdkLike;
      };
      return wrapStripeSdk(new mod.default(secretKey));
    } catch {
      return null;
    }
  }
}

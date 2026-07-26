/**
 * Preview authUser ↔ Stripe customer binding (EH-051 / EH-082).
 * Process-local memory until a durable store ships — never trust client customerId
 * on production portal/checkout routes. Fixture-only client binding requires an
 * explicit opt-in that production routes must never pass.
 */

export type BillingCustomerLink = {
  siteId: string;
  authUserId: string;
  customerId: string;
  updatedAt: string;
};

export type BillingCustomerMapStore = {
  get(siteId: string, authUserId: string): Promise<string | null>;
  set(siteId: string, authUserId: string, customerId: string): Promise<void>;
  /**
   * Return existing mapping, or persist `customerId` when none exists.
   * Does not overwrite an established link with a different customer id.
   */
  getOrCreate(
    siteId: string,
    authUserId: string,
    customerId: string
  ): Promise<string>;
  clear?(): void;
};

function mapKey(siteId: string, authUserId: string): string {
  return `${siteId.trim()}::${authUserId.trim()}`;
}

/** In-memory map for unit tests / single-process preview. */
export function createMemoryBillingCustomerMap(): BillingCustomerMapStore & {
  links: Map<string, BillingCustomerLink>;
} {
  const links = new Map<string, BillingCustomerLink>();
  return {
    links,
    async get(siteId, authUserId) {
      const row = links.get(mapKey(siteId, authUserId));
      return row?.customerId ?? null;
    },
    async set(siteId, authUserId, customerId) {
      const sid = siteId.trim();
      const uid = authUserId.trim();
      const cid = customerId.trim();
      if (!sid || !uid || !cid) return;
      links.set(mapKey(sid, uid), {
        siteId: sid,
        authUserId: uid,
        customerId: cid,
        updatedAt: new Date().toISOString()
      });
    },
    async getOrCreate(siteId, authUserId, customerId) {
      const existing = await this.get(siteId, authUserId);
      if (existing) return existing;
      await this.set(siteId, authUserId, customerId);
      return (await this.get(siteId, authUserId)) ?? customerId.trim();
    },
    clear() {
      links.clear();
    }
  };
}

const previewMap = createMemoryBillingCustomerMap();

/** Shared preview store for routes/webhooks until SQL-backed store is wired. */
export function getPreviewBillingCustomerMap(): BillingCustomerMapStore & {
  links: Map<string, BillingCustomerLink>;
} {
  return previewMap;
}

export type ResolvePortalCustomerResult =
  | { ok: true; customerId: string; source: "map" | "client_preview" }
  | { ok: false; reason: string };

/**
 * Portal customer resolution (EH-082).
 * Default: ignore client customerId; require configured identity + owned map entry.
 * Fixture-only client trust requires `allowClientCustomerIdPreview: true`
 * (production portal route must never set this).
 */
export async function resolvePortalCustomerId(args: {
  identityConfigured: boolean;
  siteId: string;
  authUserId: string | null;
  clientCustomerId?: string | null;
  store?: BillingCustomerMapStore;
  /**
   * Fixture/test opt-in only. When true and identity is unset, a non-empty
   * client customerId may be used. Production routes must omit this.
   */
  allowClientCustomerIdPreview?: boolean;
}): Promise<ResolvePortalCustomerResult> {
  const store = args.store ?? previewMap;
  const client =
    typeof args.clientCustomerId === "string"
      ? args.clientCustomerId.trim()
      : "";

  if (args.identityConfigured) {
    if (!args.authUserId?.trim()) {
      return { ok: false, reason: "auth_required" };
    }
    const mapped = await store.get(args.siteId, args.authUserId);
    if (!mapped) {
      return { ok: false, reason: "billing_customer_link_missing" };
    }
    return { ok: true, customerId: mapped, source: "map" };
  }

  // Identity unset: fail closed unless explicit fixture opt-in.
  if (args.allowClientCustomerIdPreview === true) {
    if (!client) {
      return { ok: false, reason: "missing_customer_id" };
    }
    return { ok: true, customerId: client, source: "client_preview" };
  }

  return { ok: false, reason: "identity_required" };
}

export type ResolveCheckoutCustomerResult = {
  /** Stripe customer to attach, or null to let Stripe create one. */
  customerId: string | null;
  /** True when a client-supplied id was discarded under identity. */
  discardedClientCustomerId: boolean;
};

/**
 * Checkout customer resolution (EH-082).
 * Default: discard client customerId; use server map when identity is configured.
 * Fixture-only client pass-through requires `allowClientCustomerIdPreview: true`
 * (production checkout route must never set this).
 */
export async function resolveCheckoutCustomerId(args: {
  identityConfigured: boolean;
  siteId: string;
  authUserId: string | null;
  clientCustomerId?: string | null;
  store?: BillingCustomerMapStore;
  /** Fixture/test opt-in only. Production routes must omit this. */
  allowClientCustomerIdPreview?: boolean;
}): Promise<ResolveCheckoutCustomerResult> {
  const store = args.store ?? previewMap;
  const client =
    typeof args.clientCustomerId === "string"
      ? args.clientCustomerId.trim()
      : "";

  if (args.identityConfigured) {
    if (!args.authUserId?.trim()) {
      return { customerId: null, discardedClientCustomerId: Boolean(client) };
    }
    const mapped = await store.get(args.siteId, args.authUserId);
    return {
      customerId: mapped,
      discardedClientCustomerId: Boolean(client)
    };
  }

  if (args.allowClientCustomerIdPreview === true) {
    return {
      customerId: client || null,
      discardedClientCustomerId: false
    };
  }

  return {
    customerId: null,
    discardedClientCustomerId: Boolean(client)
  };
}

/**
 * Persist mapping after Stripe returns/creates a customer (checkout complete / webhook).
 */
export async function rememberBillingCustomerLink(args: {
  siteId: string;
  authUserId: string;
  customerId: string;
  store?: BillingCustomerMapStore;
}): Promise<string> {
  const store = args.store ?? previewMap;
  return store.getOrCreate(args.siteId, args.authUserId, args.customerId);
}

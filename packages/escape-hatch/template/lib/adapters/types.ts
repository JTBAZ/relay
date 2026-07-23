/**
 * Typed adapter surfaces for the generated kit (EH-030 / EH-050 billing).
 * Stub adapters remain for unset env; Supabase implementations activate when configured.
 * Billing: contract EH-050; creator-owned Stripe adapter EH-051.
 */

import type {
  BillingAccountConnection,
  BillingCapabilityMatrix,
  BillingCheckoutSession,
  BillingMigrationMapping,
  BillingPolicyDeclaration,
  BillingPortalSession,
  BillingPrice,
  BillingProduct,
  BillingReadinessReport,
  BillingResult,
  BillingWebhookEnvelope,
  NormalizeWebhookResult
} from "../billing/types";
import type { SiteAuthSession } from "../identity/types";

export type AdapterHealth =
  | { ok: true; detail?: string }
  | { ok: false; reason: string };

export type AuthProvider = {
  readonly id: "auth";
  readonly implementation: "stub" | "supabase" | "portable";
  health(): Promise<AdapterHealth>;
  /** Null when unset, unsigned, or outside a request context. */
  getSession(siteId?: string): Promise<SiteAuthSession | null>;
};

export type DatabaseProvider = {
  readonly id: "database";
  readonly implementation: "stub" | "postgres" | "supabase";
  health(): Promise<AdapterHealth>;
  /**
   * Apply forward migrations. Live runners apply SQL under db/migrations
   * when DATABASE_URL is real; otherwise documents apply-via-dashboard path.
   */
  migrate(): Promise<{ applied: string[]; skipped: boolean; reason?: string }>;
};

export type StorageProvider = {
  readonly id: "storage";
  readonly implementation: "stub" | "r2" | "local_private";
  health(): Promise<AdapterHealth>;
  /**
   * Mint a short-lived signed GET URL for a private object key (EH-033).
   * Stub / misconfigured private_r2 returns url: null (fail closed).
   */
  signGetObject(
    key: string
  ): Promise<{ url: string | null; expiresAt?: string; reason?: string }>;
};

/**
 * Shared BillingProvider contract (EH-050 / EH-051).
 * Stub is default; `stripe` / `nowpayments` are creator-owned adapters.
 * Entitlement service consumes normalized events — never provider client payloads.
 */
export type BillingProvider = {
  readonly id: "billing";
  readonly implementation: "stub" | "stripe" | "nowpayments";
  health(): Promise<AdapterHealth>;

  /** Connect and validate creator-owned processor account. */
  connectAccount(args?: {
    returnUrl?: string;
    refreshUrl?: string;
  }): Promise<BillingResult<BillingAccountConnection>>;
  validateAccount(): Promise<BillingResult<BillingAccountConnection>>;

  /** List / create / update tier products and recurring prices. */
  listProducts(): Promise<BillingResult<BillingProduct[]>>;
  createProduct(input: {
    name: string;
    tierId?: string | null;
  }): Promise<BillingResult<BillingProduct>>;
  updateProduct(input: {
    productId: string;
    name?: string;
    active?: boolean;
    tierId?: string | null;
  }): Promise<BillingResult<BillingProduct>>;
  listPrices(productId?: string): Promise<BillingResult<BillingPrice[]>>;
  createPrice(input: {
    productId: string;
    currency: string;
    unitAmountCents: number;
    interval: "month" | "year" | "week" | "day";
  }): Promise<BillingResult<BillingPrice>>;
  updatePrice(input: {
    priceId: string;
    active?: boolean;
  }): Promise<BillingResult<BillingPrice>>;

  /** Hosted or embedded checkout session. */
  createCheckoutSession(input: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    customerId?: string | null;
    authUserId?: string | null;
    siteId: string;
    tierIds?: readonly string[];
    mode?: "hosted" | "embedded";
  }): Promise<BillingResult<BillingCheckoutSession>>;

  /** Account-management portal (or documented equivalent). */
  createCustomerPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<BillingResult<BillingPortalSession>>;

  /** Verify signed webhooks (fail closed when not implemented). */
  verifyWebhookSignature(input: {
    rawBody: string | Buffer;
    signatureHeader: string | null;
  }): Promise<BillingResult<{ verified: true }>>;

  /**
   * Normalize a verified webhook envelope into a canonical lifecycle event.
   * Always fail closed when signatureVerified is false.
   */
  normalizeWebhookEvent(
    envelope: BillingWebhookEnvelope
  ): NormalizeWebhookResult;

  /** Capability / readiness / policy declaration. */
  getCapabilityMatrix(): BillingCapabilityMatrix;
  getReadiness(): BillingReadinessReport;
  getPolicyDeclaration(): BillingPolicyDeclaration;

  /** Sandbox / test mode honesty. */
  isSandboxMode(): boolean;

  /** Export customer/subscription mapping for migration. */
  exportMigrationMapping(siteId: string): Promise<
    BillingResult<BillingMigrationMapping>
  >;
};

export type PatreonAuthorizeResult =
  | { ok: true; url: string; state: string; expiresAtIso: string }
  | { ok: false; reason: string };

export type PatreonCallbackResult =
  | { ok: true; redirectTo: string; patreonUserId: string; tierIds: string[] }
  | { ok: false; redirectTo: string; reason: string };

export type PatreonRefreshResult =
  | { ok: true; patreonUserId: string; tierIds: string[] }
  | { ok: false; reason: string };

export type PatreonVerificationProvider = {
  readonly id: "patreon";
  readonly implementation: "stub" | "creator_oauth" | "relay_managed";
  health(): Promise<AdapterHealth>;
  /** Mint Patreon authorize URL + signed state (CSRF + PKCE). */
  buildAuthorizeUrl(args: {
    siteId: string;
    accountId: string;
    returnPath?: string;
  }): Promise<PatreonAuthorizeResult>;
  /** Exchange callback code after state verify (caller verifies state first). */
  handleCallback(args: {
    siteId: string;
    accountId: string;
    code: string;
    codeVerifier: string;
    returnPath?: string;
  }): Promise<PatreonCallbackResult>;
  /** Refresh stored token and re-validate campaign membership. */
  refreshAndRelink(args: {
    siteId: string;
    accountId: string;
  }): Promise<PatreonRefreshResult>;
};

export type TransactionalEmailProvider = {
  readonly id: "email";
  readonly implementation: "stub";
  health(): Promise<AdapterHealth>;
};

export type DeploymentProvider = {
  readonly id: "deployment";
  readonly implementation: "manifest" | "vercel" | "docker";
  /** Declares supported targets from escape-hatch.manifest.json — not a live deploy. */
  listTargets(): ReadonlyArray<"vercel" | "docker">;
  health(): Promise<AdapterHealth>;
};

export type SiteAdapters = {
  auth: AuthProvider;
  database: DatabaseProvider;
  storage: StorageProvider;
  billing: BillingProvider;
  patreon: PatreonVerificationProvider;
  email: TransactionalEmailProvider;
  deployment: DeploymentProvider;
};

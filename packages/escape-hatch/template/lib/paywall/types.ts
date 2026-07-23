/**
 * Shared paywall / account UX types (EH-034).
 * Safe to import from client components — no secrets.
 */

export type ServerAccessSummary = {
  allowed: boolean;
  reason: string;
  detail: string;
  provider: string;
  stale: boolean;
};

export type IdentityProviderUx = "none" | "supabase" | "portable" | "invalid";

export type AccountSummaryView = {
  provider: IdentityProviderUx;
  signedIn: boolean;
  email: string | null;
  role: string | null;
  userId: string | null;
  entitlement: {
    source: string | null;
    tierIds: string[];
    status: string | null;
    observedAt: string | null;
    staleAfter: string | null;
    expiresAt: string | null;
    reason: string | null;
    ok: boolean;
    detail: string;
  };
  softPersonaAllowed: boolean;
  billingConfigured: boolean;
  billingNote: string;
  /** EH-040/041 Patreon link honesty on /account */
  patreon: {
    mode: "stub" | "creator_oauth" | "relay_managed" | "relay_managed_deferred";
    configured: boolean;
    canConnect: boolean;
    linked: boolean;
    patreonUserId: string | null;
    note: string;
  };
};

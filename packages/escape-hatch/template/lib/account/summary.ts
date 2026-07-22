/**
 * Server account summary for /account (EH-034).
 * Never trusts client persona or client-passed entitlement claims.
 */

import {
  isPortableIdentityConfigured,
  isSupabaseIdentityConfigured,
  loadEnv,
  resolveIdentityProviderSafe
} from "../env";
import {
  getServerAuthSession,
  loadOwnEntitlementSnapshot
} from "../identity/session";
import type { AccountSummaryView, IdentityProviderUx } from "../paywall/types";

function toProviderUx(
  mode: ReturnType<typeof resolveIdentityProviderSafe>
): IdentityProviderUx {
  if (mode === "invalid") return "invalid";
  return mode;
}

export async function loadAccountSummary(
  siteId: string
): Promise<AccountSummaryView> {
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);
  const provider = toProviderUx(mode);
  const softPersonaAllowed = provider === "none";

  const billingConfigured = false;
  const billingNote =
    "Independent billing checkout is not configured yet (EH-050+). Membership may come from Patreon sync, manual grants, or staff — not a live Stripe Checkout in this kit.";

  if (provider === "invalid") {
    return {
      provider,
      signedIn: false,
      email: null,
      role: null,
      userId: null,
      entitlement: {
        source: null,
        tierIds: [],
        status: null,
        observedAt: null,
        staleAfter: null,
        expiresAt: null,
        reason: null,
        ok: false,
        detail: "Identity provider value is invalid — membership checks fail closed."
      },
      softPersonaAllowed,
      billingConfigured,
      billingNote
    };
  }

  if (provider === "none") {
    return {
      provider,
      signedIn: false,
      email: null,
      role: null,
      userId: null,
      entitlement: {
        source: null,
        tierIds: [],
        status: null,
        observedAt: null,
        staleAfter: null,
        expiresAt: null,
        reason: null,
        ok: false,
        detail:
          "Identity is unset. Soft demo personas on the gallery are preview-only and never authorize premium bytes when Path A/B is later enabled."
      },
      softPersonaAllowed,
      billingConfigured,
      billingNote
    };
  }

  const configured =
    (provider === "supabase" && isSupabaseIdentityConfigured(env)) ||
    (provider === "portable" && isPortableIdentityConfigured(env));

  if (!configured) {
    return {
      provider,
      signedIn: false,
      email: null,
      role: null,
      userId: null,
      entitlement: {
        source: null,
        tierIds: [],
        status: null,
        observedAt: null,
        staleAfter: null,
        expiresAt: null,
        reason: null,
        ok: false,
        detail: `Provider is ${provider}, but required env is missing — sign-in unavailable.`
      },
      softPersonaAllowed: false,
      billingConfigured,
      billingNote
    };
  }

  const session = await getServerAuthSession(siteId);
  if (!session) {
    return {
      provider,
      signedIn: false,
      email: null,
      role: null,
      userId: null,
      entitlement: {
        source: null,
        tierIds: [],
        status: null,
        observedAt: null,
        staleAfter: null,
        expiresAt: null,
        reason: null,
        ok: false,
        detail: "Not signed in. Soft demo personas cannot unlock membership content."
      },
      softPersonaAllowed: false,
      billingConfigured,
      billingNote
    };
  }

  const snap = await loadOwnEntitlementSnapshot(siteId, session.userId);
  if (!snap.ok) {
    return {
      provider,
      signedIn: true,
      email: session.email,
      role: session.role,
      userId: session.userId,
      entitlement: {
        source: null,
        tierIds: [],
        status: null,
        observedAt: null,
        staleAfter: null,
        expiresAt: null,
        reason: null,
        ok: false,
        detail: snap.reason || "No entitlement snapshot on file for this account."
      },
      softPersonaAllowed: false,
      billingConfigured,
      billingNote
    };
  }

  const s = snap.snapshot;
  const status = snap.stale
    ? "stale"
    : s.revokedAt
      ? "revoked"
      : s.expiresAt && Date.parse(s.expiresAt) <= Date.now()
        ? "expired"
        : "active";
  return {
    provider,
    signedIn: true,
    email: session.email,
    role: session.role,
    userId: session.userId,
    entitlement: {
      source: s.source,
      tierIds: [...s.tierIds],
      status,
      observedAt: s.observedAt,
      staleAfter: s.staleAfter,
      expiresAt: s.expiresAt,
      reason: s.reason,
      ok: true,
      detail: s.reason?.trim() || `Membership source: ${s.source}.`
    },
    softPersonaAllowed: false,
    billingConfigured,
    billingNote
  };
}

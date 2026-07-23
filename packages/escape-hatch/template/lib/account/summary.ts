/**
 * Server account summary for /account (EH-034 / EH-040).
 * Never trusts client persona or client-passed entitlement claims.
 */

import { createSiteAdapters } from "../adapters";
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
import {
  isCreatorOAuthConfigured,
  resolvePatreonMode
} from "../patreon/config";
import { isRelayManagedConfigured } from "../patreon/relay-managed/config";
import type { AccountSummaryView, IdentityProviderUx } from "../paywall/types";

function toProviderUx(
  mode: ReturnType<typeof resolveIdentityProviderSafe>
): IdentityProviderUx {
  if (mode === "invalid") return "invalid";
  return mode;
}

function patreonSummary(args: {
  signedIn: boolean;
  userId: string | null;
  entitlementSource: string | null;
}): AccountSummaryView["patreon"] {
  const env = loadEnv();
  const rawMode = env.ESCAPE_HATCH_PATREON_MODE?.toLowerCase();
  if (rawMode === "relay_managed") {
    const configured = isRelayManagedConfigured(env);
    if (!configured) {
      return {
        mode: "relay_managed_deferred",
        configured: false,
        canConnect: false,
        linked: false,
        patreonUserId: null,
        note: "Relay-managed mode is selected but verify env is incomplete, placeholder, or kill-switched (ESCAPE_HATCH_RELAY_VERIFY_ENABLED)."
      };
    }
    const linkedBySource = args.entitlementSource === "patreon";
    return {
      mode: "relay_managed",
      configured: true,
      canConnect: args.signedIn && Boolean(args.userId),
      linked: linkedBySource,
      patreonUserId: null,
      note: linkedBySource
        ? "Patreon membership linked via Relay-managed assertion (source=patreon)."
        : args.signedIn
          ? "Verify with Patreon through Relay — site does not hold Patreon tokens."
          : "Sign in to verify Patreon via Relay."
    };
  }
  const configured = isCreatorOAuthConfigured(env);
  const mode = resolvePatreonMode(env);
  if (!configured || mode !== "creator_oauth") {
    return {
      mode: "stub",
      configured: false,
      canConnect: false,
      linked: false,
      patreonUserId: null,
      note: "Creator-owned Patreon OAuth is not configured. Set ESCAPE_HATCH_PATREON_MODE=creator_oauth or relay_managed with the env names in OPERATIONS.md."
    };
  }
  const linkedBySource = args.entitlementSource === "patreon";
  return {
    mode: "creator_oauth",
    configured: true,
    canConnect: args.signedIn && Boolean(args.userId),
    linked: linkedBySource,
    patreonUserId: null,
    note: linkedBySource
      ? "Patreon membership is linked for this account (source=patreon)."
      : args.signedIn
        ? "Connect Patreon to validate campaign membership and refresh entitlements."
        : "Sign in to connect Patreon."
  };
}

export async function loadAccountSummary(
  siteId: string
): Promise<AccountSummaryView> {
  const env = loadEnv();
  const mode = resolveIdentityProviderSafe(env);
  const provider = toProviderUx(mode);
  const softPersonaAllowed = provider === "none";

  const billing = createSiteAdapters().billing;
  const billingReady = billing.getReadiness();
  const billingConfigured =
    billing.implementation === "stripe" && billingReady.ok;
  const billingNote = billingConfigured
    ? billing.isSandboxMode()
      ? "Independent Stripe billing is configured in test/sandbox mode (EH-051). Membership updates come from verified webhooks — not from the browser alone."
      : "Independent Stripe billing is configured (EH-051). Membership updates come from verified webhooks — not from the browser alone."
    : billing.implementation === "stripe"
      ? "Stripe billing adapter selected but credentials are incomplete — Checkout/Portal remain closed until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set."
      : "Independent billing checkout is not configured (stub). Set ESCAPE_HATCH_BILLING_PROVIDER=stripe with creator Stripe credentials (EH-051), or use Patreon sync / manual grants.";

  const withPatreon = (
    base: Omit<AccountSummaryView, "patreon">
  ): AccountSummaryView => ({
    ...base,
    patreon: patreonSummary({
      signedIn: base.signedIn,
      userId: base.userId,
      entitlementSource: base.entitlement.source
    })
  });

  if (provider === "invalid") {
    return withPatreon({
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
    });
  }

  if (provider === "none") {
    return withPatreon({
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
    });
  }

  const configured =
    (provider === "supabase" && isSupabaseIdentityConfigured(env)) ||
    (provider === "portable" && isPortableIdentityConfigured(env));

  if (!configured) {
    return withPatreon({
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
    });
  }

  const session = await getServerAuthSession(siteId);
  if (!session) {
    return withPatreon({
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
    });
  }

  const snap = await loadOwnEntitlementSnapshot(siteId, session.userId);
  if (!snap.ok) {
    return withPatreon({
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
    });
  }

  const s = snap.snapshot;
  const status = snap.stale
    ? "stale"
    : s.revokedAt
      ? "revoked"
      : s.expiresAt && Date.parse(s.expiresAt) <= Date.now()
        ? "expired"
        : "active";
  return withPatreon({
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
  });
}

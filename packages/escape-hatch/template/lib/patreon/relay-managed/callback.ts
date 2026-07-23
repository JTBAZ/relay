/**
 * Relay-managed callback: verify assertion → upsert link + entitlement (EH-041).
 */

import {
  buildPatreonEntitlementSnapshot,
  type PatreonLinkStore
} from "../store";
import {
  verifyRelayAssertion,
  type RelayAssertionPublicKey
} from "./assertion";
import type { RelayManagedConfig } from "./config";
import type { AssertionReplayStore } from "./replay";
import {
  verifyRelayManagedState,
  type RelayManagedStatePayload
} from "./start";

export type HandleRelayCallbackArgs = {
  config: RelayManagedConfig;
  store: PatreonLinkStore;
  replay: AssertionReplayStore;
  assertion: string;
  state: string;
  expectedAccountId: string;
  expectedSiteId: string;
  /** Extra verification keys (e.g. from JWKS fetch in production). */
  extraKeys?: readonly RelayAssertionPublicKey[];
  nowMs?: number;
};

export type HandleRelayCallbackResult =
  | {
      ok: true;
      redirectTo: string;
      patreonUserId: string;
      tierIds: string[];
      payload: RelayManagedStatePayload;
    }
  | { ok: false; redirectTo: string; reason: string };

export async function handleRelayManagedCallback(
  args: HandleRelayCallbackArgs
): Promise<HandleRelayCallbackResult> {
  if (!args.config.enabled) {
    return {
      ok: false,
      redirectTo: "/account?patreon=error&reason=kill_switch",
      reason: "kill_switch"
    };
  }

  const stateResult = verifyRelayManagedState(
    args.state,
    args.config.stateSecret,
    {
      expectedAccountId: args.expectedAccountId,
      expectedSiteId: args.expectedSiteId,
      nowMs: args.nowMs
    }
  );
  if (!stateResult.ok) {
    return {
      ok: false,
      redirectTo: `/account?patreon=error&reason=${encodeURIComponent(stateResult.reason)}`,
      reason: stateResult.reason
    };
  }

  const keys = [...args.config.keys, ...(args.extraKeys ?? [])];
  if (keys.length === 0) {
    return {
      ok: false,
      redirectTo: "/account?patreon=error&reason=no_verification_keys",
      reason: "no_verification_keys"
    };
  }

  const verified = verifyRelayAssertion({
    token: args.assertion,
    expectedIssuer: args.config.issuer,
    expectedAudience: args.config.audience,
    expectedSiteId: args.config.siteId,
    expectedAccountId: args.expectedAccountId,
    expectedNonce: stateResult.payload.nonce,
    keys,
    nowMs: args.nowMs
  });
  if (!verified.ok) {
    return {
      ok: false,
      redirectTo: `${stateResult.payload.returnPath.split("?")[0]}?patreon=error&reason=${encodeURIComponent(verified.reason)}`,
      reason: verified.reason
    };
  }

  if (!args.replay.consume(verified.claims.jti, verified.claims.exp * 1000)) {
    return {
      ok: false,
      redirectTo: `${stateResult.payload.returnPath.split("?")[0]}?patreon=error&reason=replay`,
      reason: "replay"
    };
  }

  const nowIso = new Date(args.nowMs ?? Date.now()).toISOString();
  await args.store.upsertLink({
    siteId: args.expectedSiteId,
    authUserId: args.expectedAccountId,
    patreonUserId: verified.claims.sub,
    linkedAt: nowIso,
    lastValidatedAt: verified.claims.entitlement.observed_at
  });

  const snap = buildPatreonEntitlementSnapshot({
    siteId: args.expectedSiteId,
    authUserId: args.expectedAccountId,
    tierIds: verified.claims.entitlement.tier_ids,
    observedAt: verified.claims.entitlement.observed_at,
    reason:
      "Relay-managed Patreon assertion verified (source=patreon)."
  });
  await args.store.upsertEntitlementSnapshot(snap);

  const base = stateResult.payload.returnPath.split("?")[0] || "/account";
  return {
    ok: true,
    redirectTo: `${base}?patreon=linked`,
    patreonUserId: verified.claims.sub,
    tierIds: [...verified.claims.entitlement.tier_ids],
    payload: stateResult.payload
  };
}

/** Non-secret migration metadata export for /admin/patreon. */
export type RelayMigrationMetadataExport = {
  mode: "relay_managed";
  siteId: string;
  audience: string;
  issuer: string;
  verifyBaseUrl: string;
  callbackPath: "/api/patreon/relay/callback";
  note: string;
};

export function buildRelayMigrationMetadataExport(
  config: RelayManagedConfig
): RelayMigrationMetadataExport {
  return {
    mode: "relay_managed",
    siteId: config.siteId,
    audience: config.audience,
    issuer: config.issuer,
    verifyBaseUrl: config.verifyBaseUrl,
    callbackPath: "/api/patreon/relay/callback",
    note: "Non-secret link metadata only. Request full export from Relay GET .../migration-export. No tokens or credentials."
  };
}

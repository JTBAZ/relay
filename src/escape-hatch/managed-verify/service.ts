/**
 * Relay-managed Patreon verification orchestrator (EH-041).
 * In-memory / CI-safe — no live Patreon credentials.
 */

import { randomBytes } from "node:crypto";
import {
  issueManagedVerifyAssertion,
  verifyManagedVerifyAssertion
} from "./assertion.js";
import { createManagedVerifyKeyRing, type ManagedVerifyKeyRing } from "./keys.js";
import {
  buildManagedVerifyHealth,
  createManagedVerifyMetrics,
  isManagedVerifyEnabled,
  noteProviderFailure,
  noteTokenRefreshHook,
  type ManagedVerifyMetrics
} from "./metrics.js";
import {
  createMemoryReplayStore,
  createMemorySiteRegistry,
  mintAssertionJti,
  type ManagedVerifyReplayStore,
  type ManagedVerifySiteRegistry
} from "./registry.js";
import type {
  EntitlementObservation,
  ManagedVerifyAssertionClaims,
  ManagedVerifyHealth,
  ManagedVerifyJwks
} from "./types.js";

/**
 * Optional EH-042 billing gate. When provided, assertion mint fails closed
 * unless the site has active/grace connector entitlement (webhook truth).
 */
export type ManagedVerifyBillingGate = {
  assertCanIssue(args: {
    siteId: string;
    nowMs?: number;
  }): { ok: true } | { ok: false; reason: string };
};

export type ManagedVerifyService = {
  isEnabled(): boolean;
  health(): ManagedVerifyHealth;
  jwks(): ManagedVerifyJwks;
  registerSite(args: {
    siteId: string;
    callbackOrigins: string[];
    audience: string;
  }): { ok: true; siteId: string } | { ok: false; reason: string };
  revokeSite(siteId: string): { ok: true } | { ok: false; reason: string };
  rotateKeys(): { ok: true; kid: string } | { ok: false; reason: string };
  /**
   * Issue a short-lived signed assertion after mocked/membership resolution.
   * Validates allowlisted return URL when provided; records non-secret link metadata.
   * When a billing gate is configured (EH-042), denies mint if entitlement inactive/past grace.
   */
  issueAssertion(args: {
    siteId: string;
    accountId: string;
    patreonUserId: string;
    nonce: string;
    entitlement: EntitlementObservation;
    returnUrl?: string;
    nowMs?: number;
  }):
    | { ok: true; token: string; claims: ManagedVerifyAssertionClaims }
    | { ok: false; reason: string };
  /**
   * Build redirect back to the independent site with assertion + state.
   * Fails closed on allowlist miss / revocation / kill switch.
   */
  completeRedirect(args: {
    siteId: string;
    accountId: string;
    patreonUserId: string;
    nonce: string;
    state: string;
    returnUrl: string;
    entitlement: EntitlementObservation;
    nowMs?: number;
  }):
    | { ok: true; redirectUrl: string; token: string }
    | { ok: false; reason: string };
  /** Server-side verify (overlap kids) + replay consume. */
  verifyAndConsume(args: {
    token: string;
    expectedIssuer: string;
    expectedAudience: string;
    expectedSiteId: string;
    expectedNonce?: string;
    nowMs?: number;
  }):
    | { ok: true; claims: ManagedVerifyAssertionClaims; kid: string }
    | { ok: false; reason: string };
  exportMigrationMetadata(siteId: string): {
    ok: true;
    export: NonNullable<
      ReturnType<ManagedVerifySiteRegistry["exportMigrationMetadata"]>
    >;
  } | { ok: false; reason: string };
  isReturnUrlAllowed(siteId: string, returnUrl: string): boolean;
  /** Monitoring hooks (stubs). */
  noteProviderFailure(): void;
  noteTokenRefresh(): void;
  /** Test/introspection accessors. */
  _registry: ManagedVerifySiteRegistry;
  _keys: ManagedVerifyKeyRing;
  _replay: ManagedVerifyReplayStore;
  _metrics: ManagedVerifyMetrics;
};

export type CreateManagedVerifyServiceArgs = {
  issuer: string;
  env?: NodeJS.ProcessEnv;
  keys?: ManagedVerifyKeyRing;
  registry?: ManagedVerifySiteRegistry;
  replay?: ManagedVerifyReplayStore;
  metrics?: ManagedVerifyMetrics;
  /** EH-042 — when set, issueAssertion/completeRedirect check billing entitlement. */
  billingGate?: ManagedVerifyBillingGate | null;
};

export function createManagedVerifyService(
  args: CreateManagedVerifyServiceArgs
): ManagedVerifyService {
  const env = args.env ?? process.env;
  const keys = args.keys ?? createManagedVerifyKeyRing();
  const registry = args.registry ?? createMemorySiteRegistry();
  const replay = args.replay ?? createMemoryReplayStore();
  const metrics = args.metrics ?? createManagedVerifyMetrics();
  const issuer = args.issuer.trim();
  const billingGate = args.billingGate ?? null;

  const guardEnabled = (): true | { ok: false; reason: string } => {
    if (!isManagedVerifyEnabled(env)) {
      return { ok: false, reason: "kill_switch" };
    }
    return true;
  };

  const guardBilling = (
    siteId: string,
    nowMs?: number
  ): true | { ok: false; reason: string } => {
    if (!billingGate) return true;
    const gate = billingGate.assertCanIssue({ siteId, nowMs });
    if (!gate.ok) return { ok: false, reason: gate.reason };
    return true;
  };

  const service: ManagedVerifyService = {
    _registry: registry,
    _keys: keys,
    _replay: replay,
    _metrics: metrics,

    isEnabled() {
      return isManagedVerifyEnabled(env);
    },

    health() {
      return buildManagedVerifyHealth({
        enabled: isManagedVerifyEnabled(env),
        metrics: metrics.snapshot()
      });
    },

    jwks() {
      return keys.toJwks();
    },

    registerSite(regArgs) {
      const g = guardEnabled();
      if (g !== true) return g;
      try {
        const rec = registry.register(regArgs);
        return { ok: true, siteId: rec.siteId };
      } catch {
        return { ok: false, reason: "register_failed" };
      }
    },

    revokeSite(siteId) {
      const g = guardEnabled();
      if (g !== true) return g;
      if (!registry.revoke(siteId)) return { ok: false, reason: "not_found" };
      metrics.incr("revocations");
      return { ok: true };
    },

    rotateKeys() {
      const g = guardEnabled();
      if (g !== true) return g;
      const next = keys.rotate();
      return { ok: true, kid: next.kid };
    },

    issueAssertion(issueArgs) {
      const g = guardEnabled();
      if (g !== true) return g;
      const b = guardBilling(issueArgs.siteId, issueArgs.nowMs);
      if (b !== true) return b;
      const site = registry.get(issueArgs.siteId);
      if (!site) return { ok: false, reason: "site_not_found" };
      if (site.revoked) return { ok: false, reason: "site_revoked" };
      if (
        issueArgs.returnUrl !== undefined &&
        !registry.isReturnUrlAllowed(issueArgs.siteId, issueArgs.returnUrl)
      ) {
        return { ok: false, reason: "return_url_not_allowlisted" };
      }
      const jti = mintAssertionJti();
      const signingKey = keys.getActiveSigningKey();
      const issued = issueManagedVerifyAssertion({
        issuer,
        audience: site.audience,
        siteId: issueArgs.siteId,
        accountId: issueArgs.accountId,
        patreonUserId: issueArgs.patreonUserId,
        nonce: issueArgs.nonce,
        jti,
        entitlement: issueArgs.entitlement,
        signingKey,
        nowMs: issueArgs.nowMs
      });
      registry.recordLink({
        siteId: issueArgs.siteId,
        patreonUserId: issueArgs.patreonUserId,
        siteAccountId: issueArgs.accountId,
        linkedAtIso: issueArgs.entitlement.observedAtIso
      });
      metrics.incr("assertionsIssued");
      return { ok: true, token: issued.token, claims: issued.claims };
    },

    completeRedirect(redirArgs) {
      const issued = service.issueAssertion({
        siteId: redirArgs.siteId,
        accountId: redirArgs.accountId,
        patreonUserId: redirArgs.patreonUserId,
        nonce: redirArgs.nonce,
        entitlement: redirArgs.entitlement,
        returnUrl: redirArgs.returnUrl,
        nowMs: redirArgs.nowMs
      });
      if (!issued.ok) return issued;
      let dest: URL;
      try {
        dest = new URL(redirArgs.returnUrl);
      } catch {
        return { ok: false, reason: "return_url_invalid" };
      }
      dest.searchParams.set("assertion", issued.token);
      dest.searchParams.set("state", redirArgs.state);
      return { ok: true, redirectUrl: dest.toString(), token: issued.token };
    },

    verifyAndConsume(verifyArgs) {
      const g = guardEnabled();
      if (g !== true) {
        metrics.incr("assertionsRejected");
        return g;
      }
      if (registry.isRevoked(verifyArgs.expectedSiteId)) {
        metrics.incr("assertionsRejected");
        return { ok: false, reason: "site_revoked" };
      }
      const verified = verifyManagedVerifyAssertion({
        token: verifyArgs.token,
        expectedIssuer: verifyArgs.expectedIssuer,
        expectedAudience: verifyArgs.expectedAudience,
        expectedSiteId: verifyArgs.expectedSiteId,
        expectedNonce: verifyArgs.expectedNonce,
        verificationKeys: keys.listVerificationKeys(verifyArgs.nowMs),
        nowMs: verifyArgs.nowMs
      });
      if (!verified.ok) {
        metrics.incr("assertionsRejected");
        return verified;
      }
      const expMs = verified.claims.exp * 1000;
      if (!replay.consume(verified.claims.jti, expMs)) {
        metrics.incr("assertionsRejected");
        return { ok: false, reason: "replay" };
      }
      metrics.incr("assertionsVerifiedOk");
      return verified;
    },

    exportMigrationMetadata(siteId) {
      const g = guardEnabled();
      if (g !== true) return g;
      const exp = registry.exportMigrationMetadata(siteId);
      if (!exp) return { ok: false, reason: "not_found" };
      return { ok: true, export: exp };
    },

    isReturnUrlAllowed(siteId, returnUrl) {
      return registry.isReturnUrlAllowed(siteId, returnUrl);
    },

    noteProviderFailure() {
      noteProviderFailure(metrics);
    },

    noteTokenRefresh() {
      noteTokenRefreshHook(metrics);
    }
  };

  return service;
}

/** Mint a random nonce for site→Relay start (also usable in tests). */
export function mintManagedVerifyNonce(): string {
  return randomBytes(16).toString("base64url");
}

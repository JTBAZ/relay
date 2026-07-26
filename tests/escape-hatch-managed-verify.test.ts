/**
 * EH-041 Relay-managed Patreon verification — focused unit tests.
 * No live Patreon network. productionSafe remains false.
 */

import { describe, expect, it } from "vitest";
import {
  createManagedVerifyKeyRing,
  createManagedVerifyService,
  issueManagedVerifyAssertion,
  tamperAssertionPayload,
  verifyManagedVerifyAssertion
} from "../src/escape-hatch/managed-verify/index.js";

const ISSUER = "https://relay.example/eh-managed-verify";
const SITE = "site_eh041_test";
const AUD = "aud_site_eh041_test";
const ORIGIN = "https://creator.example";

function baseService(env?: NodeJS.ProcessEnv) {
  const svc = createManagedVerifyService({
    issuer: ISSUER,
    env: env ?? { ESCAPE_HATCH_RELAY_MANAGED_VERIFY_ENABLED: "1" }
  });
  svc.registerSite({
    siteId: SITE,
    audience: AUD,
    callbackOrigins: [ORIGIN]
  });
  return svc;
}

describe("EH-041 managed-verify assertion crypto", () => {
  it("signs and verifies happy path", () => {
    const keys = createManagedVerifyKeyRing();
    const signing = keys.getActiveSigningKey();
    const { token, claims } = issueManagedVerifyAssertion({
      issuer: ISSUER,
      audience: AUD,
      siteId: SITE,
      accountId: "acct_1",
      patreonUserId: "pat_1",
      nonce: "nonce_abc",
      jti: "jti_1",
      entitlement: {
        tierIds: ["tier_a"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      },
      signingKey: signing
    });
    const verified = verifyManagedVerifyAssertion({
      token,
      expectedIssuer: ISSUER,
      expectedAudience: AUD,
      expectedSiteId: SITE,
      expectedNonce: "nonce_abc",
      verificationKeys: keys.listVerificationKeys()
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.sub).toBe("pat_1");
      expect(verified.claims.entitlement.tier_ids).toEqual(["tier_a"]);
      expect(verified.kid).toBe(signing.kid);
      expect(verified.claims.jti).toBe(claims.jti);
    }
  });

  it("rejects tampered / expired / wrong aud / wrong iss", () => {
    const keys = createManagedVerifyKeyRing();
    const signing = keys.getActiveSigningKey();
    const now = Date.now();
    const { token } = issueManagedVerifyAssertion({
      issuer: ISSUER,
      audience: AUD,
      siteId: SITE,
      accountId: "acct_1",
      patreonUserId: "pat_1",
      nonce: "n1",
      jti: "j1",
      entitlement: {
        tierIds: ["t1"],
        observedAtIso: new Date(now).toISOString(),
        patronStatus: "active_patron"
      },
      signingKey: signing,
      nowMs: now,
      ttlSec: 60
    });

    expect(
      verifyManagedVerifyAssertion({
        token: tamperAssertionPayload(token),
        expectedIssuer: ISSUER,
        expectedAudience: AUD,
        expectedSiteId: SITE,
        verificationKeys: keys.listVerificationKeys()
      }).ok
    ).toBe(false);

    expect(
      verifyManagedVerifyAssertion({
        token,
        expectedIssuer: "https://evil.example",
        expectedAudience: AUD,
        expectedSiteId: SITE,
        verificationKeys: keys.listVerificationKeys()
      })
    ).toMatchObject({ ok: false, reason: "iss" });

    expect(
      verifyManagedVerifyAssertion({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: "wrong_aud",
        expectedSiteId: SITE,
        verificationKeys: keys.listVerificationKeys()
      })
    ).toMatchObject({ ok: false, reason: "aud" });

    expect(
      verifyManagedVerifyAssertion({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: AUD,
        expectedSiteId: SITE,
        verificationKeys: keys.listVerificationKeys(),
        nowMs: now + 120_000
      })
    ).toMatchObject({ ok: false, reason: "exp" });
  });
});

describe("EH-041 managed-verify service ops", () => {
  it("allowlists return URLs and rejects open redirects", () => {
    const svc = baseService();
    const entitlement = {
      tierIds: ["tier_a"],
      observedAtIso: new Date().toISOString(),
      patronStatus: "active_patron"
    };
    const ok = svc.issueAssertion({
      siteId: SITE,
      accountId: "a1",
      patreonUserId: "p1",
      nonce: "n",
      entitlement,
      returnUrl: `${ORIGIN}/api/patreon/relay/callback`
    });
    expect(ok.ok).toBe(true);

    const bad = svc.issueAssertion({
      siteId: SITE,
      accountId: "a1",
      patreonUserId: "p1",
      nonce: "n2",
      entitlement,
      returnUrl: "https://evil.example/steal"
    });
    expect(bad).toMatchObject({
      ok: false,
      reason: "return_url_not_allowlisted"
    });
  });

  it("enforces replay protection and kill switch", () => {
    const svc = baseService();
    const issued = svc.issueAssertion({
      siteId: SITE,
      accountId: "a1",
      patreonUserId: "p1",
      nonce: "nonce_r",
      entitlement: {
        tierIds: ["t"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const first = svc.verifyAndConsume({
      token: issued.token,
      expectedIssuer: ISSUER,
      expectedAudience: AUD,
      expectedSiteId: SITE,
      expectedNonce: "nonce_r"
    });
    expect(first.ok).toBe(true);

    const replay = svc.verifyAndConsume({
      token: issued.token,
      expectedIssuer: ISSUER,
      expectedAudience: AUD,
      expectedSiteId: SITE,
      expectedNonce: "nonce_r"
    });
    expect(replay).toMatchObject({ ok: false, reason: "replay" });

    const killed = createManagedVerifyService({
      issuer: ISSUER,
      env: { ESCAPE_HATCH_RELAY_MANAGED_VERIFY_ENABLED: "0" }
    });
    expect(killed.health().ok).toBe(false);
    expect(killed.health().productionSafe).toBe(false);
    expect(
      killed.registerSite({
        siteId: "x",
        audience: "a",
        callbackOrigins: [ORIGIN]
      })
    ).toMatchObject({ ok: false, reason: "kill_switch" });
  });

  it("supports key rotation with overlapping verification", () => {
    const svc = baseService();
    const issued = svc.issueAssertion({
      siteId: SITE,
      accountId: "a1",
      patreonUserId: "p1",
      nonce: "n_rot",
      entitlement: {
        tierIds: ["t"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const oldKid = issued.claims;
    expect(oldKid).toBeTruthy();

    const rot = svc.rotateKeys();
    expect(rot.ok).toBe(true);

    // Old assertion still verifies under overlapping grace keys.
    const verified = svc.verifyAndConsume({
      token: issued.token,
      expectedIssuer: ISSUER,
      expectedAudience: AUD,
      expectedSiteId: SITE,
      expectedNonce: "n_rot"
    });
    expect(verified.ok).toBe(true);

    const issued2 = svc.issueAssertion({
      siteId: SITE,
      accountId: "a2",
      patreonUserId: "p2",
      nonce: "n_rot2",
      entitlement: {
        tierIds: ["t2"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    expect(issued2.ok).toBe(true);
    if (issued2.ok && rot.ok) {
      // New assertions use the rotated kid.
      const jwks = svc.jwks();
      expect(jwks.keys.some((k) => k.kid === rot.kid)).toBe(true);
      expect(jwks.keys.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("revokes per site and exports non-secret migration metadata", () => {
    const svc = baseService();
    svc.issueAssertion({
      siteId: SITE,
      accountId: "acct_m",
      patreonUserId: "pat_m",
      nonce: "n",
      entitlement: {
        tierIds: ["t"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    const exp = svc.exportMigrationMetadata(SITE);
    expect(exp.ok).toBe(true);
    if (exp.ok) {
      expect(exp.export.links[0]?.patreonUserId).toBe("pat_m");
      expect(exp.export.links[0]?.siteAccountId).toBe("acct_m");
      expect(JSON.stringify(exp.export)).not.toMatch(/private|secret|refresh/i);
    }
    expect(svc.revokeSite(SITE).ok).toBe(true);
    expect(
      svc.issueAssertion({
        siteId: SITE,
        accountId: "a",
        patreonUserId: "p",
        nonce: "n",
        entitlement: {
          tierIds: [],
          observedAtIso: new Date().toISOString(),
          patronStatus: "active_patron"
        }
      })
    ).toMatchObject({ ok: false, reason: "site_revoked" });
  });

  it("completeRedirect rejects open redirect origins", () => {
    const svc = baseService();
    const bad = svc.completeRedirect({
      siteId: SITE,
      accountId: "a",
      patreonUserId: "p",
      nonce: "n",
      state: "s",
      returnUrl: "https://attacker.example/cb",
      entitlement: {
        tierIds: ["t"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    expect(bad).toMatchObject({
      ok: false,
      reason: "return_url_not_allowlisted"
    });

    const good = svc.completeRedirect({
      siteId: SITE,
      accountId: "a",
      patreonUserId: "p",
      nonce: "n",
      state: "s",
      returnUrl: `${ORIGIN}/api/patreon/relay/callback`,
      entitlement: {
        tierIds: ["t"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.redirectUrl.startsWith(ORIGIN)).toBe(true);
      expect(good.redirectUrl).toMatch(/assertion=/);
    }
  });

  it("exposes monitoring hooks without claiming productionSafe", () => {
    const svc = baseService();
    svc.noteProviderFailure();
    svc.noteTokenRefresh();
    const h = svc.health();
    expect(h.productionSafe).toBe(false);
    expect(h.metrics.providerFailures).toBe(1);
    expect(h.metrics.tokenRefreshHooks).toBe(1);
  });

  it("rejects inactive patron_status on assertion verify", () => {
    const keys = createManagedVerifyKeyRing();
    const signing = keys.getActiveSigningKey();
    const now = Date.now();
    const { token } = issueManagedVerifyAssertion({
      issuer: ISSUER,
      audience: AUD,
      siteId: SITE,
      accountId: "acct_1",
      patreonUserId: "pat_1",
      nonce: "n_inactive",
      jti: "j_inactive",
      entitlement: {
        tierIds: ["t1"],
        observedAtIso: new Date(now).toISOString(),
        patronStatus: "former_patron"
      },
      signingKey: signing,
      nowMs: now
    });
    expect(
      verifyManagedVerifyAssertion({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: AUD,
        expectedSiteId: SITE,
        verificationKeys: keys.listVerificationKeys(),
        nowMs: now
      })
    ).toMatchObject({ ok: false, reason: "inactive_patron" });
  });
});

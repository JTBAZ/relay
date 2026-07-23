/**
 * EH-040 Creator-owned Patreon OAuth: state/PKCE, crypto, client mock fetch,
 * campaign identity, link→entitlement, adapter health, open-redirect, SQL review.
 * No live Patreon network. productionSafe remains false.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { scanFixtureTree } from "../src/fixture-scan.js";
import {
  createSiteAdapters,
  createStubAdapters
} from "../template/lib/adapters/index.js";
import { loadEnv } from "../template/lib/env.js";
import {
  PatreonClient,
  PatreonTokenEncryption,
  buildAuthorizeUrl,
  createMemoryPatreonLinkStore,
  decodePatreonTokenKey,
  extractCampaignMembership,
  isCreatorOAuthConfigured,
  isSafeReturnPath,
  linkFromAuthorizationCode,
  loadCreatorOAuthConfig,
  pkceChallengeS256,
  resolvePatreonMode,
  signPatreonOAuthState,
  verifyPatreonOAuthState,
  type PatreonIdentityDocument
} from "../template/lib/patreon/index.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(PACKAGE_ROOT, "template");

const PATREON_ENV_KEYS = [
  "ESCAPE_HATCH_PATREON_MODE",
  "PATREON_CLIENT_ID",
  "PATREON_CLIENT_SECRET",
  "PATREON_REDIRECT_URI",
  "PATREON_CAMPAIGN_ID",
  "ESCAPE_HATCH_PATREON_TOKEN_KEY",
  "ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET",
  "ESCAPE_HATCH_PATREON_AUTHORIZE_URL",
  "ESCAPE_HATCH_PATREON_TOKEN_URL",
  "ESCAPE_HATCH_PATREON_IDENTITY_URL"
] as const;

function clearPatreonEnv(): void {
  for (const k of PATREON_ENV_KEYS) {
    delete process.env[k];
  }
}

function testTokenKeyB64(): string {
  return randomBytes(32).toString("base64");
}

function setCreatorOAuthEnv(overrides?: Record<string, string>): void {
  process.env.ESCAPE_HATCH_PATREON_MODE = "creator_oauth";
  process.env.PATREON_CLIENT_ID = "test_client_id_eh040";
  process.env.PATREON_CLIENT_SECRET = "test_client_secret_eh040_not_real";
  process.env.PATREON_REDIRECT_URI =
    "http://localhost:3001/api/patreon/oauth/callback";
  process.env.PATREON_CAMPAIGN_ID = "999001";
  process.env.ESCAPE_HATCH_PATREON_TOKEN_KEY = testTokenKeyB64();
  process.env.ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET =
    "eh040-state-secret-min16";
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      process.env[k] = v;
    }
  }
}

afterEach(() => {
  clearPatreonEnv();
});

describe("EH-040 status + slice", () => {
  it("advances slice to EH-073 with next EH-074 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-073");
    expect(status.slice).toBe("EH-073");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-074");
    expect(status.nextSlice.title).toMatch(/deploy|wizard/i);
    expect(
      status.blockers.some((b) => /Creator-owned Patreon OAuth.*EH-040/i.test(b))
    ).toBe(false);
    expect(status.blockers.some((b) => /belongs to EH-043/i.test(b))).toBe(
      false
    );
    const cap = status.capabilities.find((c) => c.id === "creator-patreon-oauth");
    expect(cap?.state).toBe("preview_only");
    expect(cap?.nextSlice).toBe("EH-074");
  });
});

describe("EH-040 OAuth state + open redirect", () => {
  const secret = "eh040-state-secret-min16";

  it("signs and verifies state with PKCE verifier", () => {
    const { state, payload } = signPatreonOAuthState({
      siteId: "site_a",
      accountId: "acct_1",
      returnPath: "/account",
      secret
    });
    expect(payload.codeVerifier.length).toBeGreaterThan(20);
    const ok = verifyPatreonOAuthState(state, secret, {
      expectedAccountId: "acct_1",
      expectedSiteId: "site_a"
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.payload.codeVerifier).toBe(payload.codeVerifier);
    }
  });

  it("rejects tampered signature, expiry, and account mismatch", () => {
    const { state } = signPatreonOAuthState({
      siteId: "site_a",
      accountId: "acct_1",
      secret,
      nowMs: 1_000_000
    });
    const parts = state.split(".");
    const tampered = `${parts[0]}.${parts[1]}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
    expect(verifyPatreonOAuthState(tampered, secret).ok).toBe(false);

    const expired = signPatreonOAuthState({
      siteId: "site_a",
      accountId: "acct_1",
      secret,
      ttlMs: 1,
      nowMs: 1_000_000
    });
    expect(
      verifyPatreonOAuthState(expired.state, secret, { nowMs: 1_000_100 }).ok
    ).toBe(false);

    expect(
      verifyPatreonOAuthState(state, secret, {
        expectedAccountId: "other",
        nowMs: 1_000_000
      }).ok
    ).toBe(false);
  });

  it("rejects unsafe return paths", () => {
    expect(isSafeReturnPath("/account")).toBe(true);
    expect(isSafeReturnPath("//evil.example")).toBe(false);
    expect(isSafeReturnPath("https://evil.example")).toBe(false);
    expect(isSafeReturnPath("\\windows")).toBe(false);
  });

  it("PKCE challenge is S256 of verifier", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = pkceChallengeS256(verifier);
    const expected = createHash("sha256")
      .update(verifier, "utf8")
      .digest("base64url");
    expect(challenge).toBe(expected);
  });
});

describe("EH-040 token encryption", () => {
  it("roundtrips and ciphertext differs from plaintext", () => {
    const key = testTokenKeyB64();
    const enc = new PatreonTokenEncryption(key);
    const plain = "refresh_token_plaintext_fixture";
    const cipher = enc.encrypt(plain);
    expect(cipher).not.toContain(plain);
    expect(enc.decrypt(cipher)).toBe(plain);
    expect(decodePatreonTokenKey(key).byteLength).toBe(32);
  });

  it("accepts hex keys", () => {
    const hex = randomBytes(32).toString("hex");
    const enc = new PatreonTokenEncryption(hex);
    expect(enc.decrypt(enc.encrypt("abc"))).toBe("abc");
  });
});

describe("EH-040 PatreonClient mock fetch", () => {
  it("exchangeCode posts form with client_id/secret without leaking secret in errors", async () => {
    let capturedBody = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          access_token: "access_fixture",
          refresh_token: "refresh_fixture",
          expires_in: 3600,
          scope: "identity"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const client = new PatreonClient({
      clientId: "cid",
      clientSecret: "csecret_value",
      tokenUrl: "https://example.test/token",
      fetchImpl
    });
    const tokens = await client.exchangeCode("authcode", "https://cb.test/cb", "verifier");
    expect(tokens.refresh_token).toBe("refresh_fixture");
    expect(capturedBody).toContain("client_id=cid");
    expect(capturedBody).toContain("client_secret=csecret_value");
    expect(capturedBody).toContain("code_verifier=verifier");

    const failClient = new PatreonClient({
      clientId: "cid",
      clientSecret: "csecret_value",
      tokenUrl: "https://example.test/token",
      fetchImpl: async () =>
        new Response("secret_leak_should_not_appear", { status: 401 })
    });
    await expect(failClient.refreshToken("rt")).rejects.toThrow(/status 401/);
    try {
      await failClient.refreshToken("rt");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain("csecret_value");
      expect(msg).not.toContain("secret_leak");
    }
  });
});

describe("EH-040 identity campaign validation", () => {
  const goodDoc: PatreonIdentityDocument = {
    data: { type: "user", id: "user_77" },
    included: [
      {
        type: "member",
        id: "mem_1",
        attributes: { patron_status: "active_patron" },
        relationships: {
          campaign: { data: { type: "campaign", id: "999001" } },
          currently_entitled_tiers: {
            data: [{ type: "tier", id: "tier_gold" }]
          }
        }
      }
    ]
  };

  it("accepts matching campaign and extracts tier ids", () => {
    const m = extractCampaignMembership(goodDoc, "999001");
    expect(m.patreonUserId).toBe("user_77");
    expect(m.tierIds).toEqual(["patreon_tier_tier_gold"]);
    expect(m.campaignMatched).toBe(true);
  });

  it("rejects wrong campaign", () => {
    expect(() => extractCampaignMembership(goodDoc, "000000")).toThrow(
      /No Patreon membership/
    );
  });

  it("rejects non-active patron status for the campaign", () => {
    const former: PatreonIdentityDocument = {
      data: { type: "user", id: "user_77" },
      included: [
        {
          type: "member",
          id: "mem_1",
          attributes: { patron_status: "former_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "999001" } },
            currently_entitled_tiers: {
              data: [{ type: "tier", id: "tier_gold" }]
            }
          }
        }
      ]
    };
    expect(() => extractCampaignMembership(former, "999001")).toThrow(
      /No active Patreon membership/
    );
  });
});

describe("EH-040 link flow + entitlement snapshot", () => {
  it("upserts encrypted credential and patreon entitlement snapshot", async () => {
    const tokenKey = testTokenKeyB64();
    const store = createMemoryPatreonLinkStore();
    const config = {
      mode: "creator_oauth" as const,
      clientId: "cid",
      clientSecret: "csecret",
      redirectUri: "https://cb.test/cb",
      campaignId: "999001",
      tokenKey,
      stateSecret: "eh040-state-secret-min16",
      authorizeUrl: "https://example.test/authorize",
      tokenUrl: "https://example.test/token",
      identityUrl: "https://example.test/identity",
      scopes: "identity"
    };

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access_fixture",
            refresh_token: "refresh_fixture_plain",
            expires_in: 3600,
            scope: "identity"
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          data: { type: "user", id: "user_77" },
          included: [
            {
              type: "member",
              id: "mem_1",
              attributes: { patron_status: "active_patron" },
              relationships: {
                campaign: { data: { type: "campaign", id: "999001" } },
                currently_entitled_tiers: {
                  data: [{ type: "tier", id: "t1" }]
                }
              }
            }
          ]
        }),
        { status: 200 }
      );
    };

    const result = await linkFromAuthorizationCode({
      config,
      store,
      code: "authcode",
      codeVerifier: "verifier",
      siteId: "site_a",
      accountId: "acct_1",
      fetchImpl
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cred = await store.getCredential("site_a", "acct_1");
    expect(cred).not.toBeNull();
    expect(cred!.encryptedRefreshToken).not.toBe("refresh_fixture_plain");
    const enc = new PatreonTokenEncryption(tokenKey);
    expect(enc.decrypt(cred!.encryptedRefreshToken)).toBe(
      "refresh_fixture_plain"
    );

    const snap = await store.getEntitlementSnapshot("site_a", "acct_1");
    expect(snap?.source).toBe("patreon");
    expect(snap?.tierIds).toContain("patreon_tier_t1");
  });

  it("buildAuthorizeUrl includes PKCE challenge", () => {
    const built = buildAuthorizeUrl({
      config: {
        mode: "creator_oauth",
        clientId: "cid",
        clientSecret: "csecret",
        redirectUri: "https://cb.test/cb",
        campaignId: "999001",
        tokenKey: testTokenKeyB64(),
        stateSecret: "eh040-state-secret-min16",
        authorizeUrl: "https://example.test/authorize",
        tokenUrl: "https://example.test/token",
        identityUrl: "https://example.test/identity",
        scopes: "identity"
      },
      siteId: "site_a",
      accountId: "acct_1",
      returnPath: "/account"
    });
    const u = new URL(built.url);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("client_id")).toBe("cid");
  });
});

describe("EH-040 adapter health", () => {
  it("stub when unset; creator_oauth when configured", async () => {
    clearPatreonEnv();
    const stub = createStubAdapters();
    expect(stub.patreon.implementation).toBe("stub");
    const h0 = await stub.patreon.health();
    expect(h0.ok).toBe(false);
    if (!h0.ok) {
      expect(h0.reason).toMatch(/stub|creator_oauth|relay_managed|EH-040|EH-041/i);
    }

    setCreatorOAuthEnv();
    const live = createSiteAdapters();
    expect(live.patreon.implementation).toBe("creator_oauth");
    const h1 = await live.patreon.health();
    expect(h1.ok).toBe(true);
    expect(isCreatorOAuthConfigured(loadEnv())).toBe(true);
    expect(resolvePatreonMode(loadEnv())).toBe("creator_oauth");
    expect(loadCreatorOAuthConfig().campaignId).toBe("999001");
  });

  it("placeholders fail closed", () => {
    setCreatorOAuthEnv({
      PATREON_CLIENT_SECRET: "changeme",
      ESCAPE_HATCH_PATREON_TOKEN_KEY: "replace_me"
    });
    expect(isCreatorOAuthConfigured(loadEnv())).toBe(false);
  });

  it("relay_managed mode without env stays stub with honest reason", async () => {
    process.env.ESCAPE_HATCH_PATREON_MODE = "relay_managed";
    const adapters = createSiteAdapters();
    expect(adapters.patreon.implementation).toBe("stub");
    const h = await adapters.patreon.health();
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.reason).toMatch(/relay_managed|incomplete|kill|EH-041/i);
    }
  });
});

describe("EH-040 SQL + surfaces", () => {
  it("ships 0005 migrations with RLS fail-closed on credentials", () => {
    const a = readFileSync(
      join(TEMPLATE, "db/migrations/0005_patreon_oauth_supabase.sql"),
      "utf8"
    );
    const b = readFileSync(
      join(TEMPLATE, "db/migrations/0005_patreon_oauth_portable.sql"),
      "utf8"
    );
    expect(a).toMatch(/eh_patreon_oauth_credentials/);
    expect(a).toMatch(/eh_patreon_identity_links/);
    expect(a).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(a).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(a).toMatch(/encrypted_refresh_token/);
    expect(a).toMatch(/auth\.uid\(\)/);
    expect(b).toMatch(/eh_private\.current_user_id\(\)/);
    expect(
      existsSync(join(TEMPLATE, "db/docker-init/04_patreon_oauth.sql"))
    ).toBe(true);
    expect(
      existsSync(join(TEMPLATE, "app/api/patreon/oauth/start/route.ts"))
    ).toBe(true);
    expect(
      existsSync(join(TEMPLATE, "app/api/patreon/oauth/callback/route.ts"))
    ).toBe(true);
    expect(existsSync(join(TEMPLATE, "app/admin/patreon/page.tsx"))).toBe(true);
    const startRoute = readFileSync(
      join(TEMPLATE, "app/api/patreon/oauth/start/route.ts"),
      "utf8"
    );
    expect(startRoute).toMatch(/export async function POST/);
    expect(startRoute).toMatch(/status: 405/);
    expect(startRoute).toMatch(/isSameOriginOAuthStart/);
  });

  it("ops + env example document Patreon names only", () => {
    const ops = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    const envEx = readFileSync(join(TEMPLATE, ".env.example"), "utf8");
    const ownership = readFileSync(join(TEMPLATE, "OWNERSHIP.md"), "utf8");
    expect(ops).toMatch(/EH-040/);
    expect(ops).toMatch(/ESCAPE_HATCH_PATREON_TOKEN_KEY/);
    expect(envEx).toMatch(/ESCAPE_HATCH_PATREON_MODE/);
    expect(ownership).toMatch(/EH-040/);
  });
});

describe("EH-040 fixture secret scan still clean", () => {
  it("scans package fixtures without secret findings", () => {
    const report = scanFixtureTree(join(PACKAGE_ROOT, "fixtures"));
    expect(report.findings).toEqual([]);
  });
});

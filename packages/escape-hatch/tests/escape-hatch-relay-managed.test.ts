/**
 * EH-041 Relay-managed Patreon verification (kit): assertion verify,
 * start redirect, replay/kill-switch, adapter health vs stub.
 * No live Patreon / Relay network. productionSafe remains false.
 */

import {
  createPrivateKey,
  generateKeyPairSync,
  sign
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { scanFixtureTree } from "../src/fixture-scan.js";
import { createSiteAdapters } from "../template/lib/adapters/index.js";
import { loadEnv } from "../template/lib/env.js";
import {
  buildRelayManagedStartUrl,
  createMemoryAssertionReplayStore,
  handleRelayManagedCallback,
  isRelayManagedConfigured,
  loadRelayManagedConfig,
  parseAssertionKeysJson,
  RELAY_ASSERTION_ALG,
  signRelayManagedState,
  verifyRelayAssertion,
  type RelayAssertionClaims
} from "../template/lib/patreon/relay-managed/index.js";
import { createMemoryPatreonLinkStore } from "../template/lib/patreon/store.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(PACKAGE_ROOT, "template");
const ISSUER = "https://relay.example/eh-managed-verify";
const AUD = "aud_kit_eh041";
const SITE = "site_kit_eh041";

const RELAY_ENV_KEYS = [
  "ESCAPE_HATCH_PATREON_MODE",
  "ESCAPE_HATCH_RELAY_VERIFY_BASE_URL",
  "ESCAPE_HATCH_RELAY_SITE_ID",
  "ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE",
  "ESCAPE_HATCH_RELAY_ASSERTION_ISSUER",
  "ESCAPE_HATCH_RELAY_ASSERTION_JWKS_URL",
  "ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON",
  "ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET",
  "ESCAPE_HATCH_RELAY_VERIFY_ENABLED",
  "NEXT_PUBLIC_SITE_URL"
] as const;

function clearRelayEnv(): void {
  for (const k of RELAY_ENV_KEYS) delete process.env[k];
}

function mintKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    kid: `kit_${Date.now().toString(36)}`,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString()
  };
}

function signTestAssertion(args: {
  kid: string;
  privateKeyPem: string;
  claims: RelayAssertionClaims;
}): string {
  const header = {
    alg: RELAY_ASSERTION_ALG,
    typ: "JWT",
    kid: args.kid
  };
  const headerB64 = Buffer.from(JSON.stringify(header), "utf8").toString(
    "base64url"
  );
  const payloadB64 = Buffer.from(JSON.stringify(args.claims), "utf8").toString(
    "base64url"
  );
  const input = `${headerB64}.${payloadB64}`;
  const sig = sign(
    null,
    Buffer.from(input, "utf8"),
    createPrivateKey(args.privateKeyPem)
  ).toString("base64url");
  return `${headerB64}.${payloadB64}.${sig}`;
}

function tamperToken(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) return token;
  const raw = Buffer.from(parts[1]!, "base64url");
  raw[0] = raw[0]! ^ 0xff;
  parts[1] = raw.toString("base64url");
  return parts.join(".");
}

function setRelayManagedEnv(
  keysJson: string,
  overrides?: Record<string, string>
) {
  process.env.ESCAPE_HATCH_PATREON_MODE = "relay_managed";
  process.env.ESCAPE_HATCH_RELAY_VERIFY_BASE_URL = "http://localhost:8787";
  process.env.ESCAPE_HATCH_RELAY_SITE_ID = SITE;
  process.env.ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE = AUD;
  process.env.ESCAPE_HATCH_RELAY_ASSERTION_ISSUER = ISSUER;
  process.env.ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON = keysJson;
  process.env.ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET =
    "eh041-relay-state-secret";
  process.env.ESCAPE_HATCH_RELAY_VERIFY_ENABLED = "1";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3001";
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  }
}

afterEach(() => {
  clearRelayEnv();
});

describe("EH-042 status + slice (relay_managed capability)", () => {
  it("advances slice to EH-052 with next EH-053 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-052");
    expect(status.slice).toBe("EH-052");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-053");
    expect(status.nextSlice.title).toMatch(/alternate|billing|recipe/i);
    expect(status.blockers.some((b) => /EH-042/i.test(b))).toBe(false);
    expect(status.blockers.some((b) => /belongs to EH-043/i.test(b))).toBe(
      false
    );
    const cap = status.capabilities.find(
      (c) => c.id === "relay-managed-patreon-verification"
    );
    expect(cap?.state).toBe("preview_only");
    expect(cap?.nextSlice).toBe("EH-053");
  });
});

describe("EH-041 kit assertion verify", () => {
  it("happy path + tamper/expired/wrong aud/iss/replay/kill-switch", async () => {
    const key = mintKey();
    const keysJson = JSON.stringify([
      { kid: key.kid, publicKeyPem: key.publicKeyPem }
    ]);
    setRelayManagedEnv(keysJson);

    const now = Date.now();
    const nowSec = Math.floor(now / 1000);
    const claims: RelayAssertionClaims = {
      iss: ISSUER,
      aud: AUD,
      sub: "pat_1",
      site_id: SITE,
      account_id: "acct_1",
      nonce: "nonce_kit",
      jti: "jti_kit_1",
      iat: nowSec,
      nbf: nowSec,
      exp: nowSec + 120,
      entitlement: {
        tier_ids: ["tier_x"],
        observed_at: new Date(now).toISOString(),
        patron_status: "active_patron"
      }
    };
    const token = signTestAssertion({
      kid: key.kid,
      privateKeyPem: key.privateKeyPem,
      claims
    });

    const keys = parseAssertionKeysJson(keysJson);
    expect(
      verifyRelayAssertion({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: AUD,
        expectedSiteId: SITE,
        expectedNonce: "nonce_kit",
        keys,
        nowMs: now
      }).ok
    ).toBe(true);

    expect(
      verifyRelayAssertion({
        token: tamperToken(token),
        expectedIssuer: ISSUER,
        expectedAudience: AUD,
        expectedSiteId: SITE,
        keys
      }).ok
    ).toBe(false);

    expect(
      verifyRelayAssertion({
        token,
        expectedIssuer: "https://evil",
        expectedAudience: AUD,
        expectedSiteId: SITE,
        keys
      })
    ).toMatchObject({ ok: false, reason: "iss" });

    expect(
      verifyRelayAssertion({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: "wrong",
        expectedSiteId: SITE,
        keys
      })
    ).toMatchObject({ ok: false, reason: "aud" });

    expect(
      verifyRelayAssertion({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: AUD,
        expectedSiteId: SITE,
        keys,
        nowMs: now + 200_000
      })
    ).toMatchObject({ ok: false, reason: "exp" });

    const inactiveClaims: RelayAssertionClaims = {
      ...claims,
      jti: "jti_inactive",
      entitlement: {
        ...claims.entitlement,
        patron_status: "former_patron"
      }
    };
    const inactiveToken = signTestAssertion({
      kid: key.kid,
      privateKeyPem: key.privateKeyPem,
      claims: inactiveClaims
    });
    expect(
      verifyRelayAssertion({
        token: inactiveToken,
        expectedIssuer: ISSUER,
        expectedAudience: AUD,
        expectedSiteId: SITE,
        keys,
        nowMs: now
      })
    ).toMatchObject({ ok: false, reason: "inactive_patron" });

    const config = loadRelayManagedConfig();
    const signed = signRelayManagedState({
      siteId: SITE,
      accountId: "acct_1",
      secret: config.stateSecret,
      nowMs: now
    });
    const claims2: RelayAssertionClaims = {
      ...claims,
      nonce: signed.payload.nonce,
      jti: "jti_kit_2"
    };
    const token2 = signTestAssertion({
      kid: key.kid,
      privateKeyPem: key.privateKeyPem,
      claims: claims2
    });

    const store = createMemoryPatreonLinkStore();
    const replay = createMemoryAssertionReplayStore();
    const first = await handleRelayManagedCallback({
      config,
      store,
      replay,
      assertion: token2,
      state: signed.state,
      expectedAccountId: "acct_1",
      expectedSiteId: SITE,
      nowMs: now
    });
    expect(first.ok).toBe(true);

    const replayed = await handleRelayManagedCallback({
      config,
      store,
      replay,
      assertion: token2,
      state: signed.state,
      expectedAccountId: "acct_1",
      expectedSiteId: SITE,
      nowMs: now
    });
    expect(replayed).toMatchObject({ ok: false, reason: "replay" });

    setRelayManagedEnv(keysJson, { ESCAPE_HATCH_RELAY_VERIFY_ENABLED: "0" });
    expect(isRelayManagedConfigured(loadEnv())).toBe(false);
  });

  it("build start URL rejects credentialed return URLs", () => {
    const key = mintKey();
    const keysJson = JSON.stringify([
      { kid: key.kid, publicKeyPem: key.publicKeyPem }
    ]);
    setRelayManagedEnv(keysJson);
    const config = loadRelayManagedConfig();
    const bad = buildRelayManagedStartUrl({
      config,
      siteId: SITE,
      accountId: "a",
      returnUrl: "https://user:pass@evil.example/cb"
    });
    expect(bad.ok).toBe(false);

    const good = buildRelayManagedStartUrl({
      config,
      siteId: SITE,
      accountId: "a",
      returnUrl: "http://localhost:3001/api/patreon/relay/callback"
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.url).toMatch(/managed-verify\/start/);
      expect(good.url).toMatch(/site_id=/);
      expect(good.url).not.toMatch(/private_key|refresh_token/i);
    }
  });
});

describe("EH-041 adapter health", () => {
  it("relay_managed vs stub", async () => {
    clearRelayEnv();
    const stub = createSiteAdapters();
    expect(stub.patreon.implementation).toBe("stub");

    const key = mintKey();
    const keysJson = JSON.stringify([
      { kid: key.kid, publicKeyPem: key.publicKeyPem }
    ]);
    setRelayManagedEnv(keysJson);
    const relay = createSiteAdapters();
    expect(relay.patreon.implementation).toBe("relay_managed");
    const h = await relay.patreon.health();
    expect(h.ok).toBe(true);

    clearRelayEnv();
    process.env.ESCAPE_HATCH_PATREON_MODE = "relay_managed";
    const incomplete = createSiteAdapters();
    expect(incomplete.patreon.implementation).toBe("stub");
    const h2 = await incomplete.patreon.health();
    expect(h2.ok).toBe(false);
  });
});

describe("EH-041 surfaces + docs", () => {
  it("ships relay routes and documents env names", () => {
    expect(
      existsSync(join(TEMPLATE, "app/api/patreon/relay/start/route.ts"))
    ).toBe(true);
    expect(
      existsSync(join(TEMPLATE, "app/api/patreon/relay/callback/route.ts"))
    ).toBe(true);
    const start = readFileSync(
      join(TEMPLATE, "app/api/patreon/relay/start/route.ts"),
      "utf8"
    );
    expect(start).toMatch(/export async function POST/);
    expect(start).toMatch(/status: 405/);
    const ops = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    const envEx = readFileSync(join(TEMPLATE, ".env.example"), "utf8");
    expect(ops).toMatch(/EH-041/);
    expect(ops).toMatch(/ESCAPE_HATCH_RELAY_ASSERTION_ISSUER/);
    expect(ops).toMatch(/Privacy|data-processing/i);
    expect(envEx).toMatch(/ESCAPE_HATCH_RELAY_VERIFY_BASE_URL/);
    expect(envEx).toMatch(/ESCAPE_HATCH_RELAY_VERIFY_ENABLED/);
  });
});

describe("EH-041 fixture secret scan still clean", () => {
  it("scans package fixtures without secret findings", () => {
    const report = scanFixtureTree(join(PACKAGE_ROOT, "fixtures"));
    expect(report.findings).toEqual([]);
  });
});

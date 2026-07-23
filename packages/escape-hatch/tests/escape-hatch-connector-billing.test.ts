/**
 * EH-042 kit honesty — connector billing observation + status advance.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSiteAdapters } from "../template/lib/adapters/index.js";
import {
  observeConnectorBilling
} from "../template/lib/patreon/relay-managed/billing.js";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";

const TEMPLATE = join(__dirname, "..", "template");
const SITE = "site_billing_kit";

function clearBillingEnv() {
  delete process.env.ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED;
  delete process.env.ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS;
  delete process.env.ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE;
  delete process.env.ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED;
  delete process.env.ESCAPE_HATCH_PATREON_MODE;
  delete process.env.ESCAPE_HATCH_RELAY_VERIFY_BASE_URL;
  delete process.env.ESCAPE_HATCH_RELAY_SITE_ID;
  delete process.env.ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE;
  delete process.env.ESCAPE_HATCH_RELAY_ASSERTION_ISSUER;
  delete process.env.ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON;
  delete process.env.ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET;
  delete process.env.ESCAPE_HATCH_RELAY_VERIFY_ENABLED;
  delete process.env.NEXT_PUBLIC_SITE_URL;
}

afterEach(() => {
  clearBillingEnv();
});

describe("EH-042 status", () => {
  it("advances slice to EH-073 with next EH-074 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-073");
    expect(status.slice).toBe("EH-073");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-074");
    expect(status.nextSlice.title).toMatch(/deploy|wizard/i);
    expect(status.blockers.some((b) => /EH-042/i.test(b))).toBe(false);
    expect(status.blockers.some((b) => /belongs to EH-043/i.test(b))).toBe(
      false
    );
    const cap = status.capabilities.find(
      (c) => c.id === "relay-managed-connector-billing"
    );
    expect(cap?.state).toBe("preview_only");
    expect(cap?.nextSlice).toBe("EH-074");
    expect(cap?.evidence).toMatch(/webhook|grace|feature flag/i);
  });
});

describe("EH-042 connector billing observation", () => {
  it("unset status defaults active; flag off and cancelled deny", () => {
    clearBillingEnv();
    const unset = observeConnectorBilling(process.env);
    expect(unset.state).toBe("active");
    expect(unset.canUseRelayManaged).toBe(true);

    process.env.ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED = "0";
    const off = observeConnectorBilling(process.env);
    expect(off.canUseRelayManaged).toBe(false);
    expect(off.billingFeatureEnabled).toBe(false);

    process.env.ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED = "1";
    process.env.ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS = "cancelled";
    process.env.ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE = "2026-08-01";
    const cancelled = observeConnectorBilling(process.env);
    expect(cancelled.canUseRelayManaged).toBe(false);
    expect(cancelled.staleWarning).toMatch(/2026-08-01/);
    expect(cancelled.patronsPreserved).toBe(true);
    expect(cancelled.migrationHint).toMatch(/creator_oauth/i);
  });

  it("relay_managed health degrades when billing denied; creator_oauth unaffected", async () => {
    clearBillingEnv();
    const { generateKeyPairSync } = await import("node:crypto");
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const kid = "kit_eh042";
    process.env.ESCAPE_HATCH_PATREON_MODE = "relay_managed";
    process.env.ESCAPE_HATCH_RELAY_VERIFY_BASE_URL = "http://localhost:8787";
    process.env.ESCAPE_HATCH_RELAY_SITE_ID = SITE;
    process.env.ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE = "aud";
    process.env.ESCAPE_HATCH_RELAY_ASSERTION_ISSUER =
      "https://relay.local/eh-managed-verify";
    process.env.ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON = JSON.stringify([
      { kid, publicKeyPem }
    ]);
    process.env.ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET =
      "eh042-kit-state-secret";
    process.env.ESCAPE_HATCH_RELAY_VERIFY_ENABLED = "1";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3001";
    process.env.ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS = "none";

    const denied = createSiteAdapters();
    expect(denied.patreon.implementation).toBe("relay_managed");
    const hDenied = await denied.patreon.health();
    expect(hDenied.ok).toBe(false);
    if (!hDenied.ok) {
      expect(hDenied.reason).toMatch(/billing|entitlement|denied/i);
    }

    // creator_oauth path ignores connector billing
    clearBillingEnv();
    process.env.ESCAPE_HATCH_PATREON_MODE = "creator_oauth";
    process.env.PATREON_CLIENT_ID = "test_client_id_eh042";
    process.env.PATREON_CLIENT_SECRET = "test_client_secret_eh042_not_real";
    process.env.PATREON_REDIRECT_URI =
      "http://localhost:3001/api/patreon/oauth/callback";
    process.env.PATREON_CAMPAIGN_ID = "12345";
    process.env.ESCAPE_HATCH_PATREON_TOKEN_KEY = Buffer.alloc(32, 7).toString(
      "base64"
    );
    process.env.ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET =
      "eh042-oauth-state-secret";
    process.env.ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED = "0";
    const creator = createSiteAdapters();
    expect(creator.patreon.implementation).toBe("creator_oauth");
    const hCreator = await creator.patreon.health();
    expect(hCreator.ok).toBe(true);
  });
});

describe("EH-042 docs + admin honesty", () => {
  it("documents observation env names and admin billing section", () => {
    const envExample = readFileSync(join(TEMPLATE, ".env.example"), "utf8");
    expect(envExample).toMatch(/ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS/);
    expect(envExample).toMatch(/ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE/);
    const ops = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    expect(ops).toMatch(/EH-042/);
    expect(ops).toMatch(/go stale/);
    expect(ops).toMatch(/creator_oauth/);
    const admin = readFileSync(
      join(TEMPLATE, "app/admin/patreon/page.tsx"),
      "utf8"
    );
    expect(admin).toMatch(/observeConnectorBilling/);
    expect(admin).toMatch(/EH-042/);
    expect(admin).toMatch(/EH-043/);
    expect(
      existsSync(
        join(TEMPLATE, "lib/patreon/relay-managed/billing.ts")
      )
    ).toBe(true);
  });
});

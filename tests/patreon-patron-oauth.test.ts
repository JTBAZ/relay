import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

const identityFixture = {
  data: {
    type: "user",
    id: "patron_user_1",
    attributes: { email: "patron@example.com", full_name: "Pat" }
  },
  included: [
    {
      type: "member",
      id: "mem-a",
      attributes: { patron_status: "active_patron" },
      relationships: {
        campaign: { data: { type: "campaign", id: "555555" } },
        currently_entitled_tiers: {
          data: [{ type: "tier", id: "9876" }]
        }
      }
    }
  ]
};

describe("Patreon patron OAuth exchange", () => {
  it("exchanges code, fetches identity, syncs tiers, returns session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patron-oauth-"));
    const encryptionKey = randomBytes(32).toString("base64");

    const fetchImpl: typeof fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("oauth2/token")) {
          return new Response(
            JSON.stringify({
              access_token: "patron_access_tmp",
              refresh_token: "patron_refresh_tmp",
              expires_in: 3600
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("/api/oauth2/v2/identity")) {
          expect(init?.headers).toBeDefined();
          return new Response(JSON.stringify(identityFixture), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response("{}", { status: 200 });
      }
    ) as unknown as typeof fetch;

    const { app } = createApp({
      patreon_client_id: "cid",
      patreon_client_secret: "sec",
      patreon_token_url: "https://www.patreon.com/api/oauth2/token",
      relay_token_encryption_key: encryptionKey,
      credential_store_path: join(tempDir, "patreon_credentials.json"),
      ingest_canonical_path: join(tempDir, "canonical.json"),
      ingest_dlq_path: join(tempDir, "ingest_dlq.json"),
      export_storage_root: join(tempDir, "exports"),
      gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
      gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
      analytics_store_path: join(tempDir, "analytics.json"),
      clone_store_path: join(tempDir, "clone_sites.json"),
      identity_store_path: join(tempDir, "identity.json"),
      payment_store_path: join(tempDir, "payments.json"),
      migration_store_path: join(tempDir, "migrations.json"),
      deploy_store_path: join(tempDir, "deploys.json"),
      fetch_impl: fetchImpl
    });

    const res = await request(app)
      .post("/api/v1/auth/patreon/patron/exchange")
      .send({
        creator_id: "cr_patron_test",
        patreon_campaign_numeric_id: "555555",
        code: "oauth_code_xyz",
        redirect_uri: "http://localhost:3000/patreon/patron/callback"
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      auth_provider: "patreon",
      patreon_user_id: "patron_user_1",
      tier_ids: ["patreon_tier_9876"]
    });
    expect(res.body.data.token).toMatch(/^sess_/);

    const loginAgain = await request(app).post("/api/v1/identity/login-patreon").send({
      creator_id: "cr_patron_test",
      patreon_user_id: "patron_user_1"
    });
    expect(loginAgain.status).toBe(200);
    expect(loginAgain.body.data.tier_ids).toEqual(["patreon_tier_9876"]);
  });

  it("rejects non-numeric campaign id", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patron-oauth-bad-"));
    const encryptionKey = randomBytes(32).toString("base64");

    const { app } = createApp({
      patreon_client_id: "cid",
      patreon_client_secret: "sec",
      relay_token_encryption_key: encryptionKey,
      credential_store_path: join(tempDir, "patreon_credentials.json"),
      ingest_canonical_path: join(tempDir, "canonical.json"),
      ingest_dlq_path: join(tempDir, "ingest_dlq.json"),
      export_storage_root: join(tempDir, "exports"),
      gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
      gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
      analytics_store_path: join(tempDir, "analytics.json"),
      clone_store_path: join(tempDir, "clone_sites.json"),
      identity_store_path: join(tempDir, "identity.json"),
      payment_store_path: join(tempDir, "payments.json"),
      migration_store_path: join(tempDir, "migrations.json"),
      deploy_store_path: join(tempDir, "deploys.json"),
      fetch_impl: vi.fn() as unknown as typeof fetch
    });

    const res = await request(app)
      .post("/api/v1/auth/patreon/patron/exchange")
      .send({
        creator_id: "c",
        patreon_campaign_numeric_id: "not-a-number",
        code: "x",
        redirect_uri: "http://localhost/cb"
      });

    expect(res.status).toBe(400);
  });
});

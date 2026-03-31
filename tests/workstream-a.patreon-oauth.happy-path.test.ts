import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

describe("Workstream A happy path", () => {
  it("exchanges patreon code and persists encrypted tokens", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-a-"));
    const credentialStorePath = join(tempDir, "patreon_credentials.json");
    const encryptionKey = randomBytes(32).toString("base64");

    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          access_token: "access_abc",
          refresh_token: "refresh_abc",
          expires_in: 3600
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }) as unknown as typeof fetch;

    const { app } = createApp({
      patreon_client_id: "client_id",
      patreon_client_secret: "client_secret",
      patreon_token_url: "https://example.com/oauth/token",
      relay_token_encryption_key: encryptionKey,
      credential_store_path: credentialStorePath,
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

    const response = await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "creator_123",
      code: "oauth_code_123",
      redirect_uri: "https://relay.example/auth/callback"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        creator_id: "creator_123",
        credential_health_status: "healthy"
      },
      meta: {
        trace_id: expect.any(String)
      }
    });

    const persistedRaw = await readFile(credentialStorePath, "utf8");
    const persisted = JSON.parse(persistedRaw) as {
      records: Record<
        string,
        {
          encrypted_access_token: string;
          encrypted_refresh_token: string;
          credential_health_status: string;
        }
      >;
    };

    expect(persisted.records.creator_123).toBeDefined();
    expect(persisted.records.creator_123.credential_health_status).toBe("healthy");
    expect(persisted.records.creator_123.encrypted_access_token).not.toContain("access_abc");
    expect(persisted.records.creator_123.encrypted_refresh_token).not.toContain("refresh_abc");
  });
});

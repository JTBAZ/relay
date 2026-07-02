import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { RELAY_TIER_PUBLIC } from "../../src/patreon/relay-access-tiers.js";
import { createApp } from "../../src/server.js";

function baseFileConfig(tempDir: string) {
  return {
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    export_storage_root: join(tempDir, "exports"),
    gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
    gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
    collections_store_path: join(tempDir, "collections.json"),
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

function fileIdentityApp(tempDir: string) {
  return createApp(baseFileConfig(tempDir));
}

async function loginPatron(app: ReturnType<typeof createApp>["app"]): Promise<string> {
  await request(app).post("/api/v1/identity/register").send({
    creator_id: "patron_search_test",
    email: "search@example.com",
    password: "hunter2hunter2",
    tier_ids: [RELAY_TIER_PUBLIC]
  });
  const login = await request(app).post("/api/v1/identity/login").send({
    creator_id: "patron_search_test",
    email: "search@example.com",
    password: "hunter2hunter2"
  });
  expect(login.status).toBe(200);
  return login.body.data.token as string;
}

describe("GET /api/v1/patron/search (PGS-04)", () => {
  it("401 without Bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patron-search-401-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/patron/search").query({ q: "fox" });
    expect(res.status).toBe(401);
  });

  it("503 when file identity (no DB profile store)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patron-search-503-"));
    const { app } = fileIdentityApp(tempDir);
    const token = await loginPatron(app);
    const res = await request(app)
      .get("/api/v1/patron/search")
      .query({ q: "fox" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("NOT_AVAILABLE");
  });
});

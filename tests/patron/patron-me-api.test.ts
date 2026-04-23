import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server.js";
import { RELAY_TIER_PUBLIC } from "../../src/patreon/relay-access-tiers.js";

function fileIdentityApp(tempDir: string) {
  return createApp({
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
  });
}

describe("GET/PATCH /api/v1/patron/me", () => {
  it("401 without Bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patron-me-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/patron/me");
    expect(res.status).toBe(401);
  });

  it("503 when file identity (no DB profile store)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patron-me-"));
    const { app } = fileIdentityApp(tempDir);
    await request(app).post("/api/v1/identity/register").send({
      creator_id: "cme",
      email: "me@example.com",
      password: "hunter2hunter2",
      tier_ids: [RELAY_TIER_PUBLIC]
    });
    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cme",
      email: "me@example.com",
      password: "hunter2hunter2"
    });
    expect(login.status).toBe(200);
    const token = login.body.data.token as string;

    const get = await request(app).get("/api/v1/patron/me").set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(503);
    expect(get.body.error.code).toBe("NOT_AVAILABLE");

    const patch = await request(app)
      .patch("/api/v1/patron/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ display_name: "X" });
    expect(patch.status).toBe(503);

    const follows = await request(app).get("/api/v1/patron/follows").set("Authorization", `Bearer ${token}`);
    expect(follows.status).toBe(503);
    expect(follows.body.error.code).toBe("NOT_AVAILABLE");

    const acctFollows = await request(app)
      .get("/api/v1/patron/account-follows")
      .set("Authorization", `Bearer ${token}`);
    expect(acctFollows.status).toBe(503);
    expect(acctFollows.body.error.code).toBe("NOT_AVAILABLE");
  });
});

describe("GET /api/v1/patron/follows", () => {
  it("401 without Bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patron-follows-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/patron/follows");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/patron/account-follows", () => {
  it("401 without Bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patron-acct-follows-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/patron/account-follows");
    expect(res.status).toBe(401);
  });
});

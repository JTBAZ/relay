/**
 * P8-sec-002 — Patron session must not read or mutate another creator’s scope (403).
 * File-backed identity: `loadPatronAuthContext(undefined, session)` allowlists only `session.creator_id`.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server.js";
import { RELAY_TIER_PUBLIC } from "../../src/patreon/relay-access-tiers.js";

const CREATOR_A = "p8_tenant_a";
const CREATOR_B = "p8_tenant_b";

function isolationApp(tempDir: string) {
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

async function registerAndLogin(app: ReturnType<typeof isolationApp>["app"], creatorId: string) {
  await request(app).post("/api/v1/identity/register").send({
    creator_id: creatorId,
    email: `patron-${creatorId}@example.com`,
    password: "hunter2hunter2",
    tier_ids: [RELAY_TIER_PUBLIC]
  });
  const login = await request(app).post("/api/v1/identity/login").send({
    creator_id: creatorId,
    email: `patron-${creatorId}@example.com`,
    password: "hunter2hunter2"
  });
  expect(login.status).toBe(200);
  return login.body.data.token as string;
}

describe("security / cross-tenant isolation (patron)", () => {
  it("rejects favorites + collections reads for a foreign creator_id (403)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-p8-iso-"));
    const { app } = isolationApp(tempDir);
    const token = await registerAndLogin(app, CREATOR_A);

    const fav = await request(app)
      .get(`/api/v1/patron/favorites?creator_id=${encodeURIComponent(CREATOR_B)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(fav.status).toBe(403);
    expect(fav.body.error?.code).toBe("FORBIDDEN");

    const cols = await request(app)
      .get(`/api/v1/patron/collections?creator_id=${encodeURIComponent(CREATOR_B)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(cols.status).toBe(403);
    expect(cols.body.error?.code).toBe("FORBIDDEN");
  });

  it("rejects favorites mutation body with foreign creator_id (403)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-p8-iso-"));
    const { app } = isolationApp(tempDir);
    const token = await registerAndLogin(app, CREATOR_A);

    const put = await request(app)
      .put("/api/v1/patron/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({
        creator_id: CREATOR_B,
        target_kind: "post",
        target_id: "any_post"
      });
    expect(put.status).toBe(403);
    expect(put.body.error?.code).toBe("FORBIDDEN");
  });

  it("rejects new collection for a foreign creator_id (403)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-p8-iso-"));
    const { app } = isolationApp(tempDir);
    const token = await registerAndLogin(app, CREATOR_A);

    const post = await request(app)
      .post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: CREATOR_B, title: "Stolen shelf" });
    expect(post.status).toBe(403);
    expect(post.body.error?.code).toBe("FORBIDDEN");
  });

  it("rejects entitlements health probe for a foreign creator_id (403)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-p8-iso-"));
    const { app } = isolationApp(tempDir);
    const token = await registerAndLogin(app, CREATOR_A);

    const health = await request(app)
      .get(`/api/v1/patron/entitlements/health?creator_id=${encodeURIComponent(CREATOR_B)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(health.status).toBe(403);
    expect(health.body.error?.code).toBe("FORBIDDEN");
  });
});

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";

function testApp(tempDir: string) {
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
    patron_collections_store_path: join(tempDir, "patron_collections.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

async function seedAndAuth(tempDir: string) {
  const { app } = testApp(tempDir);
  await request(app)
    .post("/api/v1/ingest/batches?process_sync=true")
    .send({
      creator_id: "cpc",
      tiers: [],
      posts: [
        {
          post_id: "p_c",
          title: "Batch",
          published_at: "2026-03-10T12:00:00Z",
          tag_ids: [],
          tier_ids: [RELAY_TIER_PUBLIC],
          upstream_revision: "v1",
          media: [
            { media_id: "m_1", mime_type: "image/png", upstream_revision: "a" },
            { media_id: "m_2", mime_type: "image/png", upstream_revision: "b" }
          ]
        }
      ]
    });
  await request(app).post("/api/v1/identity/register").send({
    creator_id: "cpc",
    email: "col@example.com",
    password: "hunter2hunter2",
    tier_ids: [RELAY_TIER_PUBLIC]
  });
  const login = await request(app).post("/api/v1/identity/login").send({
    creator_id: "cpc",
    email: "col@example.com",
    password: "hunter2hunter2"
  });
  const token = login.body.data.token as string;
  return { app, token };
}

describe("Patron collections API", () => {
  it("401 without Bearer; CRUD collection; add/remove entry; rejects bad link", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-api-"));
    const { app, token } = await seedAndAuth(tempDir);

    const nope = await request(app).get("/api/v1/patron/collections?creator_id=cpc");
    expect(nope.status).toBe(401);

    const empty = await request(app)
      .get("/api/v1/patron/collections?creator_id=cpc")
      .set("Authorization", `Bearer ${token}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.collections).toEqual([]);

    const mk = await request(app)
      .post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", title: "Characters" });
    expect(mk.status).toBe(201);
    const colId = mk.body.data.collection.collection_id as string;

    const badEntry = await request(app)
      .post(`/api/v1/patron/collections/${colId}/entries`)
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", post_id: "p_c", media_id: "nope" });
    expect(badEntry.status).toBe(400);

    const add = await request(app)
      .post(`/api/v1/patron/collections/${colId}/entries`)
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", post_id: "p_c", media_id: "m_1" });
    expect(add.status).toBe(200);

    const list = await request(app)
      .get("/api/v1/patron/collections?creator_id=cpc")
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data.collections[0].entries).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/v1/patron/collections/${colId}/entries`)
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", post_id: "p_c", media_id: "m_1" });
    expect(del.status).toBe(200);

    const delCol = await request(app)
      .delete(`/api/v1/patron/collections/${colId}?creator_id=cpc`)
      .set("Authorization", `Bearer ${token}`);
    expect(delCol.status).toBe(200);
  });
});

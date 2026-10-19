import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { FileCanonicalStore } from "../src/ingest/canonical-store.js";
import { FilePatronCollectionsStore } from "../src/gallery/patron-collections-store.js";
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
  afterEach(() => vi.restoreAllMocks());

  it("retries a failed catalog read with the same key and persists one entry after recovery", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-read-retry-"));
    const { app, token } = await seedAndAuth(tempDir);
    const created = await request(app).post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`).send({ creator_id: "cpc", title: "Saved art" });
    expect(created.status).toBe(201);
    const collectionId = created.body.data.collection.collection_id;
    const load = vi.spyOn(FileCanonicalStore.prototype, "load").mockRejectedValueOnce(new Error("Catalog unavailable"));
    const write = vi.spyOn(FilePatronCollectionsStore.prototype, "addEntry");
    const send = () => request(app).post(`/api/v1/patron/collections/${collectionId}/entries`)
      .set("Authorization", `Bearer ${token}`).set("Idempotency-Key", "catalog-recovery")
      .send({ creator_id: "cpc", post_id: "p_c", media_id: "m_1" });
    const failed = await send();
    expect(failed.status).toBe(503);
    expect(load).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    const persisted = new FilePatronCollectionsStore(join(tempDir, "patron_collections.json"));
    expect((await persisted.load()).entries).toHaveLength(0);
    const retry = await send();
    expect(retry.status).toBe(200);
    expect(retry.headers["idempotency-replayed"]).toBeUndefined();
    const replay = await send();
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body).toEqual(retry.body);
    expect(write).toHaveBeenCalledTimes(1);
    expect((await persisted.load()).entries).toHaveLength(1);
  });

  it("protects an entry committed before its store call reports a failure", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-uncertain-retry-"));
    const { app, token } = await seedAndAuth(tempDir);
    const created = await request(app).post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`).send({ creator_id: "cpc", title: "Saved art" });
    expect(created.status).toBe(201);
    const addEntry = FilePatronCollectionsStore.prototype.addEntry;
    const write = vi.spyOn(FilePatronCollectionsStore.prototype, "addEntry").mockImplementationOnce(
      async function (this: FilePatronCollectionsStore, ...args: Parameters<typeof addEntry>) {
        await addEntry.apply(this, args);
        throw new Error("Follow-up failed after saving");
      }
    );
    const send = () => request(app).post(`/api/v1/patron/collections/${created.body.data.collection.collection_id}/entries`)
      .set("Authorization", `Bearer ${token}`).set("Idempotency-Key", "uncertain-entry")
      .send({ creator_id: "cpc", post_id: "p_c", media_id: "m_1" });
    const failed = await send();
    expect(failed.status).toBe(404);
    const replay = await send();
    expect(replay.status).toBe(404);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body).toEqual(failed.body);
    expect(write).toHaveBeenCalledTimes(1);
    const persisted = new FilePatronCollectionsStore(join(tempDir, "patron_collections.json"));
    expect((await persisted.load()).entries).toHaveLength(1);
  });

  it("isolates authenticated callers sharing a retry key and rejects unauthenticated replay", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-retry-"));
    const { app, token } = await seedAndAuth(tempDir);
    await request(app).post("/api/v1/identity/register").send({
      creator_id: "cpc", email: "other@example.com", password: "hunter2hunter2", tier_ids: [RELAY_TIER_PUBLIC]
    });
    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cpc", email: "other@example.com", password: "hunter2hunter2"
    });
    expect(login.status).toBe(200);
    const body = { creator_id: "cpc", title: "Characters" };
    const first = await request(app).post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`).set("Idempotency-Key", "shared-create").send(body);
    expect(first.status).toBe(201);
    const second = await request(app).post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${login.body.data.token}`).set("Idempotency-Key", "shared-create").send(body);
    expect(second.status).toBe(201);
    expect(second.body.data.collection.collection_id).not.toBe(first.body.data.collection.collection_id);
    expect(second.body.data.collection.user_id).not.toBe(first.body.data.collection.user_id);
    expect(second.headers["idempotency-replayed"]).toBeUndefined();
    const replay = await request(app).post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`).set("Idempotency-Key", "shared-create").send(body);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    const unauthorized = await request(app).post("/api/v1/patron/collections")
      .set("Idempotency-Key", "shared-create").send(body);
    expect(unauthorized.status).toBe(401);
  });

  it("writes entries to both collection targets when their retry key and body match", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-target-retry-"));
    const { app, token } = await seedAndAuth(tempDir);
    const collectionIds: string[] = [];
    for (const title of ["First", "Second"]) {
      const created = await request(app).post("/api/v1/patron/collections")
        .set("Authorization", `Bearer ${token}`).send({ creator_id: "cpc", title });
      expect(created.status).toBe(201);
      collectionIds.push(created.body.data.collection.collection_id);
    }
    for (const collectionId of collectionIds) {
      const added = await request(app).post(`/api/v1/patron/collections/${collectionId}/entries`)
        .set("Authorization", `Bearer ${token}`).set("Idempotency-Key", "shared-add")
        .send({ creator_id: "cpc", post_id: "p_c", media_id: "m_1" });
      expect(added.status).toBe(200);
      expect(added.body.data.entry.collection_id).toBe(collectionId);
      expect(added.headers["idempotency-replayed"]).toBeUndefined();
    }
    const listed = await request(app).get("/api/v1/patron/collections?creator_id=cpc")
      .set("Authorization", `Bearer ${token}`);
    expect(listed.body.data.collections).toHaveLength(2);
    expect(listed.body.data.collections.every((collection: { entries: unknown[] }) => collection.entries.length === 1)).toBe(true);
  });

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

  it("PATCH toggles is_public; GET /collections/all round-trips enriched collections", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-api-"));
    const { app, token } = await seedAndAuth(tempDir);

    const mk = await request(app)
      .post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", title: "Shelf" });
    expect(mk.status).toBe(201);
    const colId = mk.body.data.collection.collection_id as string;

    const pub = await request(app)
      .patch(`/api/v1/patron/collections/${colId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", is_public: true });
    expect(pub.status).toBe(200);
    expect(pub.body.data.collection.is_public).toBe(true);

    const add = await request(app)
      .post(`/api/v1/patron/collections/${colId}/entries`)
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", post_id: "p_c", media_id: "m_1" });
    expect(add.status).toBe(200);

    const list = await request(app)
      .get("/api/v1/patron/collections?creator_id=cpc")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.collections).toHaveLength(1);
    expect(list.body.data.collections[0].collection_id).toBe(colId);
    expect(list.body.data.collections[0].is_public).toBe(true);
    expect(list.body.data.collections[0].entries).toHaveLength(1);
    expect(list.body.data.collections[0].entries[0].viewer_entitlement).toMatchObject({
      state: "visible"
    });

    const all = await request(app)
      .get("/api/v1/patron/collections/all")
      .set("Authorization", `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(Array.isArray(all.body.data.collections)).toBe(true);
    expect(all.body.data.collections).toHaveLength(1);
    expect(all.body.data.collections[0].collection_id).toBe(colId);
    expect(all.body.data.collections[0].entries).toHaveLength(1);
    expect(all.body.data.collections[0].entries[0].viewer_entitlement).toMatchObject({
      state: "visible"
    });
  });

  it("rejects PATCH with foreign creator_id (403)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-api-"));
    const { app, token } = await seedAndAuth(tempDir);

    const mk = await request(app)
      .post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", title: "Mine" });
    const colId = mk.body.data.collection.collection_id as string;

    const foreign = await request(app)
      .patch(`/api/v1/patron/collections/${colId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "other_creator", is_public: true });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error?.code).toBe("FORBIDDEN");
  });

  it("GET /collections/:id returns owner detail with thumb for visible entries", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-api-"));
    const { app, token } = await seedAndAuth(tempDir);

    const mk = await request(app)
      .post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", title: "Gallery" });
    const colId = mk.body.data.collection.collection_id as string;

    await request(app)
      .post(`/api/v1/patron/collections/${colId}/entries`)
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", post_id: "p_c", media_id: "m_1" });

    const detail = await request(app)
      .get(`/api/v1/patron/collections/${colId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.collection.collection_id).toBe(colId);
    expect(detail.body.data.collection.title).toBe("Gallery");
    expect(detail.body.data.collection.entries).toHaveLength(1);
    expect(detail.body.data.collection.entries[0]).toMatchObject({
      media_id: "m_1",
      source_post_title: "Batch",
      mime_type: "image/png",
      viewer_entitlement: { state: "visible" },
      thumb_url_path: "/api/v1/export/media/cpc/m_1/thumb",
      // The owner is entitled, so the full content URL is now included.
      content_url_path: "/api/v1/export/media/cpc/m_1/content"
    });
  });

  it("GET /collections/:id returns 404 for another patron's collection", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pcol-api-"));
    const { app, token } = await seedAndAuth(tempDir);

    const mk = await request(app)
      .post("/api/v1/patron/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cpc", title: "Private shelf" });
    const colId = mk.body.data.collection.collection_id as string;

    await request(app).post("/api/v1/identity/register").send({
      creator_id: "cpc",
      email: "other@example.com",
      password: "hunter2hunter2",
      tier_ids: [RELAY_TIER_PUBLIC],
    });
    const otherLogin = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cpc",
      email: "other@example.com",
      password: "hunter2hunter2",
    });
    const otherToken = otherLogin.body.data.token as string;

    const foreign = await request(app)
      .get(`/api/v1/patron/collections/${colId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error?.code).toBe("NOT_FOUND");
  });
});

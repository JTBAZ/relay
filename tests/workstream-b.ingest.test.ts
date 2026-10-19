import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { IngestOwnershipConflict } from "../src/ingest/ownership-conflict.js";
import { ingestIdempotencyKey, legacyIngestIdempotencyKey } from "../src/ingest/idempotency.js";
import { createApp } from "../src/server.js";

function baseConfig(tempDir: string) {
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
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

const samplePost = (revision: string) => ({
  post_id: "post_1",
  title: "Episode 5",
  published_at: "2026-03-30T12:00:00Z",
  tag_ids: ["tag_story"],
  tier_ids: ["tier_gold"],
  upstream_revision: revision,
  media: [
    {
      media_id: "media_1",
      mime_type: "image/png",
      upstream_revision: "mrev_1"
    }
  ]
});

describe("Workstream B ingest", () => {
  it.each(["canonical", "subscribestar"])("returns a private ownership conflict for synchronous %s ingest", async (provider) => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ownership-http-"));
    const conflict = new IngestOwnershipConflict({ entity_type: "post", entity_id: "private_post_id", owner_creator_id: "private_owner_id" });
    const failure = vi.spyOn(IngestService.prototype, "runBatch").mockRejectedValueOnce(conflict);
    vi.stubEnv("SUBSCRIBESTAR_INGEST_ENABLED", "1");
    vi.stubEnv("RELAY_PILOT_PATREON_ONLY", "");
    try {
      const { app } = createApp(baseConfig(tempDir));
      const endpoint = provider === "canonical" ? "/api/v1/ingest/batches" : "/api/v1/subscribestar/creator/ingest/batch";
      const body = provider === "canonical" ? { creator_id: "c1", posts: [samplePost("r1")] } : {
        creator_id: "c1", campaign: { external_campaign_id: "profile1", name: "Main" },
        posts: [{ external_post_id: "post1", title: "Post", published_at: "2026-10-01T00:00:00Z", upstream_revision: "r1", media: [] }]
      };
      const response = await request(app).post(`${endpoint}?process_sync=true`).send(body);
      expect(response.status).toBe(409);
      expect(response.body.error).toMatchObject({ code: conflict.code, message: conflict.message });
      expect(JSON.stringify(response.body)).not.toContain("private_owner_id");
      expect(JSON.stringify(response.body)).not.toContain("private_post_id");
      expect(response.body.error.trace_id).toBeTruthy();
    } finally {
      failure.mockRestore();
      vi.unstubAllEnvs();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("stops an ambiguous legacy replay before HTTP batch writes or events and ignores wire overrides", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-b-replay-conflict-"));
    try {
      const { app, eventBus } = createApp(baseConfig(tempDir));
      const endpoint = "/api/v1/ingest/batches?process_sync=true";
      const owner = { ...samplePost("r1"), post_id: "post|part", media: [] };
      await request(app).post(endpoint).send({ creator_id: "c1", posts: [owner] }).expect(200);
      const path = join(tempDir, "canonical.json");
      const snapshot = JSON.parse(await readFile(path, "utf8")) as CanonicalSnapshot;
      const identity = ["ingest_post", "c1", "post|part", "r1"];
      snapshot.ingest_idempotency[legacyIngestIdempotencyKey(identity)] = snapshot.ingest_idempotency[ingestIdempotencyKey(identity)]!;
      delete snapshot.ingest_idempotency[ingestIdempotencyKey(identity)];
      await writeFile(path, JSON.stringify(snapshot));
      const before = await readFile(path, "utf8");
      const eventCount = eventBus.getAll().length;
      const response = await request(app).post(endpoint).send({
        creator_id: "c1", posts: [samplePost("new"), { ...owner, post_id: "post", upstream_revision: "part|r1" }],
        replay_resolutions: [{ parts: ["ingest_post", "c1", "post", "part|r1"], action: "import_once" }]
      });
      expect(response.status).toBe(500);
      expect(response.body.error).toMatchObject({ code: "INTERNAL", message: "Unable to apply ingest batch." });
      expect(await readFile(path, "utf8")).toBe(before);
      expect(eventBus.getAll()).toHaveLength(eventCount);
    } finally { await rm(tempDir, { recursive: true, force: true }); }
  });

  it("returns a generic failure when synchronous deletion persistence rejects", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-b-deletion-failure-"));
    const failure = vi.spyOn(IngestService.prototype, "runBatch").mockRejectedValueOnce(new Error("private storage detail"));
    try {
      const { app } = createApp(baseConfig(tempDir));
      const response = await request(app).post("/api/v1/ingest/batches?process_sync=true").send({
        creator_id: "c1", tombstones: [{ entity_type: "post", id: "post_1", deleted_at: "2026-10-01T00:00:00Z" }]
      });
      expect(response.status).toBe(500);
      expect(response.body.error).toMatchObject({ code: "INTERNAL", message: "Unable to apply ingest batch." });
      expect(JSON.stringify(response.body)).not.toContain("private storage detail");
    } finally {
      failure.mockRestore();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects missing deletion metadata before writing or queuing any batch content", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-b-deletion-validation-"));
    try {
      const { app } = createApp(baseConfig(tempDir));
      const endpoint = "/api/v1/ingest/batches";
      await request(app).post(`${endpoint}?process_sync=true`).send({ creator_id: "c1", posts: [samplePost("r1")] }).expect(200);
      const canonicalPath = join(tempDir, "canonical.json");
      const before = await readFile(canonicalPath, "utf8");
      for (const query of ["", "?process_sync=true"]) {
        const response = await request(app).post(`${endpoint}${query}`).send({
          creator_id: "c1", posts: [samplePost("r2")],
          tombstones: [
            { entity_type: "post", id: "post_1", deleted_at: "2026-10-01T00:00:00Z" },
            { entity_type: "media", id: "media_1" }
          ]
        });
        expect(response.status).toBe(400);
        expect(response.body.error.details).toContainEqual({ field: "tombstones[1].deleted_at", issue: "missing" });
        expect(await readFile(canonicalPath, "utf8")).toBe(before);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it.each(["post", "media"] as const)("keeps a restored %s visible after replaying a persisted deletion", async (entityType) => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-b-deletion-replay-"));
    try {
      const { app, eventBus } = createApp(baseConfig(tempDir));
      const endpoint = "/api/v1/ingest/batches?process_sync=true";
      await request(app).post(endpoint).send({ creator_id: "c1", posts: [samplePost("r1")] }).expect(200);
      const deletion = {
        creator_id: "c1", tombstones: [{ entity_type: entityType, id: entityType === "post" ? "post_1" : "media_1", deleted_at: "2026-10-01T00:00:00Z" }]
      };
      const first = await request(app).post(endpoint).send(deletion).expect(200);
      expect(first.body.data.tombstones_applied).toBe(1);
      const newer = samplePost("r2");
      newer.media[0]!.upstream_revision = "mrev_2";
      await request(app).post(endpoint).send({ creator_id: "c1", posts: [newer] }).expect(200);
      const before = await readFile(join(tempDir, "canonical.json"), "utf8");
      const restored = JSON.parse(before) as CanonicalSnapshot;
      expect(restored.media.c1!.media_1!.upstream_status).toBe("active");
      expect(restored.media.c1!.media_1!.current.upstream_revision).toBe("mrev_2");
      deletion.tombstones[0]!.deleted_at = "2026-10-01T02:00:00+02:00";
      const replay = await request(app).post(endpoint).send(deletion).expect(200);
      expect(replay.body.data).toMatchObject({ tombstones_applied: 0, idempotent_skips: 1, events_emitted: 0 });
      expect(await readFile(join(tempDir, "canonical.json"), "utf8")).toBe(before);
      expect(eventBus.getAll().filter((event) => event.event_name === "post_published")).toHaveLength(2);
      const gallery = await request(app).get("/api/v1/gallery/items").query({ creator_id: "c1" }).expect(200);
      expect(gallery.body.data.items.some((item: { media_id: string }) => item.media_id === "media_1")).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("idempotent batch, media-centric links, post_published events, revision history", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-b-"));
    const { app, eventBus } = createApp(baseConfig(tempDir));

    const body = {
      creator_id: "creator_123",
      campaigns: [
        {
          campaign_id: "camp_1",
          name: "Main",
          upstream_updated_at: "2026-03-30T12:00:00Z"
        }
      ],
      tiers: [
        {
          tier_id: "tier_gold",
          title: "Gold",
          campaign_id: "camp_1",
          upstream_updated_at: "2026-03-30T12:00:00Z"
        }
      ],
      posts: [samplePost("rev_a")]
    };

    const first = await request(app).post("/api/v1/ingest/batches?process_sync=true").send(body);
    expect(first.status).toBe(200);
    expect(first.body.data.posts_written).toBe(1);
    expect(first.body.data.idempotent_skips).toBe(0);

    const second = await request(app).post("/api/v1/ingest/batches?process_sync=true").send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.posts_written).toBe(0);
    expect(second.body.data.idempotent_skips).toBeGreaterThan(0);

    const revB = await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "creator_123",
        posts: [samplePost("rev_b")]
      });
    expect(revB.status).toBe(200);
    expect(revB.body.data.posts_written).toBe(1);

    const snapRaw = await readFile(join(tempDir, "canonical.json"), "utf8");
    const snap = JSON.parse(snapRaw) as CanonicalSnapshot;
    const post = snap.posts.creator_123.post_1;
    expect(post.versions.length).toBe(2);
    expect(post.current.upstream_revision).toBe("rev_b");

    const media = snap.media.creator_123.media_1;
    expect(media.post_ids).toContain("post_1");

    const published = eventBus.getAll().filter((e) => e.event_name === "post_published");
    expect(published.length).toBe(2);
    expect(published.every((e) => e.producer === "ingestion-service")).toBe(true);
    expect(published[0].payload).toMatchObject({
      primary_id: "post_1",
      post_id: "post_1",
      creator_id: "creator_123"
    });

    const shared = await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "creator_123",
        posts: [
          {
            post_id: "post_2",
            title: "Side story",
            published_at: "2026-03-31T12:00:00Z",
            tag_ids: [],
            tier_ids: ["tier_gold"],
            upstream_revision: "p2_v1",
            media: [
              {
                media_id: "media_1",
                upstream_revision: "mrev_2"
              }
            ]
          }
        ]
      });
    expect(shared.status).toBe(200);
    const snap2 = JSON.parse(await readFile(join(tempDir, "canonical.json"), "utf8")) as CanonicalSnapshot;
    expect(snap2.media.creator_123.media_1.post_ids.sort()).toEqual(["post_1", "post_2"].sort());

    const tomb = await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "creator_123",
        tombstones: [{ entity_type: "post" as const, id: "post_1", deleted_at: "2026-04-01T00:00:00Z" }]
      });
    expect(tomb.status).toBe(200);
    const snap3 = JSON.parse(await readFile(join(tempDir, "canonical.json"), "utf8")) as CanonicalSnapshot;
    expect(snap3.posts.creator_123.post_1.upstream_status).toBe("deleted");
  });

  it("keeps cover on media role; gallery shows cover tag only on cover row", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-b-cover-"));
    const { app } = createApp(baseConfig(tempDir));

    const body = {
      creator_id: "creator_456",
      posts: [
        {
          post_id: "p_cover",
          title: "Post with cover",
          published_at: "2026-03-30T12:00:00Z",
          tag_ids: ["art"],
          tier_ids: [],
          upstream_revision: "rev_cover",
          media: [
            {
              media_id: "m_content",
              mime_type: "image/png",
              upstream_revision: "mr_content"
            },
            {
              media_id: "m_cover",
              mime_type: "image/jpeg",
              upstream_revision: "mr_cover",
              role: "cover"
            }
          ]
        }
      ]
    };

    const res = await request(app).post("/api/v1/ingest/batches?process_sync=true").send(body);
    expect(res.status).toBe(200);

    const snapRaw = await readFile(join(tempDir, "canonical.json"), "utf8");
    const snap = JSON.parse(snapRaw) as CanonicalSnapshot;

    const post = snap.posts.creator_456.p_cover;
    expect(post.current.tag_ids).not.toContain("cover");
    expect(post.current.tag_ids).toContain("art");

    const coverMedia = snap.media.creator_456.m_cover;
    expect(coverMedia.current.role).toBe("cover");

    const galleryRes = await request(app)
      .get("/api/v1/gallery/items")
      .query({ creator_id: "creator_456", limit: 50 });
    expect(galleryRes.status).toBe(200);
    const coverItem = galleryRes.body.data.items.find(
      (i: { media_id: string }) => i.media_id === "m_cover"
    );
    expect(coverItem).toBeDefined();
    expect(coverItem.media_role).toBe("cover");
    expect(coverItem.tag_ids).toContain("cover");
    const contentItem = galleryRes.body.data.items.find(
      (i: { media_id: string }) => i.media_id === "m_content"
    );
    expect(contentItem).toBeDefined();
    expect(contentItem.tag_ids).not.toContain("cover");
  });
});

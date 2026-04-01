import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
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

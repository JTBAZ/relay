import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

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
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("Gallery post_primary search focus", () => {
  it("returns one row per post and focuses matching child media", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-primary-focus-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crFocus",
        tiers: [],
        posts: [
          {
            post_id: "p_focus",
            title: "Album",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "r1",
            media: [
              { media_id: "m_hero", mime_type: "image/png", upstream_revision: "h1" },
              { media_id: "m_bugs_bunny", mime_type: "image/png", upstream_revision: "h2" }
            ]
          }
        ]
      });

    const res = await request(app).get(
      "/api/v1/gallery/items?creator_id=crFocus&display=post_primary&q=bugs+bunny&limit=50"
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].post_id).toBe("p_focus");
    expect(res.body.data.items[0].media_id).toBe("m_bugs_bunny");
  });

  it("post_primary search focuses the row with a per-asset tag when the post title is shared", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-primary-child-tag-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crChildTag",
        tiers: [],
        posts: [
          {
            post_id: "p_album",
            title: "Same title",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "r1",
            media: [
              { media_id: "m_one", mime_type: "image/png", upstream_revision: "1" },
              { media_id: "m_two", mime_type: "image/png", upstream_revision: "2" }
            ]
          }
        ]
      });

    await request(app).post("/api/v1/gallery/media/bulk-tags").send({
      creator_id: "crChildTag",
      media_targets: [{ post_id: "p_album", media_id: "m_two" }],
      add_tag_ids: ["character_zed"],
      remove_tag_ids: []
    });

    const res = await request(app).get(
      "/api/v1/gallery/items?creator_id=crChildTag&display=post_primary&q=character+zed&limit=50"
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].media_id).toBe("m_two");
  });

  it("falls back to hero when q only matches shared post-level fields", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-primary-desc-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crDesc",
        tiers: [],
        posts: [
          {
            post_id: "p_desc",
            title: "Title",
            description: "<p>Bugs Bunny Scene</p>",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "r1",
            media: [
              {
                media_id: "patreon_77_cover",
                mime_type: "image/jpeg",
                upstream_revision: "c1",
                role: "cover"
              },
              { media_id: "m_attachment", mime_type: "image/png", upstream_revision: "a1" }
            ]
          }
        ]
      });

    const res = await request(app).get(
      "/api/v1/gallery/items?creator_id=crDesc&display=post_primary&q=bugs+bunny&limit=50"
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].media_id).toBe("patreon_77_cover");
  });

  it("falls through to primary when only a shadow-cover row matches q", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-primary-shadow-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crShadow",
        tiers: [],
        posts: [
          {
            post_id: "p_shadow",
            title: "S",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "s1",
            media: [
              {
                media_id: "patreon_99_cover_matchtoken",
                mime_type: "image/jpeg",
                upstream_revision: "c1",
                role: "cover",
                upstream_url:
                  "https://c10.patreonusercontent.com/p/post/999/0123456789abcdef0123456789abcdef/cvr.jpg"
              },
              {
                media_id: "patreon_media_plain",
                mime_type: "image/jpeg",
                upstream_revision: "a1",
                upstream_url:
                  "https://c10.patreonusercontent.com/p/post/999/0123456789abcdef0123456789abcdef/att.jpg"
              }
            ]
          }
        ]
      });

    const all = await request(app).get("/api/v1/gallery/items?creator_id=crShadow&limit=50");
    expect(all.status).toBe(200);
    const coverRow = all.body.data.items.find(
      (i: { media_id: string; shadow_cover?: boolean }) =>
        i.media_id === "patreon_99_cover_matchtoken"
    );
    expect(Boolean(coverRow?.shadow_cover)).toBe(true);

    const res = await request(app).get(
      "/api/v1/gallery/items?creator_id=crShadow&display=post_primary&q=matchtoken&limit=50"
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].media_id).toBe("patreon_media_plain");
  });

  it("excludes post when only hidden child matches q and visibility=visible", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-primary-hidden-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crHidden",
        tiers: [],
        posts: [
          {
            post_id: "p_hidden_match",
            title: "Album",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "r1",
            media: [
              { media_id: "m_visible", mime_type: "image/png", upstream_revision: "v1" },
              { media_id: "m_match_token", mime_type: "image/png", upstream_revision: "h1" }
            ]
          }
        ]
      });

    await request(app).post("/api/v1/gallery/visibility").send({
      creator_id: "crHidden",
      post_ids: [],
      media_targets: [{ post_id: "p_hidden_match", media_id: "m_match_token" }],
      visibility: "hidden"
    });

    const res = await request(app).get(
      "/api/v1/gallery/items?creator_id=crHidden&display=post_primary&visibility=visible&q=match+token&limit=50"
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("paginates without duplicates/skips for post_primary q results", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-primary-cursor-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crCursor",
        tiers: [],
        posts: [
          {
            post_id: "p1",
            title: "A",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "1",
            media: [{ media_id: "m_token_1", mime_type: "image/png", upstream_revision: "1m" }]
          },
          {
            post_id: "p2",
            title: "B",
            published_at: "2026-03-29T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "2",
            media: [{ media_id: "m_token_2", mime_type: "image/png", upstream_revision: "2m" }]
          },
          {
            post_id: "p3",
            title: "C",
            published_at: "2026-03-28T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "3",
            media: [{ media_id: "m_token_3", mime_type: "image/png", upstream_revision: "3m" }]
          }
        ]
      });

    const p1 = await request(app).get(
      "/api/v1/gallery/items?creator_id=crCursor&display=post_primary&q=token&limit=1"
    );
    expect(p1.status).toBe(200);
    expect(p1.body.data.items).toHaveLength(1);
    const id1 = p1.body.data.items[0].post_id as string;
    const cursor1 = p1.body.data.next_cursor as string;
    expect(cursor1).toBeTruthy();

    const p2 = await request(app).get(
      `/api/v1/gallery/items?creator_id=crCursor&display=post_primary&q=token&limit=1&cursor=${encodeURIComponent(cursor1)}`
    );
    expect(p2.status).toBe(200);
    expect(p2.body.data.items).toHaveLength(1);
    const id2 = p2.body.data.items[0].post_id as string;
    expect(id2).not.toBe(id1);
  });
});

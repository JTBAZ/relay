import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";

function testApp(tempDir: string, fetchImpl?: typeof fetch) {
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
    fetch_impl:
      fetchImpl ??
      (vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch)
  });
}

describe("Visitor gallery API", () => {
  it("visitor=true omits hidden rows but keeps review; ignores visibility=visible filter", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-visitor-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "cv1",
        tiers: [],
        posts: [
          {
            post_id: "p_vis",
            title: "Visible",
            published_at: "2026-03-10T12:00:00Z",
            tag_ids: [],
            tier_ids: [RELAY_TIER_PUBLIC],
            upstream_revision: "v1",
            media: [{ media_id: "m_vis", mime_type: "image/png", upstream_revision: "mv" }]
          },
          {
            post_id: "p_rev",
            title: "Review",
            published_at: "2026-03-11T12:00:00Z",
            tag_ids: [],
            tier_ids: [RELAY_TIER_PUBLIC],
            upstream_revision: "r1",
            media: [{ media_id: "m_rev", mime_type: "image/png", upstream_revision: "mr" }]
          },
          {
            post_id: "p_hid",
            title: "Hidden",
            published_at: "2026-03-12T12:00:00Z",
            tag_ids: [],
            tier_ids: [RELAY_TIER_PUBLIC],
            upstream_revision: "h1",
            media: [{ media_id: "m_hid", mime_type: "image/png", upstream_revision: "mh" }]
          }
        ]
      });

    await request(app).post("/api/v1/gallery/visibility").send({
      creator_id: "cv1",
      post_ids: ["p_rev"],
      media_targets: [],
      visibility: "review"
    });
    await request(app).post("/api/v1/gallery/visibility").send({
      creator_id: "cv1",
      post_ids: ["p_hid"],
      media_targets: [],
      visibility: "hidden"
    });

    const v = await request(app).get(
      "/api/v1/gallery/items?creator_id=cv1&visitor=true&display=post_primary&limit=50"
    );
    expect(v.status).toBe(200);
    const ids = v.body.data.items.map((i: { post_id: string }) => i.post_id).sort();
    expect(ids).toEqual(["p_rev", "p_vis"].sort());
    const reviewRow = v.body.data.items.find((i: { post_id: string }) => i.post_id === "p_rev");
    expect(reviewRow.visibility).toBe("review");

    const wrongClientFilter = await request(app).get(
      "/api/v1/gallery/items?creator_id=cv1&visitor=true&visibility=visible&display=post_primary&limit=50"
    );
    expect(wrongClientFilter.status).toBe(200);
    const ids2 = wrongClientFilter.body.data.items.map((i: { post_id: string }) => i.post_id).sort();
    expect(ids2).toEqual(["p_rev", "p_vis"].sort());
  });

  it("visitor=true redacts export paths for tier-gated posts without session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-visitor-redact-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = vi.fn(async () => new Response(png, { status: 200 })) as unknown as typeof fetch;
    const { app } = testApp(tempDir, fetchImpl);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "cv2",
        tiers: [
          {
            tier_id: "t_paid",
            title: "Paid",
            upstream_updated_at: "2026-03-30T12:00:00Z"
          }
        ],
        posts: [
          {
            post_id: "p_pub",
            title: "Public",
            published_at: "2026-03-10T12:00:00Z",
            tag_ids: [],
            tier_ids: [RELAY_TIER_PUBLIC],
            upstream_revision: "a",
            media: [
              {
                media_id: "m_pub",
                mime_type: "image/png",
                upstream_revision: "mp",
                upstream_url: "https://cdn.example/pub.png"
              }
            ]
          },
          {
            post_id: "p_paid",
            title: "Paid only",
            published_at: "2026-03-11T12:00:00Z",
            tag_ids: [],
            tier_ids: ["t_paid"],
            upstream_revision: "b",
            media: [
              {
                media_id: "m_paid",
                mime_type: "image/png",
                upstream_revision: "mz",
                upstream_url: "https://cdn.example/paid.png"
              }
            ]
          }
        ]
      });

    await request(app).post("/api/v1/export/media").send({ creator_id: "cv2", media_id: "m_pub" });
    await request(app).post("/api/v1/export/media").send({ creator_id: "cv2", media_id: "m_paid" });

    const list = await request(app).get(
      "/api/v1/gallery/items?creator_id=cv2&visitor=true&display=post_primary&limit=50"
    );
    expect(list.status).toBe(200);
    const pub = list.body.data.items.find((i: { post_id: string }) => i.post_id === "p_pub");
    const paid = list.body.data.items.find((i: { post_id: string }) => i.post_id === "p_paid");
    expect(pub?.has_export).toBe(true);
    expect(String(pub?.content_url_path ?? "")).toContain("/export/media/");
    expect(paid?.has_export).toBe(false);
    expect(paid?.content_url_path).toBe("");
  });

  it("visitor=true collections drop hidden posts from post_ids", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-visitor-col-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "cv3",
        tiers: [],
        posts: [
          {
            post_id: "p_a",
            title: "A",
            published_at: "2026-03-10T12:00:00Z",
            tag_ids: [],
            tier_ids: [RELAY_TIER_PUBLIC],
            upstream_revision: "a",
            media: [{ media_id: "ma", mime_type: "image/png", upstream_revision: "ma" }]
          },
          {
            post_id: "p_b",
            title: "B",
            published_at: "2026-03-11T12:00:00Z",
            tag_ids: [],
            tier_ids: [RELAY_TIER_PUBLIC],
            upstream_revision: "b",
            media: [{ media_id: "mb", mime_type: "image/png", upstream_revision: "mb" }]
          }
        ]
      });

    await request(app).post("/api/v1/gallery/visibility").send({
      creator_id: "cv3",
      post_ids: ["p_b"],
      media_targets: [],
      visibility: "hidden"
    });

    const col = await request(app).post("/api/v1/gallery/collections").send({
      creator_id: "cv3",
      title: "Mix"
    });
    expect(col.status).toBe(201);
    const cid = col.body.data.collection_id as string;

    await request(app)
      .post(`/api/v1/gallery/collections/${cid}/posts`)
      .send({ post_ids: ["p_a", "p_b"] });

    const lib = await request(app).get("/api/v1/gallery/collections?creator_id=cv3");
    expect(lib.body.data.items.find((c: { collection_id: string }) => c.collection_id === cid).post_ids.sort()).toEqual([
      "p_a",
      "p_b"
    ]);

    const vis = await request(app).get("/api/v1/gallery/collections?creator_id=cv3&visitor=true");
    expect(
      vis.body.data.items.find((c: { collection_id: string }) => c.collection_id === cid).post_ids
    ).toEqual(["p_a"]);
  });
});

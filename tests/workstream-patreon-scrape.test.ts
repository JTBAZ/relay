import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

const campaignsDoc = {
  data: [
    {
      type: "campaign",
      id: "999",
      attributes: {
        name: "Mock Studio",
        created_at: "2026-01-01T00:00:00.000Z",
        published_at: "2026-01-02T00:00:00.000Z"
      },
      relationships: {
        tiers: { data: [{ type: "tier", id: "555" }] }
      }
    }
  ],
  included: [
    {
      type: "tier",
      id: "555",
      attributes: {
        title: "Supporter",
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: "2026-01-03T00:00:00.000Z"
      }
    }
  ]
};

const postsDoc = {
  data: [
    {
      type: "post",
      id: "111",
      attributes: {
        title: "Sketch drop",
        published_at: "2026-03-15T18:00:00.000Z",
        content:
          '<p>Hi</p><img src="https://cdn.example.com/art.png?token=abc" alt="x" />',
        embed_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        tiers: ["555"]
      }
    },
    {
      type: "post",
      id: "222",
      attributes: {
        title: "Text only",
        published_at: "2026-03-16T12:00:00.000Z",
        content: "<p>No images</p>",
        tiers: []
      }
    }
  ],
  links: {}
};

function testConfig(tempDir: string, fetchImpl: typeof fetch) {
  return {
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    cookie_store_path: join(tempDir, "cookies.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    patreon_sync_watermark_path: join(tempDir, "watermarks.json"),
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
  };
}

describe("Patreon scrape → ingest", () => {
  it("dry_run maps posts, embeds, and image URLs from HTML; sync persists to canonical", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patreon-"));

    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("patreon.com/api/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "tok",
            refresh_token: "ref",
            expires_in: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/campaigns?") && !url.includes("/posts")) {
        return new Response(JSON.stringify(campaignsDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/campaigns/999/posts")) {
        return new Response(JSON.stringify(postsDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(`unexpected ${url}`, { status: 404 });
    }) as unknown as typeof fetch;

    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_mock",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    const dry = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_mock",
      campaign_id: "999",
      dry_run: true
    });
    expect(dry.status).toBe(200);
    expect(dry.body.data.posts_fetched).toBe(2);
    expect(dry.body.data.summary.posts).toBe(2);
    expect(dry.body.data.summary.tiers).toBe(3);
    expect(dry.body.data.summary.media_items).toBeGreaterThanOrEqual(2);
    const sample = dry.body.data.sample_posts as Array<{ media_count: number }>;
    const sketch = sample.find((s) => s.media_count >= 2);
    expect(sketch).toBeDefined();

    const live = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_mock",
      campaign_id: "999",
      dry_run: false
    });
    expect(live.status).toBe(200);
    expect(live.body.data.apply_result.posts_written).toBe(2);

    const gallery = await request(app)
      .get("/api/v1/gallery/items")
      .query({ creator_id: "cr_mock", limit: 20 });
    expect(gallery.status).toBe(200);
    expect(gallery.body.data.items.length).toBeGreaterThanOrEqual(2);

    const detail = await request(app)
      .get("/api/v1/gallery/post-detail")
      .query({ creator_id: "cr_mock", post_id: "patreon_post_111" });
    expect(detail.status).toBe(200);
    expect(detail.body.data.description).toBe(
      '<p>Hi</p><img src="https://cdn.example.com/art.png?token=abc" alt="x" />'
    );
  });

  it("returns 404 when no OAuth tokens for creator", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-patreon-2-"));
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    const { app } = createApp(testConfig(tempDir, fetchImpl));

    const res = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "unknown",
      dry_run: true
    });
    expect(res.status).toBe(404);
  });
});

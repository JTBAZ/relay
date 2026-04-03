import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
        published_at: "2026-01-02T00:00:00.000Z",
        patron_count: 42,
        vanity: "MyStudio",
        image_url: "https://cdn.example/patreon/banner.jpg",
        image_small_url: "https://cdn.example/patreon/avatar.jpg"
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
        content: "<p>Hi</p>",
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
    patreon_sync_health_path: join(tempDir, "patreon_sync_health.json"),
    creator_campaign_display_path: join(tempDir, "creator_campaign_display.json"),
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

function mockFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
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
}

describe("GET /api/v1/patreon/sync-state", () => {
  it("returns watermark fields and skips posts fetch without probe_upstream", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-state-"));
    const fetchImpl = mockFetch();
    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_state",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    const res = await request(app)
      .get("/api/v1/patreon/sync-state")
      .query({ creator_id: "cr_state", campaign_id: "999" });
    expect(res.status).toBe(200);
    expect(res.body.data.creator_id).toBe("cr_state");
    expect(res.body.data.patreon_campaign_id).toBe("999");
    expect(res.body.data.watermark_published_at).toBeNull();
    expect(res.body.data.has_cookie_session).toBe(false);
    expect(res.body.data.upstream_newest_published_at).toBeUndefined();
    expect(res.body.data.likely_has_newer_posts).toBeUndefined();
    expect(res.body.data.oauth?.credential_health_status).toBe("healthy");
    expect(res.body.data.last_post_scrape).toBeNull();
    expect(res.body.data.last_member_sync).toBeNull();

    const postsCalls = vi.mocked(fetchImpl).mock.calls.filter(([u]) => {
      const url = typeof u === "string" ? u : u instanceof URL ? u.href : (u as Request).url;
      return url.includes("/campaigns/999/posts");
    });
    expect(postsCalls.length).toBe(0);
  });

  it("probe_upstream sets newest published_at and likely_has_newer_posts vs watermark", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-probe-"));
    const wmPath = join(tempDir, "watermarks.json");
    await writeFile(
      wmPath,
      JSON.stringify({
        records: {
          "cr_probe:999": {
            last_synced_at: "2026-03-10T00:00:00.000Z",
            updated_at: "2026-03-10T12:00:00.000Z"
          }
        }
      }),
      "utf8"
    );

    const fetchImpl = mockFetch();
    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_probe",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    const res = await request(app)
      .get("/api/v1/patreon/sync-state")
      .query({ creator_id: "cr_probe", campaign_id: "999", probe_upstream: "true" });

    expect(res.status).toBe(200);
    expect(res.body.data.watermark_published_at).toBe("2026-03-10T00:00:00.000Z");
    expect(res.body.data.watermark_updated_at).toBe("2026-03-10T12:00:00.000Z");
    expect(res.body.data.upstream_newest_published_at).toBe("2026-03-16T12:00:00.000Z");
    expect(res.body.data.likely_has_newer_posts).toBe(true);
    expect(res.body.data.oauth?.access_token_expired).toBe(false);
    expect(res.body.data.last_post_scrape).toBeNull();
    expect(res.body.data.campaign_display).toBeNull();
  });

  it("returns 400 without creator_id", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-bad-"));
    const { app } = createApp(testConfig(tempDir, mockFetch()));
    const res = await request(app).get("/api/v1/patreon/sync-state");
    expect(res.status).toBe(400);
  });
});

describe("Patreon watermark advancement and force_refresh", () => {
  it("advances watermark last_synced_at to max post published_at after live scrape", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-wm-adv-"));
    const fetchImpl = mockFetch();
    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_wm",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    const live = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_wm",
      campaign_id: "999",
      dry_run: false
    });
    expect(live.status).toBe(200);
    expect(live.body.data.campaign_display?.patron_count).toBe(42);
    expect(live.body.data.campaign_display?.image_small_url).toContain("avatar");

    const st = await request(app)
      .get("/api/v1/patreon/sync-state")
      .query({ creator_id: "cr_wm", campaign_id: "999" });
    expect(st.status).toBe(200);
    expect(st.body.data.campaign_display?.patron_count).toBe(42);
    expect(st.body.data.campaign_display?.image_url).toContain("banner");
    expect(st.body.data.campaign_display?.patreon_name).toBe("mystudio");

    const raw = await readFile(join(tempDir, "watermarks.json"), "utf8");
    const root = JSON.parse(raw) as {
      records: Record<string, { last_synced_at: string }>;
    };
    expect(root.records["cr_wm:999"]?.last_synced_at).toBe("2026-03-16T12:00:00.000Z");
  });

  it("incremental scrape skips posts behind watermark; force_refresh includes them (dry_run)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-wm-force-"));
    const wmPath = join(tempDir, "watermarks.json");
    await writeFile(
      wmPath,
      JSON.stringify({
        records: {
          "cr_inc:999": {
            last_synced_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z"
          }
        }
      }),
      "utf8"
    );

    const fetchImpl = mockFetch();
    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_inc",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    const inc = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_inc",
      campaign_id: "999",
      dry_run: true,
      force_refresh_post_access: false
    });
    expect(inc.status).toBe(200);
    expect(inc.body.data.posts_fetched).toBe(0);
    expect(inc.body.data.summary.posts).toBe(0);

    const forced = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_inc",
      campaign_id: "999",
      dry_run: true,
      force_refresh_post_access: true
    });
    expect(forced.status).toBe(200);
    expect(forced.body.data.posts_fetched).toBe(2);
    expect(forced.body.data.summary.posts).toBe(2);
  });
});

/**
 * Characterizes OAuth-only vs cookie scrape paths for media_source and warnings.
 * Golden payloads: tests/fixtures/patreon/
 */
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const oauthTextOnlyList = JSON.parse(
  readFileSync(join(__dirname, "fixtures/patreon/oauth-list-post-text-only.json"), "utf8")
) as { data: unknown[]; links: Record<string, unknown> };

const cookieWithMedia = JSON.parse(
  readFileSync(join(__dirname, "fixtures/patreon/cookie-list-with-media.json"), "utf8")
) as { data: unknown[]; included: unknown[]; links: Record<string, unknown> };

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

describe("Patreon sync media_source (OAuth vs cookie)", () => {
  it("OAuth-only: text-only content yields media_source oauth, 0 media warnings, cookie hint", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-media-src-oauth-"));

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
      if (url.includes("oauth2/v2/identity")) {
        return new Response(
          JSON.stringify({ data: { type: "user", id: "vitest_patreon_user" } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/oauth2/v2/campaigns?") && !url.includes("/posts")) {
        return new Response(JSON.stringify(campaignsDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/oauth2/v2/campaigns/") && url.includes("/posts")) {
        return new Response(JSON.stringify(oauthTextOnlyList), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    }) as unknown as typeof fetch;

    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_oauth_media",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    const dry = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_oauth_media",
      campaign_id: "999",
      dry_run: true,
      max_post_pages: 1
    });
    expect(dry.status).toBe(200);
    expect(dry.body.data.media_source).toBe("oauth");
    expect(dry.body.data.summary.media_items).toBe(0);
    const warnings = dry.body.data.warnings as string[];
    expect(warnings.some((w) => w.includes("0 media"))).toBe(true);
    expect(warnings.some((w) => w.includes("No session cookie") && w.includes("OAuth API only"))).toBe(
      true
    );
  });

  it("cookie path: fixture list + session yields media_source cookie and non-zero media", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-media-src-cookie-"));

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
      if (url.includes("oauth2/v2/identity")) {
        return new Response(
          JSON.stringify({ data: { type: "user", id: "vitest_patreon_user" } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/oauth2/v2/campaigns?") && !url.includes("/posts")) {
        return new Response(JSON.stringify(campaignsDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/oauth2/v2/campaigns/") && url.includes("/posts")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                type: "post",
                id: "111",
                attributes: {
                  title: "Fixture post with relationship media",
                  is_public: false,
                  is_paid: true,
                  tiers: [555],
                  published_at: "2026-04-01T12:00:00.000Z"
                }
              }
            ],
            links: {}
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/posts?") && url.includes("filter")) {
        return new Response(JSON.stringify(cookieWithMedia), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/oauth2/v2/posts/111")) {
        return new Response(
          JSON.stringify({
            data: {
              type: "post",
              id: "111",
              attributes: {
                title: "Fixture post with relationship media",
                content: "<p>body</p>",
                published_at: "2026-04-01T12:00:00.000Z",
                edited_at: "2026-04-01T12:00:00.000Z",
                url: "https://www.patreon.com/posts/x",
                is_public: false,
                is_paid: true,
                embed_url: "",
                embed_data: null
              },
              relationships: {
                tiers: { data: [{ type: "tier", id: "555" }] }
              }
            },
            included: []
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    }) as unknown as typeof fetch;

    const { app } = createApp(testConfig(tempDir, fetchImpl));

    const reg = await request(app).post("/api/v1/identity/register").send({
      creator_id: "cr_cookie_media",
      email: "cookie-media@example.com",
      password: "password123",
      tier_ids: []
    });
    expect(reg.status).toBe(201);
    const bearerMedia = reg.body.data.token as string;

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_cookie_media",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    await request(app)
      .post("/api/v1/patreon/cookie")
      .set("Authorization", `Bearer ${bearerMedia}`)
      .send({
        creator_id: "cr_cookie_media",
        session_id: "sess_fixture"
      });

    const dry = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_cookie_media",
      campaign_id: "999",
      dry_run: true,
      max_post_pages: 1
    });
    expect(dry.status).toBe(200);
    expect(dry.body.data.media_source).toBe("cookie");
    expect(dry.body.data.summary.media_items).toBeGreaterThanOrEqual(1);
    const warnings = dry.body.data.warnings as string[];
    expect(warnings.some((w) => w.includes("Cookie scrape:") && w.includes("media"))).toBe(true);
  });
});

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
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

const cookieListDoc = {
  data: [
    {
      type: "post",
      id: "111",
      attributes: {
        title: "With media",
        content: null,
        published_at: "2026-03-15T18:00:00.000Z",
        edited_at: "2026-03-15T18:00:00.000Z",
        tiers: ["555"]
      },
      relationships: {
        images: { data: [{ type: "media", id: "m1" }] }
      }
    }
  ],
  included: [
    {
      type: "media",
      id: "m1",
      attributes: {
        download_url: "https://cdn.example.com/a.png"
      }
    }
  ],
  links: {}
};

const cookieDetailDoc = {
  data: {
    type: "post",
    id: "111",
    attributes: {
      title: "With media",
      content: null,
      published_at: "2026-03-15T18:00:00.000Z",
      edited_at: "2026-03-15T18:00:00.000Z"
    },
    relationships: {}
  },
  included: []
};

function oauthPostDoc(id: string, html: string) {
  return {
    data: {
      type: "post",
      id,
      attributes: {
        title: "With media",
        content: html,
        published_at: "2026-03-15T18:00:00.000Z",
        edited_at: "2026-03-15T18:00:00.000Z",
        url: "https://www.patreon.com/posts/xxx",
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
  };
}

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

describe("Cookie scrape + OAuth post body backfill", () => {
  it("fills description when www API returns content null but OAuth /posts/{id} has HTML", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-cookie-oauth-"));

    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
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
      if (url.includes("/api/oauth2/v2/campaigns?") && !url.includes("/posts")) {
        return new Response(JSON.stringify(campaignsDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/oauth2/v2/campaigns/") && url.includes("/posts")) {
        return new Response(JSON.stringify({
          data: [{
            type: "post",
            id: "111",
            attributes: {
              title: "With media",
              is_public: false,
              is_paid: true,
              tiers: [555],
              published_at: "2026-03-15T18:00:00.000Z"
            }
          }],
          links: {}
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/api/oauth2/v2/posts/111")) {
        return new Response(
          JSON.stringify(oauthPostDoc("111", "<p>From OAuth</p>")),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/posts?") && url.includes("filter")) {
        return new Response(JSON.stringify(cookieListDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/posts/111?")) {
        return new Response(JSON.stringify(cookieDetailDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    }) as unknown as typeof fetch;

    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_hybrid",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    await request(app).post("/api/v1/patreon/cookie").send({
      creator_id: "cr_hybrid",
      session_id: "sess_test"
    });

    const dry = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_hybrid",
      campaign_id: "999",
      dry_run: true,
      include_batch: true,
      max_post_pages: 1
    });
    expect(dry.status).toBe(200);
    const batch = dry.body.data.batch as { posts: Array<{ description?: string }> };
    expect(batch.posts).toHaveLength(1);
    expect(batch.posts[0]!.description).toContain("From OAuth");

    const oauthCalls = vi.mocked(fetchImpl).mock.calls.filter(([u]) => {
      const url =
        typeof u === "string" ? u : u instanceof URL ? u.href : (u as Request).url;
      return url.includes("/api/oauth2/v2/posts/111");
    });
    expect(oauthCalls.length).toBeGreaterThanOrEqual(1);
    const oauthUrl = vi.mocked(fetchImpl).mock.calls.find(([u]) => {
      const url =
        typeof u === "string" ? u : u instanceof URL ? u.href : (u as Request).url;
      return url.includes("/api/oauth2/v2/posts/111");
    })?.[0];
    const urlStr =
      typeof oauthUrl === "string"
        ? oauthUrl
        : oauthUrl instanceof URL
          ? oauthUrl.href
          : (oauthUrl as Request).url;
    expect(urlStr).not.toContain("include=");
    expect(urlStr).toMatch(/\/api\/oauth2\/v2\/posts\/111(?:\?|$)/);

    expect(dry.body.data.tier_access_summary).toMatchObject({
      media_source: "cookie",
      oauth_list_pass: true
    });
  });

  it("cookie empty tiers + misleading is_paid false becomes tier-gated after OAuth (not public)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-cookie-tier-"));

    const ambiguousCookieList = {
      data: [
        {
          type: "post",
          id: "222",
          attributes: {
            title: "Paid-looking",
            content: "<p>ok</p>",
            published_at: "2026-03-15T18:00:00.000Z",
            edited_at: "2026-03-15T18:00:00.000Z",
            is_paid: false,
            tiers: []
          },
          relationships: {
            images: { data: [{ type: "media", id: "m2" }] }
          }
        }
      ],
      included: [
        {
          type: "media",
          id: "m2",
          attributes: { download_url: "https://cdn.example.com/b.png" }
        }
      ],
      links: {}
    };

    const oauthListFor222 = {
      data: [
        {
          type: "post",
          id: "222",
          attributes: {
            title: "Paid-looking",
            is_public: false,
            is_paid: true,
            tiers: [555],
            published_at: "2026-03-15T18:00:00.000Z"
          }
        }
      ],
      links: {}
    };

    const oauthPost222 = {
      data: {
        type: "post",
        id: "222",
        attributes: {
          title: "Paid-looking",
          content: "<p>ok</p>",
          published_at: "2026-03-15T18:00:00.000Z",
          edited_at: "2026-03-15T18:00:00.000Z",
          url: "https://www.patreon.com/posts/xxx",
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
    };

    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
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
      if (url.includes("/api/oauth2/v2/campaigns?") && !url.includes("/posts")) {
        return new Response(JSON.stringify(campaignsDoc), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/oauth2/v2/campaigns/") && url.includes("/posts")) {
        return new Response(JSON.stringify(oauthListFor222), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/oauth2/v2/posts/222")) {
        return new Response(JSON.stringify(oauthPost222), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/posts?") && url.includes("filter")) {
        return new Response(JSON.stringify(ambiguousCookieList), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/api/posts/222?")) {
        return new Response(
          JSON.stringify({
            data: {
              type: "post",
              id: "222",
              attributes: {
                title: "Paid-looking",
                content: "<p>ok</p>",
                published_at: "2026-03-15T18:00:00.000Z",
                edited_at: "2026-03-15T18:00:00.000Z"
              },
              relationships: {}
            },
            included: []
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    }) as unknown as typeof fetch;

    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_ambig",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    await request(app).post("/api/v1/patreon/cookie").send({
      creator_id: "cr_ambig",
      session_id: "sess_ambig"
    });

    const dry = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_ambig",
      campaign_id: "999",
      dry_run: true,
      include_batch: true,
      max_post_pages: 1
    });
    expect(dry.status).toBe(200);
    const batch = dry.body.data.batch as {
      posts: Array<{ tier_ids: string[] }>;
    };
    expect(batch.posts).toHaveLength(1);
    expect(batch.posts[0]!.tier_ids).toContain("patreon_tier_555");
    expect(batch.posts[0]!.tier_ids).not.toContain(RELAY_TIER_PUBLIC);
    expect(batch.posts[0]!.tier_ids).not.toEqual([RELAY_TIER_ALL_PATRONS]);

    expect(dry.body.data.tier_access_summary.media_source).toBe("cookie");
    expect(dry.body.data.tier_access_summary.oauth_list_pass).toBe(true);
  });
});

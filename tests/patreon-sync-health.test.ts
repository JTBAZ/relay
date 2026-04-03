import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { classifySyncError } from "../src/patreon/sync-error-copy.js";

const campaignsDoc = {
  data: [
    {
      type: "campaign",
      id: "999",
      attributes: {
        name: "Mock Studio",
        created_at: "2026-01-01T00:00:00.000Z",
        published_at: "2026-01-02T00:00:00.000Z",
        patron_count: 7,
        vanity: "healthcreator",
        image_url: "https://cdn.example/b.jpg",
        image_small_url: "https://cdn.example/a.jpg"
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

describe("classifySyncError", () => {
  it("maps no-token messages to no_tokens", () => {
    const r = classifySyncError("No Patreon tokens for this creator_id.");
    expect(r.code).toBe("no_tokens");
    expect(r.hint).toMatch(/Connect your Patreon/i);
  });

  it("maps ambiguous campaigns", () => {
    const r = classifySyncError("Multiple Patreon campaigns found. Pass campaign_id.");
    expect(r.code).toBe("campaign_ambiguous");
  });

  it("maps network-ish failures", () => {
    const r = classifySyncError("fetch failed: ECONNREFUSED");
    expect(r.code).toBe("patreon_unreachable");
  });
});

describe("Patreon sync health persistence + GET sync-state", () => {
  it("records successful scrape and exposes last_post_scrape + oauth on sync-state", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-health-"));
    const healthPath = join(tempDir, "patreon_sync_health.json");
    const fetchImpl = mockFetch();
    const { app } = createApp(testConfig(tempDir, fetchImpl));

    await request(app).post("/api/v1/auth/patreon/exchange").send({
      creator_id: "cr_health",
      code: "code",
      redirect_uri: "http://localhost/cb"
    });

    const scrape = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "cr_health",
      campaign_id: "999",
      dry_run: true
    });
    expect(scrape.status).toBe(200);

    const raw = await readFile(healthPath, "utf8");
    const health = JSON.parse(raw) as {
      records: Record<string, { last_post_scrape?: { ok: boolean } }>;
    };
    expect(health.records.cr_health?.last_post_scrape?.ok).toBe(true);

    const state = await request(app)
      .get("/api/v1/patreon/sync-state")
      .query({ creator_id: "cr_health", campaign_id: "999" });
    expect(state.status).toBe(200);
    expect(state.body.data.oauth).toMatchObject({
      credential_health_status: "healthy",
      access_token_expired: false
    });
    expect(state.body.data.oauth.access_token_expires_at).toBeTruthy();
    expect(state.body.data.last_post_scrape?.ok).toBe(true);
    expect(state.body.data.last_member_sync).toBeNull();
    expect(state.body.data.campaign_display?.patron_count).toBe(7);
    expect(state.body.data.campaign_display?.patreon_name).toBe("healthcreator");
    expect(state.body.data.campaign_display?.captured_at).toBeTruthy();
  });

  it("records scrape failure and sync-state surfaces classified hint", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-health-fail-"));
    const fetchImpl = mockFetch();
    const { app } = createApp(testConfig(tempDir, fetchImpl));

    const bad = await request(app).post("/api/v1/patreon/scrape").send({
      creator_id: "no_one_here",
      campaign_id: "999",
      dry_run: true
    });
    expect(bad.status).toBe(404);

    const state = await request(app)
      .get("/api/v1/patreon/sync-state")
      .query({ creator_id: "no_one_here", campaign_id: "999" });
    expect(state.status).toBe(404);

    const healthPath = join(tempDir, "patreon_sync_health.json");
    const raw = await readFile(healthPath, "utf8");
    const health = JSON.parse(raw) as {
      records: Record<string, { last_post_scrape?: { ok: boolean; error?: { code: string } } }>;
    };
    expect(health.records.no_one_here?.last_post_scrape?.ok).toBe(false);
    expect(health.records.no_one_here?.last_post_scrape?.error?.code).toBe("no_tokens");
  });
});

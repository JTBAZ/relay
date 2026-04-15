import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
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

describe("GET /api/v1/patron/permission/post (MIG-41)", () => {
  it("returns outcome for a public post without Bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-perm-"));
    const creatorId = "cr_route";
    const postId = "post_pub";
    const now = "2026-03-01T12:00:00.000Z";
    const canonical = {
      ingest_idempotency: {},
      campaigns: {},
      tiers: {
        [creatorId]: {
          t1: {
            tier_id: "t1",
            creator_id: creatorId,
            campaign_id: "c1",
            title: "T",
            upstream_updated_at: now,
            version_seq: 1
          }
        }
      },
      posts: {
        [creatorId]: {
          [postId]: {
            post_id: postId,
            creator_id: creatorId,
            upstream_status: "active",
            current: {
              version_seq: 1,
              upstream_revision: "r1",
              title: "Hi",
              published_at: now,
              tag_ids: [],
              tier_ids: [RELAY_TIER_PUBLIC],
              media_ids: [],
              ingested_at: now
            },
            versions: []
          }
        }
      },
      media: {}
    };
    await writeFile(join(tempDir, "canonical.json"), JSON.stringify(canonical), "utf8");

    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app)
      .get("/api/v1/patron/permission/post")
      .query({ creator_id: creatorId, post_id: postId });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ outcome: "allow" });
  });
});

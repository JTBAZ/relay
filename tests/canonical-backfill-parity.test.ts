import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/server.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import {
  compareCanonicalParity,
  countCanonicalSnapshotEntities
} from "../src/ingest/backfill-canonical-from-file.js";

function minimalSnapshot(): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {
      cr1: {
        camp_a: {
          campaign_id: "camp_a",
          creator_id: "cr1",
          name: "C",
          upstream_updated_at: "2026-01-01T00:00:00.000Z",
          version_seq: 1
        }
      }
    },
    tiers: {
      cr1: {
        patreon_tier_1: {
          tier_id: "patreon_tier_1",
          creator_id: "cr1",
          campaign_id: "camp_a",
          title: "T",
          upstream_updated_at: "2026-01-01T00:00:00.000Z",
          version_seq: 1
        }
      }
    },
    posts: {
      cr1: {
        post_1: {
          post_id: "post_1",
          creator_id: "cr1",
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "r1",
            title: "Hello",
            published_at: "2026-01-02T00:00:00.000Z",
            tag_ids: [],
            tier_ids: ["patreon_tier_1"],
            media_ids: [],
            ingested_at: "2026-01-02T00:00:00.000Z"
          },
          versions: [
            {
              version_seq: 1,
              upstream_revision: "r1",
              title: "Hello",
              published_at: "2026-01-02T00:00:00.000Z",
              tag_ids: [],
              tier_ids: ["patreon_tier_1"],
              media_ids: [],
              ingested_at: "2026-01-02T00:00:00.000Z"
            }
          ]
        }
      }
    },
    media: {}
  };
}

describe("canonical snapshot counts + parity compare", () => {
  it("countCanonicalSnapshotEntities matches nested maps", () => {
    const s = minimalSnapshot();
    const c = countCanonicalSnapshotEntities(s);
    expect(c).toEqual({
      campaigns: 1,
      tiers: 1,
      posts: 1,
      media: 0,
      ingestIdempotencyKeys: 0
    });
  });

  it("compareCanonicalParity passes for identical snapshots", () => {
    const s = minimalSnapshot();
    const r = compareCanonicalParity({
      fileSnapshot: s,
      dbSnapshot: structuredClone(s),
      sampleSize: 10
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("compareCanonicalParity reports count mismatch", () => {
    const a = minimalSnapshot();
    const b = structuredClone(a);
    b.posts.cr1 = {};
    const r = compareCanonicalParity({ fileSnapshot: a, dbSnapshot: b, sampleSize: 5 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("posts:"))).toBe(true);
  });
});

describe("RELAY_DB_STORE_CANONICAL wiring", () => {
  it("createApp throws if canonical DB is on but prisma is missing", async () => {
    const d = await mkdtemp(join(tmpdir(), "relay-can-throw-"));
    expect(() =>
      createApp({
        patreon_client_id: "c",
        patreon_client_secret: "s",
        relay_token_encryption_key: randomBytes(32).toString("base64"),
        credential_store_path: join(d, "patreon.json"),
        ingest_canonical_path: join(d, "canonical.json"),
        ingest_dlq_path: join(d, "dlq.json"),
        export_storage_root: join(d, "exports"),
        gallery_post_overrides_path: join(d, "gallery_overrides.json"),
        gallery_saved_filters_path: join(d, "saved_filters.json"),
        analytics_store_path: join(d, "analytics.json"),
        clone_store_path: join(d, "clone_sites.json"),
        identity_store_path: join(d, "identity.json"),
        payment_store_path: join(d, "payments.json"),
        migration_store_path: join(d, "migrations.json"),
        deploy_store_path: join(d, "deploys.json"),
        relay_db_store_canonical: true
      })
    ).toThrow(/config\.prisma is required when any database-backed Relay store is enabled/);
  });

  it("createApp builds when relay_db_store_canonical and prisma are set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-can-app-"));
    const fakePrisma = {
      campaign: { findMany: async () => [] }
    } as unknown as PrismaClient;
    const { app } = createApp({
      patreon_client_id: "c",
      patreon_client_secret: "s",
      relay_token_encryption_key: randomBytes(32).toString("base64"),
      credential_store_path: join(dir, "patreon.json"),
      ingest_canonical_path: join(dir, "canonical.json"),
      ingest_dlq_path: join(dir, "dlq.json"),
      export_storage_root: join(dir, "exports"),
      gallery_post_overrides_path: join(dir, "gallery_overrides.json"),
      gallery_saved_filters_path: join(dir, "saved_filters.json"),
      analytics_store_path: join(dir, "analytics.json"),
      clone_store_path: join(dir, "clone_sites.json"),
      identity_store_path: join(dir, "identity.json"),
      payment_store_path: join(dir, "payments.json"),
      migration_store_path: join(dir, "migrations.json"),
      deploy_store_path: join(dir, "deploys.json"),
      relay_db_store_canonical: true,
      prisma: fakePrisma
    });
    expect(app).toBeDefined();
  });
});

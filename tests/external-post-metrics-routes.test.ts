/**
 * Slice 2 — external post metrics ingest + read API routes.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TenantRole } from "@prisma/client";
import { createApp } from "../src/server.js";
import { IdentityService } from "../src/identity/identity-service.js";
import { FileIdentityStore } from "../src/identity/identity-store.js";
import type { UserAccount } from "../src/identity/types.js";

const CREATOR_ID = "rcx_pilot_dev_ava";
const ACCOUNT_ID = "acc_metrics_owner";
const MEMBERSHIP_ID = "tm_metrics_owner";
const POST_ID = "post_metrics_test";
const ATTEMPT_ID = "pda_metrics_test";
const EXTERNAL_URL = "https://www.patreon.com/RelayTEST/posts/test-162544992";

function baseAppConfig(tempDir: string, prisma: PrismaClient) {
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
    collections_store_path: join(tempDir, "collections.json"),
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    prisma,
    relay_db_store_identity: false
  };
}

function ownerUser(): UserAccount {
  const now = new Date().toISOString();
  return {
    user_id: MEMBERSHIP_ID,
    creator_id: CREATOR_ID,
    email: "metrics-owner@test.example",
    password_hash: "x",
    auth_provider: "independent",
    tier_ids: [],
    created_at: now,
    updated_at: now
  };
}

async function seedExtensionToken(tempDir: string): Promise<string> {
  const store = new FileIdentityStore(join(tempDir, "identity.json"));
  const svc = new IdentityService(store);
  await store.createUser(ownerUser());
  const session = await svc.issueExtensionSession(ownerUser(), "metrics-test");
  return session.token;
}

async function seedWebToken(tempDir: string): Promise<string> {
  const store = new FileIdentityStore(join(tempDir, "identity.json"));
  const svc = new IdentityService(store);
  await store.createUser(ownerUser());
  const session = await svc.issueSessionForUser(ownerUser());
  return session.token;
}

function platformInstanceStub() {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 })
  };
}

/** Callback-style $transaction used by recordExternalPostMetricSnapshots. */
function interactiveTransaction(tx: Record<string, unknown>) {
  return vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
}

function authPrismaStub(metricsPrisma: Record<string, unknown>): PrismaClient {
  return {
    $executeRawUnsafe: vi.fn(async () => 0),
    tenantMembership: {
      findUnique: vi.fn(async () => ({ accountId: ACCOUNT_ID, role: TenantRole.patron })),
      count: vi.fn(async () => 0)
    },
    account: {
      findUnique: vi.fn(async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
        if (args.where.id !== ACCOUNT_ID) return null;
        if (args.select?.primaryRelayCreatorId) {
          return { primaryRelayCreatorId: CREATOR_ID };
        }
        return {
          id: ACCOUNT_ID,
          supabaseUserId: null,
          primaryRelayCreatorId: CREATOR_ID
        };
      })
    },
    ...metricsPrisma
  } as unknown as PrismaClient;
}

function postedAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    variantId: "pdv_metrics",
    postId: POST_ID,
    creatorId: CREATOR_ID,
    destination: "patreon",
    status: "posted",
    extensionTabId: null,
    fillResult: {},
    externalUrl: EXTERNAL_URL,
    externalId: "162544992",
    errorCode: null,
    errorDetail: null,
    startedAt: new Date("2026-06-30T17:00:00.000Z"),
    completedAt: new Date("2026-06-30T18:00:00.000Z"),
    createdAt: new Date("2026-06-30T17:00:00.000Z"),
    updatedAt: new Date("2026-06-30T18:00:00.000Z"),
    ...overrides
  };
}

function snapshotRow(metricType: string, value: number, id: string) {
  return {
    id,
    attemptId: ATTEMPT_ID,
    postId: POST_ID,
    creatorId: CREATOR_ID,
    destination: "patreon",
    externalUrl: EXTERNAL_URL,
    externalId: "162544992",
    metricType,
    value,
    raw: {},
    source: "extension_dom",
    capturedAt: new Date("2026-06-30T18:10:00.000Z")
  };
}

describe("POST /api/v1/relay/distribution-attempts/:attempt_id/metrics", () => {
  it("returns 503 when database is unavailable", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-metrics-post-503-"));
    const { app } = createApp({
      ...baseAppConfig(tempDir, {} as PrismaClient),
      prisma: undefined
    });
    const res = await request(app)
      .post(`/api/v1/relay/distribution-attempts/${ATTEMPT_ID}/metrics`)
      .send({
        source: "extension_dom",
        metrics: [{ metric_type: "likes", value: 1 }]
      });
    expect(res.status).toBe(503);
  });

  it("returns 401 without bearer token", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-metrics-post-401-"));
    const prisma = authPrismaStub({});
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app)
      .post(`/api/v1/relay/distribution-attempts/${ATTEMPT_ID}/metrics`)
      .send({
        source: "extension_dom",
        metrics: [{ metric_type: "likes", value: 1 }]
      });
    expect(res.status).toBe(401);
  });

  it("returns 201 with snapshots for extension bearer on posted attempt", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-metrics-post-201-"));
    const create = vi
      .fn()
      .mockResolvedValueOnce(snapshotRow("likes", 12, "epms_likes"))
      .mockResolvedValueOnce(snapshotRow("comments", 3, "epms_comments"));
    const platformInstance = platformInstanceStub();
    const tx = {
      platformInstance,
      externalPostMetricSnapshot: { create }
    };
    const prisma = authPrismaStub({
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(postedAttempt())
      },
      platformInstance,
      externalPostMetricSnapshot: { create },
      $transaction: interactiveTransaction(tx)
    });
    const extToken = await seedExtensionToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app)
      .post(`/api/v1/relay/distribution-attempts/${ATTEMPT_ID}/metrics`)
      .set("Authorization", `Bearer ${extToken}`)
      .send({
        source: "extension_dom",
        metrics: [
          { metric_type: "likes", value: 12 },
          { metric_type: "comments", value: 3 }
        ]
      });
    expect(res.status).toBe(201);
    expect(res.body.data.snapshots).toHaveLength(2);
    expect(res.body.data.attempt).toMatchObject({
      attempt_id: ATTEMPT_ID,
      post_id: POST_ID,
      destination: "patreon",
      external_url: EXTERNAL_URL,
      status: "posted"
    });
  });

  it("returns 400 for non-posted attempts", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-metrics-post-400-"));
    const prisma = authPrismaStub({
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(postedAttempt({ status: "fill_succeeded" }))
      }
    });
    const extToken = await seedExtensionToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app)
      .post(`/api/v1/relay/distribution-attempts/${ATTEMPT_ID}/metrics`)
      .set("Authorization", `Bearer ${extToken}`)
      .send({
        source: "extension_dom",
        metrics: [{ metric_type: "likes", value: 1 }]
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/v1/relay/posts/:post_id/external-metrics", () => {
  it("returns 503 when database is unavailable", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-metrics-get-503-"));
    const { app } = createApp({
      ...baseAppConfig(tempDir, {} as PrismaClient),
      prisma: undefined
    });
    const res = await request(app).get(`/api/v1/relay/posts/${POST_ID}/external-metrics`);
    expect(res.status).toBe(503);
  });

  it("returns 401 without session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-metrics-get-401-"));
    const prisma = authPrismaStub({
      postDistributionVariant: { findMany: vi.fn().mockResolvedValue([]) },
      externalPostMetricSnapshot: { findMany: vi.fn().mockResolvedValue([]) }
    });
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app).get(`/api/v1/relay/posts/${POST_ID}/external-metrics`);
    expect(res.status).toBe(401);
  });

  it("returns latest metrics for linked posted destinations", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-metrics-get-200-"));
    const prisma = authPrismaStub({
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            destination: "patreon",
            attempts: [postedAttempt()]
          }
        ])
      },
      externalPostMetricSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          snapshotRow("likes", 15, "epms_likes_new"),
          snapshotRow("likes", 10, "epms_likes_old"),
          snapshotRow("comments", 4, "epms_comments")
        ])
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([])
      }
    });
    const webToken = await seedWebToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app)
      .get(`/api/v1/relay/posts/${POST_ID}/external-metrics`)
      .set("Authorization", `Bearer ${webToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.metrics).toEqual({
      post_id: POST_ID,
      destinations: [
        {
          destination: "patreon",
          attempt_id: ATTEMPT_ID,
          external_url: EXTERNAL_URL,
          external_id: "162544992",
          metrics: [
            {
              snapshot_id: "epms_comments",
              metric_type: "comments",
              value: 4,
              source: "extension_dom",
              captured_at: "2026-06-30T18:10:00.000Z"
            },
            {
              snapshot_id: "epms_likes_new",
              metric_type: "likes",
              value: 15,
              source: "extension_dom",
              captured_at: "2026-06-30T18:10:00.000Z"
            }
          ]
        }
      ]
    });
  });
});

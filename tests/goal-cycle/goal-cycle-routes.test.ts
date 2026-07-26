import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server.js";
import {
  GOAL_CYCLE_ACTIVE_EXISTS_FIXTURE,
  GOAL_CYCLE_API_CLIENT_FIXTURES,
  GOAL_CYCLE_NOT_FOUND_FIXTURE,
  GOAL_CYCLE_RESUME_DETAIL_FIXTURE,
  GOAL_CYCLE_VERSION_CONFLICT_FIXTURE
} from "../../src/goal-cycle/fixtures/api-client.js";

function fileIdentityApp(tempDir: string) {
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
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

const ROUTES = [
  { method: "get" as const, path: "/api/v1/creator/goal-cycles/active" },
  { method: "get" as const, path: "/api/v1/creator/goal-cycles" },
  { method: "get" as const, path: "/api/v1/creator/goal-cycles/cycle_x" },
  { method: "post" as const, path: "/api/v1/creator/goal-cycles", body: { goal_kind: "engagement" } },
  {
    method: "patch" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/checkpoint",
    body: { expected_version: 1 }
  },
  { method: "post" as const, path: "/api/v1/creator/goal-cycles/cycle_x/cancel", body: {} },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/suggest-completion",
    body: {}
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/confirm-completion",
    body: {}
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/research",
    body: { topic: "character sketch warmups", inline: true }
  },
  { method: "get" as const, path: "/api/v1/creator/goal-cycles/cycle_x/research" },
  { method: "get" as const, path: "/api/v1/creator/goal-cycles/cycle_x/attribution" },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/attribution/refresh",
    body: {}
  },
  { method: "get" as const, path: "/api/v1/creator/goal-cycles/cycle_x/planner" },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/questions",
    body: { idempotency_key: "q1", expected_version: 1 }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/answers",
    body: { expected_version: 1, answers: [] }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/generate",
    body: { idempotency_key: "g1", expected_version: 1 }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/revise",
    body: { idempotency_key: "r1", revision_note: "Softer captions", expected_version: 1 }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/manual-edit",
    body: { idempotency_key: "m1", plan: {}, expected_version: 1 }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/approve",
    body: { expected_version: 1, approval_key: "appr_1" }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/materialization/repair",
    body: { repair: false }
  }
];

describe("creator goal-cycle routes", () => {
  const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
  });

  it("returns 404 for inventory when feature flag is off", async () => {
    delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    const tempDir = await mkdtemp(join(tmpdir(), "relay-goal-cycle-flag-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/creator/goal-cycles/active");
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe("NOT_FOUND");
  });

  it("returns 503 when enabled but DB is not configured", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-goal-cycle-nodb-"));
    const { app } = fileIdentityApp(tempDir);

    for (const route of ROUTES) {
      const req = request(app)[route.method](route.path);
      const res = route.body ? await req.send(route.body) : await req;
      expect(res.status, route.path).toBe(503);
      expect(res.body?.error?.code, route.path).toBe("SERVICE_UNAVAILABLE");
    }
  });

  it("exposes stable client fixtures for 404 / 409 / resume", () => {
    expect(GOAL_CYCLE_API_CLIENT_FIXTURES.errors.not_found).toEqual(GOAL_CYCLE_NOT_FOUND_FIXTURE);
    expect(GOAL_CYCLE_ACTIVE_EXISTS_FIXTURE.status).toBe(409);
    expect(GOAL_CYCLE_VERSION_CONFLICT_FIXTURE.code).toBe("GOAL_CYCLE_VERSION_CONFLICT");
    expect(GOAL_CYCLE_RESUME_DETAIL_FIXTURE.plan).toBeNull();
    expect(GOAL_CYCLE_RESUME_DETAIL_FIXTURE.cycle_id).toBe(
      GOAL_CYCLE_API_CLIENT_FIXTURES.resume.summary.cycle_id
    );
  });
});

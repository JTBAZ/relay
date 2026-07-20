/**
 * VS5-T05/T06 — Planner route inventory + frozen API fixture for VS6/VS7.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server.js";
import {
  GOAL_CYCLE_PLANNER_API_FIXTURES,
  GOAL_CYCLE_PLANNER_API_FIXTURE_VERSION
} from "../../src/goal-cycle/fixtures/planner-api.js";
import { validateGoalCyclePlan } from "../../src/goal-cycle/contracts.js";
import { buildDeterministicPlanFallback } from "../../src/goal-cycle/planner/deterministic-plan-fallback.js";
import { buildGoalCycleFactPackFromDreamFixture } from "../../src/goal-cycle/planner/goal-cycle-fact-pack.js";

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

const PLANNER_ROUTES = [
  { method: "get" as const, path: "/api/v1/creator/goal-cycles/cycle_x/planner" },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/questions",
    body: { idempotency_key: "q1" }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/answers",
    body: { expected_version: 1, answers: [] }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/generate",
    body: { idempotency_key: "g1" }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/revise",
    body: { idempotency_key: "r1", revision_note: "note" }
  },
  {
    method: "post" as const,
    path: "/api/v1/creator/goal-cycles/cycle_x/planner/manual-edit",
    body: { idempotency_key: "m1", plan: { version: 1 } }
  }
];

describe("VS5-T05 planner routes", () => {
  const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
  });

  it("freezes planner API fixture for VS6/VS7", () => {
    expect(GOAL_CYCLE_PLANNER_API_FIXTURES.fixture_id).toBe(GOAL_CYCLE_PLANNER_API_FIXTURE_VERSION);
    expect(GOAL_CYCLE_PLANNER_API_FIXTURES.routes.generate).toContain("/planner/generate");
    expect(GOAL_CYCLE_PLANNER_API_FIXTURES.hydrate.plan?.slots.length).toBeGreaterThan(0);
    expect(GOAL_CYCLE_PLANNER_API_FIXTURES.errors.limit_exceeded.code).toBe(
      "GOAL_CYCLE_LIMIT_EXCEEDED"
    );
    // Dream sample plan remains the canonical AI-mode fixture.
    expect(() =>
      validateGoalCyclePlan(GOAL_CYCLE_PLANNER_API_FIXTURES.hydrate.plan, {
        goal_kind: "engagement",
        linked_destination_ids: ["patreon", "x"]
      })
    ).not.toThrow();
  });

  it("returns 503 for planner inventory when enabled but DB missing", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-goal-cycle-planner-nodb-"));
    const { app } = fileIdentityApp(tempDir);

    for (const route of PLANNER_ROUTES) {
      const req = request(app)[route.method](route.path);
      const res = route.body ? await req.send(route.body) : await req;
      expect(res.status, route.path).toBe(503);
      expect(res.body?.error?.code, route.path).toBe("SERVICE_UNAVAILABLE");
    }
  });

  it("canonical fixture reaches a stable fallback Plan", () => {
    const pack = buildGoalCycleFactPackFromDreamFixture();
    const plan = buildDeterministicPlanFallback({ factPack: pack });
    expect(plan.slots.length).toBeGreaterThan(0);
    expect(plan.ai_revision_count).toBe(0);
    expect(plan.evidence_summary.toLowerCase()).toMatch(/history/);
  });
});

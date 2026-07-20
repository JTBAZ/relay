/**
 * @fileoverview Route-level plan gates for Autopost draft + Coach propose (MB-3).
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { CreatorPlan, TenantRole } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { IdentityService } from "../src/identity/identity-service.js";
import { FileIdentityStore } from "../src/identity/identity-store.js";
import type { UserAccount } from "../src/identity/types.js";

const CREATOR_ID = "rcx_pilot_dev_ava";
const ACCOUNT_ID = "acc_plan_gate";
const MEMBERSHIP_ID = "tm_plan_gate";

vi.mock("../src/autopost/autopost-draft-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/autopost/autopost-draft-service.js")>();
  return {
    ...actual,
    saveAutopostDraft: vi.fn(async () => ({
      draft_id: "draft_gate_ok",
      creator_id: "rcx_pilot_dev_ava",
      status: "drafting",
      media_ids: [],
      title: null,
      body_text: null,
      style_profile_id: null,
      intent: null,
      performance_goal_id: null,
      composer_step: "compose",
      workspace: {},
      enhancements: {},
      distribution_log: {},
      published_post_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))
  };
});

function ownerUser(): UserAccount {
  const now = new Date().toISOString();
  return {
    user_id: MEMBERSHIP_ID,
    creator_id: CREATOR_ID,
    email: "plan-gate@test.example",
    password_hash: "x",
    auth_provider: "independent",
    tier_ids: [],
    created_at: now,
    updated_at: now
  };
}

async function seedWebToken(tempDir: string): Promise<string> {
  const store = new FileIdentityStore(join(tempDir, "identity.json"));
  const svc = new IdentityService(store);
  await store.createUser(ownerUser());
  const session = await svc.issueSessionForUser(ownerUser());
  return session.token;
}

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

function authAccountStub() {
  return {
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
    }),
    findFirst: vi.fn(async () => null)
  };
}

function gatingPrisma(opts: {
  entitlement?: { plan: CreatorPlan; source: string; expiresAt: Date | null } | null;
  flagEnabled?: boolean;
}): PrismaClient {
  const entitlement = opts.entitlement ?? null;
  return {
    $executeRawUnsafe: vi.fn(async () => 0),
    tenantMembership: {
      findUnique: vi.fn(async () => ({ accountId: ACCOUNT_ID, role: TenantRole.owner })),
      count: vi.fn(async () => 0)
    },
    account: authAccountStub(),
    creatorPlanEntitlement: {
      findUnique: vi.fn(async () =>
        entitlement
          ? {
              creatorId: CREATOR_ID,
              plan: entitlement.plan,
              source: entitlement.source,
              expiresAt: entitlement.expiresAt,
              effectiveAt: new Date()
            }
          : null
      ),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    planSubscription: { findFirst: vi.fn(async () => null) },
    creatorFeatureFlag: {
      findUnique: vi.fn(async () =>
        opts.flagEnabled ? { postingAssistantEnabled: true } : null
      )
    },
    platformOperatorAccessAudit: {
      create: vi.fn(async () => ({}))
    }
  } as unknown as PrismaClient;
}

describe("plan-gating-routes (MB-3)", () => {
  afterEach(() => {
    delete process.env.RELAY_POSTING_ASSISTANT_OPEN_FOR_ALL;
    delete process.env.RELAY_POSTING_ASSISTANT_DISABLED;
    delete process.env.RELAY_OPS_FEATURE_FLAG_SECRET;
  });

  it("POST autopost/draft returns 402 without plan or flag", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-gate-402-"));
    const prisma = gatingPrisma({});
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const token = await seedWebToken(tempDir);

    const res = await request(app)
      .post("/api/v1/creator/autopost/draft")
      .set("Authorization", `Bearer ${token}`)
      .send({ media_ids: [], generate: false });

    expect(res.status).toBe(402);
    expect(res.body).toEqual({
      error: "plan_required",
      required_plan: "autopost"
    });
  });

  it("POST autopost/draft returns 201 with operator_grant entitlement", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-gate-grant-"));
    const prisma = gatingPrisma({
      entitlement: {
        plan: CreatorPlan.autopost,
        source: "operator_grant",
        expiresAt: null
      }
    });
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const token = await seedWebToken(tempDir);

    const res = await request(app)
      .post("/api/v1/creator/autopost/draft")
      .set("Authorization", `Bearer ${token}`)
      .send({ media_ids: [], generate: false });

    expect(res.status).toBe(201);
    expect(res.body.data?.draft?.draft_id ?? res.body.data?.draft_id).toBe("draft_gate_ok");
  });

  it("POST autopost/draft returns 201 with legacy posting_assistant flag only", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-gate-flag-"));
    const prisma = gatingPrisma({ flagEnabled: true });
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const token = await seedWebToken(tempDir);

    const res = await request(app)
      .post("/api/v1/creator/autopost/draft")
      .set("Authorization", `Bearer ${token}`)
      .send({ media_ids: [], generate: false });

    expect(res.status).toBe(201);
  });

  it("POST coach/propose returns 402 without plan or flag", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-gate-coach-"));
    const prisma = gatingPrisma({});
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const token = await seedWebToken(tempDir);

    const res = await request(app)
      .post("/api/v1/relay/posts/post_1/coach/propose")
      .set("Authorization", `Bearer ${token}`)
      .send({ destinations: ["x"], assistant_by_destination: { x: true } });

    expect(res.status).toBe(402);
    expect(res.body).toEqual({
      error: "plan_required",
      required_plan: "autopost"
    });
  });

  it("ops creator-plan-grant upserts entitlement when secret matches", async () => {
    process.env.RELAY_OPS_FEATURE_FLAG_SECRET = "ops-secret-test";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-grant-ops-"));
    const upsert = vi.fn().mockResolvedValue({
      creatorId: CREATOR_ID,
      plan: CreatorPlan.autopost,
      source: "operator_grant",
      expiresAt: null
    });
    const prisma = {
      ...gatingPrisma({}),
      creatorPlanEntitlement: { upsert, findUnique: vi.fn(), delete: vi.fn() }
    } as unknown as PrismaClient;
    const { app } = createApp(baseAppConfig(tempDir, prisma));

    const res = await request(app)
      .post("/api/v1/ops/creator-plan-grant")
      .set("X-Relay-Ops-Feature-Flag-Secret", "ops-secret-test")
      .send({ creator_id: CREATOR_ID, plan: "autopost" });

    expect(res.status).toBe(200);
    expect(res.body.data.entitlement.plan).toBe("autopost");
    expect(upsert).toHaveBeenCalled();
  });
});

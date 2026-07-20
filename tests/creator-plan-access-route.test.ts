/**
 * @fileoverview MB-15A GET /api/v1/creator/plan-access presentation wire.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { CreatorPlan } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { IdentityService } from "../src/identity/identity-service.js";
import { FileIdentityStore } from "../src/identity/identity-store.js";
import type { UserAccount } from "../src/identity/types.js";

const CREATOR_ID = "rcx_pilot_dev_ava";
const ACCOUNT_ID = "acc_plan_access";
const MEMBERSHIP_ID = "tm_plan_access";

function ownerUser(): UserAccount {
  const now = new Date().toISOString();
  return {
    user_id: MEMBERSHIP_ID,
    creator_id: CREATOR_ID,
    email: "plan-access@test.example",
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
    findFirst: vi.fn(async (args: { where?: { primaryRelayCreatorId?: string } }) => {
      if (args.where?.primaryRelayCreatorId === CREATOR_ID) {
        return { id: ACCOUNT_ID };
      }
      return null;
    })
  };
}

function accessPrisma(opts: {
  entitlement?: { plan: CreatorPlan; source: string; expiresAt: Date | null } | null;
  flagEnabled?: boolean;
  subscription?: {
    creatorPlan: CreatorPlan;
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null;
}): PrismaClient {
  const entitlement = opts.entitlement ?? null;
  return {
    $executeRawUnsafe: vi.fn(async () => 0),
    tenantMembership: {
      findUnique: vi.fn(async () => ({ accountId: ACCOUNT_ID, role: "owner" as const })),
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
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => create),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    planSubscription: {
      findFirst: vi.fn(async () => {
        if (!opts.subscription) return null;
        return {
          accountId: ACCOUNT_ID,
          scope: "creator",
          creatorPlan: opts.subscription.creatorPlan,
          status: opts.subscription.status,
          currentPeriodEnd: opts.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: opts.subscription.cancelAtPeriodEnd,
          updatedAt: new Date()
        };
      })
    },
    creatorFeatureFlag: {
      findUnique: vi.fn(async () =>
        opts.flagEnabled ? { postingAssistantEnabled: true } : null
      )
    }
  } as unknown as PrismaClient;
}

describe("creator plan-access route (MB-15A)", () => {
  beforeEach(() => {
    delete process.env.RELAY_POSTING_ASSISTANT_OPEN_FOR_ALL;
    delete process.env.RELAY_POSTING_ASSISTANT_DISABLED;
  });

  afterEach(() => {
    delete process.env.RELAY_POSTING_ASSISTANT_OPEN_FOR_ALL;
    delete process.env.RELAY_POSTING_ASSISTANT_DISABLED;
  });

  it("returns locked autopost + posting_assistant with no plan", async () => {
    delete process.env.RELAY_POSTING_ASSISTANT_OPEN_FOR_ALL;
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-access-none-"));
    const prisma = accessPrisma({});
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const token = await seedWebToken(tempDir);

    const res = await request(app)
      .get("/api/v1/creator/plan-access")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.effective_plan).toBeNull();
    expect(res.body.data.capabilities.autopost).toMatchObject({
      allowed: false,
      required_plan: "autopost",
      reason: "plan_required"
    });
    expect(res.body.data.capabilities.posting_assistant.allowed).toBe(false);
    expect(res.body.data.capabilities.growth_engine).toMatchObject({
      allowed: false,
      reason: "feature_not_shipped"
    });
  });

  it("operator grant unlocks autopost without Stripe subscription", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-access-grant-"));
    const prisma = accessPrisma({
      entitlement: {
        plan: CreatorPlan.autopost,
        source: "operator_grant",
        expiresAt: null
      }
    });
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const token = await seedWebToken(tempDir);

    const res = await request(app)
      .get("/api/v1/creator/plan-access")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.effective_plan).toBe("autopost");
    expect(res.body.data.entitlement_source).toBe("operator_grant");
    expect(res.body.data.billing.plan).toBeNull();
    expect(res.body.data.capabilities.autopost).toMatchObject({
      allowed: true,
      reason: "operator_grant"
    });
    expect(res.body.data.capabilities.posting_assistant.allowed).toBe(true);
  });

  it("legacy flag unlocks posting_assistant only (not autopost)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-access-flag-"));
    const prisma = accessPrisma({ flagEnabled: true });
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const token = await seedWebToken(tempDir);

    const res = await request(app)
      .get("/api/v1/creator/plan-access")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.capabilities.autopost.allowed).toBe(false);
    expect(res.body.data.capabilities.posting_assistant).toMatchObject({
      allowed: true,
      reason: "legacy_feature_flag"
    });
  });

  it("active Stripe subscription unlocks matching capabilities", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-plan-access-stripe-"));
    const prisma = accessPrisma({
      subscription: {
        creatorPlan: CreatorPlan.autopost,
        status: "active",
        currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false
      }
    });
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const token = await seedWebToken(tempDir);

    const res = await request(app)
      .get("/api/v1/creator/plan-access")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.effective_plan).toBe("autopost");
    expect(res.body.data.entitlement_source).toBe("stripe");
    expect(res.body.data.billing).toMatchObject({
      plan: "autopost",
      status: "active"
    });
    expect(res.body.data.capabilities.autopost.allowed).toBe(true);
  });
});

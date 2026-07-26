/**
 * T-5.1 / T-5.2 — Relay mutating routes require `body.creator_id` === `Account.primaryRelayCreatorId`
 * and pass `assertCreatorRelayMutationAllowed` (MT-010 secret + optional tenant row).
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TenantRole } from "@prisma/client";
import { getPlatformRelayCreatorId } from "../src/identity/platform-tenant.js";

const mockGetSupabaseUser = vi.fn();

vi.mock("../src/lib/supabase-auth.js", () => ({
  getSupabaseUserFromAccessToken: (token: string) => mockGetSupabaseUser(token)
}));

import { createApp } from "../src/server.js";

const TEST_SUPA_ID = "44444444-4444-4444-4444-444444444444";
const TEST_EMAIL = "relayauthz@example.com";

function fileBackedConfig(tempDir: string) {
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
    collections_store_path: join(tempDir, "collections.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

function prismaBaseConfig(tempDir: string, prisma: PrismaClient) {
  return {
    ...fileBackedConfig(tempDir),
    prisma,
    relay_db_store_identity: true
  };
}

/** Same pattern as `tests/patreon-cookie-auth.test.ts` (Postgres identity + workspace provisioning). */
function createRelayAuthzPrismaStub(): PrismaClient {
  const platformRid = getPlatformRelayCreatorId();
  const platformTenant = { id: "ten_plat", relayCreatorId: platformRid };

  type Acc = {
    id: string;
    emailNorm: string | null;
    supabaseUserId: string | null;
    primaryRelayCreatorId: string | null;
    identityAuthProvider: "independent";
    passwordHash: string | null;
  };

  let account: Acc | null = null;
  let membershipId = "";
  let storedSessionTokenHash = "";

  const now = new Date();

  const membershipRow = () => ({
    id: membershipId,
    accountId: account!.id,
    role: TenantRole.patron,
    tierIds: [] as string[],
    createdAt: now,
    updatedAt: now,
    account: { ...account! },
    tenant: platformTenant
  });

  const prismaStub: Record<string, unknown> = {
    account: {
      findUnique: vi.fn(async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
        if (!account) {
          if ("supabaseUserId" in args.where && args.where.supabaseUserId === TEST_SUPA_ID) {
            return null;
          }
          if ("emailNorm" in args.where && args.where.emailNorm === TEST_EMAIL) {
            return null;
          }
          return null;
        }
        if ("supabaseUserId" in args.where && args.where.supabaseUserId === account.supabaseUserId) {
          if (args.select?.primaryRelayCreatorId) {
            return { primaryRelayCreatorId: account.primaryRelayCreatorId };
          }
          return { ...account };
        }
        if ("id" in args.where && args.where.id === account.id) {
          if (args.select?.primaryRelayCreatorId && !args.select?.id) {
            return { primaryRelayCreatorId: account.primaryRelayCreatorId };
          }
          if (args.select?.id && args.select?.primaryRelayCreatorId) {
            return { id: account.id, primaryRelayCreatorId: account.primaryRelayCreatorId };
          }
          return { ...account };
        }
        if ("emailNorm" in args.where && args.where.emailNorm === account.emailNorm) {
          return { ...account };
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        account = {
          id: typeof data.id === "string" ? data.id : "acc_relayauthz",
          emailNorm: (data.emailNorm as string) ?? null,
          supabaseUserId: (data.supabaseUserId as string) ?? null,
          primaryRelayCreatorId: null,
          identityAuthProvider: "independent",
          passwordHash: null
        };
        return { ...account };
      }),
      update: vi.fn(async ({ data }: { data: Partial<Acc> }) => {
        account = { ...account!, ...data };
        return { ...account };
      })
    },
    tenant: {
      upsert: vi.fn(async () => platformTenant),
      create: vi.fn(async ({ data }: { data: { relayCreatorId: string } }) => ({
        id: "ten_studio",
        relayCreatorId: data.relayCreatorId
      })),
      findUnique: vi.fn(async () => null)
    },
    user: {
      create: vi.fn(async () => ({ id: "usr_studio" }))
    },
    creatorProfile: {
      create: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => ({ publicSlug: "relayauthz" }))
    },
    tenantMembership: {
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => (membershipId ? 1 : 0)),
      findUnique: vi.fn(
        async (args: {
          where: { id: string };
          select?: { accountId?: boolean };
          include?: { account?: boolean; tenant?: boolean };
        }) => {
          if (!membershipId || args.where.id !== membershipId) {
            return null;
          }
          if (args.select?.accountId) {
            return { accountId: account!.id };
          }
          return membershipRow();
        }
      ),
      create: vi.fn(async () => {
        membershipId = "tm_relayauthz_membership";
        return membershipRow();
      })
    },
    session: {
      create: vi.fn(async ({ data }: { data: { tokenHash: string } }) => {
        storedSessionTokenHash = data.tokenHash;
        return { id: "sess_db" };
      }),
      findUnique: vi.fn(
        async (args: {
          where: { tokenHash: string };
          include: { tenantMembership: { include: { account: boolean; tenant: boolean } } };
        }) => {
          if (!storedSessionTokenHash || args.where.tokenHash !== storedSessionTokenHash) {
            return null;
          }
          if (!membershipId) {
            return null;
          }
          const m = membershipRow();
          return {
            id: "sess_db",
            tokenHash: args.where.tokenHash,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 3600_000),
            tenantMembership: m
          };
        }
      ),
      delete: vi.fn(async () => ({}))
    }
  };

  prismaStub.$executeRawUnsafe = vi.fn(async () => undefined);

  prismaStub.$transaction = vi.fn(
    async (fn: (tx: Record<string, unknown>) => Promise<unknown>, _opts?: unknown) => {
      const tx = {
        account: {
          findUnique: vi.fn(
            async (args: {
              where: { id: string };
              select: { id: boolean; primaryRelayCreatorId: boolean; emailNorm?: boolean };
            }) => ({
              id: account!.id,
              primaryRelayCreatorId: account!.primaryRelayCreatorId,
              emailNorm: account!.emailNorm
            })
          ),
          update: vi.fn(async ({ data }: { data: { primaryRelayCreatorId: string } }) => {
            account = { ...account!, primaryRelayCreatorId: data.primaryRelayCreatorId };
            return { ...account };
          })
        },
        tenant: {
          create: vi.fn(async ({ data }: { data: { relayCreatorId: string } }) => ({
            id: "ten_new",
            relayCreatorId: data.relayCreatorId
          }))
        },
        user: prismaStub.user,
        creatorProfile: {
          create: vi.fn(async () => ({})),
          findUnique: vi.fn(async () => null)
        }
      };
      return fn(tx);
    }
  );

  return prismaStub as unknown as PrismaClient;
}

async function sessionAfterWorkspace(
  app: import("express").Application
): Promise<{ token: string; ownedCreatorId: string }> {
  mockGetSupabaseUser.mockResolvedValue({
    ok: true,
    user: { id: TEST_SUPA_ID, email: TEST_EMAIL }
  });
  const sync = await request(app)
    .post("/api/v1/auth/supabase/sync")
    .set("Authorization", "Bearer supa_jwt")
    .send({});
  expect(sync.status).toBe(200);
  const relay = await request(app)
    .post("/api/v1/auth/supabase/relay-session")
    .set("Authorization", "Bearer supa_jwt")
    .send({});
  expect(relay.status).toBe(200);
  const token = relay.body.data.token as string;
  const ws = await request(app)
    .post("/api/v1/creator/workspace")
    .set("Authorization", `Bearer ${token}`)
    .send({ confirm_creator_intent: true });
  expect(ws.status).toBe(201);
  const ownedCreatorId = ws.body.data.relay_creator_id as string;
  return { token, ownedCreatorId };
}

describe("T-5.2 — Relay mutating routes reject spoofed creator_id (Postgres identity)", () => {
  const prevSecret = process.env.RELAY_PATREON_OAUTH_STATE_SECRET;

  beforeEach(() => {
    mockGetSupabaseUser.mockReset();
    process.env.RELAY_PATREON_OAUTH_STATE_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.RELAY_PATREON_OAUTH_STATE_SECRET = prevSecret;
  });

  it("POST /api/v1/relay/posts — 403 when creator_id is not the session studio", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-authz-posts-"));
    const { app } = createApp(prismaBaseConfig(tempDir, createRelayAuthzPrismaStub()));
    const { token } = await sessionAfterWorkspace(app);
    const res = await request(app)
      .post("/api/v1/relay/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cr_not_my_studio" });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("POST /api/v1/relay/upload/init — 403 when creator_id is not the session studio", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-authz-init-"));
    const { app } = createApp(prismaBaseConfig(tempDir, createRelayAuthzPrismaStub()));
    const { token } = await sessionAfterWorkspace(app);
    const res = await request(app)
      .post("/api/v1/relay/upload/init")
      .set("Authorization", `Bearer ${token}`)
      .send({
        creator_id: "cr_not_my_studio",
        content_type: "video/mp4",
        byte_size: 100
      });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("POST /api/v1/relay/upload/commit — 403 when creator_id is not the session studio", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-authz-commit-"));
    const { app } = createApp(prismaBaseConfig(tempDir, createRelayAuthzPrismaStub()));
    const { token } = await sessionAfterWorkspace(app);
    const res = await request(app)
      .post("/api/v1/relay/upload/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        creator_id: "cr_not_my_studio",
        media_id: "relay_m_fake",
        content_type: "video/mp4",
        byte_size: 1
      });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });
});

/**
 * P8-sec-003 — Gallery mutate routes use `requireAccountMatchesCreator`; a patron-only account
 * (`primaryRelayCreatorId` null) must get 403, including when auth is the `relay_session` cookie.
 */
describe("P8-sec-003 — Patron-only session cannot mutate creator gallery routes", () => {
  const prevSecret = process.env.RELAY_PATREON_OAUTH_STATE_SECRET;

  beforeEach(() => {
    mockGetSupabaseUser.mockReset();
    process.env.RELAY_PATREON_OAUTH_STATE_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.RELAY_PATREON_OAUTH_STATE_SECRET = prevSecret;
  });

  async function patronOnlyOpaqueToken(app: import("express").Application): Promise<string> {
    mockGetSupabaseUser.mockResolvedValue({
      ok: true,
      user: { id: TEST_SUPA_ID, email: TEST_EMAIL }
    });
    const sync = await request(app)
      .post("/api/v1/auth/supabase/sync")
      .set("Authorization", "Bearer supa_jwt")
      .send({});
    expect(sync.status).toBe(200);
    const relay = await request(app)
      .post("/api/v1/auth/supabase/relay-session")
      .set("Authorization", "Bearer supa_jwt")
      .send({});
    expect(relay.status).toBe(200);
    return relay.body.data.token as string;
  }

  it("POST /api/v1/gallery/collections — 403 with Bearer (no creator studio)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-p8-gal-col-"));
    const { app } = createApp(prismaBaseConfig(tempDir, createRelayAuthzPrismaStub()));
    const token = await patronOnlyOpaqueToken(app);
    const res = await request(app)
      .post("/api/v1/gallery/collections")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cr_not_a_studio", title: "Should not create" });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("POST /api/v1/gallery/collections — 403 with relay_session cookie (no creator studio)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-p8-gal-cook-"));
    const { app } = createApp(prismaBaseConfig(tempDir, createRelayAuthzPrismaStub()));
    const token = await patronOnlyOpaqueToken(app);
    const res = await request(app)
      .post("/api/v1/gallery/collections")
      .set("Cookie", `relay_session=${encodeURIComponent(token)}`)
      .send({ creator_id: "cr_not_a_studio", title: "Should not create" });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("POST /api/v1/gallery/media/bulk-tags — 403 for patron-only session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-p8-gal-tags-"));
    const { app } = createApp(prismaBaseConfig(tempDir, createRelayAuthzPrismaStub()));
    const token = await patronOnlyOpaqueToken(app);
    const res = await request(app)
      .post("/api/v1/gallery/media/bulk-tags")
      .set("Authorization", `Bearer ${token}`)
      .send({
        creator_id: "cr_not_a_studio",
        add_tag_ids: [],
        remove_tag_ids: [],
        media_targets: [{ post_id: "p1", media_id: "m1" }]
      });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });
});

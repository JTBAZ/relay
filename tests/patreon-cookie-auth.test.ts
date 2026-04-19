/**
 * EXT-0A — Patreon cookie ingest routes require session + creator scope (Tier 1 Stage B).
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
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
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

function createChainPrismaStub(): PrismaClient {
  const supaId = "11111111-1111-1111-1111-111111111111";
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
          if ("supabaseUserId" in args.where && args.where.supabaseUserId === supaId) return null;
          if ("emailNorm" in args.where && args.where.emailNorm === "cookie403@example.com") return null;
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
        if ("emailNorm" in args.where && args.where.emailNorm === account.emailNorm) return { ...account };
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        account = {
          id: typeof data.id === "string" ? data.id : "acc_cookie403",
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
      findFirst: vi.fn(async () => ({ publicSlug: "cookie403" }))
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
          if (!membershipId || args.where.id !== membershipId) return null;
          if (args.select?.accountId) {
            return { accountId: account!.id };
          }
          return membershipRow();
        }
      ),
      create: vi.fn(async () => {
        membershipId = "tm_cookie403_membership";
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
          if (!storedSessionTokenHash || args.where.tokenHash !== storedSessionTokenHash) return null;
          if (!membershipId) return null;
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

describe("Patreon cookie API auth (EXT-0A)", () => {
  describe("without auth (401)", () => {
    it("POST, DELETE, GET status return 401", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "relay-cookie-auth-401-"));
      const { app } = createApp(fileBackedConfig(tempDir));

      const post = await request(app)
        .post("/api/v1/patreon/cookie")
        .send({ creator_id: "cr_x", session_id: "y" });
      expect(post.status).toBe(401);

      const del = await request(app)
        .delete("/api/v1/patreon/cookie")
        .send({ creator_id: "cr_x" });
      expect(del.status).toBe(401);

      const st = await request(app).get("/api/v1/patreon/cookie/status").query({ creator_id: "cr_x" });
      expect(st.status).toBe(401);
    });
  });

  describe("file-backed session (200)", () => {
    it("stores, reads status, and removes when Bearer matches creator_id", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "relay-cookie-auth-200-"));
      const { app } = createApp(fileBackedConfig(tempDir));

      const reg = await request(app).post("/api/v1/identity/register").send({
        creator_id: "cr_cookie_ok",
        email: "cookie-ok@example.com",
        password: "password123",
        tier_ids: []
      });
      expect(reg.status).toBe(201);
      const token = reg.body.data.token as string;

      const post = await request(app)
        .post("/api/v1/patreon/cookie")
        .set("Authorization", `Bearer ${token}`)
        .send({ creator_id: "cr_cookie_ok", session_id: "sess_ok" });
      expect(post.status).toBe(200);

      const st1 = await request(app)
        .get("/api/v1/patreon/cookie/status")
        .set("Authorization", `Bearer ${token}`)
        .query({ creator_id: "cr_cookie_ok" });
      expect(st1.status).toBe(200);
      expect(st1.body.data.has_cookie).toBe(true);

      const del = await request(app)
        .delete("/api/v1/patreon/cookie")
        .set("Authorization", `Bearer ${token}`)
        .send({ creator_id: "cr_cookie_ok" });
      expect(del.status).toBe(200);

      const st2 = await request(app)
        .get("/api/v1/patreon/cookie/status")
        .set("Authorization", `Bearer ${token}`)
        .query({ creator_id: "cr_cookie_ok" });
      expect(st2.status).toBe(200);
      expect(st2.body.data.has_cookie).toBe(false);
    });
  });

  describe("Postgres identity (403 wrong creator)", () => {
    const prevSecret = process.env.RELAY_PATREON_OAUTH_STATE_SECRET;

    beforeEach(() => {
      mockGetSupabaseUser.mockReset();
      process.env.RELAY_PATREON_OAUTH_STATE_SECRET = "0123456789abcdef0123456789abcdef";
    });

    afterEach(() => {
      process.env.RELAY_PATREON_OAUTH_STATE_SECRET = prevSecret;
    });

    it("returns 403 when Bearer is for another studio creator_id", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "relay-cookie-auth-403-"));
      const supaId = "22222222-2222-2222-2222-222222222222";
      mockGetSupabaseUser.mockResolvedValue({
        ok: true,
        user: { id: supaId, email: "cookie403@example.com" }
      });

      const prisma = createChainPrismaStub();
      const { app } = createApp(prismaBaseConfig(tempDir, prisma));

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
      const opaque = relay.body.data.token as string;

      const ws = await request(app)
        .post("/api/v1/creator/workspace")
        .set("Authorization", `Bearer ${opaque}`)
        .send({});
      expect(ws.status).toBe(201);

      const wrong = await request(app)
        .post("/api/v1/patreon/cookie")
        .set("Authorization", `Bearer ${opaque}`)
        .send({ creator_id: "cr_not_owned", session_id: "x" });
      expect(wrong.status).toBe(403);
      expect(wrong.body.error?.code).toBe("FORBIDDEN");
    });
  });
});

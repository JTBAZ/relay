/**
 * EXT-0C — extension consent start / exchange / grants / revoke (API flow).
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { IdentityAuthProvider, SessionKind, TenantRole } from "@prisma/client";
import { getPlatformRelayCreatorId } from "../src/identity/platform-tenant.js";

const mockGetSupabaseUser = vi.fn();

vi.mock("../src/lib/supabase-auth.js", () => ({
  getSupabaseUserFromAccessToken: (token: string) => mockGetSupabaseUser(token)
}));

import { createApp } from "../src/server.js";

function baseConfig(tempDir: string, prisma: PrismaClient) {
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
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    prisma,
    relay_db_store_identity: true
  };
}

type Acc = {
  id: string;
  emailNorm: string | null;
  supabaseUserId: string | null;
  primaryRelayCreatorId: string | null;
  identityAuthProvider: typeof IdentityAuthProvider.independent;
  passwordHash: string | null;
};

type SessionRow = {
  id: string;
  tokenHash: string;
  kind: SessionKind;
  tenantMembershipId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

/** Prisma-shaped stub: Supabase sync → relay session → multi session rows (web + extension). */
function createExtensionConsentPrismaStub(): PrismaClient {
  const supaId = "11111111-1111-1111-1111-111111111111";
  const platformRid = getPlatformRelayCreatorId();
  const platformTenant = { id: "ten_plat", relayCreatorId: platformRid };

  let account: Acc | null = null;
  let membershipId = "";
  const sessionsByHash = new Map<string, SessionRow>();
  let sessionSeq = 0;
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
      findUnique: vi.fn(
        async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
          if (!account) {
            if ("supabaseUserId" in args.where && args.where.supabaseUserId === supaId) return null;
            if ("emailNorm" in args.where && args.where.emailNorm === "extconsent@example.com")
              return null;
            return null;
          }
          if ("supabaseUserId" in args.where && args.where.supabaseUserId === account.supabaseUserId) {
            if (args.select?.primaryRelayCreatorId && Object.keys(args.select).length === 1) {
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
        }
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        account = {
          id: typeof data.id === "string" ? data.id : "acc_extconsent",
          emailNorm: (data.emailNorm as string) ?? null,
          supabaseUserId: (data.supabaseUserId as string) ?? null,
          primaryRelayCreatorId: null,
          identityAuthProvider: IdentityAuthProvider.independent,
          passwordHash: (data.passwordHash as string) ?? null
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
      findFirst: vi.fn(async () => ({ publicSlug: "extconsent" }))
    },
    tenantMembership: {
      findFirst: vi.fn(
        async (args: {
          where: { accountId?: string; tenantId?: string; role?: TenantRole };
          include?: { account?: boolean; tenant?: boolean };
        }) => {
          if (
            !account ||
            args.where.accountId !== account.id ||
            args.where.tenantId !== platformTenant.id ||
            args.where.role !== TenantRole.patron
          ) {
            return null;
          }
          if (!membershipId) return null;
          return membershipRow();
        }
      ),
      count: vi.fn(async (args: { where: { accountId: string } }) => {
        if (account && args.where.accountId === account.id && membershipId) return 1;
        return 0;
      }),
      findMany: vi.fn(
        async (args: {
          where: { accountId?: string; role?: TenantRole };
          include?: { tenant?: boolean };
        }) => {
          if (
            account &&
            args.where.accountId === account.id &&
            args.where.role === TenantRole.patron &&
            membershipId
          ) {
            return [{ ...membershipRow(), tenant: platformTenant }];
          }
          return [];
        }
      ),
      findUnique: vi.fn(
        async (args: {
          where: { id: string };
          select?: { accountId?: boolean; role?: boolean };
          include?: { account?: boolean; tenant?: boolean };
        }) => {
          if (!membershipId || args.where.id !== membershipId) return null;
          if (args.select?.accountId) {
            return { accountId: account!.id, role: TenantRole.patron };
          }
          return membershipRow();
        }
      ),
      create: vi.fn(
        async (args?: {
          data: { id?: string; accountId: string; tenantId: string; role: TenantRole; tierIds: string[] };
          include?: { account?: boolean; tenant?: boolean };
        }) => {
          const data = args?.data;
          membershipId = data?.id ?? "tm_extconsent_membership";
          return membershipRow();
        }
      ),
      update: vi.fn(async () => membershipRow())
    },
    session: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        sessionSeq += 1;
        const id = `sess_row_${sessionSeq}`;
        const tokenHash = data.tokenHash as string;
        const kind = data.kind as SessionKind;
        const expiresAt = data.expiresAt as Date;
        const row: SessionRow = {
          id,
          tokenHash,
          kind,
          tenantMembershipId: data.tenantMembershipId as string,
          expiresAt,
          revokedAt: null,
          label: (data.label as string) ?? null,
          createdAt: new Date(),
          lastUsedAt: (data.lastUsedAt as Date) ?? null
        };
        sessionsByHash.set(tokenHash, row);
        return { id };
      }),
      findUnique: vi.fn(
        async (args: {
          where: { tokenHash?: string; id?: string };
          include?: { tenantMembership: { include: { account: boolean; tenant: boolean } } };
          select?: Record<string, boolean>;
        }) => {
          if (args.where.tokenHash) {
            const row = sessionsByHash.get(args.where.tokenHash);
            if (!row || row.revokedAt) return null;
            if (row.expiresAt.getTime() < Date.now()) {
              sessionsByHash.delete(args.where.tokenHash);
              return null;
            }
            if (args.select?.id && args.select?.kind) {
              return { id: row.id, kind: row.kind };
            }
            if (args.select?.id && Object.keys(args.select).length === 1) {
              return { id: row.id };
            }
            if (args.include?.tenantMembership) {
              if (!membershipId || row.tenantMembershipId !== membershipId) return null;
              const m = membershipRow();
              return {
                id: row.id,
                tokenHash: args.where.tokenHash,
                revokedAt: null,
                expiresAt: row.expiresAt,
                kind: row.kind,
                label: row.label,
                lastUsedAt: row.lastUsedAt,
                tenantMembership: m
              };
            }
            return null;
          }
          return null;
        }
      ),
      findMany: vi.fn(
        async (args: {
          where: {
            kind: SessionKind;
            revokedAt: null;
            tenantMembership: { accountId: string };
            expiresAt: { gt: Date };
          };
          select: Record<string, boolean>;
          orderBy: { createdAt: string };
        }) => {
          const wantAccount = args.where.tenantMembership.accountId;
          if (!account || wantAccount !== account.id) return [];
          const out = [...sessionsByHash.values()].filter(
            (s) =>
              s.kind === SessionKind.extension &&
              s.revokedAt === null &&
              s.expiresAt > args.where.expiresAt.gt &&
              s.tenantMembershipId === membershipId
          );
          out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return out.map((s) => ({
            id: s.id,
            label: s.label,
            expiresAt: s.expiresAt,
            createdAt: s.createdAt,
            lastUsedAt: s.lastUsedAt
          }));
        }
      ),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string };
          data: { lastUsedAt?: Date; expiresAt?: Date };
        }) => {
          for (const row of sessionsByHash.values()) {
            if (row.id === where.id) {
              if (data.lastUsedAt) row.lastUsedAt = data.lastUsedAt;
              if (data.expiresAt) row.expiresAt = data.expiresAt;
              return row;
            }
          }
          return null;
        }
      ),
      deleteMany: vi.fn(
        async (args: {
          where: {
            id: string;
            kind: SessionKind;
            tenantMembership: { accountId: string };
          };
        }) => {
          const accId = args.where.tenantMembership.accountId;
          if (!account || accId !== account.id) return { count: 0 };
          let count = 0;
          for (const [h, row] of [...sessionsByHash.entries()]) {
            if (
              row.id === args.where.id &&
              row.kind === args.where.kind &&
              row.tenantMembershipId === membershipId
            ) {
              sessionsByHash.delete(h);
              count = 1;
              break;
            }
          }
          return { count };
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

describe("Extension consent flow (EXT-0C)", () => {
  const prevOAuth = process.env.RELAY_PATREON_OAUTH_STATE_SECRET;
  const prevConsent = process.env.RELAY_EXTENSION_CONSENT_SECRET;

  beforeEach(() => {
    mockGetSupabaseUser.mockReset();
    process.env.RELAY_PATREON_OAUTH_STATE_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.RELAY_EXTENSION_CONSENT_SECRET = "fedcba9876543210fedcba9876543210";
  });

  afterEach(() => {
    process.env.RELAY_PATREON_OAUTH_STATE_SECRET = prevOAuth;
    process.env.RELAY_EXTENSION_CONSENT_SECRET = prevConsent;
  });

  async function webSession(app: ReturnType<typeof createApp>["app"]): Promise<string> {
    const supaId = "11111111-1111-1111-1111-111111111111";
    mockGetSupabaseUser.mockResolvedValue({
      ok: true,
      user: { id: supaId, email: "extconsent@example.com" }
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

  it("consent/start returns 401 without Bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ext-consent-401-"));
    const prisma = createExtensionConsentPrismaStub();
    const { app } = createApp(baseConfig(tempDir, prisma));
    const res = await request(app)
      .post("/api/v1/auth/extension/consent/start")
      .send({ installation_id: "inst_x" });
    expect(res.status).toBe(401);
  });

  it("happy path: start → exchange → list grants → revoke → extension token 401", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ext-consent-happy-"));
    const prisma = createExtensionConsentPrismaStub();
    const { app } = createApp(baseConfig(tempDir, prisma));
    const opaque = await webSession(app);
    const inst = "inst_chrome_1";

    const start = await request(app)
      .post("/api/v1/auth/extension/consent/start")
      .set("Authorization", `Bearer ${opaque}`)
      .send({ installation_id: inst });
    expect(start.status).toBe(200);
    const consentCode = start.body.data.consent_code as string;

    const ex = await request(app).post("/api/v1/auth/extension/consent/exchange").send({
      consent_code: consentCode,
      installation_id: inst
    });
    expect(ex.status).toBe(200);
    const extToken = ex.body.data.token as string;
    expect(extToken).toMatch(/^sess_/);
    expect(ex.body.data.account_id).toBeTruthy();
    expect(ex.body.data.token_id).toBeTruthy();
    expect(typeof ex.body.data.token_id).toBe("string");

    const me1 = await request(app)
      .get("/api/v1/me/patron-auth")
      .set("Authorization", `Bearer ${extToken}`);
    expect(me1.status).toBe(200);

    const grants = await request(app)
      .get("/api/v1/auth/extension/grants")
      .set("Authorization", `Bearer ${opaque}`);
    expect(grants.status).toBe(200);
    const g = grants.body.data.grants as { token_id: string }[];
    expect(g.length).toBe(1);
    expect(g[0]!.token_id).toBe(ex.body.data.token_id);

    const del = await request(app)
      .delete(`/api/v1/auth/extension/grants/${g[0]!.token_id}`)
      .set("Authorization", `Bearer ${opaque}`);
    expect(del.status).toBe(200);

    const me2 = await request(app)
      .get("/api/v1/me/patron-auth")
      .set("Authorization", `Bearer ${extToken}`);
    expect(me2.status).toBe(401);
  });

  it("exchange returns 409 when consent code is replayed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ext-consent-replay-"));
    const prisma = createExtensionConsentPrismaStub();
    const { app } = createApp(baseConfig(tempDir, prisma));
    const opaque = await webSession(app);
    const inst = "inst_replay";

    const start = await request(app)
      .post("/api/v1/auth/extension/consent/start")
      .set("Authorization", `Bearer ${opaque}`)
      .send({ installation_id: inst });
    const consentCode = start.body.data.consent_code as string;

    const ex1 = await request(app).post("/api/v1/auth/extension/consent/exchange").send({
      consent_code: consentCode,
      installation_id: inst
    });
    expect(ex1.status).toBe(200);

    const ex2 = await request(app).post("/api/v1/auth/extension/consent/exchange").send({
      consent_code: consentCode,
      installation_id: inst
    });
    expect(ex2.status).toBe(409);
    expect(ex2.body.error?.code).toBe("CONSENT_CODE_USED");
  });

  it("exchange returns 410 when consent code is expired", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ext-consent-exp-"));
    const prisma = createExtensionConsentPrismaStub();
    const { app } = createApp(baseConfig(tempDir, prisma));
    const opaque = await webSession(app);
    const inst = "inst_exp";

    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const start = await request(app)
      .post("/api/v1/auth/extension/consent/start")
      .set("Authorization", `Bearer ${opaque}`)
      .send({ installation_id: inst });
    const consentCode = start.body.data.consent_code as string;

    vi.setSystemTime(t0 + 120_000);
    const ex = await request(app).post("/api/v1/auth/extension/consent/exchange").send({
      consent_code: consentCode,
      installation_id: inst
    });
    expect(ex.status).toBe(410);
    expect(ex.body.error?.code).toBe("CONSENT_CODE_EXPIRED");
    vi.useRealTimers();
  });
});

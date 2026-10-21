import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityAuthProvider, SessionKind, TenantRole, type PrismaClient } from "@prisma/client";
import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DbIdentityStore } from "../../src/identity/identity-store-db.js";
import { FileIdentityStore } from "../../src/identity/identity-store.js";
import { IdentityService } from "../../src/identity/identity-service.js";
import { requireAccount } from "../../src/identity/require-account.js";
import type { SessionToken } from "../../src/identity/types.js";

const dirs: string[] = [];
const sessionToken = "readonly-session-token";
const session: SessionToken = { token: sessionToken, user_id: "membership-1", creator_id: "creator-1", tier_ids: [], expires_at: "2030-01-01T00:00:00.000Z" };
const requestWithBearer = (): Request => {
  const headers = { authorization: `Bearer ${sessionToken}` };
  return { headers, header(name: string) { return headers[name.toLowerCase() as keyof typeof headers]; } } as unknown as Request;
};
function database(row: Record<string, unknown> | null) {
  const membership = { id: "membership-1", role: TenantRole.patron, tierIds: [], createdAt: new Date("2025-01-01T00:00:00.000Z"), updatedAt: new Date("2025-01-01T00:00:00.000Z"), tenant: { relayCreatorId: "creator-1" }, account: { id: "account-1", emailNorm: "creator@example.test", username: "creator", usernameNorm: "creator", passwordHash: "hash", identityAuthProvider: IdentityAuthProvider.independent, patronPatreonUserId: null } };
  const prisma = {
    session: { findUnique: vi.fn(async () => row), delete: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 0 })), update: vi.fn(async () => ({})) },
    tenantMembership: {
      findUnique: vi.fn(async ({ include }: { include?: unknown }) => include ? membership : { accountId: "account-1" }),
      count: vi.fn(async () => 0), findMany: vi.fn(async () => [])
    },
    account: { findUnique: vi.fn(async () => ({ id: "account-1", supabaseUserId: null, primaryRelayCreatorId: "creator-1" })) },
    $executeRawUnsafe: vi.fn(async () => 1)
  } as unknown as PrismaClient;
  return { prisma, membership };
}
const dbRow = (overrides: Record<string, unknown> = {}) => ({
  id: "session-row-1", revokedAt: null, expiresAt: new Date(Date.now() + 60_000), lastUsedAt: null, kind: SessionKind.web,
  tenantMembership: { id: "membership-1", role: TenantRole.patron, tierIds: [], createdAt: new Date("2025-01-01T00:00:00.000Z"), updatedAt: new Date("2025-01-01T00:00:00.000Z"), tenant: { relayCreatorId: "creator-1" }, account: { id: "account-1", emailNorm: "creator@example.test", username: "creator", usernameNorm: "creator", passwordHash: "hash", identityAuthProvider: IdentityAuthProvider.independent, patronPatreonUserId: null } },
  ...overrides
});

afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("read-only session resolution", () => {
  it("rejects expired database sessions without deleting when requireAccount opts into read-only resolution", async () => {
    const expired = database(dbRow({ expiresAt: new Date(Date.now() - 60_000) }));
    const identityService = new IdentityService(new DbIdentityStore(expired.prisma));
    await expect(requireAccount(requestWithBearer(), { prisma: expired.prisma, identityService, readonlySession: true })).rejects.toMatchObject({ status: 401 });
    expect(expired.prisma.session.findUnique).toHaveBeenCalledOnce();
    expect(expired.prisma.session.delete).not.toHaveBeenCalled();
    expect(expired.prisma.tenantMembership.findUnique).not.toHaveBeenCalled();
  });

  it("preserves the legacy default cleanup of expired database sessions", async () => {
    const expired = database(dbRow({ expiresAt: new Date(Date.now() - 60_000) }));
    const result = await new DbIdentityStore(expired.prisma).getSession(sessionToken);
    expect(result).toBeNull();
    expect(expired.prisma.session.delete).toHaveBeenCalledWith({ where: { id: "session-row-1" } });
  });

  it("accepts a valid session and rejects revoked and missing sessions without cleanup writes", async () => {
    const valid = database(dbRow());
    const accepted = await requireAccount(requestWithBearer(), { prisma: valid.prisma, identityService: new IdentityService(new DbIdentityStore(valid.prisma)), readonlySession: true });
    expect(accepted.context).toMatchObject({ accountId: "account-1", primaryRelayCreatorId: "creator-1" });
    expect(valid.prisma.session.delete).not.toHaveBeenCalled();

    const revoked = database(dbRow({ revokedAt: new Date() }));
    expect(await new DbIdentityStore(revoked.prisma).getSession(sessionToken, { cleanupExpired: false })).toBeNull();
    expect(revoked.prisma.session.delete).not.toHaveBeenCalled();
    const missing = database(null);
    expect(await new DbIdentityStore(missing.prisma).getSession(sessionToken, { cleanupExpired: false })).toBeNull();
    expect(missing.prisma.session.delete).not.toHaveBeenCalled();
  });

  it("does not save an expired file session in read-only mode and preserves default cleanup", async () => {
    const path = await mkdtemp(join(tmpdir(), "relay-session-readonly-")); dirs.push(path);
    const file = join(path, "identity.json");
    const expired = { ...session, expires_at: "2000-01-01T00:00:00.000Z" };
    await writeFile(file, JSON.stringify({ users: {}, sessions: { [sessionToken]: expired } }), "utf8");
    const store = new FileIdentityStore(file);
    const before = await readFile(file, "utf8");
    expect(await store.getSession(sessionToken, { cleanupExpired: false })).toBeNull();
    expect(await readFile(file, "utf8")).toBe(before);
    expect(JSON.parse(await readFile(file, "utf8")).sessions[sessionToken]).toBeDefined();
    expect(await store.getSession(sessionToken)).toBeNull();
    expect(JSON.parse(await readFile(file, "utf8")).sessions[sessionToken]).toBeUndefined();
  });
});


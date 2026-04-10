import {
  IdentityAuthProvider,
  PrismaClient,
  UserKind,
  type Tenant,
  type User
} from "@prisma/client";
import type { IdentityStore } from "./identity-store.js";
import { hashOpaqueSessionToken } from "./session-token-hash.js";
import type { AuthProvider, IdentityStoreRoot, SessionToken, UserAccount } from "./types.js";

function mapAuthProvider(a: AuthProvider): IdentityAuthProvider {
  return a === "independent" ? IdentityAuthProvider.independent : IdentityAuthProvider.patreon;
}

function mapAuthProviderFromDb(a: IdentityAuthProvider): AuthProvider {
  return a === IdentityAuthProvider.independent ? "independent" : "patreon";
}

function userToAccount(user: User & { tenant: Tenant }): UserAccount | null {
  if (user.kind !== UserKind.patron) return null;
  const rid = user.tenant.relayCreatorId;
  if (!rid) return null;
  return {
    user_id: user.id,
    creator_id: rid,
    email: user.emailNorm ?? "",
    password_hash: user.passwordHash ?? "",
    auth_provider: mapAuthProviderFromDb(user.identityAuthProvider),
    patreon_user_id: user.patronPatreonUserId ?? undefined,
    tier_ids: [...user.tierIds],
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString()
  };
}

export class DbIdentityStore implements IdentityStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async load(): Promise<IdentityStoreRoot> {
    const rows = await this.prisma.user.findMany({
      where: { kind: UserKind.patron },
      include: { tenant: true }
    });
    const users: Record<string, UserAccount> = {};
    for (const u of rows) {
      const acc = userToAccount(u);
      if (acc) users[u.id] = acc;
    }
    return { users, sessions: {} };
  }

  public async save(_root: IdentityStoreRoot): Promise<void> {
    throw new Error(
      "DbIdentityStore.save is not supported: sessions are keyed by hashed tokens only; use createUser / createSession / updateTiers or a dedicated backfill."
    );
  }

  public async createUser(user: UserAccount): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { relayCreatorId: user.creator_id },
        create: { relayCreatorId: user.creator_id },
        update: {}
      });
      await tx.user.upsert({
        where: { id: user.user_id },
        create: {
          id: user.user_id,
          tenantId: tenant.id,
          kind: UserKind.patron,
          emailNorm: user.email.toLowerCase().trim(),
          passwordHash: user.password_hash || null,
          identityAuthProvider: mapAuthProvider(user.auth_provider),
          patronPatreonUserId: user.patreon_user_id ?? null,
          tierIds: user.tier_ids,
          legacyFileId: user.user_id
        },
        update: {
          tenantId: tenant.id,
          emailNorm: user.email.toLowerCase().trim(),
          passwordHash: user.password_hash || null,
          identityAuthProvider: mapAuthProvider(user.auth_provider),
          patronPatreonUserId: user.patreon_user_id ?? null,
          tierIds: user.tier_ids,
          legacyFileId: user.user_id
        }
      });
    });
  }

  public async findByEmail(
    email: string,
    creatorId: string
  ): Promise<UserAccount | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { relayCreatorId: creatorId }
    });
    if (!tenant) return null;
    const norm = email.toLowerCase().trim();
    const u = await this.prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        kind: UserKind.patron,
        emailNorm: norm
      },
      include: { tenant: true }
    });
    return u ? userToAccount(u) : null;
  }

  public async findByPatreonId(
    patreonUserId: string,
    creatorId: string
  ): Promise<UserAccount | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { relayCreatorId: creatorId }
    });
    if (!tenant) return null;
    const u = await this.prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        kind: UserKind.patron,
        patronPatreonUserId: patreonUserId
      },
      include: { tenant: true }
    });
    return u ? userToAccount(u) : null;
  }

  public async getUser(userId: string): Promise<UserAccount | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true }
    });
    if (!u) return null;
    return userToAccount(u);
  }

  public async updateTiers(userId: string, tierIds: string[]): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (u && u.kind === UserKind.patron) {
      await this.prisma.user.update({ where: { id: userId }, data: { tierIds } });
    }
  }

  public async createSession(session: SessionToken): Promise<void> {
    const hash = hashOpaqueSessionToken(session.token);
    await this.prisma.session.create({
      data: {
        userId: session.user_id,
        tokenHash: hash,
        expiresAt: new Date(session.expires_at)
      }
    });
  }

  public async getSession(token: string): Promise<SessionToken | null> {
    const hash = hashOpaqueSessionToken(token);
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: hash },
      include: {
        user: { include: { tenant: true } }
      }
    });
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({ where: { id: row.id } });
      return null;
    }
    const acc = userToAccount(row.user);
    if (!acc) return null;
    return {
      token,
      user_id: acc.user_id,
      creator_id: acc.creator_id,
      tier_ids: [...acc.tier_ids],
      expires_at: row.expiresAt!.toISOString()
    };
  }

  public async deleteSession(token: string): Promise<void> {
    const hash = hashOpaqueSessionToken(token);
    await this.prisma.session.deleteMany({ where: { tokenHash: hash } });
  }
}

import {
  IdentityAuthProvider,
  PrismaClient,
  TenantRole,
  type Account,
  type Tenant,
  type TenantMembership
} from "@prisma/client";
import type { IdentityStore } from "./identity-store.js";
import { hashPassword, verifyPassword } from "./password.js";
import { getPlatformRelayCreatorId } from "./platform-tenant.js";
import { hashOpaqueSessionToken } from "./session-token-hash.js";
import { upsertPatronEntitlementSnapshotForOAuth } from "./patron-entitlement-snapshot.js";
import type { AuthProvider, IdentityStoreRoot, SessionToken, UserAccount } from "./types.js";

function mapAuthProvider(a: AuthProvider): IdentityAuthProvider {
  return a === "independent" ? IdentityAuthProvider.independent : IdentityAuthProvider.patreon;
}

function mapAuthProviderFromDb(a: IdentityAuthProvider): AuthProvider {
  return a === IdentityAuthProvider.independent ? "independent" : "patreon";
}

function membershipToAccount(
  m: TenantMembership & { account: Account; tenant: Tenant }
): UserAccount | null {
  if (m.role !== TenantRole.patron) return null;
  const rid = m.tenant.relayCreatorId;
  if (!rid) return null;
  return {
    user_id: m.id,
    creator_id: rid,
    email: m.account.emailNorm ?? "",
    password_hash: m.account.passwordHash ?? "",
    auth_provider: mapAuthProviderFromDb(m.account.identityAuthProvider),
    patreon_user_id: m.account.patronPatreonUserId ?? undefined,
    tier_ids: [...m.tierIds],
    created_at: m.createdAt.toISOString(),
    updated_at: m.updatedAt.toISOString()
  };
}

export class DbIdentityStore implements IdentityStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async load(): Promise<IdentityStoreRoot> {
    const rows = await this.prisma.tenantMembership.findMany({
      where: { role: TenantRole.patron },
      include: { account: true, tenant: true }
    });
    const users: Record<string, UserAccount> = {};
    for (const m of rows) {
      const acc = membershipToAccount(m);
      if (acc) users[m.id] = acc;
    }
    return { users, sessions: {} };
  }

  public async save(_root: IdentityStoreRoot): Promise<void> {
    throw new Error(
      "DbIdentityStore.save is not supported: sessions are keyed by hashed tokens only; use createUser / createSession / updateTiers or a dedicated backfill."
    );
  }

  public async createUser(user: UserAccount): Promise<void> {
    const emailNorm = user.email.toLowerCase().trim();
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { relayCreatorId: user.creator_id },
        create: { relayCreatorId: user.creator_id },
        update: {}
      });

      let account = await tx.account.findFirst({
        where: {
          OR: [
            ...(emailNorm.length > 0 ? [{ emailNorm }] : []),
            ...(user.patreon_user_id
              ? [{ patronPatreonUserId: user.patreon_user_id }]
              : [])
          ]
        }
      });

      if (!account) {
        account = await tx.account.create({
          data: {
            emailNorm: emailNorm.length > 0 ? emailNorm : null,
            passwordHash: user.password_hash || null,
            identityAuthProvider: mapAuthProvider(user.auth_provider),
            patronPatreonUserId: user.patreon_user_id ?? null,
            legacyFileId: user.user_id
          }
        });
      } else {
        account = await tx.account.update({
          where: { id: account.id },
          data: {
            emailNorm: emailNorm.length > 0 ? emailNorm : account.emailNorm,
            passwordHash: user.password_hash || null,
            identityAuthProvider: mapAuthProvider(user.auth_provider),
            patronPatreonUserId: user.patreon_user_id ?? account.patronPatreonUserId,
            legacyFileId: user.user_id
          }
        });
      }

      await tx.tenantMembership.upsert({
        where: { id: user.user_id },
        create: {
          id: user.user_id,
          accountId: account.id,
          tenantId: tenant.id,
          role: TenantRole.patron,
          tierIds: user.tier_ids,
          legacyFileId: user.user_id
        },
        update: {
          accountId: account.id,
          tenantId: tenant.id,
          tierIds: user.tier_ids,
          legacyFileId: user.user_id
        }
      });

      if (user.creator_id !== getPlatformRelayCreatorId()) {
        await upsertPatronEntitlementSnapshotForOAuth(tx, {
          patronMembershipId: user.user_id,
          relayCreatorId: user.creator_id,
          entitledTierIds: user.tier_ids
        });
      }
    });
  }

  public async registerAccountEmailPassword(
    email: string,
    password: string
  ): Promise<UserAccount> {
    const platformCreatorId = getPlatformRelayCreatorId();
    const emailNorm = email.toLowerCase().trim();
    if (!emailNorm) {
      throw new Error("Email is required.");
    }

    return await this.prisma.$transaction(async (tx) => {
      const dup = await tx.account.findUnique({ where: { emailNorm } });
      if (dup) {
        throw new Error("Account with this email already exists.");
      }

      const tenant = await tx.tenant.upsert({
        where: { relayCreatorId: platformCreatorId },
        create: { relayCreatorId: platformCreatorId },
        update: {}
      });

      const account = await tx.account.create({
        data: {
          emailNorm,
          passwordHash: hashPassword(password),
          identityAuthProvider: IdentityAuthProvider.independent
        }
      });

      const m = await tx.tenantMembership.create({
        data: {
          accountId: account.id,
          tenantId: tenant.id,
          role: TenantRole.patron,
          tierIds: []
        },
        include: { account: true, tenant: true }
      });

      const mapped = membershipToAccount(m);
      if (!mapped) {
        throw new Error("Failed to materialize platform membership.");
      }
      return mapped;
    });
  }

  public async loginAccountEmailPassword(
    email: string,
    password: string
  ): Promise<UserAccount> {
    const platformCreatorId = getPlatformRelayCreatorId();
    const emailNorm = email.toLowerCase().trim();
    if (!emailNorm) {
      throw new Error("Invalid credentials.");
    }

    const account = await this.prisma.account.findUnique({
      where: { emailNorm }
    });
    if (!account?.passwordHash) {
      throw new Error("Invalid credentials.");
    }
    if (account.identityAuthProvider === IdentityAuthProvider.patreon) {
      throw new Error("This account uses Patreon login. Set a password first.");
    }
    if (!verifyPassword(password, account.passwordHash)) {
      throw new Error("Invalid credentials.");
    }

    return this.ensurePlatformPatronUserForAccount(account.id);
  }

  /**
   * MT-033: Ensure platform patron membership for an existing `Account` and return `UserAccount` for opaque session.
   */
  public async ensurePlatformPatronUserForAccount(accountId: string): Promise<UserAccount> {
    const platformCreatorId = getPlatformRelayCreatorId();
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new Error("Account not found.");
    }

    const tenant = await this.prisma.tenant.upsert({
      where: { relayCreatorId: platformCreatorId },
      create: { relayCreatorId: platformCreatorId },
      update: {}
    });

    let m = await this.prisma.tenantMembership.findFirst({
      where: {
        accountId: account.id,
        tenantId: tenant.id,
        role: TenantRole.patron
      },
      include: { account: true, tenant: true }
    });

    if (!m) {
      m = await this.prisma.tenantMembership.create({
        data: {
          accountId: account.id,
          tenantId: tenant.id,
          role: TenantRole.patron,
          tierIds: []
        },
        include: { account: true, tenant: true }
      });
    }

    const mapped = membershipToAccount(m);
    if (!mapped) {
      throw new Error("Failed to materialize platform membership.");
    }
    return mapped;
  }

  public async findByEmail(
    email: string,
    creatorId: string
  ): Promise<UserAccount | null> {
    const norm = email.toLowerCase().trim();
    const account = await this.prisma.account.findUnique({
      where: { emailNorm: norm }
    });
    if (!account) return null;
    const tenant = await this.prisma.tenant.findUnique({
      where: { relayCreatorId: creatorId }
    });
    if (!tenant) return null;
    const m = await this.prisma.tenantMembership.findFirst({
      where: {
        accountId: account.id,
        tenantId: tenant.id,
        role: TenantRole.patron
      },
      include: { account: true, tenant: true }
    });
    return m ? membershipToAccount(m) : null;
  }

  public async findByPatreonId(
    patreonUserId: string,
    creatorId: string
  ): Promise<UserAccount | null> {
    const account = await this.prisma.account.findUnique({
      where: { patronPatreonUserId: patreonUserId }
    });
    if (!account) return null;
    const tenant = await this.prisma.tenant.findUnique({
      where: { relayCreatorId: creatorId }
    });
    if (!tenant) return null;
    const m = await this.prisma.tenantMembership.findFirst({
      where: {
        accountId: account.id,
        tenantId: tenant.id,
        role: TenantRole.patron
      },
      include: { account: true, tenant: true }
    });
    return m ? membershipToAccount(m) : null;
  }

  public async getUser(userId: string): Promise<UserAccount | null> {
    const m = await this.prisma.tenantMembership.findUnique({
      where: { id: userId },
      include: { account: true, tenant: true }
    });
    if (!m) return null;
    return membershipToAccount(m);
  }

  public async updateTiers(userId: string, tierIds: string[]): Promise<void> {
    const m = await this.prisma.tenantMembership.findUnique({
      where: { id: userId },
      include: { tenant: true }
    });
    if (!m || m.role !== TenantRole.patron) return;
    await this.prisma.tenantMembership.update({
      where: { id: userId },
      data: { tierIds }
    });
    const relayCreatorId = m.tenant.relayCreatorId;
    if (!relayCreatorId) return;
    await upsertPatronEntitlementSnapshotForOAuth(this.prisma, {
      patronMembershipId: userId,
      relayCreatorId,
      entitledTierIds: tierIds
    });
  }

  public async createSession(session: SessionToken): Promise<void> {
    const hash = hashOpaqueSessionToken(session.token);
    await this.prisma.session.create({
      data: {
        tenantMembershipId: session.user_id,
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
        tenantMembership: { include: { account: true, tenant: true } }
      }
    });
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({ where: { id: row.id } });
      return null;
    }
    const acc = membershipToAccount(row.tenantMembership);
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

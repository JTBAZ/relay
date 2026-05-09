/**
 * @fileoverview Prisma implementation of `IdentityStore` (accounts, patron memberships, hashed sessions).
 * @description Patreon merge rules, platform tenant bootstrap, entitlement snapshots on tier changes, and campaign→creator resolution for unified OAuth.
 * @see src/jsdoc-core-entities.ts
 */

import {
  IdentityAuthProvider,
  PrismaClient,
  SessionKind,
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
import { EXTENSION_SESSION_TTL_MS } from "./session-constants.js";
import type { AuthProvider, IdentityStoreRoot, SessionToken, UserAccount } from "./types.js";

function mapAuthProvider(a: AuthProvider): IdentityAuthProvider {
  return a === "independent" ? IdentityAuthProvider.independent : IdentityAuthProvider.patreon;
}

function mapAuthProviderFromDb(a: IdentityAuthProvider): AuthProvider {
  return a === IdentityAuthProvider.independent ? "independent" : "patreon";
}

/**
 * @description Thrown when Patreon user id cannot be merged without splitting two `Account` rows.
 */
export class PatreonAccountLinkConflictError extends Error {
  public override readonly name = "PatreonAccountLinkConflictError";
  constructor(message?: string) {
    super(
      message ??
        "This Patreon account is already linked to a different Relay account. Sign in with the account that originally connected Patreon."
    );
    Object.setPrototypeOf(this, PatreonAccountLinkConflictError.prototype);
  }
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

/**
 * @description Postgres-backed identity store implementing {@link IdentityStore}.
 * @see ./identity-store.js
 */
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

      let account: Account | null = null;
      if (user.patreon_user_id) {
        const byPatreon = await tx.account.findUnique({
          where: { patronPatreonUserId: user.patreon_user_id }
        });
        const byEmail =
          emailNorm.length > 0
            ? await tx.account.findUnique({ where: { emailNorm } })
            : null;
        if (byPatreon && byEmail && byPatreon.id !== byEmail.id) {
          throw new PatreonAccountLinkConflictError();
        }
        account = byPatreon ?? byEmail;
      } else {
        account =
          emailNorm.length > 0
            ? await tx.account.findUnique({ where: { emailNorm } })
            : null;
      }

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

      // When an Account already existed (e.g. registered via email/Supabase before linking
      // Patreon, or materialized by creator-side member sync), its TenantMembership for this
      // tenant may have been created with a cuid id that differs from `user.user_id`. Upserting
      // by `user.user_id` would find nothing and try to CREATE, hitting the
      // @@unique([accountId, tenantId]) constraint. Look up by the natural compound key first.
      const existingMembership = await tx.tenantMembership.findUnique({
        where: { accountId_tenantId: { accountId: account.id, tenantId: tenant.id } }
      });
      const membershipId = existingMembership?.id ?? user.user_id;

      await tx.tenantMembership.upsert({
        where: { id: membershipId },
        create: {
          id: membershipId,
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

      // Sync the in-memory UserAccount with the actual DB membership id. Callers
      // (e.g. `registerPatreonFallback` → `completeUnifiedPatreonPatronOAuth` →
      // `createSessionForUser`, plus the PE-C `PatronFollow` seed) all use
      // `user.user_id` as the `TenantMembership.id`, so when an existing membership
      // wins the upsert, the returned `user_id` MUST be that membership's id —
      // otherwise downstream FK references (snapshot, follow, session lookup)
      // resolve to a phantom row.
      user.user_id = membershipId;

      if (user.creator_id !== getPlatformRelayCreatorId()) {
        await upsertPatronEntitlementSnapshotForOAuth(tx, {
          patronMembershipId: membershipId,
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
    const kind =
      session.kind === "extension" ? SessionKind.extension : SessionKind.web;
    await this.prisma.session.create({
      data: {
        tenantMembershipId: session.user_id,
        tokenHash: hash,
        expiresAt: new Date(session.expires_at),
        kind,
        label: session.label ?? null,
        lastUsedAt:
          session.last_used_at != null ? new Date(session.last_used_at) : null
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
      expires_at: row.expiresAt!.toISOString(),
      kind: row.kind === SessionKind.extension ? "extension" : "web",
      label: row.label ?? null,
      last_used_at: row.lastUsedAt?.toISOString() ?? null
    };
  }

  public async deleteSession(token: string): Promise<void> {
    const hash = hashOpaqueSessionToken(token);
    await this.prisma.session.deleteMany({ where: { tokenHash: hash } });
  }

  public async touchSessionExpiry(token: string): Promise<void> {
    const hash = hashOpaqueSessionToken(token);
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: hash },
      select: { id: true, kind: true }
    });
    if (!row || row.kind !== SessionKind.extension) return;
    const now = new Date();
    await this.prisma.session.update({
      where: { id: row.id },
      data: {
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + EXTENSION_SESSION_TTL_MS)
      }
    });
  }

  /**
   * PE-A: resolve a batch of Patreon `campaign_id` values to their Relay
   * `creator_id` strings via `CreatorProfile.patreonCampaignId → Tenant.relayCreatorId`.
   * Campaigns whose creator is not on Relay are simply absent from the result.
   */
  public async findRelayCreatorIdsByPatreonCampaignIds(
    patreonCampaignIds: readonly string[]
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = [...new Set(patreonCampaignIds.filter((s) => s.length > 0))];
    if (ids.length === 0) return out;
    const rows = await this.prisma.creatorProfile.findMany({
      where: { patreonCampaignId: { in: ids } },
      select: {
        patreonCampaignId: true,
        tenant: { select: { relayCreatorId: true } }
      }
    });
    for (const row of rows) {
      const cid = row.patreonCampaignId;
      const rid = row.tenant?.relayCreatorId;
      if (cid && rid) out.set(cid, rid);
    }
    return out;
  }
}

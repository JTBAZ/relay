import { readFile } from "node:fs/promises";
import {
  IdentityAuthProvider,
  PrismaClient,
  TenantRole,
  type Prisma
} from "@prisma/client";
import type {
  AuthProvider,
  IdentityStoreRoot,
  SessionToken,
  UserAccount
} from "./types.js";
import { hashOpaqueSessionToken } from "./session-token-hash.js";

function mapAuthProvider(a: AuthProvider): IdentityAuthProvider {
  return a === "independent" ? IdentityAuthProvider.independent : IdentityAuthProvider.patreon;
}

/**
 * Idempotent upsert from `identity.json` into Postgres (tenants, accounts, memberships, sessions with token hashes).
 * Intended for one-time migration; safe to re-run (same file → same rows).
 */
export async function backfillIdentityFromFile(args: {
  prisma: PrismaClient;
  filePath: string;
}): Promise<{ usersUpserted: number; sessionsUpserted: number }> {
  const raw = await readFile(args.filePath, "utf8");
  const root = JSON.parse(raw) as IdentityStoreRoot;
  const users = Object.values(root.users);
  const sessions = Object.values(root.sessions);

  let usersUpserted = 0;
  let sessionsUpserted = 0;

  await args.prisma.$transaction(async (tx) => {
    for (const u of users) {
      await upsertPatronMembership(tx, u);
      usersUpserted += 1;
    }
    for (const s of sessions) {
      await upsertSession(tx, s);
      sessionsUpserted += 1;
    }
  });

  return { usersUpserted, sessionsUpserted };
}

async function upsertPatronMembership(
  tx: Prisma.TransactionClient,
  user: UserAccount
): Promise<void> {
  const tenant = await tx.tenant.upsert({
    where: { relayCreatorId: user.creator_id },
    create: { relayCreatorId: user.creator_id },
    update: {}
  });
  const emailNorm = user.email.toLowerCase().trim();

  let account = await tx.account.findFirst({
    where: {
      OR: [
        ...(emailNorm.length > 0 ? [{ emailNorm }] : []),
        ...(user.patreon_user_id ? [{ patronPatreonUserId: user.patreon_user_id }] : [])
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
}

async function upsertSession(tx: Prisma.TransactionClient, session: SessionToken): Promise<void> {
  const tokenHash = hashOpaqueSessionToken(session.token);
  await tx.session.upsert({
    where: { tokenHash },
    create: {
      tenantMembershipId: session.user_id,
      tokenHash,
      expiresAt: new Date(session.expires_at),
      legacyFileId: `file:${session.user_id}`
    },
    update: {
      tenantMembershipId: session.user_id,
      expiresAt: new Date(session.expires_at),
      legacyFileId: `file:${session.user_id}`
    }
  });
}

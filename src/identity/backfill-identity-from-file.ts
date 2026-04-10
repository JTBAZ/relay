import { readFile } from "node:fs/promises";
import {
  IdentityAuthProvider,
  PrismaClient,
  UserKind,
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
 * Idempotent upsert from `identity.json` into Postgres (tenants, patron users, sessions with token hashes).
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
      await upsertPatronUser(tx, u);
      usersUpserted += 1;
    }
    for (const s of sessions) {
      await upsertSession(tx, s);
      sessionsUpserted += 1;
    }
  });

  return { usersUpserted, sessionsUpserted };
}

async function upsertPatronUser(
  tx: Prisma.TransactionClient,
  user: UserAccount
): Promise<void> {
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
}

async function upsertSession(tx: Prisma.TransactionClient, session: SessionToken): Promise<void> {
  const tokenHash = hashOpaqueSessionToken(session.token);
  await tx.session.upsert({
    where: { tokenHash },
    create: {
      userId: session.user_id,
      tokenHash,
      expiresAt: new Date(session.expires_at),
      legacyFileId: `file:${session.user_id}`
    },
    update: {
      userId: session.user_id,
      expiresAt: new Date(session.expires_at),
      legacyFileId: `file:${session.user_id}`
    }
  });
}

/**
 * @fileoverview Supabase Auth ↔ Prisma `Account` linking (Pattern A: `supabaseUserId`).
 * @description Idempotent upserts and patron membership ensures for Option B / MT-033 flows.
 * @see src/jsdoc-core-entities.ts
 */

import { randomUUID } from "node:crypto";
import {
  IdentityAuthProvider,
  PrismaClient,
  TenantRole,
  type Account
} from "@prisma/client";

export type UpsertSupabaseAccountResult = {
  account: Account;
  created: boolean;
};

/**
 * @description Ensures an `Account` row exists for a Supabase Auth user; merges by `supabaseUserId` or `emailNorm` when safe.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ supabaseUserId: string; email: string | null | undefined }} args
 * @returns {Promise<UpsertSupabaseAccountResult>}
 * @async
 * @throws {Error} When email is already linked to a different Supabase user.
 */
export async function upsertAccountForSupabaseUser(
  prisma: PrismaClient,
  args: { supabaseUserId: string; email: string | null | undefined }
): Promise<UpsertSupabaseAccountResult> {
  const supabaseUserId = args.supabaseUserId.trim();
  const emailNorm =
    typeof args.email === "string" && args.email.trim().length > 0
      ? args.email.toLowerCase().trim()
      : null;

  const existingBySupa = await prisma.account.findUnique({
    where: { supabaseUserId }
  });
  if (existingBySupa) {
    if (emailNorm && existingBySupa.emailNorm !== emailNorm) {
      const updated = await prisma.account.update({
        where: { id: existingBySupa.id },
        data: { emailNorm }
      });
      return { account: updated, created: false };
    }
    return { account: existingBySupa, created: false };
  }

  if (emailNorm) {
    const byEmail = await prisma.account.findUnique({
      where: { emailNorm }
    });
    if (byEmail) {
      if (byEmail.supabaseUserId && byEmail.supabaseUserId !== supabaseUserId) {
        throw new Error("Email is already linked to another Supabase user.");
      }
      const linked = await prisma.account.update({
        where: { id: byEmail.id },
        data: { supabaseUserId, identityAuthProvider: IdentityAuthProvider.independent }
      });
      return { account: linked, created: false };
    }
  }

  const created = await prisma.account.create({
    data: {
      emailNorm,
      identityAuthProvider: IdentityAuthProvider.independent,
      supabaseUserId,
      passwordHash: null
    }
  });
  return { account: created, created: true };
}

/**
 * @description Ensures a patron `TenantMembership` exists for `accountId` under the tenant for `creatorId`.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ accountId: string; creatorId: string; tierIds: string[] }} args
 * @returns {Promise<{ membershipId: string }>}
 * @async
 * @throws Errors from Prisma on constraint violations.
 */
export async function ensurePatronMembershipForSupabaseAccount(
  prisma: PrismaClient,
  args: { accountId: string; creatorId: string; tierIds: string[] }
): Promise<{ membershipId: string }> {
  const tenant = await prisma.tenant.upsert({
    where: { relayCreatorId: args.creatorId },
    create: { relayCreatorId: args.creatorId },
    update: {}
  });

  const existing = await prisma.tenantMembership.findFirst({
    where: {
      accountId: args.accountId,
      tenantId: tenant.id,
      role: TenantRole.patron
    }
  });

  if (existing) {
    await prisma.tenantMembership.update({
      where: { id: existing.id },
      data: { tierIds: args.tierIds }
    });
    return { membershipId: existing.id };
  }

  const membershipId = `tm_${randomUUID()}`;
  await prisma.tenantMembership.create({
    data: {
      id: membershipId,
      accountId: args.accountId,
      tenantId: tenant.id,
      role: TenantRole.patron,
      tierIds: args.tierIds
    }
  });
  return { membershipId };
}

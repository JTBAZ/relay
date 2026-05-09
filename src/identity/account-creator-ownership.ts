/**
 * @fileoverview Account ↔ creator ownership and tenant existence helpers (MT-034).
 * @description Validates `primaryRelayCreatorId` and known `Tenant.relayCreatorId` before persisting client ids.
 * @see src/jsdoc-core-entities.ts
 */

import type { PrismaClient } from "@prisma/client";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} accountId
 * @param {string} relayCreatorId
 * @returns {Promise<boolean>}
 * @async
 */
export async function accountOwnsRelayCreatorId(
  prisma: PrismaClient,
  accountId: string,
  relayCreatorId: string
): Promise<boolean> {
  const rid = relayCreatorId.trim();
  if (!rid) return false;
  const row = await prisma.account.findUnique({
    where: { id: accountId },
    select: { primaryRelayCreatorId: true }
  });
  return row?.primaryRelayCreatorId === rid;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} relayCreatorId
 * @returns {Promise<boolean>}
 * @async
 */
export async function relayCreatorIdExists(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<boolean> {
  const rid = relayCreatorId.trim();
  if (!rid) return false;
  const row = await prisma.tenant.findFirst({
    where: { relayCreatorId: rid },
    select: { id: true }
  });
  return row !== null;
}

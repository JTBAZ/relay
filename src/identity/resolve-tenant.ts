/**
 * @fileoverview Resolve `Tenant` by public slug or `relay_creator_id` for routing.
 * @description Canonical server-side tenant lookup; used by public profile and API scoping.
 * @see ../creator/public-slug.js
 * @see src/jsdoc-core-entities.ts
 */

import type { PrismaClient } from "@prisma/client";
import { normalizePublicSlugCandidate } from "../creator/public-slug.js";
import { prisma as defaultPrisma } from "../lib/db.js";

export type TenantRef = {
  /** Immutable `Tenant.id` (CUID) — use for FKs, RLS context, joins. */
  id: string;
  /** Immutable cross-system correlation key (`cr_*`). */
  relayCreatorId: string;
  /** Mutable URL slug from `CreatorProfile.public_slug` (null if no profile row). */
  publicSlug: string | null;
};

/**
 * @description Resolves `CreatorProfile.public_slug` to tenant ids (normalized, min length 3).
 * @param {string} slug
 * @param {import("@prisma/client").PrismaClient} [db]
 * @returns {Promise<TenantRef | null>}
 * @async
 */
export async function resolveTenantBySlug(
  slug: string,
  db: PrismaClient = defaultPrisma
): Promise<TenantRef | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const normalized = normalizePublicSlugCandidate(trimmed);
  if (!normalized || normalized.length < 3) return null;

  const row = await db.creatorProfile.findUnique({
    where: { publicSlug: normalized },
    select: {
      publicSlug: true,
      tenant: { select: { id: true, relayCreatorId: true } }
    }
  });
  const rid = row?.tenant.relayCreatorId;
  if (!row || !rid) return null;
  return {
    id: row.tenant.id,
    relayCreatorId: rid,
    publicSlug: row.publicSlug
  };
}

/**
 * @description Resolves immutable `cr_*` key to tenant + optional public slug.
 * @param {string} crId
 * @param {import("@prisma/client").PrismaClient} [db]
 * @returns {Promise<TenantRef | null>}
 * @async
 */
export async function resolveTenantByRelayCreatorId(
  crId: string,
  db: PrismaClient = defaultPrisma
): Promise<TenantRef | null> {
  const trimmed = crId.trim();
  if (!trimmed) return null;

  const row = await db.tenant.findUnique({
    where: { relayCreatorId: trimmed },
    select: {
      id: true,
      relayCreatorId: true,
      creators: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { publicSlug: true }
      }
    }
  });
  const rid = row?.relayCreatorId;
  if (!row || !rid) return null;
  return {
    id: row.id,
    relayCreatorId: rid,
    publicSlug: row.creators[0]?.publicSlug ?? null
  };
}

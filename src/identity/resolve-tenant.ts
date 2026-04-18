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
 * Resolve a public creator slug to `Tenant.id` + `relayCreatorId`.
 * Canonical slug → tenant lookup for server routes; call once per request.
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
 * Resolve immutable `cr_*` tenant key to `Tenant.id` (and public slug when present).
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

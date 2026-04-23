/**
 * PE-K Rest (BO-P4-04) — public patron profile lookup.
 *
 * Resolves a `/p/[handle]` request into a public-safe payload. The lookup is keyed on
 * `PatronProfile.handleNorm` (canonical lowercase form of the handle) and returns null when:
 *   - The handle doesn't exist in any profile row.
 *   - The matching profile has `isPublic = false`.
 *
 * Returning null in BOTH cases is intentional: it prevents handle enumeration. A drive-by
 * scraper learns nothing more from a private profile than from a non-existent one.
 *
 * What we DO return:
 *   - handle, display name, bio, avatar, banner (all PatronProfile fields the patron has
 *     curated through /patron/settings + the onboarding wizard)
 *   - public collections summary (id, title, entry count) — only collections with
 *     `isPublic = true`. Entry-level data (cover thumbnails, etc.) is deferred to a per-
 *     collection detail page; the profile page is intentionally low-density.
 *
 * What we DO NOT return:
 *   - the underlying TenantMembership id, account id, email, or any creator scope info
 *   - private collections, favorites, follows, or comments
 *   - anything keyed off entitlement state (this is a public profile, not a content surface)
 */

import type { PrismaClient } from "@prisma/client";

import { normalizePatronHandle } from "./patron-handle-policy.js";

export interface PublicPatronProfileView {
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  /** Subset of `PatronSavedCollection` rows where `isPublic = true`. */
  public_collections: Array<{
    id: string;
    title: string;
    entry_count: number;
    /** Stable ISO so SSR + JSON-LD can render consistently. */
    created_at: string;
  }>;
}

/** Returns the public payload, or null when the profile doesn't exist or isn't public. */
export async function getPublicPatronProfileByHandle(
  prisma: PrismaClient,
  rawHandle: string
): Promise<PublicPatronProfileView | null> {
  const handleNorm = normalizePatronHandle(rawHandle);
  if (!handleNorm) return null;
  const profile = await prisma.patronProfile.findUnique({
    where: { handleNorm },
    select: {
      tenantMembershipId: true,
      handle: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      bannerUrl: true,
      isPublic: true
    }
  });
  if (!profile || !profile.isPublic || !profile.handle) {
    // Same null for "private" and "not found" -- enumeration resistance.
    return null;
  }

  // Public collections live on PatronSavedCollection (D11). Membership join: a single profile
  // belongs to one membership, but a patron may have collections across multiple creators --
  // include all of theirs that are flagged isPublic.
  const collections = await prisma.patronSavedCollection.findMany({
    where: {
      patronMembershipId: profile.tenantMembershipId,
      isPublic: true
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      _count: { select: { entries: true } }
    },
    orderBy: { sortOrder: "asc" }
  });

  return {
    handle: profile.handle,
    display_name: profile.displayName,
    bio: profile.bio,
    avatar_url: profile.avatarUrl,
    banner_url: profile.bannerUrl,
    public_collections: collections.map((c) => ({
      id: c.id,
      title: c.title,
      entry_count: c._count.entries,
      created_at: c.createdAt.toISOString()
    }))
  };
}

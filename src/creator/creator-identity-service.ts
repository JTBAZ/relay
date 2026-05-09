/**
 * @fileoverview Creator-facing identity reads/patches and Patreon snapshot promotion into `CreatorProfile`.
 * @description Validation helpers for usernames; Prisma persistence for profile fields and slugs.
 * @see ../patreon/creator-campaign-display-store.js
 * @see prisma/schema.prisma CreatorProfile
 * @see src/jsdoc-core-entities.ts Artist
 */

import {
  PublicSlugSource,
  type CreatorProfile,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import type { CreatorCampaignDisplayStore } from "../patreon/creator-campaign-display-store.js";
import {
  allocateUniquePublicSlugFromNormalizedBase,
  normalizePublicSlugCandidate,
  RESERVED_PUBLIC_SLUGS
} from "./public-slug.js";

const MAX_BIO = 280;
const MAX_DISPLAY = 120;
const MAX_DISCIPLINE = 120;
const MAX_URL = 2048;
const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

const RESERVED_USERNAMES = new Set([
  ...RESERVED_PUBLIC_SLUGS,
  "admin",
  "moderator",
  "staff",
  "system",
  "relay",
  "support",
  "help",
  "root",
  "null",
  "undefined"
]);

/**
 * @description Read model for Relay creator profile cards (slug, Patreon ids, persona fields).
 * @security-audit-required Exposes patron-facing persona data; callers must scope by authorized account id.
 */
export type CreatorIdentityView = {
  public_slug: string;
  slug_source: PublicSlugSource;
  patreon_campaign_id: string | null;
  username: string | null;
  username_norm: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  discipline: string | null;
  needs_setup: boolean;
};

function toView(row: CreatorProfile): CreatorIdentityView {
  return {
    public_slug: row.publicSlug,
    slug_source: row.slugSource,
    patreon_campaign_id: row.patreonCampaignId,
    username: row.username,
    username_norm: row.usernameNorm,
    display_name: row.displayName,
    avatar_url: row.avatarUrl,
    banner_url: row.bannerUrl,
    bio: row.bio,
    discipline: row.discipline,
    needs_setup: !row.displayName || !row.avatarUrl
  };
}

/**
 * @description Normalizes inbound username candidates to lowercase alphanumeric + underscore form.
 * @param raw Raw username text.
 */
export function normalizeCreatorUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

/**
 * @description Validates normalized username constraints and reserved word list.
 * @param norm Already normalized username.
 */
export function validateCreatorUsernameFormat(
  norm: string
): { ok: true } | { ok: false; message: string } {
  if (!USERNAME_RE.test(norm)) {
    return {
      ok: false,
      message: "Username must be 3–32 characters: lowercase letters, numbers, and underscores only."
    };
  }
  if (RESERVED_USERNAMES.has(norm)) {
    return { ok: false, message: "That username is reserved." };
  }
  return { ok: true };
}

async function findCreatorProfileForAccount(
  prisma: PrismaClient,
  accountId: string
): Promise<CreatorProfile | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { primaryRelayCreatorId: true }
  });
  const relayId = account?.primaryRelayCreatorId?.trim();
  if (!relayId) return null;
  return prisma.creatorProfile.findFirst({
    where: { tenant: { relayCreatorId: relayId } }
  });
}

/**
 * @description Loads identity view derived from creator profile linked via `account.primaryRelayCreatorId`.
 * @param prisma Shared Prisma client.
 * @param accountId Caller account scope.
 * @returns View or `null` when no linked studio exists.
 * @async
 * @throws {Error} Prisma failures propagate.
 * @security-audit-required Caller must own `accountId`.
 */
export async function getCreatorIdentity(
  prisma: PrismaClient,
  accountId: string
): Promise<CreatorIdentityView | null> {
  const row = await findCreatorProfileForAccount(prisma, accountId);
  if (!row) return null;
  return toView(row);
}

/** @description Writable subset for `patchCreatorIdentity`. */
export type PatchCreatorIdentityInput = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  bio?: string | null;
  discipline?: string | null;
};

/** @description Result union for patched identity mutations. */
export type PatchCreatorIdentityResult =
  | { ok: true; profile: CreatorIdentityView }
  | { ok: false; message: string; code: "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND" };

/**
 * @description Applies validated field patches to creator profile backing the account's primary studio.
 * @param prisma Prisma client.
 * @param accountId Owning Relay account id.
 * @param patch Partial profile updates (null clears where allowed).
 * @returns Success with updated view or typed failure envelope.
 * @async
 * @throws {Error} Unexpected Prisma errors beyond handled conflict/validation branches.
 */
export async function patchCreatorIdentity(
  prisma: PrismaClient,
  accountId: string,
  patch: PatchCreatorIdentityInput
): Promise<PatchCreatorIdentityResult> {
  const row = await findCreatorProfileForAccount(prisma, accountId);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "No creator profile found." };
  }

  const data: Prisma.CreatorProfileUpdateInput = {};

  if (patch.display_name !== undefined) {
    const v = patch.display_name;
    if (v !== null && v.length > MAX_DISPLAY) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `display_name must be at most ${MAX_DISPLAY} characters.`
      };
    }
    data.displayName = v;
  }

  if (patch.bio !== undefined) {
    const v = patch.bio;
    if (v !== null && v.length > MAX_BIO) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `bio must be at most ${MAX_BIO} characters.`
      };
    }
    data.bio = v;
  }

  if (patch.discipline !== undefined) {
    const v = patch.discipline;
    if (v !== null && v.length > MAX_DISCIPLINE) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `discipline must be at most ${MAX_DISCIPLINE} characters.`
      };
    }
    data.discipline = v;
  }

  if (patch.avatar_url !== undefined) {
    const v = patch.avatar_url;
    if (v !== null && v.length > MAX_URL) {
      return { ok: false, code: "VALIDATION_ERROR", message: "avatar_url is too long." };
    }
    data.avatarUrl = v;
  }

  if (patch.banner_url !== undefined) {
    const v = patch.banner_url;
    if (v !== null && v.length > MAX_URL) {
      return { ok: false, code: "VALIDATION_ERROR", message: "banner_url is too long." };
    }
    data.bannerUrl = v;
  }

  if (patch.username !== undefined) {
    if (patch.username === null) {
      data.username = null;
      data.usernameNorm = null;
    } else {
      const norm = normalizeCreatorUsername(patch.username);
      const fmt = validateCreatorUsernameFormat(norm);
      if (!fmt.ok) {
        return { ok: false, code: "VALIDATION_ERROR", message: fmt.message };
      }
      const clash = await prisma.creatorProfile.findFirst({
        where: { usernameNorm: norm, NOT: { id: row.id } },
        select: { id: true }
      });
      if (clash) {
        return { ok: false, code: "CONFLICT", message: "That username is already taken." };
      }
      data.username = patch.username.trim();
      data.usernameNorm = norm;
    }
  }

  if (Object.keys(data).length === 0) {
    return { ok: true, profile: toView(row) };
  }

  const updated = await prisma.creatorProfile.update({
    where: { id: row.id },
    data
  });
  return { ok: true, profile: toView(updated) };
}

/**
 * Idempotent: when `CreatorProfile` identity fields are null, fill them
 * from the `CampaignDisplaySnapshot` captured during Patreon OAuth/sync.
 * Never overwrites creator-authored edits.
 * @description Fills nullable profile identity fields using Patreon-backed snapshot when safe.
 * @param prisma Shared Prisma client.
 * @param snapshotStore Cached campaign display rows from OAuth/sync pipeline.
 * @param relayCreatorId Relay legacy creator identifier.
 * @returns Whether any profile mutation occurred.
 * @async
 * @throws {Error} Database failures propagate.
 */
export async function promoteSnapshotToProfile(
  prisma: PrismaClient,
  snapshotStore: CreatorCampaignDisplayStore,
  relayCreatorId: string
): Promise<{ promoted: boolean }> {
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  if (!tenant) return { promoted: false };

  const profile = await prisma.creatorProfile.findFirst({
    where: { tenantId: tenant.id }
  });
  if (!profile) return { promoted: false };

  const snap = await snapshotStore.get(relayCreatorId);
  if (!snap) return { promoted: false };

  const data: Prisma.CreatorProfileUpdateInput = {};

  if (!profile.displayName && snap.patreon_name) {
    data.displayName = snap.patreon_name;
  }
  if (!profile.avatarUrl && snap.image_small_url) {
    data.avatarUrl = snap.image_small_url;
  }
  if (!profile.bannerUrl && snap.image_url) {
    data.bannerUrl = snap.image_url;
  }
  if (!profile.username && snap.patreon_name) {
    const norm = normalizeCreatorUsername(snap.patreon_name);
    const fmt = validateCreatorUsernameFormat(norm);
    if (fmt.ok) {
      const clash = await prisma.creatorProfile.findFirst({
        where: { usernameNorm: norm, NOT: { id: profile.id } },
        select: { id: true }
      });
      if (!clash) {
        data.username = snap.patreon_name.trim().toLowerCase();
        data.usernameNorm = norm;
      }
    }
  }

  if (profile.slugSource === PublicSlugSource.allocated && snap.patreon_name?.trim()) {
    const desired = normalizePublicSlugCandidate(snap.patreon_name.trim());
    if (desired.length >= 3) {
      const unique = await allocateUniquePublicSlugFromNormalizedBase(
        prisma,
        desired,
        profile.id
      );
      if (unique) {
        if (unique !== profile.publicSlug) {
          data.publicSlug = unique;
        }
        data.slugSource = PublicSlugSource.patreon_default;
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return { promoted: false };
  }

  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data
  });
  return { promoted: true };
}

/**
 * @fileoverview Public slug allocation and validation for `CreatorProfile.publicSlug`.
 * @description Reserved word guardrails, normalization, and collision-aware allocation helpers for Prisma transactions.
 * @see prisma/schema.prisma CreatorProfile
 * @see src/jsdoc-core-entities.ts Artist.slug
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * Routes and product names that must not be used as public creator slugs.
 * @description Reserved segments blocked from `publicSlug` to avoid routing collisions.
 */
export const RESERVED_PUBLIC_SLUGS = new Set([
  "about",
  "account",
  "action-center",
  "admin",
  "api",
  "app",
  "auth",
  "callback",
  "collections",
  "commission",
  "creator",
  "creators",
  "designer",
  "dev",
  "favorites",
  "feed",
  "help",
  "landing",
  "login",
  "logout",
  "new",
  "null",
  "oauth",
  "onboarding",
  "patron",
  "patrons",
  "privacy",
  "private",
  "public",
  "patreon",
  "relay",
  "settings",
  "signup",
  "static",
  "support",
  "terms",
  "undefined",
  "visitor",
  "visitors",
  "www"
]);

/** @description Regex validating final slug shape after normalization. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * @description Sanitizes slug candidates for public profile URLs.
 * @param raw User or campaign derived string.
 * @returns Normalized slug fragment.
 */
export function normalizePublicSlugCandidate(raw: string): string {
  let s = raw.toLowerCase().trim();
  const at = s.indexOf("@");
  if (at !== -1) {
    s = s.slice(0, at);
  }
  const plus = s.indexOf("+");
  if (plus !== -1) {
    s = s.slice(0, plus);
  }
  s = s.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.length > 32) {
    s = s.slice(0, 32).replace(/-+$/g, "");
  }
  return s;
}

/**
 * @description Derives default slug text from an email local-part using {@link normalizePublicSlugCandidate}.
 * @param email Email address or null/undefined.
 * @returns Candidate slug or fallback `studio`.
 */
export function defaultPublicSlugFromEmail(email: string | null | undefined): string {
  if (!email?.trim()) {
    return "studio";
  }
  const n = normalizePublicSlugCandidate(email);
  return n.length >= 3 ? n : "studio";
}

/**
 * @description Validates length, charset, and reserved list for slug publish.
 * @param slug Raw slug string.
 * @returns Success or human-readable validation error.
 */
export function validatePublicSlugFormat(
  slug: string
): { ok: true } | { ok: false; message: string } {
  const s = slug.trim().toLowerCase();
  if (s.length < 3 || s.length > 32) {
    return { ok: false, message: "Slug must be between 3 and 32 characters." };
  }
  if (!SLUG_RE.test(s)) {
    return {
      ok: false,
      message: "Use lowercase letters, numbers, and hyphens only (no leading or trailing hyphen)."
    };
  }
  if (RESERVED_PUBLIC_SLUGS.has(s)) {
    return { ok: false, message: "This URL is reserved. Pick another slug." };
  }
  return { ok: true };
}

type CreatorProfileDb = Pick<PrismaClient, "creatorProfile">;

async function isPublicSlugOwnedOrFree(
  tx: CreatorProfileDb,
  candidate: string,
  ownProfileId: string
): Promise<boolean> {
  const row = await tx.creatorProfile.findFirst({
    where: { publicSlug: candidate },
    select: { id: true }
  });
  return !row || row.id === ownProfileId;
}

/**
 * Resolves a unique `public_slug` from an already-normalized base (e.g. Patreon campaign vanity).
 * Returns null if the base fails format validation. On collision with another profile, appends
 * `-{hex}` until unique (max attempts).
 * @description Allocates unique slug from vanity base with suffix attempts inside `tx`.
 * @param tx Prisma interface exposing `creatorProfile`.
 * @param normalizedBase Already normalized slug candidate.
 * @param ownProfileId Profile row id allowed to keep existing claim on `normalizedBase`.
 * @returns Unique slug or `null` when validation fails or attempts exhausted.
 * @async
 * @throws {Error} Prisma query failures propagate.
 */
export async function allocateUniquePublicSlugFromNormalizedBase(
  tx: CreatorProfileDb,
  normalizedBase: string,
  ownProfileId: string
): Promise<string | null> {
  const v = validatePublicSlugFormat(normalizedBase);
  if (!v.ok) {
    return null;
  }
  if (await isPublicSlugOwnedOrFree(tx, normalizedBase, ownProfileId)) {
    return normalizedBase;
  }
  for (let attempt = 0; attempt < 64; attempt++) {
    const suffix = randomBytes(2).toString("hex");
    let candidate = `${normalizedBase}-${suffix}`;
    if (candidate.length > 32) {
      const maxBaseLen = 32 - suffix.length - 1;
      const truncated = normalizedBase
        .slice(0, Math.max(3, maxBaseLen))
        .replace(/-+$/g, "");
      candidate = `${truncated}-${suffix}`;
    }
    const v2 = validatePublicSlugFormat(candidate);
    if (!v2.ok) {
      continue;
    }
    if (await isPublicSlugOwnedOrFree(tx, candidate, ownProfileId)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Picks a unique `public_slug` starting from an email-derived base, appending short
 * random suffixes on collision (inside a transaction).
 * @description Entry point for first-time slug allocation from email-derived base.
 * @param tx Prisma client/tx with `creatorProfile` access.
 * @param email Optional email seed.
 * @returns Allocated unique slug.
 * @async
 * @throws {Error} When uniqueness cannot be achieved after attempts.
 */
export async function allocateUniquePublicSlug(
  tx: CreatorProfileDb,
  email: string | null | undefined
): Promise<string> {
  let base = defaultPublicSlugFromEmail(email);
  if (base.length < 3) {
    base = "studio";
  }
  if (RESERVED_PUBLIC_SLUGS.has(base)) {
    base = `${base}-x`;
  }

  for (let attempt = 0; attempt < 64; attempt++) {
    const candidate =
      attempt === 0 ? base : `relay-${randomBytes(7).toString("hex")}`;
    const v = validatePublicSlugFormat(candidate);
    if (!v.ok) {
      base = `studio-${randomBytes(3).toString("hex")}`;
      continue;
    }
    const existing = await tx.creatorProfile.findUnique({
      where: { publicSlug: candidate },
      select: { id: true }
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Could not allocate a unique public slug.");
}

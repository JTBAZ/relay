import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/** Routes and product names that must not be used as public creator slugs. */
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

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

/** Default slug from signup email local-part (before @ and +tag). */
export function defaultPublicSlugFromEmail(email: string | null | undefined): string {
  if (!email?.trim()) {
    return "studio";
  }
  const n = normalizePublicSlugCandidate(email);
  return n.length >= 3 ? n : "studio";
}

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

/**
 * Picks a unique `public_slug` starting from an email-derived base, appending short
 * random suffixes on collision (inside a transaction).
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

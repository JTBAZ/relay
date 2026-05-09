/**
 * @fileoverview Patron experience module patron-profile-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
import type { PatronProfile, Prisma, PrismaClient } from "@prisma/client";
import {
  generateAutoPatronHandle,
  isReservedPatronHandle,
  normalizePatronHandle,
  validatePatronHandleFormat
} from "./patron-handle-policy.js";

const MAX_BIO = 4000;
const MAX_DISPLAY = 120;
const MAX_URL = 2048;
const ONBOARDING_MAX_STEP = 4;

export type PatronProfileView = {
  tenant_membership_id: string;
  handle: string | null;
  handle_norm: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_public: boolean;
  onboarding_step: number;
};

function toView(row: PatronProfile): PatronProfileView {
  return {
    tenant_membership_id: row.tenantMembershipId,
    handle: row.handle,
    handle_norm: row.handleNorm,
    display_name: row.displayName,
    bio: row.bio,
    avatar_url: row.avatarUrl,
    banner_url: row.bannerUrl,
    is_public: row.isPublic,
    onboarding_step: row.onboardingStep
  };
}

async function pickUniqueAutoHandle(prisma: PrismaClient): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const candidate = normalizePatronHandle(generateAutoPatronHandle());
    const clash = await prisma.patronProfile.findUnique({
      where: { handleNorm: candidate },
      select: { id: true }
    });
    if (!clash) return candidate;
  }
  throw new Error("Could not allocate a unique auto handle for PatronProfile.");
}

/**
 * Lazy-create `PatronProfile` with auto `handle` / `handleNorm` when missing (D16).
 */
export async function ensurePatronProfileForMembership(
  prisma: PrismaClient,
  tenantMembershipId: string
): Promise<PatronProfile> {
  const existing = await prisma.patronProfile.findUnique({
    where: { tenantMembershipId }
  });
  if (existing) {
    if (!existing.handleNorm || !existing.handle) {
      const auto = await pickUniqueAutoHandle(prisma);
      return prisma.patronProfile.update({
        where: { tenantMembershipId },
        data: {
          handle: existing.handle ?? auto,
          handleNorm: existing.handleNorm ?? auto
        }
      });
    }
    return existing;
  }
  const auto = await pickUniqueAutoHandle(prisma);
  return prisma.patronProfile.create({
    data: {
      tenantMembershipId,
      handle: auto,
      handleNorm: auto
    }
  });
}

export async function getPatronProfileViewForMembership(
  prisma: PrismaClient,
  tenantMembershipId: string
): Promise<PatronProfileView> {
  const row = await ensurePatronProfileForMembership(prisma, tenantMembershipId);
  return toView(row);
}

export type PatchPatronProfileInput = {
  handle?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  is_public?: boolean;
  onboarding_step?: number;
};

export type PatchPatronProfileResult =
  | { ok: true; profile: PatronProfileView }
  | { ok: false; message: string; code: "VALIDATION_ERROR" | "CONFLICT" };

export async function patchPatronProfileForMembership(
  prisma: PrismaClient,
  tenantMembershipId: string,
  patch: PatchPatronProfileInput
): Promise<PatchPatronProfileResult> {
  const row = await ensurePatronProfileForMembership(prisma, tenantMembershipId);

  const data: Prisma.PatronProfileUpdateInput = {};

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
  if (patch.avatar_url !== undefined) {
    const v = patch.avatar_url;
    if (v !== null && v.length > MAX_URL) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "avatar_url is too long."
      };
    }
    data.avatarUrl = v;
  }
  if (patch.banner_url !== undefined) {
    const v = patch.banner_url;
    if (v !== null && v.length > MAX_URL) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "banner_url is too long."
      };
    }
    data.bannerUrl = v;
  }
  if (patch.is_public !== undefined) {
    data.isPublic = patch.is_public;
  }
  if (patch.onboarding_step !== undefined) {
    const s = patch.onboarding_step;
    if (!Number.isInteger(s) || s < 0 || s > ONBOARDING_MAX_STEP) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `onboarding_step must be an integer 0–${ONBOARDING_MAX_STEP}.`
      };
    }
    data.onboardingStep = s;
  }

  if (patch.handle !== undefined) {
    if (patch.handle === null) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "handle cannot be cleared; use the auto-generated value or pick a new handle."
      };
    }
    const norm = normalizePatronHandle(patch.handle);
    const fmt = validatePatronHandleFormat(norm);
    if (!fmt.ok) {
      return { ok: false, code: "VALIDATION_ERROR", message: fmt.message };
    }
    if (isReservedPatronHandle(norm)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "That handle is reserved."
      };
    }
    const other = await prisma.patronProfile.findFirst({
      where: {
        handleNorm: norm,
        NOT: { tenantMembershipId }
      },
      select: { id: true }
    });
    if (other) {
      return {
        ok: false,
        code: "CONFLICT",
        message: "That handle is already taken."
      };
    }
    data.handle = patch.handle.trim();
    data.handleNorm = norm;
  }

  if (Object.keys(data).length === 0) {
    return { ok: true, profile: toView(row) };
  }

  const updated = await prisma.patronProfile.update({
    where: { tenantMembershipId },
    data
  });
  return { ok: true, profile: toView(updated) };
}

/**
 * @fileoverview Patron experience module patron-profile-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
import type { PatronProfile, Prisma, PrismaClient } from "@prisma/client";
import {
  generateAutoPatronHandle,
  normalizePatronHandle,
} from "./patron-handle-policy.js";
import { setRelayUsernameForAccount } from "../identity/relay-username-service.js";
import {
  MUTED_NOTIFICATION_CADENCE,
  isMutedNotificationCadence,
  normalizeNotificationDigestCadence,
  normalizeNotificationCadencePreference,
  normalizeNotificationDigestSlot,
  type NotificationCadencePreferenceId,
  type NotificationDigestSlotId,
} from "./notification-digest-preferences.js";
import { resolveNotificationDigestTimezone as normalizeNotificationDigestTimezone } from "./notification-digest-schedule.js";
import { isAllowedPatronProfileImageUrl } from "./patron-profile-upload-service.js";

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
  notification_digest_enabled: boolean;
  notification_digest_cadence: NotificationCadencePreferenceId;
  notification_digest_slot: NotificationDigestSlotId | null;
  notification_digest_timezone: string | null;
  hide_mature_content: boolean;
};

function toView(
  row: PatronProfile,
  account?: { username: string | null; usernameNorm: string | null } | null
): PatronProfileView {
  return {
    tenant_membership_id: row.tenantMembershipId,
    handle: account?.username ?? row.handle,
    handle_norm: account?.usernameNorm ?? row.handleNorm,
    display_name: row.displayName,
    bio: row.bio,
    avatar_url: row.avatarUrl,
    banner_url: row.bannerUrl,
    is_public: row.isPublic,
    onboarding_step: row.onboardingStep,
    notification_digest_enabled: row.notificationDigestEnabled,
    notification_digest_cadence:
      normalizeNotificationCadencePreference(row.notificationDigestCadence) ?? "weekly",
    notification_digest_slot: normalizeNotificationDigestSlot(row.notificationDigestSlot),
    notification_digest_timezone: row.notificationDigestTimezone,
    hide_mature_content: row.hideMatureContent,
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
  const membership = await prisma.tenantMembership.findUnique({
    where: { id: tenantMembershipId },
    select: { account: { select: { username: true, usernameNorm: true } } }
  });
  return toView(row, membership?.account);
}

export type PatchPatronProfileInput = {
  handle?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  is_public?: boolean;
  onboarding_step?: number;
  notification_digest_enabled?: boolean;
  notification_digest_cadence?: string | null;
  notification_digest_slot?: string | null;
  notification_digest_timezone?: string | null;
  hide_mature_content?: boolean;
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
  let membershipAccountId: string | null = null;
  const needsImageUrlAccount =
    (patch.avatar_url !== undefined && patch.avatar_url !== null) ||
    (patch.banner_url !== undefined && patch.banner_url !== null);
  if (needsImageUrlAccount) {
    const membership = await prisma.tenantMembership.findUnique({
      where: { id: tenantMembershipId },
      select: { accountId: true },
    });
    membershipAccountId = membership?.accountId ?? null;
    if (!membershipAccountId) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Membership not found.",
      };
    }
  }

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
    if (v !== null && !isAllowedPatronProfileImageUrl(v, membershipAccountId!)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "avatar_url must be a Relay-hosted profile image or static default.",
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
    if (v !== null && !isAllowedPatronProfileImageUrl(v, membershipAccountId!)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "banner_url must be a Relay-hosted profile image or static default.",
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
  if (patch.notification_digest_enabled !== undefined) {
    data.notificationDigestEnabled = patch.notification_digest_enabled;
  }
  if (patch.notification_digest_cadence !== undefined) {
    if (patch.notification_digest_cadence === null) {
      data.notificationDigestCadence = "weekly";
    } else {
      if (isMutedNotificationCadence(patch.notification_digest_cadence)) {
        data.notificationDigestCadence = MUTED_NOTIFICATION_CADENCE;
      } else {
        const cadence = normalizeNotificationDigestCadence(patch.notification_digest_cadence);
        if (!cadence) {
          return {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "notification_digest_cadence must be one of: weekly, monthly, never.",
          };
        }
        data.notificationDigestCadence = cadence;
      }
    }
  }
  if (patch.notification_digest_slot !== undefined) {
    if (patch.notification_digest_slot === null) {
      data.notificationDigestSlot = null;
    } else {
      const slot = normalizeNotificationDigestSlot(patch.notification_digest_slot);
      if (!slot) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          message:
            "notification_digest_slot must be one of: morning, midday, evening, late_night.",
        };
      }
      data.notificationDigestSlot = slot;
    }
  }
  if (patch.notification_digest_timezone !== undefined) {
    if (patch.notification_digest_timezone === null) {
      data.notificationDigestTimezone = null;
    } else {
      data.notificationDigestTimezone = normalizeNotificationDigestTimezone(
        patch.notification_digest_timezone
      );
    }
  }
  if (patch.hide_mature_content !== undefined) {
    data.hideMatureContent = patch.hide_mature_content;
  }

  if (patch.handle !== undefined) {
    if (patch.handle === null) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "handle cannot be cleared; use the auto-generated value or pick a new handle."
      };
    }
    const membership = await prisma.tenantMembership.findUnique({
      where: { id: tenantMembershipId },
      select: { accountId: true }
    });
    if (!membership) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Membership not found."
      };
    }
    try {
      const next = await setRelayUsernameForAccount(prisma, {
        accountId: membership.accountId,
        username: patch.handle
      });
      data.handle = next.username;
      data.handleNorm = next.usernameNorm;
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code: string }).code
          : "VALIDATION_ERROR";
      return {
        ok: false,
        code: code === "CONFLICT" ? "CONFLICT" : "VALIDATION_ERROR",
        message: err instanceof Error ? err.message : "Invalid username."
      };
    }
  }

  if (Object.keys(data).length === 0) {
    const membership = await prisma.tenantMembership.findUnique({
      where: { id: tenantMembershipId },
      select: { account: { select: { username: true, usernameNorm: true } } }
    });
    return { ok: true, profile: toView(row, membership?.account) };
  }

  const updated = await prisma.patronProfile.update({
    where: { tenantMembershipId },
    data
  });
  const membership = await prisma.tenantMembership.findUnique({
    where: { id: tenantMembershipId },
    select: { account: { select: { username: true, usernameNorm: true } } }
  });
  return { ok: true, profile: toView(updated, membership?.account) };
}

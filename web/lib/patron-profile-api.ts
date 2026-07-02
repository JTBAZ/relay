import { relayFetch, relayFetchWithoutAuthRedirect } from "@/lib/relay-api";
import type {
  NotificationCadencePreferenceId,
  NotificationDigestSlotId,
} from "@/lib/notification-digest-preferences";

/** UI cap for patron bio — matches creator onboarding textarea limit. */
export const PATRON_PROFILE_BIO_UI_LIMIT = 280;

/** Server cap for patron display name (`PatronProfile.displayName`). */
export const PATRON_PROFILE_DISPLAY_NAME_LIMIT = 120;

/** Row from `GET /api/v1/patron/me`. */
export type PatronProfileMe = {
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

export type PatronProfileMeFetchOptions = {
  /** Dev/optional previews should fall back instead of navigating to `/login` on 401. */
  suppressAuthRedirect?: boolean;
};

export async function fetchPatronProfileMe(
  options: PatronProfileMeFetchOptions = {}
): Promise<PatronProfileMe> {
  const fetcher = options.suppressAuthRedirect
    ? relayFetchWithoutAuthRedirect
    : relayFetch;
  return fetcher<PatronProfileMe>("/api/v1/patron/me");
}

export type PatronProfilePatch = {
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  notification_digest_enabled?: boolean;
  notification_digest_cadence?: NotificationCadencePreferenceId | null;
  notification_digest_slot?: NotificationDigestSlotId | null;
  notification_digest_timezone?: string | null;
  hide_mature_content?: boolean;
};

function browserTimezone(): string | null {
  if (typeof Intl === "undefined") return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function resolvedPatronDigestTimezone(existing: string | null | undefined): string | null {
  return existing?.trim() || browserTimezone();
}

function normalizePatchString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function patchPatronProfileMe(
  patch: PatronProfilePatch
): Promise<PatronProfileMe> {
  const body: PatronProfilePatch = {};
  if (patch.display_name !== undefined) {
    body.display_name = normalizePatchString(patch.display_name) ?? null;
  }
  if (patch.bio !== undefined) {
    body.bio = normalizePatchString(patch.bio) ?? null;
  }
  if (patch.avatar_url !== undefined) {
    body.avatar_url = normalizePatchString(patch.avatar_url) ?? null;
  }
  if (patch.banner_url !== undefined) {
    body.banner_url = normalizePatchString(patch.banner_url) ?? null;
  }
  if (patch.notification_digest_enabled !== undefined) {
    body.notification_digest_enabled = patch.notification_digest_enabled;
  }
  if (patch.notification_digest_cadence !== undefined) {
    body.notification_digest_cadence = patch.notification_digest_cadence;
  }
  if (patch.notification_digest_slot !== undefined) {
    body.notification_digest_slot = patch.notification_digest_slot;
  }
  if (patch.notification_digest_timezone !== undefined) {
    body.notification_digest_timezone = normalizePatchString(patch.notification_digest_timezone) ?? null;
  }
  if (patch.hide_mature_content !== undefined) {
    body.hide_mature_content = patch.hide_mature_content;
  }
  return relayFetch<PatronProfileMe>("/api/v1/patron/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

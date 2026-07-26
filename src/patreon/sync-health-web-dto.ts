/**
 * P5-sync-001 — Normalized sync health DTO for web clients (Library banner, read-only gates).
 * Source: `CreatorSyncHealthState` from patreon-sync-health-store / DB `CreatorSyncState` JSON.
 */

import type { CreatorSyncHealthState, SyncHealthError } from "./patreon-sync-health-store.js";

/** Rollup for creator-facing UI (banner color, gating). */
export type SyncHealthWebStatus = "unknown" | "healthy" | "degraded" | "failed";

export type SyncHealthWebLastError = (SyncHealthError & {
  source: "post_scrape" | "member_sync";
}) | null;

/** Single JSON shape for sync health surfaces (P5-sync-002+). */
export type SyncHealthWebDto = {
  status: SyncHealthWebStatus;
  /** Latest `finished_at` among successful post scrape and/or member sync (ISO 8601), or null if none. */
  last_success_at: string | null;
  /** Most severe current error (post scrape takes precedence over member sync). */
  last_error: SyncHealthWebLastError;
  /** Patreon campaign id from scrape or member snapshot when present. */
  campaign_id: string | null;
  /** Stable key for copy deck / i18n (no user-facing prose in API). */
  message_key: string;
};

const MSG = {
  unknown: "sync_health.unknown",
  healthy: "sync_health.healthy",
  post_scrape_failed: "sync_health.post_scrape_failed",
  member_sync_failed: "sync_health.member_sync_failed",
  post_scrape_warnings: "sync_health.post_scrape_warnings"
} as const;

function maxIsoTimes(times: string[]): string | null {
  if (times.length === 0) return null;
  return [...times].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).at(-1) ?? null;
}

/**
 * Maps internal health snapshots to a stable web DTO.
 *
 * - **failed:** last post scrape ended with `ok: false`.
 * - **degraded:** post scrape succeeded with warnings, or member sync failed while posts are OK.
 * - **healthy:** last post scrape OK without warnings (member sync OK or absent); or only member OK if no post row yet.
 * - **unknown:** no scrape/member data.
 */
export function creatorSyncHealthStateToWebDto(
  state: CreatorSyncHealthState | null | undefined
): SyncHealthWebDto {
  const baseUnknown: SyncHealthWebDto = {
    status: "unknown",
    last_success_at: null,
    last_error: null,
    campaign_id: null,
    message_key: MSG.unknown
  };

  if (!state) {
    return baseUnknown;
  }

  const post = state.last_post_scrape;
  const member = state.last_member_sync;

  if (!post && !member) {
    return baseUnknown;
  }

  const successTimes: string[] = [];
  if (post?.ok === true) successTimes.push(post.finished_at);
  if (member?.ok === true) successTimes.push(member.finished_at);
  const last_success_at = maxIsoTimes(successTimes);

  const campaign_id =
    (typeof post?.patreon_campaign_id === "string" ? post.patreon_campaign_id : null) ??
    (typeof member?.patreon_campaign_id === "string" ? member.patreon_campaign_id : null) ??
    null;

  if (post?.ok === false) {
    const err = post.error;
    return {
      status: "failed",
      last_success_at,
      last_error: err ? { ...err, source: "post_scrape" as const } : null,
      campaign_id,
      message_key: MSG.post_scrape_failed
    };
  }

  if (post?.ok === true && (post.warning_snippets?.length ?? 0) > 0) {
    return {
      status: "degraded",
      last_success_at,
      last_error: null,
      campaign_id,
      message_key: MSG.post_scrape_warnings
    };
  }

  if (member?.ok === false) {
    const err = member.error;
    return {
      status: "degraded",
      last_success_at,
      last_error: err ? { ...err, source: "member_sync" as const } : null,
      campaign_id,
      message_key: MSG.member_sync_failed
    };
  }

  if (post?.ok === true || member?.ok === true) {
    return {
      status: "healthy",
      last_success_at,
      last_error: null,
      campaign_id,
      message_key: MSG.healthy
    };
  }

  return {
    ...baseUnknown,
    campaign_id
  };
}

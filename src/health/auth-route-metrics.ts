/**
 * @fileoverview Supabase-auth sync telemetry counters surfaced on platform health (MIG-51).
 * @description In-process counters for auth-related routes scraped via `GET /api/v1/health/platform`.
 * Resets on process restart; for durable audit use DB logs or an external metrics sink.
 */

let supabaseSyncSuccess = 0;
let supabaseSyncAuthError = 0;
let supabaseSyncOtherError = 0;

/** @description Categorizes Supabase `/sync` attempts for dashboards. */
export type SupabaseSyncOutcome = "success" | "auth_error" | "other_error";

/**
 * @description Increments auth sync counters for the given outcome bucket.
 * @param outcome Result classification.
 */
export function recordSupabaseSyncOutcome(outcome: SupabaseSyncOutcome): void {
  switch (outcome) {
    case "success":
      supabaseSyncSuccess += 1;
      break;
    case "auth_error":
      supabaseSyncAuthError += 1;
      break;
    case "other_error":
      supabaseSyncOtherError += 1;
      break;
    default:
      break;
  }
}

/**
 * @description Snapshot of Supabase sync counters since process boot.
 * @returns Totals for success/auth/other error paths.
 */
export function getSupabaseSyncRouteMetrics(): {
  supabase_sync_success_total: number;
  supabase_sync_auth_error_total: number;
  supabase_sync_other_error_total: number;
  supabase_sync_attempts_total: number;
} {
  return {
    supabase_sync_success_total: supabaseSyncSuccess,
    supabase_sync_auth_error_total: supabaseSyncAuthError,
    supabase_sync_other_error_total: supabaseSyncOtherError,
    supabase_sync_attempts_total:
      supabaseSyncSuccess + supabaseSyncAuthError + supabaseSyncOtherError
  };
}

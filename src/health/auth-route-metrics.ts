/**
 * MIG-51 — In-process counters for auth-related routes (scraped via `GET /api/v1/health/platform`).
 * Resets on process restart; for durable audit use DB logs or an external metrics sink.
 */

let supabaseSyncSuccess = 0;
let supabaseSyncAuthError = 0;
let supabaseSyncOtherError = 0;

export type SupabaseSyncOutcome = "success" | "auth_error" | "other_error";

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

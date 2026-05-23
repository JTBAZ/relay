/**
 * PILOT-001 — Patreon-only pilot cohort scope (web).
 * When enabled, SubscribeStar connect UI is suppressed even if
 * `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT=1`.
 */
export function isPilotPatreonOnlyScope(): boolean {
  return process.env.NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY === "1";
}

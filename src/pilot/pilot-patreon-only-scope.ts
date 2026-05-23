/**
 * PILOT-001 — Patreon-only pilot cohort scope (API).
 * SubscribeStar OAuth/ingest routes should refuse when this is enabled.
 */
function relayEnvTruthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isPilotPatreonOnlyScope(): boolean {
  return relayEnvTruthy(process.env.RELAY_PILOT_PATREON_ONLY);
}

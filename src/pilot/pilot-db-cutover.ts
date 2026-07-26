/**
 * PILOT-002 — Postgres-backed store requirements for the pilot host.
 * See docs/pilot-db-cutover.md for operator runbook and migrate/backfill order.
 */

export type PilotDbStoreKey =
  | "IDENTITY"
  | "CANONICAL"
  | "OVERRIDES"
  | "CREATOR_OAUTH"
  | "WATERMARK"
  | "SYNC_HEALTH"
  | "COLLECTIONS"
  | "SAVED_FILTERS"
  | "LAYOUT"
  | "DLQ"
  | "EVENTS"
  | "ANALYTICS"
  | "PATRON_ENGAGEMENT";

export type PilotDbStoreRow = {
  env: string;
  key: PilotDbStoreKey;
  /** Minimum for pilot UX (seed, login, gallery, patron feed, comments). */
  requiredForPilotUx: boolean;
  /** Recommended when exercising full PUX gates (hidden visibility, Library curation). */
  recommendedForPilotUx: boolean;
  pilotSurface: string;
};

function relayEnvTruthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isRelayDbStoreEnabled(envName: string): boolean {
  return relayEnvTruthy(process.env[envName]);
}

/** Canonical pilot store matrix (env names match root `.env.example`). */
export const PILOT_DB_STORE_MATRIX: readonly PilotDbStoreRow[] = [
  {
    env: "RELAY_DB_STORE_IDENTITY",
    key: "IDENTITY",
    requiredForPilotUx: true,
    recommendedForPilotUx: true,
    pilotSurface: "Login, sessions, patron feed, comments, pilot-ux seed"
  },
  {
    env: "RELAY_DB_STORE_CANONICAL",
    key: "CANONICAL",
    requiredForPilotUx: true,
    recommendedForPilotUx: true,
    pilotSurface: "Posts, tiers, patron feed assembly, pilot-ux seed"
  },
  {
    env: "RELAY_DB_STORE_OVERRIDES",
    key: "OVERRIDES",
    requiredForPilotUx: false,
    recommendedForPilotUx: true,
    pilotSurface: "Gallery visibility / hidden posts (PUX-006)"
  },
  {
    env: "RELAY_DB_STORE_CREATOR_OAUTH",
    key: "CREATOR_OAUTH",
    requiredForPilotUx: false,
    recommendedForPilotUx: true,
    pilotSurface: "Real Patreon creator OAuth (not pilot-ux password login)"
  },
  {
    env: "RELAY_DB_STORE_WATERMARK",
    key: "WATERMARK",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Incremental ingest cursors"
  },
  {
    env: "RELAY_DB_STORE_SYNC_HEALTH",
    key: "SYNC_HEALTH",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Library sync health banner (P5)"
  },
  {
    env: "RELAY_DB_STORE_COLLECTIONS",
    key: "COLLECTIONS",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Library collections"
  },
  {
    env: "RELAY_DB_STORE_SAVED_FILTERS",
    key: "SAVED_FILTERS",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Gallery saved filters"
  },
  {
    env: "RELAY_DB_STORE_LAYOUT",
    key: "LAYOUT",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Designer page layout"
  },
  {
    env: "RELAY_DB_STORE_DLQ",
    key: "DLQ",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Ingest DLQ persistence"
  },
  {
    env: "RELAY_DB_STORE_EVENTS",
    key: "EVENTS",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Outbox / event bus"
  },
  {
    env: "RELAY_DB_STORE_ANALYTICS",
    key: "ANALYTICS",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Action Center analytics (P5a)"
  },
  {
    env: "RELAY_DB_STORE_PATRON_ENGAGEMENT",
    key: "PATRON_ENGAGEMENT",
    requiredForPilotUx: false,
    recommendedForPilotUx: false,
    pilotSurface: "Patron favorites / saved collections"
  }
] as const;

/** Minimum RELAY_DB_STORE_* flags for pilot UX seed and DB-backed patron/creator flows. */
export const PILOT_UX_REQUIRED_STORE_ENVS = PILOT_DB_STORE_MATRIX.filter(
  (r) => r.requiredForPilotUx
).map((r) => r.env);

export function getPilotDbStoreStatus(
  env: NodeJS.ProcessEnv = process.env
): Array<PilotDbStoreRow & { enabled: boolean }> {
  return PILOT_DB_STORE_MATRIX.map((row) => ({
    ...row,
    enabled: relayEnvTruthy(env[row.env])
  }));
}

export function assertPilotUxRequiredDbStores(
  env: NodeJS.ProcessEnv = process.env
): void {
  const missing = PILOT_UX_REQUIRED_STORE_ENVS.filter((name) => !relayEnvTruthy(env[name]));
  if (missing.length === 0) return;
  throw new Error(
    `Pilot UX requires Postgres-backed stores: ${missing.join(", ")}. ` +
      "See docs/pilot-db-cutover.md and root .env.example (Pilot cutover block)."
  );
}

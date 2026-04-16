import type { AppConfig } from "../server.js";
import { resolvePublicWebhookBaseFromEnv } from "../patreon/patreon-webhook-registration.js";

/** Matches `relayEnvTruthy` in `server.ts`. */
function relayEnvTruthy(raw: string | undefined): boolean {
  if (raw === undefined || raw.trim() === "") {
    return false;
  }
  const s = raw.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function flagDb(config: AppConfig, key: keyof AppConfig, envName: string): boolean {
  const v = config[key];
  if (typeof v === "boolean") {
    return v;
  }
  return relayEnvTruthy(process.env[envName]);
}

export type StoreReadPath = "postgres" | "file";

export type FlaggedDomain = {
  envVar: string;
  effective: boolean;
  readPath: StoreReadPath;
};

export type RelayRuntimeManifest = {
  /** Effective `RELAY_DB_STORE_*` resolutions (same logic as `createApp` in `server.ts`). */
  relay_db_store: {
    identity: FlaggedDomain;
    canonical: FlaggedDomain;
    watermark: FlaggedDomain;
    sync_health: FlaggedDomain;
    overrides: FlaggedDomain;
    collections: FlaggedDomain;
    saved_filters: FlaggedDomain;
    layout: FlaggedDomain;
    dlq: FlaggedDomain;
    events: FlaggedDomain;
    patron_engagement: FlaggedDomain;
    analytics: FlaggedDomain;
    clone: FlaggedDomain;
    payments: FlaggedDomain;
    migration: FlaggedDomain;
    deploy: FlaggedDomain;
    creator_oauth: FlaggedDomain;
  };
  /** Always file-backed in current Relay (see truth matrix). */
  always_file: {
    patreon_session_cookies: true;
    patreon_webhook_metadata: true;
    patreon_campaign_creator_index: true;
  };
  /** Prisma `WebhookEndpoint` — dual-write from `ensurePatreonPlatformWebhook` when DB + encryption are configured. */
  webhook_endpoint_table: { wired_as_live: boolean };
  /** False when `RELAY_PUBLIC_WEBHOOK_BASE_URL` / `PUBLIC_WEBHOOK_BASE_URL` / `public_webhook_base_url` are unset. */
  public_webhook_base_configured: boolean;
  prisma_configured: boolean;
}

/**
 * Echoes which backing store `createApp` would select — source for honest pipeline-parity UI.
 */
export function buildRelayRuntimeManifest(config: AppConfig): RelayRuntimeManifest {
  const identity = flagDb(config, "relay_db_store_identity", "RELAY_DB_STORE_IDENTITY");
  const canonical = flagDb(config, "relay_db_store_canonical", "RELAY_DB_STORE_CANONICAL");
  const watermark = flagDb(config, "relay_db_store_watermark", "RELAY_DB_STORE_WATERMARK");
  const sync_health = flagDb(config, "relay_db_store_sync_health", "RELAY_DB_STORE_SYNC_HEALTH");
  const overrides = flagDb(config, "relay_db_store_overrides", "RELAY_DB_STORE_OVERRIDES");
  const collections = flagDb(config, "relay_db_store_collections", "RELAY_DB_STORE_COLLECTIONS");
  const saved_filters = flagDb(config, "relay_db_store_saved_filters", "RELAY_DB_STORE_SAVED_FILTERS");
  const layout = flagDb(config, "relay_db_store_layout", "RELAY_DB_STORE_LAYOUT");
  const dlq = flagDb(config, "relay_db_store_dlq", "RELAY_DB_STORE_DLQ");
  const events = flagDb(config, "relay_db_store_events", "RELAY_DB_STORE_EVENTS");
  const patron_engagement = flagDb(
    config,
    "relay_db_store_patron_engagement",
    "RELAY_DB_STORE_PATRON_ENGAGEMENT"
  );
  const analytics = flagDb(config, "relay_db_store_analytics", "RELAY_DB_STORE_ANALYTICS");
  const clone = flagDb(config, "relay_db_store_clone", "RELAY_DB_STORE_CLONE");
  const payments = flagDb(config, "relay_db_store_payments", "RELAY_DB_STORE_PAYMENTS");
  const migration = flagDb(config, "relay_db_store_migration", "RELAY_DB_STORE_MIGRATION");
  const deploy = flagDb(config, "relay_db_store_deploy", "RELAY_DB_STORE_DEPLOY");
  const creator_oauth = flagDb(config, "relay_db_store_creator_oauth", "RELAY_DB_STORE_CREATOR_OAUTH");

  const publicWebhookBaseConfigured = Boolean(
    config.public_webhook_base_url?.trim() || resolvePublicWebhookBaseFromEnv()
  );

  const fd = (envVar: string, effective: boolean): FlaggedDomain => ({
    envVar,
    effective,
    readPath: effective ? "postgres" : "file"
  });

  return {
    relay_db_store: {
      identity: fd("RELAY_DB_STORE_IDENTITY", identity),
      canonical: fd("RELAY_DB_STORE_CANONICAL", canonical),
      watermark: fd("RELAY_DB_STORE_WATERMARK", watermark),
      sync_health: fd("RELAY_DB_STORE_SYNC_HEALTH", sync_health),
      overrides: fd("RELAY_DB_STORE_OVERRIDES", overrides),
      collections: fd("RELAY_DB_STORE_COLLECTIONS", collections),
      saved_filters: fd("RELAY_DB_STORE_SAVED_FILTERS", saved_filters),
      layout: fd("RELAY_DB_STORE_LAYOUT", layout),
      dlq: fd("RELAY_DB_STORE_DLQ", dlq),
      events: fd("RELAY_DB_STORE_EVENTS", events),
      patron_engagement: fd("RELAY_DB_STORE_PATRON_ENGAGEMENT", patron_engagement),
      analytics: fd("RELAY_DB_STORE_ANALYTICS", analytics),
      clone: fd("RELAY_DB_STORE_CLONE", clone),
      payments: fd("RELAY_DB_STORE_PAYMENTS", payments),
      migration: fd("RELAY_DB_STORE_MIGRATION", migration),
      deploy: fd("RELAY_DB_STORE_DEPLOY", deploy),
      creator_oauth: fd("RELAY_DB_STORE_CREATOR_OAUTH", creator_oauth)
    },
    always_file: {
      patreon_session_cookies: true,
      patreon_webhook_metadata: true,
      patreon_campaign_creator_index: true
    },
    webhook_endpoint_table: { wired_as_live: true },
    public_webhook_base_configured: publicWebhookBaseConfigured,
    prisma_configured: Boolean(config.prisma)
  };
}

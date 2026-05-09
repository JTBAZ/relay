/**
 * @fileoverview Maps `process.env` into `AppConfig` for the Relay HTTP server and CLI tools.
 * @description Reads paths, Patreon OAuth client settings, Stripe/PayPal secrets, export retry policy, and analytics thresholds. Omits validation — missing values surface when consumers run.
 * @see {@link ./jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Indirect: config drives which file/DB stores and payment rows are touched at runtime
 * @security-audit-required Env contains live API secrets (`patreon_client_secret`, `stripe_secret_key`, `paypal_client_secret`, `relay_token_encryption_key`); never log return value.
 */
import type { AppConfig } from "./server.js";

/**
 * Constructs `AppConfig` from environment variables (see root `.env.example`).
 * @returns Populated config object; absent env vars are passed through as `undefined` where typed optional.
 */
export function relayServerConfigFromEnv(): AppConfig {
  return {
    patreon_client_id: process.env.PATREON_CLIENT_ID,
    patreon_client_secret: process.env.PATREON_CLIENT_SECRET,
    patreon_token_url: process.env.PATREON_TOKEN_URL,
    relay_token_encryption_key: process.env.RELAY_TOKEN_ENCRYPTION_KEY,
    credential_store_path: process.env.RELAY_CREDENTIAL_STORE_PATH,
    ingest_canonical_path: process.env.RELAY_INGEST_CANONICAL_PATH,
    ingest_dlq_path: process.env.RELAY_INGEST_DLQ_PATH,
    patreon_sync_watermark_path: process.env.RELAY_PATREON_SYNC_WATERMARK_PATH,
    patreon_sync_health_path: process.env.RELAY_PATREON_SYNC_HEALTH_PATH,
    public_webhook_base_url:
      process.env.RELAY_PUBLIC_WEBHOOK_BASE_URL ?? process.env.PUBLIC_WEBHOOK_BASE_URL,
    creator_campaign_display_path: process.env.RELAY_CREATOR_CAMPAIGN_DISPLAY_PATH,
    relay_creator_display_name: process.env.RELAY_CREATOR_DISPLAY_NAME,
    export_storage_root: process.env.RELAY_EXPORT_STORAGE_ROOT,
    gallery_post_overrides_path: process.env.RELAY_GALLERY_POST_OVERRIDES_PATH,
    gallery_saved_filters_path: process.env.RELAY_GALLERY_SAVED_FILTERS_PATH,
    collections_store_path: process.env.RELAY_COLLECTIONS_STORE_PATH,
    page_layout_store_path: process.env.RELAY_PAGE_LAYOUT_STORE_PATH,
    patron_favorites_store_path: process.env.RELAY_PATRON_FAVORITES_PATH,
    patron_collections_store_path: process.env.RELAY_PATRON_COLLECTIONS_PATH,
    analytics_store_path: process.env.RELAY_ANALYTICS_STORE_PATH,
    analytics_confidence_threshold: (() => {
      const raw = process.env.RELAY_ANALYTICS_CONFIDENCE_THRESHOLD;
      if (raw === undefined || raw.trim() === "") return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    })(),
    clone_store_path: process.env.RELAY_CLONE_STORE_PATH,
    identity_store_path: process.env.RELAY_IDENTITY_STORE_PATH,
    payment_store_path: process.env.RELAY_PAYMENT_STORE_PATH,
    migration_store_path: process.env.RELAY_MIGRATION_STORE_PATH,
    deploy_store_path: process.env.RELAY_DEPLOY_STORE_PATH,
    stripe_secret_key: process.env.STRIPE_SECRET_KEY,
    stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
    paypal_client_id: process.env.PAYPAL_CLIENT_ID,
    paypal_client_secret: process.env.PAYPAL_CLIENT_SECRET,
    export_fetch_retry_policy: (() => {
      const maxRaw = process.env.RELAY_EXPORT_MAX_ATTEMPTS;
      const delayRaw = process.env.RELAY_EXPORT_BASE_DELAY_MS;
      const timeoutRaw = process.env.RELAY_EXPORT_FETCH_TIMEOUT_MS;
      const partial: {
        max_attempts?: number;
        base_delay_ms?: number;
        timeout_ms?: number;
      } = {};
      if (maxRaw !== undefined && maxRaw.trim() !== "") {
        const n = Number(maxRaw);
        if (Number.isFinite(n) && n >= 1) partial.max_attempts = Math.min(n, 10);
      }
      if (delayRaw !== undefined && delayRaw.trim() !== "") {
        const n = Number(delayRaw);
        if (Number.isFinite(n) && n >= 0) partial.base_delay_ms = n;
      }
      if (timeoutRaw !== undefined && timeoutRaw.trim() !== "") {
        const n = Number(timeoutRaw);
        if (Number.isFinite(n) && n >= 1000) partial.timeout_ms = n;
      }
      return Object.keys(partial).length > 0 ? partial : undefined;
    })()
  };
}

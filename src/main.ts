import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./server.js";

/** Repo root: `dist/src/main.js` → two levels up. */
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: join(projectRoot, ".env") });

/**
 * Loads `AppConfig` from environment (see repo root `.env.example`).
 * Patreon **creator** tokens are not read here — they are persisted by
 * `POST /api/v1/auth/patreon/exchange` into the credential store file.
 */
function configFromEnv(): Parameters<typeof createApp>[0] {
  return {
    patreon_client_id: process.env.PATREON_CLIENT_ID,
    patreon_client_secret: process.env.PATREON_CLIENT_SECRET,
    patreon_token_url: process.env.PATREON_TOKEN_URL,
    relay_token_encryption_key: process.env.RELAY_TOKEN_ENCRYPTION_KEY,
    credential_store_path: process.env.RELAY_CREDENTIAL_STORE_PATH,
    ingest_canonical_path: process.env.RELAY_INGEST_CANONICAL_PATH,
    ingest_dlq_path: process.env.RELAY_INGEST_DLQ_PATH,
    export_storage_root: process.env.RELAY_EXPORT_STORAGE_ROOT,
    gallery_post_overrides_path: process.env.RELAY_GALLERY_POST_OVERRIDES_PATH,
    gallery_saved_filters_path: process.env.RELAY_GALLERY_SAVED_FILTERS_PATH,
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
    paypal_client_secret: process.env.PAYPAL_CLIENT_SECRET
  };
}

if (!process.env.RELAY_TOKEN_ENCRYPTION_KEY?.trim()) {
  // eslint-disable-next-line no-console -- CLI entrypoint
  console.error(
    `Relay: missing RELAY_TOKEN_ENCRYPTION_KEY.\n` +
      `  Add it to: ${join(projectRoot, ".env")}\n` +
      `  Generate:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
      `  Name must be exactly: RELAY_TOKEN_ENCRYPTION_KEY=...`
  );
  process.exit(1);
}

const port = Number(process.env.PORT ?? "8787");
const { app } = createApp(configFromEnv());

app.listen(port, () => {
  // eslint-disable-next-line no-console -- CLI entrypoint
  console.log(`Relay API listening on http://127.0.0.1:${port}`);
});

/**
 * Credentials inventory — env names only (EH-080).
 */

import { SITE_ENV_NAMES } from "../env";
import type { CredentialInventoryRow } from "./types";

const PURPOSE: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "Public site origin for callbacks and email links",
  NEXT_PUBLIC_SITE_NAME: "Display name",
  ESCAPE_HATCH_IDENTITY_PROVIDER: "Identity path selector (none|supabase|portable)",
  NEXT_PUBLIC_SUPABASE_URL: "Path A Supabase project URL (public)",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Path A anon key (public; RLS fail-closed)",
  SUPABASE_URL: "Path A server Supabase URL",
  SUPABASE_ANON_KEY: "Path A server anon key",
  SUPABASE_SERVICE_ROLE_KEY: "Path A service role — never browser",
  DATABASE_URL: "Path B Postgres connection",
  ESCAPE_HATCH_SESSION_SECRET: "Path B session HMAC secret",
  ESCAPE_HATCH_MEDIA_MODE: "Private media mode selector",
  R2_ENDPOINT: "R2/S3 endpoint",
  R2_BUCKET: "Private media bucket",
  R2_ACCESS_KEY_ID: "R2 access key id",
  R2_SECRET_ACCESS_KEY: "R2 secret — never browser/logs/packet",
  STRIPE_SECRET_KEY: "Stripe secret — never browser",
  STRIPE_WEBHOOK_SECRET: "Stripe webhook signing secret",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "Stripe publishable key",
  ESCAPE_HATCH_BILLING_PROVIDER: "Billing adapter selector",
  PATREON_CLIENT_ID: "Creator Patreon OAuth client id",
  PATREON_CLIENT_SECRET: "Creator Patreon OAuth secret",
  ESCAPE_HATCH_PATREON_TOKEN_KEY: "Patreon refresh-token encryption key",
  ESCAPE_HATCH_EMAIL_PROVIDER: "Email transport selector",
  RESEND_API_KEY: "Resend API key",
  EMAIL_FROM: "Transactional From address",
  ESCAPE_HATCH_CROSSPOST_TOKEN_PEPPER: "Crosspost token hash pepper",
  ESCAPE_HATCH_RELAY_VERIFY_BASE_URL: "Optional Relay-managed verify base",
  ESCAPE_HATCH_RELAY_SITE_ID: "Optional Relay site id for managed verify"
};

const RELAY_OPTIONAL = new Set([
  "ESCAPE_HATCH_RELAY_VERIFY_BASE_URL",
  "ESCAPE_HATCH_RELAY_SITE_ID",
  "ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE",
  "ESCAPE_HATCH_RELAY_ASSERTION_ISSUER",
  "ESCAPE_HATCH_RELAY_ASSERTION_JWKS_URL",
  "ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON",
  "ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET",
  "ESCAPE_HATCH_RELAY_VERIFY_ENABLED",
  "ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED",
  "ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS",
  "ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE",
  "ESCAPE_HATCH_CROSSPOST_TOKEN_PEPPER"
]);

function rowsFor(
  category: string,
  names: readonly string[],
  costOwner: string
): CredentialInventoryRow[] {
  return names.map((env_name) => ({
    env_name,
    category,
    purpose: PURPOSE[env_name] ?? `${category} configuration`,
    ownership: RELAY_OPTIONAL.has(env_name) ? "optional_relay" : "creator",
    rotation_hint:
      "Rotate in your provider dashboard / secret store; never paste values into this packet.",
    estimated_cost_owner: costOwner
  }));
}

/**
 * Flatten documented env names into a credential inventory (no values).
 */
export function buildCredentialInventory(): CredentialInventoryRow[] {
  const rows: CredentialInventoryRow[] = [
    ...rowsFor("preview", SITE_ENV_NAMES.optionalForPreviewBuild, "Creator hosting"),
    ...rowsFor("identity", SITE_ENV_NAMES.optionalIdentity, "Creator auth/DB"),
    ...rowsFor("media", SITE_ENV_NAMES.optionalMedia, "Creator storage (R2)"),
    ...rowsFor("patreon", SITE_ENV_NAMES.optionalPatreon, "Creator Patreon / optional Relay"),
    ...rowsFor("crosspost", SITE_ENV_NAMES.optionalCrosspost, "Creator site (optional)"),
    ...rowsFor("email", SITE_ENV_NAMES.optionalEmail, "Creator ESP (Resend)"),
    ...rowsFor(
      "billing",
      [
        "ESCAPE_HATCH_BILLING_PROVIDER",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        "NOWPAYMENTS_API_KEY",
        "NOWPAYMENTS_IPN_SECRET",
        "ESCAPE_HATCH_BILLING_TEST_WEBHOOK_SECRET"
      ] as const,
      "Creator billing provider"
    )
  ];

  // Deduplicate by env_name preserving first category.
  const seen = new Set<string>();
  const out: CredentialInventoryRow[] = [];
  for (const row of rows) {
    if (seen.has(row.env_name)) continue;
    seen.add(row.env_name);
    out.push(row);
  }
  return out.sort((a, b) => a.env_name.localeCompare(b.env_name));
}

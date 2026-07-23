import Link from "next/link";
import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { createSiteAdapters } from "@/lib/adapters";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import { loadEnv } from "@/lib/env";
import { assertAdminReadAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";
import {
  isCreatorOAuthConfigured,
  resolvePatreonMode
} from "@/lib/patreon";
import {
  buildRelayMigrationMetadataExport,
  isRelayManagedConfigured,
  isRelayVerifyKillSwitchOff,
  loadRelayManagedConfig
} from "@/lib/patreon/relay-managed";

export const dynamic = "force-dynamic";

/**
 * Operator checklist for Patreon verification (EH-040 creator_oauth + EH-041 relay_managed).
 * Hatch Console / admin chrome — not visitor gallery.
 */
export default async function AdminPatreonPage() {
  const site = loadSite();
  const read = await assertAdminReadAccess(site.site_id);
  redirectIfAdminSignInRequired(
    read.allowed,
    read.allowed ? null : read.reason,
    "/admin/patreon"
  );

  const env = loadEnv();
  const mode = resolvePatreonMode(env);
  const creatorConfigured = isCreatorOAuthConfigured(env);
  const relayConfigured = isRelayManagedConfigured(env);
  const adapters = createSiteAdapters();
  const health = await adapters.patreon.health();
  const killOff = isRelayVerifyKillSwitchOff(env);
  let migrationExport: ReturnType<typeof buildRelayMigrationMetadataExport> | null =
    null;
  if (relayConfigured) {
    try {
      migrationExport = buildRelayMigrationMetadataExport(
        loadRelayManagedConfig(env)
      );
    } catch {
      migrationExport = null;
    }
  }

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Patreon verification"
        lede="Creator-owned OAuth or Relay-managed verification. Credentials and assertion keys stay in your host secret store — never in zip or browser bundle."
        identity={read.identity}
      >
        {!read.allowed ? (
          <AdminAccessDenied reason={read.reason} />
        ) : (
          <>
            <section className="admin-panel">
              <h2>Status</h2>
              <p className="muted">
                Mode: <span className="mono">{mode}</span> · Adapter:{" "}
                <span className="mono">{adapters.patreon.implementation}</span> ·{" "}
                {health.ok ? "health ok (preview)" : health.reason}
              </p>
              <p className="muted">
                productionSafe: false · Next billing add-on: EH-042
              </p>
            </section>

            <section className="admin-panel">
              <h2>Creator-owned Patreon OAuth (EH-040)</h2>
              <ol>
                <li>
                  Create or choose a Patreon OAuth client in the Patreon developer
                  portal.
                </li>
                <li>
                  Register the exact callback:{" "}
                  <span className="mono">/api/patreon/oauth/callback</span> on
                  your site origin (
                  <span className="mono">PATREON_REDIRECT_URI</span>).
                </li>
                <li>
                  Set env names only (never commit secrets):{" "}
                  <span className="mono">ESCAPE_HATCH_PATREON_MODE=creator_oauth</span>
                  , <span className="mono">PATREON_CLIENT_ID</span>,{" "}
                  <span className="mono">PATREON_CLIENT_SECRET</span>,{" "}
                  <span className="mono">PATREON_REDIRECT_URI</span>,{" "}
                  <span className="mono">PATREON_CAMPAIGN_ID</span>,{" "}
                  <span className="mono">ESCAPE_HATCH_PATREON_TOKEN_KEY</span>,{" "}
                  <span className="mono">ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET</span>
                  .
                </li>
                <li>
                  Apply SQL{" "}
                  <span className="mono">0005_patreon_oauth_*.sql</span> for Path
                  A or Path B.
                </li>
                <li>
                  Test link from <Link href="/account">/account</Link> while
                  signed in — state, exchange, refresh, campaign identity,
                  entitlement snapshot.
                </li>
              </ol>
              <p role="status">
                {creatorConfigured
                  ? "Creator OAuth env looks complete (non-placeholder). Still preview-only."
                  : "Creator OAuth is not fully configured."}
              </p>
            </section>

            <section className="admin-panel">
              <h2>Relay-managed verification (EH-041)</h2>
              <ol>
                <li>
                  Set{" "}
                  <span className="mono">ESCAPE_HATCH_PATREON_MODE=relay_managed</span>{" "}
                  and Relay env names:{" "}
                  <span className="mono">ESCAPE_HATCH_RELAY_VERIFY_BASE_URL</span>,{" "}
                  <span className="mono">ESCAPE_HATCH_RELAY_SITE_ID</span>,{" "}
                  <span className="mono">ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE</span>,{" "}
                  <span className="mono">ESCAPE_HATCH_RELAY_ASSERTION_ISSUER</span>,{" "}
                  <span className="mono">ESCAPE_HATCH_RELAY_ASSERTION_JWKS_URL</span>{" "}
                  and/or{" "}
                  <span className="mono">ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON</span>,{" "}
                  <span className="mono">ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET</span>.
                </li>
                <li>
                  Register this site&apos;s callback origin with Relay (
                  <span className="mono">/api/patreon/relay/callback</span>) —
                  allowlist prevents open redirects.
                </li>
                <li>
                  Kill switch:{" "}
                  <span className="mono">ESCAPE_HATCH_RELAY_VERIFY_ENABLED=0</span>{" "}
                  fails closed
                  {killOff ? " (currently off)." : "."}
                </li>
                <li>
                  Assertions use EdDSA (Ed25519); verify iss/aud/kid/exp/nbf/nonce
                  and reject replays. Site does not hold Patreon tokens.
                </li>
                <li>
                  Migration: export non-secret link metadata from Relay; switch to
                  creator_oauth without rebuilding the site (EH-043 UX).
                </li>
              </ol>
              <p role="status">
                {relayConfigured
                  ? "Relay-managed env looks complete (non-placeholder). Still preview-only."
                  : "Relay-managed path is not fully configured."}
              </p>
              {migrationExport ? (
                <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(migrationExport, null, 2)}
                </pre>
              ) : null}
            </section>
          </>
        )}
      </AdminShell>
    </>
  );
}

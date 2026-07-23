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

export const dynamic = "force-dynamic";

/**
 * Operator checklist for creator-owned Patreon OAuth (EH-040).
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
  const configured = isCreatorOAuthConfigured(env);
  const adapters = createSiteAdapters();
  const health = await adapters.patreon.health();

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Patreon OAuth"
        lede="Guided setup for creator-owned Patreon OAuth. Credentials stay in your host secret store — never in zip, browser bundle, or Relay records after handoff."
        identity={read.identity}
      >
        {!read.allowed ? (
          <AdminAccessDenied reason={read.reason} />
        ) : (
          <section className="admin-panel">
            <h2>Creator-owned Patreon OAuth (EH-040)</h2>
            <p className="muted">
              Mode: <span className="mono">{mode}</span> · Adapter:{" "}
              <span className="mono">{adapters.patreon.implementation}</span> ·{" "}
              {health.ok ? "health ok (preview)" : health.reason}
            </p>
            <p className="muted">
              productionSafe: false · Relay-managed verification is EH-041
            </p>

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
              <li>
                Record ownership + rotation: rotate client secret and token key
                in your host secret store; never paste tokens into diagnostics.
              </li>
            </ol>

            <p role="status">
              {configured
                ? "Creator OAuth env looks complete (non-placeholder). Still preview-only."
                : "Creator OAuth is not fully configured — Connect Patreon stays disabled on /account."}
            </p>
          </section>
        )}
      </AdminShell>
    </>
  );
}

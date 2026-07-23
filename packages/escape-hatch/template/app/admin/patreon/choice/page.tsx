import Link from "next/link";
import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { PatreonOAuthChoice } from "@/components/admin/PatreonOAuthChoice";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import { loadEnv } from "@/lib/env";
import { assertAdminReadAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";
import { buildOAuthChoiceDisclosures } from "@/lib/patreon/oauth-choice";
import { loadPatreonModePreference } from "@/lib/patreon/mode-preference";

export const dynamic = "force-dynamic";

/**
 * Neutral Patreon OAuth choice (EH-043).
 * Hatch Console / admin — not visitor gallery chrome.
 * Managed path is never preselected.
 */
export default async function AdminPatreonChoicePage() {
  const site = loadSite();
  const read = await assertAdminReadAccess(site.site_id);
  redirectIfAdminSignInRequired(
    read.allowed,
    read.allowed ? null : read.reason,
    "/admin/patreon/choice"
  );

  const env = loadEnv();
  const disclosures = buildOAuthChoiceDisclosures(env);
  const preference = loadPatreonModePreference(site.site_id);

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Patreon connection choice"
        lede="Own your Patreon connection or let Relay maintain it. Equal weight — neither option is preselected. Costs, dependencies, cancellation, and migration are always disclosed."
        identity={read.identity}
      >
        {!read.allowed ? (
          <AdminAccessDenied reason={read.reason} />
        ) : (
          <section className="admin-panel">
            <p className="muted">
              <Link href="/admin/patreon">← Patreon verification health</Link>
              {" · "}
              productionSafe: false · EH-043
            </p>
            <PatreonOAuthChoice
              disclosures={disclosures}
              initialSelection={preference.preferred_mode}
            />
          </section>
        )}
      </AdminShell>
    </>
  );
}

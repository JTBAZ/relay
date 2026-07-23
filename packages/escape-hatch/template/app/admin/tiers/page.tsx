import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTiers } from "@/components/admin/AdminTiers";
import {
  TierBillingWizard,
  toDraft
} from "@/components/admin/TierBillingWizard";
import { loadAdminTiers } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import {
  getTierMapEntry,
  loadBillingTierMap,
  runBillingTierPreflight
} from "@/lib/billing";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

export default async function AdminTiersPage() {
  const model = await loadAdminTiers();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/tiers"
  );

  const site = loadSite();
  const map = loadBillingTierMap(site.site_id);
  const draftRows = site.tiers.map((t) =>
    toDraft(t.tier_id, t.title, getTierMapEntry(map, t.tier_id))
  );
  const preflight =
    model.read_allowed
      ? runBillingTierPreflight({
          siteId: site.site_id,
          catalog: site.tiers,
          map
        })
      : null;

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Tiers & billing"
        lede="Catalog honesty plus EH-054 independent billing map, preflight, and /tiers conversion preview. Never disguise adult use to unlock Stripe."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <>
            <AdminTiers model={model} />
            <TierBillingWizard
              siteId={site.site_id}
              initialRows={draftRows}
              initialPreflight={preflight}
            />
          </>
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

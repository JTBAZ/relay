import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTiers } from "@/components/admin/AdminTiers";
import { loadAdminTiers } from "@/lib/admin/load-admin";
import { resolveAdminIdentity } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

export default async function AdminTiersPage() {
  const model = loadAdminTiers();
  const site = loadSite();
  const identity = await resolveAdminIdentity(site.site_id);

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Tiers & access"
        lede="Catalog and mapping honesty for membership tiers. Deep edits stay in Structure and Library truth."
        identity={identity}
      >
        <AdminTiers model={model} />
      </AdminShell>
    </>
  );
}

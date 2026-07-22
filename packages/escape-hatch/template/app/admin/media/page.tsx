import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminMedia } from "@/components/admin/AdminMedia";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminMedia } from "@/lib/admin/load-admin";
import { resolveAdminIdentity } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const model = loadAdminMedia();
  const site = loadSite();
  const identity = await resolveAdminIdentity(site.site_id);

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Media"
        lede="Inventory from site bundle and migration ledger when present. Never treat public/media as private-verified."
        identity={identity}
      >
        <AdminMedia model={model} />
      </AdminShell>
    </>
  );
}

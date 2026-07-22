import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTiers } from "@/components/admin/AdminTiers";
import { loadAdminTiers } from "@/lib/admin/load-admin";

export const dynamic = "force-dynamic";

export default function AdminTiersPage() {
  const model = loadAdminTiers();

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Tiers & access"
        lede="Catalog and mapping honesty for membership tiers. Deep edits stay in Structure and Library truth."
      >
        <AdminTiers model={model} />
      </AdminShell>
    </>
  );
}

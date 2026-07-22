import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminOverview } from "@/lib/admin/load-admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const model = await loadAdminOverview();

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Admin"
        lede="Operate this membership kit from its own console — health, posts, media, and tiers against fixture/data state. Soft personas never authorize admin."
        identity={model.identity}
      >
        <AdminOverview model={model} />
      </AdminShell>
    </>
  );
}

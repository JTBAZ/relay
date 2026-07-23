import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminConnectionsPanel } from "@/components/admin/AdminConnectionsPanel";
import { AdminShell } from "@/components/admin/AdminShell";
import { buildConnectionCards } from "@/lib/admin/connections";
import { loadAdminOverview } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminConnectionsPage() {
  const model = await loadAdminOverview();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/connections"
  );
  const cards = buildConnectionCards(model.adapters);

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Connections"
        lede="Operator-facing adapter status with reconnect guidance. Never confuse preview ok with productionSafe."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <AdminConnectionsPanel cards={cards} />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

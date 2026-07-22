import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminOverview } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const model = await loadAdminOverview();
  redirectIfAdminSignInRequired(model.read_allowed, model.deny_reason, "/admin");

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Admin"
        lede="Operate this membership kit from its own console — health, posts, media, and tiers against fixture/data state. Soft personas never authorize admin."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <AdminOverview model={model} />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

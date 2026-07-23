import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { CrosspostPanel } from "@/components/admin/CrosspostPanel";
import { loadAdminOverview } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminCrosspostPage() {
  const model = await loadAdminOverview();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/crosspost"
  );

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Crosspost"
        lede="Optional Relay Crosspost tokens — revocable, scoped, audited. Never elevates to admin; productionSafe remains false."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <CrosspostPanel siteId={model.site_id} />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

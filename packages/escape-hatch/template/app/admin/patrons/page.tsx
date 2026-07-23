import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminPatronsPanel } from "@/components/admin/AdminPatronsPanel";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminPatrons } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminPatronsPage() {
  const model = await loadAdminPatrons();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/patrons"
  );

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Patrons & grants"
        lede="Manual grants, access-reason inspector, and portable session revoke (EH-061). Local JSON store is preview_only — productionSafe remains false."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <AdminPatronsPanel
            siteId={model.site_id}
            tierIds={model.tier_ids}
            initialGrants={model.grants}
          />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

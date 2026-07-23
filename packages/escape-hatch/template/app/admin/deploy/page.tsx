import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeployPanel } from "@/components/admin/DeployPanel";
import { loadAdminOverview } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminDeployPage() {
  const model = await loadAdminOverview();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/deploy"
  );

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Deploy"
        lede="EH-070/071 Path A (Vercel) and Path B (Docker) fixture rehearsals — preview, promote, rollback, callback checklist, and Compose/proxy recipe. Not live provider deploys; productionSafe remains false."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <DeployPanel siteId={model.site_id} />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

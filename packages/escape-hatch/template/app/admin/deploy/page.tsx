import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeployLaunchWizard } from "@/components/admin/DeployLaunchWizard";
import { DeployPanel } from "@/components/admin/DeployPanel";
import { OwnershipPacketPanel } from "@/components/admin/OwnershipPacketPanel";
import { loadAdminOverview } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import { readAdminRequestContextFromHeaders } from "@/lib/identity/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminDeployPage() {
  const requestContext = await readAdminRequestContextFromHeaders();
  const model = await loadAdminOverview(requestContext);
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
        lede="EH-074 launch wizard, EH-070/071 Path A/B fixtures, and EH-080 ownership packet (EH-082 local QC). Backup-before-complete enforced; not live providers; productionSafe remains false until HUMAN-SIGNOFF."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <>
            <DeployLaunchWizard siteId={model.site_id} />
            <OwnershipPacketPanel siteId={model.site_id} />
            <DeployPanel siteId={model.site_id} />
          </>
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

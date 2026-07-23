import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHealthPanel } from "@/components/admin/AdminHealthPanel";
import { AdminShell } from "@/components/admin/AdminShell";
import { buildHealthItems, loadDeployReadinessForAdmin } from "@/lib/admin/connections";
import { loadAdminOverview } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import { assessBackupReadiness } from "@/lib/backup/readiness";
import { assessPathBRecipe } from "@/lib/deploy/path-b-recipe";
import { assessEmailReadiness } from "@/lib/email/readiness";
import { loadEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const model = await loadAdminOverview();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/health"
  );
  const env = loadEnv();
  const deployReadiness = loadDeployReadinessForAdmin(
    model.site_id,
    env.NEXT_PUBLIC_SITE_URL
  );
  const items = buildHealthItems({
    adapters: model.adapters,
    blockers: model.blockers,
    manifestSlice: model.manifest_slice,
    publicMediaHonesty:
      "public/media paths are never treated as private-read verification; premium bytes use /api/media after entitlement checks.",
    deployReadiness,
    pathBRecipe: assessPathBRecipe(),
    emailReadiness: assessEmailReadiness({ env }),
    backupReadiness: assessBackupReadiness({ siteId: model.site_id })
  });

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Site health"
        lede="Actionable next steps for adapters, deploy checklist, email, and EH-073 backup/restore. Live DNS/TLS and cloud backup providers remain deferred."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <AdminHealthPanel items={items} />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

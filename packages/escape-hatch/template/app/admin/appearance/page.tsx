import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminAppearanceEditor } from "@/components/admin/AdminAppearanceEditor";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminOverview } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import { readAdminRequestContextFromHeaders } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

export default async function AdminAppearancePage() {
  const requestContext = await readAdminRequestContextFromHeaders();
  const model = await loadAdminOverview(requestContext);
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/appearance"
  );
  const site = loadSite();

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Appearance"
        lede="Controlled brand publishing (EH-062). Preview dials, then publish approved theme fields into kit data — no raw CSS."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <AdminAppearanceEditor
            siteId={site.site_id}
            initialTheme={site.theme}
          />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

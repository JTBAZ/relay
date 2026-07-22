import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTiers } from "@/components/admin/AdminTiers";
import { loadAdminTiers } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminTiersPage() {
  const model = await loadAdminTiers();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/tiers"
  );

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Tiers & access"
        lede="Catalog and mapping honesty for membership tiers. Deep edits stay in Structure and Library truth."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <AdminTiers model={model} />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

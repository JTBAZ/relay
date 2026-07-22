import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminMedia } from "@/components/admin/AdminMedia";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminMedia } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const model = await loadAdminMedia();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/media"
  );

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Media"
        lede="Inventory from site bundle and migration ledger when present. Never treat public/media as private-verified."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <AdminMedia model={model} />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

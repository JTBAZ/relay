import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHealthPanel } from "@/components/admin/AdminHealthPanel";
import { AdminShell } from "@/components/admin/AdminShell";
import { buildHealthItems } from "@/lib/admin/connections";
import { loadAdminOverview } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const model = await loadAdminOverview();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/health"
  );
  const items = buildHealthItems({
    adapters: model.adapters,
    blockers: model.blockers,
    manifestSlice: model.manifest_slice,
    publicMediaHonesty:
      "public/media paths are never treated as private-read verification; premium bytes use /api/media after entitlement checks."
  });

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Site health"
        lede="Actionable next steps for adapters and known blockers (EH-062). Domain/TLS/backup probes remain deferred."
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

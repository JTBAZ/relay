import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminMedia } from "@/components/admin/AdminMedia";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminMedia } from "@/lib/admin/load-admin";

export const dynamic = "force-dynamic";

export default function AdminMediaPage() {
  const model = loadAdminMedia();

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Media"
        lede="Inventory from site bundle and migration ledger when present. Never treat public/media as private-verified."
      >
        <AdminMedia model={model} />
      </AdminShell>
    </>
  );
}

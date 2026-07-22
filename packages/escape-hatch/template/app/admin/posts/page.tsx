import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminPosts } from "@/components/admin/AdminPosts";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminPosts } from "@/lib/admin/load-admin";
import { resolveAdminIdentity } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage() {
  const model = loadAdminPosts();
  const site = loadSite();
  const identity = await resolveAdminIdentity(site.site_id);

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Posts"
        lede="Inspect access levels from the site bundle. Attention marks require staff session when identity is configured."
        identity={identity}
      >
        <AdminPosts model={model} />
      </AdminShell>
    </>
  );
}

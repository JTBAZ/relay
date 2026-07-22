import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminPosts } from "@/components/admin/AdminPosts";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminPosts } from "@/lib/admin/load-admin";

export const dynamic = "force-dynamic";

export default function AdminPostsPage() {
  const model = loadAdminPosts();

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Posts"
        lede="Inspect access levels from the site bundle. Mark attention for Structure review — local-operator only."
      >
        <AdminPosts model={model} />
      </AdminShell>
    </>
  );
}

import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminPosts } from "@/components/admin/AdminPosts";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminPosts } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage() {
  const model = await loadAdminPosts();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/posts"
  );

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Posts"
        lede="Inspect access levels from the site bundle. Staff session required when identity is configured."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <AdminPosts model={model} />
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

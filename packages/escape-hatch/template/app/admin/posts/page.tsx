import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminPosts } from "@/components/admin/AdminPosts";
import { AdminPostsEditor } from "@/components/admin/AdminPostsEditor";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminPosts } from "@/lib/admin/load-admin";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage() {
  const model = await loadAdminPosts();
  redirectIfAdminSignInRequired(
    model.read_allowed,
    model.deny_reason,
    "/admin/posts"
  );
  const site = loadSite();

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Posts & media CMS"
        lede="Create, edit, publish, and attach local media. Drafts stay off the visitor gallery. productionSafe remains false (EH-060)."
        identity={model.identity}
      >
        {model.read_allowed && model.deny_reason === null ? (
          <>
            <AdminPostsEditor
              model={model}
              tiers={site.tiers.map((t) => ({
                tier_id: t.tier_id,
                title: t.title
              }))}
            />
            <AdminPosts model={model} />
          </>
        ) : (
          <AdminAccessDenied reason={model.deny_reason ?? "staff_required"} />
        )}
      </AdminShell>
    </>
  );
}

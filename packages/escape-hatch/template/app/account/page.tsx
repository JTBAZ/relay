import { AccountShell } from "@/components/AccountShell";
import { ConsoleNav } from "@/components/ConsoleNav";
import { loadAccountSummary } from "@/lib/account/summary";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

/**
 * Account surface (EH-034): session, membership summary, sign-out POST.
 */
export default async function AccountPage() {
  const site = loadSite();
  const summary = await loadAccountSummary(site.site_id);
  const displayName = site.theme.hero.title || site.creator.display_name;

  return (
    <>
      <ConsoleNav />
      <main className="console-page shell">
        <AccountShell
          summary={summary}
          displayName={displayName}
          communityCta={site.theme.community_cta ?? null}
        />
      </main>
    </>
  );
}

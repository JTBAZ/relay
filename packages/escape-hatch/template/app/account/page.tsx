import { AccountShell } from "@/components/AccountShell";
import { PatronChrome } from "@/components/PatronChrome";
import { loadAccountSummary } from "@/lib/account/summary";
import {
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { loadSite } from "@/lib/load-site";
import type { IdentityProviderUx } from "@/lib/paywall/types";

export const dynamic = "force-dynamic";

/**
 * Account surface (EH-034 / EH-035): visitor chrome, not Hatch Console.
 */
export default async function AccountPage() {
  const site = loadSite();
  const summary = await loadAccountSummary(site.site_id);
  const displayName = site.theme.hero.title || site.creator.display_name;
  const mode = resolveIdentityProviderSafe(loadEnv());
  const identityMode: IdentityProviderUx =
    mode === "invalid" ? "invalid" : mode;

  return (
    <PatronChrome site={site} identityMode={identityMode} compact>
      <div className="patron-account">
        <AccountShell
          summary={summary}
          displayName={displayName}
          communityCta={site.theme.community_cta ?? null}
        />
      </div>
    </PatronChrome>
  );
}

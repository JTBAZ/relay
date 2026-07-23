import { PatronChrome } from "@/components/PatronChrome";
import { TierCatalog } from "@/components/TierCatalog";
import { loadAccountSummary } from "@/lib/account/summary";
import {
  buildConversionSubjectFromSummary,
  buildTierCatalogCards,
  evaluateSiteProviderPolicy,
  loadBillingTierMap
} from "@/lib/billing";
import {
  loadEnv,
  resolveIdentityProviderSafe
} from "@/lib/env";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

/**
 * Unified membership catalog (EH-054). Context-aware CTAs; server entitlement only.
 */
export default async function TiersPage() {
  const site = loadSite();
  const env = loadEnv();
  const identityMode = resolveIdentityProviderSafe(env);
  const summary = await loadAccountSummary(site.site_id);
  const map = loadBillingTierMap(site.site_id);
  const policy = evaluateSiteProviderPolicy(site.site_id);
  const subject = buildConversionSubjectFromSummary({
    signedIn: summary.signedIn,
    tierIds: summary.entitlement.tierIds,
    source: summary.entitlement.source,
    softPersonaPreview: summary.softPersonaAllowed && !summary.signedIn,
    activeSources: summary.entitlement.source
      ? [summary.entitlement.source]
      : []
  });
  const cards = buildTierCatalogCards({
    catalog: site.tiers,
    map,
    subject,
    policy
  });

  const patreonConnectHref =
    !summary.signedIn && summary.patreon.configured
      ? "/login?next=%2Faccount"
      : summary.patreon.canConnect && !summary.patreon.linked
        ? "/account"
        : null;

  return (
    <PatronChrome
      site={site}
      identityMode={
        identityMode === "invalid"
          ? "invalid"
          : identityMode === "supabase"
            ? "supabase"
            : identityMode === "portable"
              ? "portable"
              : "none"
      }
      compact
    >
      <TierCatalog
        cards={cards}
        signedIn={summary.signedIn}
        patreonConnectHref={patreonConnectHref}
        billingNote={summary.billingNote}
        policyBlocked={!policy.paidLaunchAllowed}
      />
    </PatronChrome>
  );
}

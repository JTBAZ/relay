import Link from "next/link";
import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProviderPolicyPanel } from "@/components/admin/ProviderPolicyPanel";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import {
  evaluateSiteProviderPolicy,
  getBillingPolicyRow,
  loadContentUseAttestation
} from "@/lib/billing/policy";
import { assertAdminReadAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const dynamic = "force-dynamic";

/**
 * Provider policy router + content/use attestation (EH-052).
 * Hatch Console — not visitor chrome.
 */
export default async function AdminBillingPolicyPage() {
  const site = loadSite();
  const read = await assertAdminReadAccess(site.site_id);
  redirectIfAdminSignInRequired(
    read.allowed,
    read.allowed ? null : read.reason,
    "/admin/billing/policy"
  );

  const attestation = loadContentUseAttestation(site.site_id);
  const decision = evaluateSiteProviderPolicy(site.site_id);
  const stripeRow = getBillingPolicyRow();

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Billing provider policy"
        lede="Declare content/use for routing. Stripe is offered only for eligible attested categories. Ineligible creators keep archive/free/Patreon paths — never disguise content to unlock Checkout."
        identity={read.identity}
      >
        {!read.allowed ? (
          <AdminAccessDenied reason={read.reason} />
        ) : (
          <section className="admin-panel">
            <p className="muted">
              <Link href="/admin">← Overview</Link>
              {" · "}
              productionSafe: false · EH-052
            </p>
            <ProviderPolicyPanel
              siteId={site.site_id}
              initialAttestation={attestation}
              initialDecision={decision}
              matrixCheckedAt={stripeRow.checkedAt}
              matrixPolicyUrl={stripeRow.policyUrl}
            />
          </section>
        )}
      </AdminShell>
    </>
  );
}

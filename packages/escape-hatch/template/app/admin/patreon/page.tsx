import Link from "next/link";
import { ConsoleNav } from "@/components/ConsoleNav";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminShell } from "@/components/admin/AdminShell";
import { PatreonModeSwitchOff } from "@/components/admin/PatreonModeSwitchOff";
import { PatreonSyncPanel } from "@/components/admin/PatreonSyncPanel";
import { createSiteAdapters } from "@/lib/adapters";
import { redirectIfAdminSignInRequired } from "@/lib/admin/require-admin-page";
import { loadEnv } from "@/lib/env";
import { assertAdminReadAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";
import {
  isCreatorOAuthConfigured,
  resolvePatreonMode
} from "@/lib/patreon";
import {
  buildPatreonVerificationHealthSummary,
  creatorOAuthSetupChecklist,
  observeManagedConnectorPrice,
  relayManagedSetupChecklist,
  switchOffMigrationSteps
} from "@/lib/patreon/oauth-choice";
import { loadPatreonModePreference } from "@/lib/patreon/mode-preference";
import {
  buildRelayMigrationMetadataExport,
  isRelayManagedConfigured,
  isRelayVerifyKillSwitchOff,
  loadRelayManagedConfig,
  observeConnectorBilling
} from "@/lib/patreon/relay-managed";

export const dynamic = "force-dynamic";

/**
 * Operator checklist for Patreon verification
 * (EH-040–043: choice, setup, health, switch-off).
 * Hatch Console / admin chrome — not visitor gallery.
 */
export default async function AdminPatreonPage() {
  const site = loadSite();
  const read = await assertAdminReadAccess(site.site_id);
  redirectIfAdminSignInRequired(
    read.allowed,
    read.allowed ? null : read.reason,
    "/admin/patreon"
  );

  const env = loadEnv();
  const mode = resolvePatreonMode(env);
  const creatorConfigured = isCreatorOAuthConfigured(env);
  const relayConfigured = isRelayManagedConfigured(env);
  const adapters = createSiteAdapters();
  const health = await adapters.patreon.health();
  const killOff = isRelayVerifyKillSwitchOff(env);
  const connectorBilling = observeConnectorBilling(env);
  const preference = loadPatreonModePreference(site.site_id);
  const price = observeManagedConnectorPrice(env);
  const healthSummary = buildPatreonVerificationHealthSummary({
    env,
    adapterImplementation: adapters.patreon.implementation,
    healthOk: health.ok,
    healthReason: health.ok ? null : health.reason,
    preferredMode: preference.preferred_mode
  });
  const creatorSteps = creatorOAuthSetupChecklist();
  const relaySteps = relayManagedSetupChecklist();
  const migrationSteps = switchOffMigrationSteps(
    connectorBilling.lastServiceDateIso
  );
  let migrationExport: ReturnType<typeof buildRelayMigrationMetadataExport> | null =
    null;
  if (relayConfigured) {
    try {
      migrationExport = buildRelayMigrationMetadataExport(
        loadRelayManagedConfig(env)
      );
    } catch {
      migrationExport = null;
    }
  }

  return (
    <>
      <ConsoleNav />
      <AdminShell
        title="Patreon verification"
        lede="Creator-owned OAuth or Relay-managed verification. Choose a path, complete setup, monitor health, and switch off managed without rebuilding. Credentials stay in your host secret store."
        identity={read.identity}
      >
        {!read.allowed ? (
          <AdminAccessDenied reason={read.reason} />
        ) : (
          <>
            <PatreonSyncPanel siteId={site.site_id} />
            <section className="admin-panel">
              <h2>Choice</h2>
              <p className="muted">
                Neutral choice surface (neither option preselected):{" "}
                <Link href="/admin/patreon/choice">/admin/patreon/choice</Link>
              </p>
              <p className="muted">
                Preferred (local, non-secret):{" "}
                <span className="mono">
                  {preference.preferred_mode ?? "unset"}
                </span>
                {preference.switch_off_at
                  ? ` · switch-off ${preference.switch_off_at.slice(0, 10)}`
                  : ""}
                {" · "}
                Runtime env: <span className="mono">{mode}</span>
              </p>
            </section>

            <section className="admin-panel">
              <h2>Health summary</h2>
              <ul>
                <li>
                  Adapter:{" "}
                  <span className="mono">
                    {healthSummary.adapterImplementation}
                  </span>{" "}
                  · env mode <span className="mono">{healthSummary.envMode}</span>
                </li>
                <li>
                  Creator OAuth configured:{" "}
                  {healthSummary.creatorConfigured ? "yes (preview)" : "no"}
                </li>
                <li>
                  Relay-managed configured:{" "}
                  {healthSummary.relayConfigured ? "yes (preview)" : "no"}
                </li>
                <li>
                  Kill switch off: {healthSummary.killSwitchOff ? "yes" : "no"}
                </li>
                <li>
                  Connector billing:{" "}
                  <span className="mono">{healthSummary.billing.state}</span>
                  {healthSummary.billing.lastServiceDateIso
                    ? ` · last service ${healthSummary.billing.lastServiceDateIso.slice(0, 10)}`
                    : ""}{" "}
                  · entitled{" "}
                  {healthSummary.billing.canUseRelayManaged ? "yes" : "no"}
                </li>
                <li>
                  Adapter health:{" "}
                  {healthSummary.healthOk
                    ? "ok (preview)"
                    : healthSummary.healthReason}
                </li>
              </ul>
              {healthSummary.boundedOutageCopy ? (
                <p role="status">{healthSummary.boundedOutageCopy}</p>
              ) : null}
              {healthSummary.staleWarning ? (
                <p role="status">{healthSummary.staleWarning}</p>
              ) : null}
              <p className="muted">productionSafe: false · Slice EH-043</p>
            </section>

            <section className="admin-panel">
              <h2>Relay connector billing (EH-042)</h2>
              <p className="muted">
                Add-on SKU:{" "}
                <span className="mono">{price.sku}</span> · list{" "}
                <span className="mono">{price.monthlyPriceDisplay}</span> (
                {price.source === "env" ? "env mirror" : "EH-042 default copy"}
                ). Kit observes entitlement only — Checkout lives on Relay.
              </p>
              <ul>
                <li>
                  Feature flag:{" "}
                  <span className="mono">
                    ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED
                  </span>{" "}
                  — currently{" "}
                  {connectorBilling.billingFeatureEnabled ? "on" : "off (denied)"}
                </li>
                <li>
                  Entitlement:{" "}
                  <span className="mono">{connectorBilling.state}</span>
                  {connectorBilling.lastServiceDateIso
                    ? ` · last service ${connectorBilling.lastServiceDateIso.slice(0, 10)}`
                    : ""}
                </li>
                <li>{connectorBilling.staleWarning}</li>
                <li>{connectorBilling.nativeContinuesWorking}</li>
                <li>
                  When billing not entitled, relay_managed health is degraded;
                  creator_oauth still works.
                </li>
              </ul>
            </section>

            <section className="admin-panel" id="setup-creator_oauth">
              <h2>Creator-owned Patreon OAuth setup (EH-040)</h2>
              <ol>
                {creatorSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p role="status">
                {creatorConfigured
                  ? "Creator OAuth env looks complete (non-placeholder). Still preview-only."
                  : "Creator OAuth is not fully configured."}
              </p>
            </section>

            <section className="admin-panel" id="setup-relay_managed">
              <h2>Relay-managed verification setup (EH-041)</h2>
              <ol>
                {relaySteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="muted">
                Kill switch{" "}
                <span className="mono">ESCAPE_HATCH_RELAY_VERIFY_ENABLED=0</span>{" "}
                fails closed
                {killOff ? " (currently off)." : "."}
              </p>
              <p role="status">
                {relayConfigured
                  ? "Relay-managed env looks complete (non-placeholder). Still preview-only."
                  : "Relay-managed path is not fully configured."}
              </p>
              {migrationExport ? (
                <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(migrationExport, null, 2)}
                </pre>
              ) : null}
            </section>

            <section className="admin-panel" id="switch-off">
              <h2>Switch off managed / migrate (no rebuild)</h2>
              <PatreonModeSwitchOff
                lastServiceDateIso={connectorBilling.lastServiceDateIso}
                migrationSteps={migrationSteps}
              />
            </section>
          </>
        )}
      </AdminShell>
    </>
  );
}

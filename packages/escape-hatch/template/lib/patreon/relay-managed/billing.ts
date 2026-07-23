/**
 * Kit-side observation of Relay managed-connector billing entitlement (EH-042).
 * Read-only local mirror / env — not a payment processor. No secrets.
 */

export type ConnectorBillingState =
  | "active"
  | "grace"
  | "cancelled"
  | "past_due"
  | "none";

export type ConnectorBillingHonesty = {
  /** Feature flag mirror — when false, connector entitlement denied. */
  billingFeatureEnabled: boolean;
  state: ConnectorBillingState;
  lastServiceDateIso: string | null;
  staleWarning: string;
  canUseRelayManaged: boolean;
  migrationHint: string;
  patronsPreserved: true;
  nativeContinuesWorking: string;
  productionSafe: false;
};

/** Loose env bag — SiteEnv or process.env. */
export type ConnectorBillingEnvBag = {
  ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED?: string;
  ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED?: string;
  ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS?: string;
  ESCAPE_HATCH_MANAGED_VERIFY_ENTITLEMENT_STATUS?: string;
  ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE?: string;
  ESCAPE_HATCH_MANAGED_VERIFY_LAST_SERVICE_DATE?: string;
  [key: string]: string | undefined;
};

function envFalsy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

function parseState(raw: string | undefined): ConnectorBillingState {
  if (!raw) return "none";
  const v = raw.trim().toLowerCase();
  if (
    v === "active" ||
    v === "grace" ||
    v === "cancelled" ||
    v === "canceled" ||
    v === "past_due" ||
    v === "none"
  ) {
    return v === "canceled" ? "cancelled" : (v as ConnectorBillingState);
  }
  return "none";
}

export function buildStaleWarning(lastServiceDateIso: string | null): string {
  if (lastServiceDateIso) {
    const day = lastServiceDateIso.slice(0, 10);
    return `Patreon-derived entitlements may go stale after ${day}. Linked patrons are not deleted.`;
  }
  return "Patreon-derived entitlements may go stale after the Relay connector last service date. Linked patrons are not deleted.";
}

/**
 * Observe Relay connector entitlement from env (local mirror).
 *
 * Env names (documented in .env.example / OPERATIONS):
 * - ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED — kill switch mirror (0 denies)
 * - ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS — active|grace|cancelled|past_due|none
 * - ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE — ISO date of last service / stale boundary
 *
 * When status is unset, preview defaults to `active` (operator has not mirrored a cancel).
 * Explicit none/cancelled/past_due or feature flag off → deny relay_managed health.
 * creator_oauth does not consult this gate.
 */
export function observeConnectorBilling(
  env: ConnectorBillingEnvBag = process.env as ConnectorBillingEnvBag
): ConnectorBillingHonesty {
  const flagRaw =
    env.ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED ??
    env.ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED;
  // Unset → treat as enabled for observation; explicit off denies.
  const billingFeatureEnabled = !envFalsy(flagRaw);

  const statusRaw =
    env.ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS ??
    env.ESCAPE_HATCH_MANAGED_VERIFY_ENTITLEMENT_STATUS;
  // Unset → preview-active; explicit values drive honesty / deny.
  const state: ConnectorBillingState =
    statusRaw === undefined || statusRaw.trim() === ""
      ? "active"
      : parseState(statusRaw);
  const lastServiceDateIso =
    (
      env.ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE ??
      env.ESCAPE_HATCH_MANAGED_VERIFY_LAST_SERVICE_DATE
    )?.trim() || null;

  const entitled =
    billingFeatureEnabled && (state === "active" || state === "grace");

  return {
    billingFeatureEnabled,
    state,
    lastServiceDateIso,
    staleWarning: buildStaleWarning(lastServiceDateIso),
    canUseRelayManaged: entitled,
    migrationHint:
      "Migrate to ESCAPE_HATCH_PATREON_MODE=creator_oauth — use /admin/patreon/choice or Switch off on /admin/patreon. Do not delete linked patrons.",
    patronsPreserved: true,
    nativeContinuesWorking:
      "Native site accounts, Stripe subscriptions (when configured), media, and admin continue working after connector cancellation.",
    productionSafe: false
  };
}

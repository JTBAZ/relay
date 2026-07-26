/**
 * OAuth choice + disclosure copy (EH-043).
 * Neutral options — managed is never a default selection.
 * No secrets. Kit-side product price is an honesty mirror of EH-042.
 */

import type { SiteEnv } from "../env";
import { loadEnv } from "../env";
import {
  isCreatorOAuthConfigured,
  resolvePatreonMode,
  type PatreonMode
} from "./config";
import {
  observeConnectorBilling,
  type ConnectorBillingHonesty
} from "./relay-managed/billing";
import {
  isRelayManagedConfigured,
  isRelayVerifyKillSwitchOff
} from "./relay-managed/config";

/** Default monthly add-on price ($29) — matches EH-042 product copy. */
export const DEFAULT_MANAGED_CONNECTOR_MONTHLY_CENTS = 2900;

export type OAuthChoiceOptionId = "creator_oauth" | "relay_managed";

export type OAuthChoiceDisclosure = {
  id: OAuthChoiceOptionId;
  title: string;
  /** Short equal-weight label used in the choice surface. */
  headline: string;
  dataHandled: string[];
  runtimeDependencies: string[];
  cancellationEffects: string[];
  migrationPath: string[];
  costDisclosure: string;
};

export type PatreonVerificationHealthSummary = {
  adapterImplementation: string;
  envMode: PatreonMode;
  preferredMode: OAuthChoiceOptionId | null;
  creatorConfigured: boolean;
  relayConfigured: boolean;
  killSwitchOff: boolean;
  billing: ConnectorBillingHonesty;
  healthOk: boolean;
  healthReason: string | null;
  boundedOutageCopy: string | null;
  staleWarning: string | null;
  productionSafe: false;
};

export type ManagedPriceHonesty = {
  sku: "relay_managed_patreon_connector";
  monthlyPriceCents: number;
  monthlyPriceDisplay: string;
  source: "env" | "default_eh042_product_copy";
  note: string;
};

/**
 * Observe managed add-on list price for disclosure cards.
 * Env mirror only — not live Stripe Checkout.
 */
export function observeManagedConnectorPrice(
  env: SiteEnv | NodeJS.ProcessEnv = loadEnv()
): ManagedPriceHonesty {
  const raw =
    (env as Record<string, string | undefined>)
      .ESCAPE_HATCH_RELAY_CONNECTOR_PRICE_CENTS ??
    (env as Record<string, string | undefined>)
      .ESCAPE_HATCH_MANAGED_VERIFY_PRICE_CENTS;
  let cents = DEFAULT_MANAGED_CONNECTOR_MONTHLY_CENTS;
  let source: ManagedPriceHonesty["source"] = "default_eh042_product_copy";
  if (raw != null && String(raw).trim() !== "") {
    const n = Number.parseInt(String(raw).trim(), 10);
    if (Number.isFinite(n) && n >= 0) {
      cents = n;
      source = "env";
    }
  }
  const dollars = (cents / 100).toFixed(2);
  return {
    sku: "relay_managed_patreon_connector",
    monthlyPriceCents: cents,
    monthlyPriceDisplay: `$${dollars}/mo`,
    source,
    note:
      "Separate Relay invoice line. Kit does not run Checkout for this add-on (EH-042 honesty)."
  };
}

export function buildOAuthChoiceDisclosures(
  env: SiteEnv | NodeJS.ProcessEnv = loadEnv()
): OAuthChoiceDisclosure[] {
  const price = observeManagedConnectorPrice(env);
  return [
    {
      id: "creator_oauth",
      title: "Own your Patreon connection",
      headline: "Creator-owned Patreon OAuth",
      dataHandled: [
        "Patreon OAuth tokens (encrypted at rest with your key)",
        "Campaign membership + mapped tier ids on your site DB",
        "No Relay assertion mint — your site talks to Patreon directly"
      ],
      runtimeDependencies: [
        "PATREON_CLIENT_ID / PATREON_CLIENT_SECRET (host secret store)",
        "PATREON_REDIRECT_URI + PATREON_CAMPAIGN_ID",
        "ESCAPE_HATCH_PATREON_TOKEN_KEY + ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET",
        "SQL 0005_patreon_oauth_* applied for Path A or Path B"
      ],
      cancellationEffects: [
        "You own the OAuth client — cancel means revoke/rotate your own credentials",
        "Native accounts, independent Stripe (when configured), media, and admin continue",
        "Linked patrons are not deleted when rotating credentials"
      ],
      migrationPath: [
        "Keep ESCAPE_HATCH_PATREON_MODE=creator_oauth",
        "No site rebuild required to stay on this path",
        "Optional: leave relay_managed env unset; kill switch optional"
      ],
      costDisclosure:
        "No Relay managed-connector monthly add-on. You operate Patreon developer credentials and refresh ownership."
    },
    {
      id: "relay_managed",
      title: "Let Relay maintain it",
      headline: "Relay-managed verification",
      dataHandled: [
        "Site id + allowlisted callback origin (registered with Relay)",
        "Opaque Patreon user id + mapped tier ids via short-lived EdDSA assertion",
        "Site does not hold Patreon refresh tokens in this mode"
      ],
      runtimeDependencies: [
        `Monthly add-on ${price.sku} at ${price.monthlyPriceDisplay} (Relay invoice)`,
        "ESCAPE_HATCH_RELAY_VERIFY_* assertion / JWKS / state secret env",
        "Billing entitlement active|grace (EH-042) + kill switch not off",
        "Network reachability to Relay verify base URL"
      ],
      cancellationEffects: [
        "Exact last service date shown when mirrored (EH-042)",
        "After cancel / past grace: managed verify fails closed (bounded outage)",
        "Native accounts, Stripe (when configured), media, and admin continue",
        "Linked patrons are not deleted — Patreon-derived entitlements may go stale"
      ],
      migrationPath: [
        "Switch preferred mode to creator_oauth (no kit rebuild)",
        "Set ESCAPE_HATCH_PATREON_MODE=creator_oauth and complete EH-040 checklist",
        "Export non-secret migration metadata; patrons re-verify under your OAuth client",
        "See /admin/patreon switch-off path"
      ],
      costDisclosure: `${price.monthlyPriceDisplay} Relay add-on (${price.sku}). ${price.note} Replaceable with creator_oauth without rebuilding the site.`
    }
  ];
}

export function creatorOAuthSetupChecklist(): string[] {
  return [
    "Create or choose a Patreon OAuth client in the Patreon developer portal.",
    "Register exact callback /api/patreon/oauth/callback → PATREON_REDIRECT_URI.",
    "Set ESCAPE_HATCH_PATREON_MODE=creator_oauth plus PATREON_* and token/state secrets (never commit).",
    "Apply SQL 0005_patreon_oauth_*.sql for Path A or Path B.",
    "From /account while signed in, Connect Patreon (POST /api/patreon/oauth/start).",
    "Confirm link + entitlement snapshot; rotate secrets in the host store only."
  ];
}

export function relayManagedSetupChecklist(): string[] {
  return [
    "Confirm Relay connector billing entitlement (active|grace) — EH-042 observation env.",
    "Set ESCAPE_HATCH_PATREON_MODE=relay_managed plus ESCAPE_HATCH_RELAY_VERIFY_* env.",
    "Register site origin + /api/patreon/relay/callback on Relay (allowlist).",
    "Keep kill switch ESCAPE_HATCH_RELAY_VERIFY_ENABLED unset or on; 0 fails closed.",
    "From /account, Verify with Patreon (Relay) — POST /api/patreon/relay/start.",
    "Export non-secret migration metadata from /admin/patreon before any cancel."
  ];
}

export function switchOffMigrationSteps(
  lastServiceDateIso: string | null
): string[] {
  const day = lastServiceDateIso?.slice(0, 10) ?? null;
  return [
    day
      ? `Confirm last Relay connector service date: ${day}. Patreon-derived entitlements may go stale after that date.`
      : "Confirm Relay connector last service date on /admin/patreon (EH-042 mirror).",
    "Record preferred mode creator_oauth via /admin/patreon/choice or Switch off (writes data/patreon-mode-preference.json — no secrets).",
    "Set ESCAPE_HATCH_PATREON_MODE=creator_oauth on the host (runtime authority).",
    "Complete creator_oauth setup checklist (EH-040) — no site rebuild.",
    "Export non-secret migration metadata if needed; do not delete linked patrons.",
    "Patrons re-verify under your OAuth client from /account.",
    "Native accounts, billing (when configured), media, and admin continue without the managed add-on."
  ];
}

/**
 * Bounded outage copy when managed path is selected but unavailable.
 */
export function buildManagedBoundedOutageCopy(args: {
  killSwitchOff: boolean;
  billing: ConnectorBillingHonesty;
  relayConfigured: boolean;
}): string | null {
  if (args.killSwitchOff) {
    return "Managed verification is off (ESCAPE_HATCH_RELAY_VERIFY_ENABLED kill switch). Outage is bounded to Patreon assertion mint — native accounts, media, and admin continue. Switch to creator_oauth or clear the kill switch.";
  }
  if (!args.billing.canUseRelayManaged) {
    const day = args.billing.lastServiceDateIso?.slice(0, 10);
    return day
      ? `Managed verification unavailable: connector billing not entitled (state=${args.billing.state}). Last service ${day}. Bounded outage — migrate to creator_oauth; patrons are not deleted.`
      : `Managed verification unavailable: connector billing not entitled (state=${args.billing.state}). Bounded outage — migrate to creator_oauth; patrons are not deleted.`;
  }
  if (!args.relayConfigured) {
    return "Managed verification env incomplete or placeholder. Bounded fail-closed — complete EH-041 setup or choose creator_oauth. No site rebuild required to switch.";
  }
  return null;
}

export function buildPatreonVerificationHealthSummary(args: {
  env?: SiteEnv;
  adapterImplementation: string;
  healthOk: boolean;
  healthReason: string | null;
  preferredMode?: OAuthChoiceOptionId | null;
}): PatreonVerificationHealthSummary {
  const env = args.env ?? loadEnv();
  const billing = observeConnectorBilling(env);
  const killSwitchOff = isRelayVerifyKillSwitchOff(env);
  const relayConfigured = isRelayManagedConfigured(env);
  const envMode = resolvePatreonMode(env);
  const preferredMode = args.preferredMode ?? null;
  const lookingAtManaged =
    preferredMode === "relay_managed" ||
    env.ESCAPE_HATCH_PATREON_MODE?.toLowerCase() === "relay_managed";

  const boundedOutageCopy = lookingAtManaged
    ? buildManagedBoundedOutageCopy({
        killSwitchOff,
        billing,
        relayConfigured
      })
    : null;

  const staleWarning =
    !billing.canUseRelayManaged ||
    billing.state === "cancelled" ||
    billing.state === "grace" ||
    billing.state === "past_due"
      ? billing.staleWarning
      : null;

  return {
    adapterImplementation: args.adapterImplementation,
    envMode,
    preferredMode,
    creatorConfigured: isCreatorOAuthConfigured(env),
    relayConfigured,
    killSwitchOff,
    billing,
    healthOk: args.healthOk,
    healthReason: args.healthReason,
    boundedOutageCopy,
    staleWarning,
    productionSafe: false
  };
}

/** Source-contract helper: managed must never be the implicit default. */
export function defaultOAuthChoiceSelection(): null {
  return null;
}

export function isValidOAuthChoiceOption(
  value: unknown
): value is OAuthChoiceOptionId {
  return value === "creator_oauth" || value === "relay_managed";
}

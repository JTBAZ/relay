/**
 * Cancellation + migration honesty copy (EH-042).
 * No secrets. Does not delete linked patrons.
 */

import { MANAGED_VERIFY_ADDON_SKU } from "./types.js";
import type {
  ManagedVerifyBillingRecord,
  ManagedVerifyBillingState,
  ManagedVerifyCancellationCopy
} from "./types.js";

const MIGRATION_STEPS = [
  "Open /admin/patreon and confirm Relay connector entitlement status (add-on cancelled or past grace).",
  "Set ESCAPE_HATCH_PATREON_MODE=creator_oauth on the independent site host.",
  "Create a Patreon OAuth client owned by the creator; register {SITE_URL}/api/patreon/oauth/callback.",
  "Set PATREON_CLIENT_ID, PATREON_CLIENT_SECRET, PATREON_REDIRECT_URI, PATREON_CAMPAIGN_ID (env names only — never commit secrets).",
  "Set ESCAPE_HATCH_PATREON_TOKEN_KEY and ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET in the host secret store.",
  "Apply SQL 0005_patreon_oauth_*.sql for Path A or Path B if not already applied.",
  "Export non-secret link metadata from Relay migration-export /admin if needed; do not delete linked patrons.",
  "From /account, use Connect Patreon (creator_oauth). Patrons re-verify under the creator-owned client.",
  "Confirm native accounts, independent Stripe (when configured), media, and admin still work without the Relay connector.",
  "Remove or leave relay_managed env unset; kill switch ESCAPE_HATCH_RELAY_VERIFY_ENABLED=0 is optional honesty."
];

export function buildStaleWarning(lastServiceDateIso: string | null): string {
  if (lastServiceDateIso) {
    const day = lastServiceDateIso.slice(0, 10);
    return `Patreon-derived entitlements may go stale after ${day}. Linked patrons are not deleted.`;
  }
  return "Patreon-derived entitlements may go stale after the add-on last service date. Linked patrons are not deleted.";
}

export function buildCancellationCopy(args: {
  state: ManagedVerifyBillingState;
  record: ManagedVerifyBillingRecord | null;
}): ManagedVerifyCancellationCopy {
  const last = args.record?.lastServiceDateIso ?? null;
  return {
    sku: MANAGED_VERIFY_ADDON_SKU,
    state: args.state,
    lastServiceDateIso: last,
    staleWarning: buildStaleWarning(last),
    nativeContinuesWorking:
      "Native site accounts, Stripe subscriptions (when configured), media, and admin continue working after connector cancellation.",
    migrationSteps: [...MIGRATION_STEPS],
    patronsPreserved: true
  };
}

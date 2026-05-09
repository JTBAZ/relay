/**
 * @fileoverview Maps raw Patreon/sync exception strings into stable machine codes plus short patron-safe hints (no secrets).
 * @description Used by HTTP/UI layers — keep hints operational, not exhaustive.
 * @see {@link ../jsdoc-core-entities.ts}
 * @todo Brittle: string `includes` heuristics; refine as Patreon messages evolve.
 */

/** Classified upstream failure bucket + user-facing remediation hint. */
export type ClassifiedSyncError = {
  code:
    | "no_tokens"
    | "token_expired"
    | "refresh_failed"
    | "patreon_unreachable"
    | "campaign_ambiguous"
    | "no_creator_campaigns"
    | "campaign_not_found"
    | "member_sync_unwired"
    | "unknown";
  hint: string;
};

/**
 * @param message Free-text error from sync stack (logs, exceptions).
 * @returns Stable classification for telemetry and UX.
 */
export function classifySyncError(message: string): ClassifiedSyncError {
  const m = message.trim();

  if (
    m.includes("No Patreon tokens") ||
    m.includes("Creator credentials not found") ||
    (m.includes("not found") && m.includes("credential"))
  ) {
    return {
      code: "no_tokens",
      hint: "Connect your Patreon account (creator OAuth) in the Library or Patreon settings, then try again."
    };
  }

  if (m.includes("Patreon returned no creator campaigns")) {
    return {
      code: "no_creator_campaigns",
      hint:
        "This token does not list any creator campaigns on Patreon. Reconnect with a creator account and the right scopes, or pass campaign_id if Relay already stores it."
    };
  }

  if (
    m.includes("Multiple Patreon campaigns found") ||
    m.includes("Multiple Patreon campaigns (")
  ) {
    return {
      code: "campaign_ambiguous",
      hint: "Set campaign_id (or NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID) when Patreon returns more than one campaign, or use the campaign stored on your Relay studio profile."
    };
  }

  if (
    m.includes("not found on Patreon for this token") ||
    (m.includes("Campaign ") && m.includes("not found"))
  ) {
    return {
      code: "campaign_not_found",
      hint: "The campaign id may be wrong, or this token cannot see that campaign. Re-check campaign_id and OAuth scopes."
    };
  }

  if (m.includes("401") || m.includes("Unauthorized") || m.toLowerCase().includes("invalid_grant")) {
    return {
      code: "token_expired",
      hint: "Your Patreon session may have expired. Reconnect Patreon or call POST /api/v1/auth/patreon/refresh if you still have a valid refresh token."
    };
  }

  if (m.includes("refresh_failed") || m.includes("Refresh failed")) {
    return {
      code: "refresh_failed",
      hint: "Relay could not refresh your Patreon token. Reconnect Patreon (creator OAuth) to issue new tokens."
    };
  }

  if (
    m.includes("ECONNREFUSED") ||
    m.includes("ETIMEDOUT") ||
    m.includes("ENOTFOUND") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("Failed to fetch")
  ) {
    return {
      code: "patreon_unreachable",
      hint: "Could not reach Patreon. Check your network, firewall, and whether patreon.com is reachable, then retry."
    };
  }

  if (m.includes("IdentityService") && m.includes("not wired")) {
    return {
      code: "member_sync_unwired",
      hint: "Member sync is not enabled on this server (identity store not wired)."
    };
  }

  return {
    code: "unknown",
    hint: "Something went wrong during sync. Check Relay logs for details and retry. If it persists, reconnect Patreon."
  };
}

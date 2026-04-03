/**
 * Map upstream / handler error text to stable codes and creator-facing hints.
 * Avoid echoing secrets; keep messages short.
 */

export type ClassifiedSyncError = {
  code:
    | "no_tokens"
    | "token_expired"
    | "refresh_failed"
    | "patreon_unreachable"
    | "campaign_ambiguous"
    | "campaign_not_found"
    | "member_sync_unwired"
    | "unknown";
  hint: string;
};

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

  if (m.includes("Multiple Patreon campaigns found") || m.includes("Pass campaign_id")) {
    return {
      code: "campaign_ambiguous",
      hint: "Set your Patreon campaign id in the sync request or in NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID when you have more than one campaign."
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

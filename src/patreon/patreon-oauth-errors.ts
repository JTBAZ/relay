/**
 * @fileoverview Normalize Patreon OAuth failures into stable public error codes.
 * @description Upstream bodies stay in redacted server logs only (never returned verbatim to clients).
 */

export type PatreonOAuthPublicCode =
  | "denied_consent"
  | "expired_or_reused_code"
  | "invalid_grant"
  | "app_suspended"
  | "wrong_patreon_account"
  | "campaign_conflict"
  | "account_link_conflict"
  | "transient_upstream"
  | "relay_config"
  | "in_flight"
  | "unknown";

export type ClassifiedPatreonOAuthError = {
  publicCode: PatreonOAuthPublicCode;
  httpStatus: number;
  clientMessage: string;
};

/**
 * Map an upstream/exchange Error into a stable public classification.
 */
export function classifyPatreonOAuthError(error: unknown): ClassifiedPatreonOAuthError {
  const message = error instanceof Error ? error.message : String(error);
  const m = message.toLowerCase();

  if (m.includes("access_denied") || m.includes("denied")) {
    return {
      publicCode: "denied_consent",
      httpStatus: 400,
      clientMessage: "Patreon authorization was cancelled or denied. You can try connecting again."
    };
  }
  if (
    m.includes("invalid_grant") ||
    m.includes("already been used") ||
    m.includes("expired") ||
    /status\s*401/.test(m)
  ) {
    return {
      publicCode: "expired_or_reused_code",
      httpStatus: 409,
      clientMessage:
        "This Patreon link has already been used or expired. Start connect again from the connect page."
    };
  }
  if (
    m.includes("app suspended") ||
    m.includes("publicapiclientappsuspended") ||
    m.includes("client_id")
  ) {
    return {
      publicCode: "app_suspended",
      httpStatus: 502,
      clientMessage:
        "Patreon rejected this app’s credentials. Relay operators need to check the Patreon developer app status."
    };
  }
  if (
    m.includes("doesn’t match the one already connected") ||
    m.includes("doesn't match the one already connected") ||
    m.includes("wrong patreon")
  ) {
    return {
      publicCode: "wrong_patreon_account",
      httpStatus: 409,
      clientMessage: message
    };
  }
  if (
    m.includes("already registered to a different relay studio") ||
    m.includes("already connected to a different relay studio") ||
    m.includes("campaign is already")
  ) {
    return {
      publicCode: "campaign_conflict",
      httpStatus: 409,
      clientMessage: message
    };
  }
  if (m.includes("patreon account") && m.includes("conflict")) {
    return {
      publicCode: "account_link_conflict",
      httpStatus: 409,
      clientMessage: message
    };
  }
  if (m.includes("timeout") || m.includes("econnreset") || m.includes("503") || m.includes("502")) {
    return {
      publicCode: "transient_upstream",
      httpStatus: 502,
      clientMessage: "Patreon is temporarily unavailable. Please try again in a moment."
    };
  }
  if (
    m.includes("not set") ||
    m.includes("service unavailable") ||
    m.includes("redirect_uri") ||
    m.includes("configuration")
  ) {
    return {
      publicCode: "relay_config",
      httpStatus: 503,
      clientMessage: "Relay Patreon configuration is incomplete. Please try again later or contact support."
    };
  }
  if (m.includes("invalid_grant")) {
    return {
      publicCode: "invalid_grant",
      httpStatus: 409,
      clientMessage:
        "Patreon rejected the authorization code. Start connect again from the connect page."
    };
  }
  return {
    publicCode: "unknown",
    httpStatus: 502,
    clientMessage: "Patreon authorization failed. Please try connecting again."
  };
}

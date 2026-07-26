/** Parse HttpOnly `relay_session` from a raw `Cookie` request header (server or client). */
export function relaySessionFromCookieHeader(
  cookieHeader: string | null | undefined
): string | null {
  const raw = cookieHeader?.trim();
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== "relay_session") continue;
    const value = part.slice(idx + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/** Authorization header value for Relay API calls when Bearer or cookie session is available. */
export function relayPatronAssetAuthHeader(args: {
  authorizationHeader?: string | null;
  cookieHeader?: string | null;
}): string | null {
  const bearer = args.authorizationHeader?.trim();
  if (bearer) return bearer;
  const session = relaySessionFromCookieHeader(args.cookieHeader);
  return session ? `Bearer ${session}` : null;
}

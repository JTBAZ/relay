/** SessionStorage Bearer for pilot UX dev login when cookies are cross-origin (127.0.0.1 web → localhost API). */
export const PILOT_UX_BEARER_SESSION_KEY = "pilot_ux_bearer";

export function storePilotUxBearerToken(token: string): void {
  if (typeof window === "undefined") return;
  const t = token.trim();
  if (t) {
    window.sessionStorage.setItem(PILOT_UX_BEARER_SESSION_KEY, t);
  }
}

export function pilotUxDevBearerHeaders(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;
  const t = window.sessionStorage.getItem(PILOT_UX_BEARER_SESSION_KEY)?.trim();
  return t ? { authorization: `Bearer ${t}` } : undefined;
}

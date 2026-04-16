import {
  RELAY_API_BASE,
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  parseRelayResponseBody
} from "./relay-api";
import { emitStudioSessionUpdate } from "./studio-session-context";
import { getSupabaseBrowserClient } from "./supabase-browser";

const RELAY_SESSION_TOKEN_KEY = "relay_session_token";

/**
 * Revokes opaque Relay session on the server (best effort), clears browser session storage,
 * notifies {@link emitStudioSessionUpdate}, and signs out Supabase when configured.
 */
export async function performRelayLogout(): Promise<void> {
  if (typeof window === "undefined") return;
  const token = window.localStorage.getItem(RELAY_SESSION_TOKEN_KEY)?.trim();
  if (token) {
    try {
      const res = await fetch(`${RELAY_API_BASE}/api/v1/identity/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await parseRelayResponseBody(res, "/api/v1/identity/logout");
      }
    } catch {
      /* still clear client */
    }
  }
  window.localStorage.removeItem(RELAY_SESSION_TOKEN_KEY);
  window.localStorage.removeItem(RELAY_CREATOR_ID_STORAGE_KEY);
  window.localStorage.removeItem(RELAY_PUBLIC_SLUG_STORAGE_KEY);
  emitStudioSessionUpdate();
  try {
    const sb = getSupabaseBrowserClient();
    if (sb) await sb.auth.signOut();
  } catch {
    /* ignore */
  }
}

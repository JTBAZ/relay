import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  relayFetch,
  type CreatorWorkspaceData
} from "./relay-api";
import { emitStudioSessionUpdate } from "./studio-session-context";
import { storePilotUxBearerToken } from "./pilot-ux-session";
import type { PilotUxDevAccountKind } from "./pilot-ux-dev-accounts";

type AuthLoginPayload = {
  token: string;
  user_id: string;
  creator_id: string;
  tier_ids: string[];
  expires_at: string;
};

/**
 * PUX-001 — password login via `POST /api/v1/auth/login` (independent accounts from pilot UX seed).
 * Sets HttpOnly session cookie, active role, and creator workspace cache for Library.
 */
function bearerAuthHeaders(token: string | undefined): Record<string, string> | undefined {
  const t = token?.trim();
  return t && t.length > 0 ? { authorization: `Bearer ${t}` } : undefined;
}

export async function bootstrapPilotUxPasswordLogin(args: {
  email: string;
  password: string;
  kind: PilotUxDevAccountKind;
}): Promise<{ token: string }> {
  const login = await relayFetch<AuthLoginPayload>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: args.email.trim(), password: args.password })
  });

  /** Cross-origin dev (`127.0.0.1:3000` → `127.0.0.1:8787` or `localhost` mix) is not same-site;
   *  SameSite=Lax cookies from login may not attach on the immediate POST hops — use dual-write Bearer
   *  (same pattern as `bootstrapStudioAfterSupabase` in relay-auth-bootstrap.ts). */
  const sessionAuth = bearerAuthHeaders(login.token);
  storePilotUxBearerToken(login.token);

  if (args.kind === "creator") {
    const ws = await relayFetch<CreatorWorkspaceData>("/api/v1/creator/workspace", {
      method: "POST",
      body: JSON.stringify({}),
      headers: sessionAuth
    });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, ws.relay_creator_id.trim());
      const slug = ws.public_slug?.trim();
      if (slug) {
        window.localStorage.setItem(RELAY_PUBLIC_SLUG_STORAGE_KEY, slug);
      }
    }
    await relayFetch<{ active_role: "creator" | "supporter"; available_roles: ("creator" | "supporter")[] }>(
      "/api/v1/me/active-role",
      {
        method: "POST",
        headers: { ...sessionAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "creator" })
      }
    );
  } else {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(RELAY_CREATOR_ID_STORAGE_KEY);
      window.localStorage.removeItem(RELAY_PUBLIC_SLUG_STORAGE_KEY);
    }
    await relayFetch<{ active_role: "creator" | "supporter"; available_roles: ("creator" | "supporter")[] }>(
      "/api/v1/me/active-role",
      {
        method: "POST",
        headers: { ...sessionAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "supporter" })
      }
    );
  }

  emitStudioSessionUpdate();
  return { token: login.token };
}

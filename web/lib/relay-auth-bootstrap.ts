import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  relayFetch,
  type CreatorWorkspaceData
} from "./relay-api";
import { emitStudioSessionUpdate } from "./studio-session-context";

export type SupporterBootstrapResult = {
  account_id: string;
  /** Opaque Relay session token (dual-write; cookie is also set by the API). */
  token: string;
};

async function postRelayWithSupabaseJwt<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  return relayFetch<T>(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken.trim()}`
    },
    body: JSON.stringify(body)
  });
}

type RelaySessionPayload = {
  token: string;
  user_id: string;
  account_id: string;
};

/**
 * PE-A Skeletal UI — Supporter path: sync Account + mint opaque Relay session cookie.
 * Does NOT provision a creator workspace. Called after Supabase sign-in for supporter accounts.
 * After this returns, the browser has a `relay_session` cookie and the caller should navigate
 * to `/patreon/patron/connect` (first time) or `/patron/feed` (returning).
 */
export async function bootstrapSupporterAfterSupabase(
  accessToken: string
): Promise<SupporterBootstrapResult> {
  await postRelayWithSupabaseJwt("/api/v1/auth/supabase/sync", accessToken, {});
  const relay = await postRelayWithSupabaseJwt<RelaySessionPayload>(
    "/api/v1/auth/supabase/relay-session",
    accessToken,
    {}
  );
  return { account_id: relay.account_id, token: relay.token };
}

/**
 * MT-036: After Supabase sign-in, sync Account, mint opaque Relay session (HttpOnly cookie), provision workspace,
 * persist `relay_creator_id` / public slug in localStorage (UI cache only).
 */
export async function bootstrapStudioAfterSupabase(accessToken: string): Promise<{
  relay_creator_id: string;
  account_id: string;
  /** True when this call first provisioned the creator workspace (first-time studio). */
  created: boolean;
}> {
  await postRelayWithSupabaseJwt("/api/v1/auth/supabase/sync", accessToken, {});
  const relay = await postRelayWithSupabaseJwt<RelaySessionPayload>(
    "/api/v1/auth/supabase/relay-session",
    accessToken,
    {}
  );

  /** Prefer in-memory Bearer for this hop: `localhost:3000` → `127.0.0.1:8787` is cross-site, so
   *  SameSite=Lax session cookies may not attach yet (align hostnames in `.env.local` for cookie-only dev). */
  const ws = await relayFetch<CreatorWorkspaceData>("/api/v1/creator/workspace", {
    method: "POST",
    body: JSON.stringify({}),
    headers:
      typeof relay.token === "string" && relay.token.trim().length > 0
        ? { authorization: `Bearer ${relay.token.trim()}` }
        : undefined
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, ws.relay_creator_id.trim());
    const slug = ws.public_slug?.trim();
    if (slug) {
      window.localStorage.setItem(RELAY_PUBLIC_SLUG_STORAGE_KEY, slug);
    }
  }
  emitStudioSessionUpdate();
  return {
    relay_creator_id: ws.relay_creator_id.trim(),
    account_id: ws.account_id,
    created: Boolean(ws.created)
  };
}

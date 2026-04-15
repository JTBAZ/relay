import {
  RELAY_API_BASE,
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  parseRelayResponseBody,
  relayFetch,
  type CreatorWorkspaceData
} from "./relay-api";

type Envelope<T> = { data: T; meta?: { trace_id: string } };

async function postRelayWithSupabaseJwt<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${RELAY_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken.trim()}`
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const json = (await parseRelayResponseBody(res, path)) as Envelope<T> & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? res.statusText);
  }
  return json.data;
}

type RelaySessionPayload = {
  token: string;
  user_id: string;
  account_id: string;
};

/**
 * MT-036: After Supabase sign-in, sync Account, mint opaque Relay session, provision workspace,
 * persist `relay_session_token` + `relay_creator_id` in localStorage.
 */
export async function bootstrapStudioAfterSupabase(accessToken: string): Promise<{
  relay_creator_id: string;
  account_id: string;
}> {
  await postRelayWithSupabaseJwt("/api/v1/auth/supabase/sync", accessToken, {});
  const relay = await postRelayWithSupabaseJwt<RelaySessionPayload>(
    "/api/v1/auth/supabase/relay-session",
    accessToken,
    {}
  );
  if (typeof window !== "undefined") {
    window.localStorage.setItem("relay_session_token", relay.token);
  }

  const ws = await relayFetch<CreatorWorkspaceData>("/api/v1/creator/workspace", {
    method: "POST",
    body: JSON.stringify({})
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, ws.relay_creator_id.trim());
    const slug = ws.public_slug?.trim();
    if (slug) {
      window.localStorage.setItem(RELAY_PUBLIC_SLUG_STORAGE_KEY, slug);
    }
  }
  return { relay_creator_id: ws.relay_creator_id.trim(), account_id: ws.account_id };
}

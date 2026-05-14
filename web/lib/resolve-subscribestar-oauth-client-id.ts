/**
 * SubscribeStar creator OAuth Client ID for `/subscribestar/creator/connect`.
 *
 * Prefer runtime **`SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID`** or **`SUBSCRIBESTAR_CREATOR_CLIENT_ID`**
 * (Server Components only — same pattern as Patreon).
 *
 * Fallback: **`NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CLIENT_ID`** for local builds.
 */
export function resolveSubscribeStarCreatorOAuthClientId(): string {
  const runtime =
    process.env.SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID?.trim() ||
    process.env.SUBSCRIBESTAR_CREATOR_CLIENT_ID?.trim();
  if (runtime) return runtime;
  return process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CLIENT_ID?.trim() ?? "";
}

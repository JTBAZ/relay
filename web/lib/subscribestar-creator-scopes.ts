/**
 * SubscribeStar creator OAuth scopes (space-separated for authorize URL).
 * Override with NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_SCOPE after Explorer confirms required scopes.
 */
export const SUBSCRIBESTAR_CREATOR_OAUTH_SCOPES = (
  process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_SCOPE?.trim() || "content_provider_profile.read"
).replace(/\+/g, " ");

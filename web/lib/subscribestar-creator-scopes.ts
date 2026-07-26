/**
 * SubscribeStar creator OAuth scopes (space-separated for authorize URL).
 * Override with NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_SCOPE (space-separated) if your OAuth app narrows scopes.
 */
const SUBSCRIBESTAR_CREATOR_OAUTH_SCOPES_DEFAULT =
  "content_provider_profile.read content_provider_profile.subscriptions.read content_provider_profile.payments.read";

export const SUBSCRIBESTAR_CREATOR_OAUTH_SCOPES = (
  process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_SCOPE?.trim() || SUBSCRIBESTAR_CREATOR_OAUTH_SCOPES_DEFAULT
).replace(/\+/g, " ");

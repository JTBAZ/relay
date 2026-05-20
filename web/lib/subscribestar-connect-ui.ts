/**
 * Gate SubscribeStar “Connect” CTAs in the web app (login + /creator/connect).
 * Set `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT=1` in web/.env.local for staging / first-link tests.
 */
export function isSubscribeStarCreatorConnectUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT === "1";
}

import { isPilotPatreonOnlyScope } from "./pilot-patreon-only";

/**
 * Gate SubscribeStar “Connect” CTAs in the web app (login + /creator/connect).
 * Set `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT=1` in web/.env.local for staging / first-link tests.
 * PILOT-001: `NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY=1` forces Patreon-only (overrides connect flag).
 */
export function isSubscribeStarCreatorConnectUiEnabled(): boolean {
  if (isPilotPatreonOnlyScope()) return false;
  return process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT === "1";
}

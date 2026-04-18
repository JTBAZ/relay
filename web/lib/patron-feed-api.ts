import { relayFetch } from "@/lib/relay-api";
import type { PatronFeedBundle } from "@/lib/relay-fixtures";

/**
 * Patron home feed + sidebar payload from `GET /api/v1/patron/relay_feed`.
 * Server reads `web/lib/patron-relay-feed-bundle.json` (fixture-shaped) until DB-backed aggregation exists.
 *
 * Auth: HttpOnly `relay_session` cookie with `credentials: "include"` (see {@link relayFetch}).
 */
export async function fetchPatronRelayFeed(): Promise<PatronFeedBundle> {
  return relayFetch<PatronFeedBundle>("/api/v1/patron/relay_feed");
}

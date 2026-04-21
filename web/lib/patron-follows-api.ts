import { relayFetch } from "@/lib/relay-api";

/** Row from `GET /api/v1/patron/follows` (PE-C). */
export type PatronFollowApiItem = {
  relay_creator_id: string;
  created_at: string;
};

export type PatronFollowsPayload = {
  items: PatronFollowApiItem[];
};

/**
 * PE-C — Patron follow graph for the session membership. Auth: `relay_session` cookie
 * (`credentials: "include"` via {@link relayFetch}).
 */
export async function fetchPatronFollows(): Promise<PatronFollowsPayload> {
  return relayFetch<PatronFollowsPayload>("/api/v1/patron/follows");
}

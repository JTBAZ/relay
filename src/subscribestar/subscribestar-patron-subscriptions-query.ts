/**
 * SubscribeStar GraphQL query for a patron bearer token (subscriber OAuth) — env-driven like ingest.
 * Validate field paths in SubscribeStar GraphQL Explorer; see `fixtures/subscribestar-patron/` in tests.
 */

export function subscribeStarPatronSubscriptionsGraphqlQueryFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const q = env.SUBSCRIBESTAR_PATRON_SUBSCRIPTIONS_GRAPHQL_QUERY?.trim();
  return q?.length ? q : null;
}

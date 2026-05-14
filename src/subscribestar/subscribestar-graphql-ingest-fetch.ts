/**
 * Optional HTTP fetch helper: run env-configured posts query → raw GraphQL JSON for
 * {@link ./subscribestar-graphql-response-to-wire.js mapSubscribeStarPostsGraphqlResponseToIngestWire}.
 */

import { ingestPostsVariablesFromCursor, subscribeStarPostsPageGraphqlQueryFromEnv } from "./subscribestar-ingest-queries.js";
import { subscribeStarGraphqlRequest } from "./subscribestar-graphql.js";

/**
 * Executes `SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY` (or bundled `postsPage`) with optional `$after` variable.
 */
export async function fetchSubscribeStarPostsGraphqlPage(
  graphqlUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch,
  options?: { after?: string | null }
): Promise<unknown> {
  const query = subscribeStarPostsPageGraphqlQueryFromEnv();
  if (!query) {
    throw new Error(
      "SubscribeStar ingest posts query is not configured. Set SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY or SUBSCRIBESTAR_INGEST_QUERIES_JSON.postsPage (see docs/integrations/subscribestar-ingest-mapping.md)."
    );
  }
  const variables = ingestPostsVariablesFromCursor(options?.after ?? undefined);
  const body: { query: string; variables?: Record<string, unknown> } = { query };
  if (Object.keys(variables).length > 0) body.variables = variables;
  return subscribeStarGraphqlRequest<unknown>(
    graphqlUrl,
    accessToken,
    body,
    fetchImpl
  );
}

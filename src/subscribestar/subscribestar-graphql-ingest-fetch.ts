/**
 * Optional HTTP fetch helper: run env-configured posts query → raw GraphQL JSON for
 * {@link ./subscribestar-graphql-response-to-wire.js mapSubscribeStarPostsGraphqlResponseToIngestWire}.
 */

import {
  ingestPostsVariablesFromCursor,
  subscribeStarPostsPageGraphqlQueryFromEnv,
  subscribeStarSupplementalIngestGraphqlQueriesFromEnv
} from "./subscribestar-ingest-queries.js";
import { mergeSubscribeStarIngestGraphqlResponses } from "./subscribestar-graphql-ingest-merge.js";
import { subscribeStarGraphqlRequest } from "./subscribestar-graphql.js";

/**
 * Executes `SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY` (or bundled `postsPage`) with optional `$after` variable,
 * then runs optional supplemental queries (`SUBSCRIBESTAR_INGEST_SUBSCRIPTIONS_GRAPHQL_QUERY` /
 * `SUBSCRIBESTAR_INGEST_PAYMENTS_GRAPHQL_QUERY` or bundled `subscriptionsRead` / `paymentsRead`) with the **same token**
 * and merges their **`data`** into the posts response (`errors` from supplementals are not forwarded).
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
  const postsEnvelope = await subscribeStarGraphqlRequest<unknown>(
    graphqlUrl,
    accessToken,
    body,
    fetchImpl
  );

  const supplementalQueries = subscribeStarSupplementalIngestGraphqlQueriesFromEnv();
  if (supplementalQueries.length === 0) return postsEnvelope;

  const supplementary: unknown[] = [];
  for (const { query: supplementalQuery } of supplementalQueries) {
    try {
      supplementary.push(
        await subscribeStarGraphqlRequest<unknown>(
          graphqlUrl,
          accessToken,
          { query: supplementalQuery },
          fetchImpl
        )
      );
    } catch {
      /* Optional reads — failure does not block posts ingest */
    }
  }
  return mergeSubscribeStarIngestGraphqlResponses(postsEnvelope, supplementary);
}

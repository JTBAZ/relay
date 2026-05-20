/**
 * POST bearer token to SubscribeStar `/api/graphql/v1` with operator-provided query document.
 */

import { subscribeStarGraphqlRequest } from "./subscribestar-graphql.js";

export async function fetchSubscribeStarPatronSubscriptionsGraphql(args: {
  graphqlUrl: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
  fetchImpl: typeof fetch;
}): Promise<unknown> {
  const body = await subscribeStarGraphqlRequest<{ data?: unknown; errors?: unknown }>(
    args.graphqlUrl,
    args.accessToken,
    { query: args.query, variables: args.variables ?? {} },
    args.fetchImpl
  );
  if (
    body &&
    typeof body === "object" &&
    "errors" in body &&
    body.errors !== undefined &&
    body.errors !== null
  ) {
    const errStr =
      typeof body.errors === "string" ? body.errors : JSON.stringify(body.errors).slice(0, 400);
    throw new Error(`SubscribeStar patron subscription GraphQL errors: ${errStr}`);
  }
  return (body as { data?: unknown })?.data ?? body;
}

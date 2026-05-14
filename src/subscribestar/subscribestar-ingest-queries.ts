/**
 * Env-driven SubscribeStar GraphQL ingest queries (mirror `creatorIdentityQueriesFromEnv` pattern).
 * Fill after API Explorer validates real schema; ingest mapping uses placeholder keys until then.
 */

type QueriesBundle = {
  /** Posts page query; optional `$after` variable for Relay-style paging (see Pagination in official API docs). */
  postsPage?: string;
};

function parseQueriesBundle(raw: string | undefined): QueriesBundle | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      return parsed as QueriesBundle;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * SubscribeStar Explorer `postsPage` query from env — either `SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY`
 * (preferred for multi-line blobs) or `SUBSCRIBESTAR_INGEST_QUERIES_JSON` → `{ "postsPage": "..." }`.
 * @returns `null` when unset (caller should skip automatic fetch until configured).
 */
export function subscribeStarPostsPageGraphqlQueryFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const direct = env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY?.trim();
  if (direct) return direct;
  const bundle = parseQueriesBundle(env.SUBSCRIBESTAR_INGEST_QUERIES_JSON);
  const q = bundle?.postsPage?.trim();
  return q?.length ? q : null;
}

export function ingestPostsVariablesFromCursor(after?: string | null): Record<string, unknown> {
  if (typeof after !== "string" || !after.trim()) return {};
  return { after: after.trim() };
}

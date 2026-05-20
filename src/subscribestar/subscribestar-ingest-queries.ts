/**
 * Env-driven SubscribeStar GraphQL ingest queries (mirror `creatorIdentityQueriesFromEnv` pattern).
 * Fill after API Explorer validates real schema; ingest mapping uses hypothesis keys until then.
 * Supplemental ops: `SUBSCRIBESTAR_INGEST_SUBSCRIPTIONS_GRAPHQL_QUERY` / `SUBSCRIBESTAR_INGEST_PAYMENTS_GRAPHQL_QUERY`
 * or `SUBSCRIBESTAR_INGEST_QUERIES_JSON` → `subscriptionsRead` / `paymentsRead`.
 */

type QueriesBundle = {
  /** Posts page query; optional `$after` variable for Relay-style paging (see Pagination in official API docs). */
  postsPage?: string;
  /** Requires OAuth scope `content_provider_profile.subscriptions.read` on the explorer-approved document. */
  subscriptionsRead?: string;
  /** Requires OAuth scope `content_provider_profile.payments.read`. */
  paymentsRead?: string;
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

/** Optional ingest operations (same bearer as posts); direct env overrides bundle keys per label. */
export function subscribeStarSupplementalIngestGraphqlQueriesFromEnv(
  env: NodeJS.ProcessEnv = process.env
): { label: string; query: string }[] {
  const bundle = parseQueriesBundle(env.SUBSCRIBESTAR_INGEST_QUERIES_JSON);
  const subscriptions =
    env.SUBSCRIBESTAR_INGEST_SUBSCRIPTIONS_GRAPHQL_QUERY?.trim() ??
    bundle?.subscriptionsRead?.trim();
  const payments =
    env.SUBSCRIBESTAR_INGEST_PAYMENTS_GRAPHQL_QUERY?.trim() ?? bundle?.paymentsRead?.trim();

  const out: { label: string; query: string }[] = [];
  if (subscriptions) out.push({ label: "content_provider_profile.subscriptions.read", query: subscriptions });
  if (payments) out.push({ label: "content_provider_profile.payments.read", query: payments });
  return out;
}

export function ingestPostsVariablesFromCursor(after?: string | null): Record<string, unknown> {
  if (typeof after !== "string" || !after.trim()) return {};
  return { after: after.trim() };
}

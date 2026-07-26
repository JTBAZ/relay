/**
 * Resolve a stable SubscribeStar user/provider id after OAuth — GraphQL roots vary by scopes.
 * Tries conservative queries until one succeeds; override with SUBSCRIBESTAR_CREATOR_IDENTITY_QUERIES_JSON.
 */
import { subscribeStarGraphqlRequest } from "./subscribestar-graphql.js";

type GraphqlEnvelope = {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
};

/** Default guesses; spike may replace with authoritative Explorer queries. */
const DEFAULT_CREATOR_IDENTITY_QUERIES: readonly string[] = [
  `{ user { id } }`,
  `{ contentProviderProfile { id } }`,
  `{ content_provider_profile { id } }`,
  `{ subscriber { id } }`,
  `{ subscriber { user { id } } }`
];

export function creatorIdentityQueriesFromEnv(): readonly string[] {
  const raw = process.env.SUBSCRIBESTAR_CREATOR_IDENTITY_QUERIES_JSON?.trim();
  if (!raw) return DEFAULT_CREATOR_IDENTITY_QUERIES;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      const list = parsed.map((x) => x.trim()).filter(Boolean);
      return list.length > 0 ? list : DEFAULT_CREATOR_IDENTITY_QUERIES;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CREATOR_IDENTITY_QUERIES;
}

function firstTruthyIdDeep(value: unknown, depth = 0): string | null {
  if (depth > 12 || value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s.length > 0 ? s : null;
  }
  if (Array.isArray(value)) {
    for (const x of value) {
      const hit = firstTruthyIdDeep(x, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const direct =
      typeof o.id === "string" || typeof o.id === "number"
        ? String(o.id).trim()
        : null;
    if (direct) return direct;
    for (const k of Object.keys(o)) {
      const hit = firstTruthyIdDeep(o[k], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * @returns Stable provider-facing user/profile id string.
 */
export async function fetchSubscribeStarCreatorProviderUserId(
  accessToken: string,
  fetchImpl: typeof fetch,
  graphqlUrl: string
): Promise<string> {
  const queries = creatorIdentityQueriesFromEnv();

  let lastIssue = "no_queries";
  for (const query of queries) {
    try {
      const doc = await subscribeStarGraphqlRequest<GraphqlEnvelope>(
        graphqlUrl,
        accessToken,
        { query },
        fetchImpl
      );
      const errs = doc.errors?.filter(Boolean) ?? [];
      if (errs.length > 0) {
        lastIssue = errs.map((e) => e.message ?? "").join("; ") || "graphql_errors";
        continue;
      }
      const id = doc.data ? firstTruthyIdDeep(doc.data) : null;
      if (id) return id;
      lastIssue = "empty_data";
    } catch (e) {
      lastIssue = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(
    `SubscribeStar GraphQL identity: could not resolve provider user id (last: ${lastIssue}). Update SUBSCRIBESTAR_CREATOR_IDENTITY_QUERIES_JSON after API Explorer spike.`
  );
}

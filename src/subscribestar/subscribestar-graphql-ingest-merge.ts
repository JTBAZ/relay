/**
 * Merge SubscribeStar GraphQL JSON envelopes before {@link ./subscribestar-graphql-response-to-wire}.
 *
 * Supplemental operations (subscriptions / payments scopes) enrich `data`; their `errors` arrays are **not**
 * propagated into the merged root so optional reads cannot fail ingest when posts + profile succeed.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Merge `data` subtrees shallowly plus one nesting level object merge when both sides are plain objects.
 * Primary scalar / array beats secondary on key collision (subscriptions/payments overlays only add sibling keys).
 */
export function mergeSubscribeStarGraphqlDataTrees(
  primary: Record<string, unknown> | undefined,
  secondary: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!secondary || Object.keys(secondary).length === 0) {
    return primary ? { ...primary } : undefined;
  }
  if (!primary || Object.keys(primary).length === 0) {
    return { ...secondary };
  }
  const keys = new Set([...Object.keys(primary), ...Object.keys(secondary)]);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const pv = primary[k];
    const sv = secondary[k];
    if (sv === undefined) {
      out[k] = pv;
      continue;
    }
    if (pv === undefined) {
      out[k] = sv;
      continue;
    }
    const pObj =
      pv !== null && typeof pv === "object" && !Array.isArray(pv) ? asRecord(pv) : null;
    const sObj =
      sv !== null && typeof sv === "object" && !Array.isArray(sv) ? asRecord(sv) : null;
    if (pObj && sObj) {
      out[k] = { ...pObj, ...sObj };
      continue;
    }
    out[k] = pv;
  }
  return out;
}

/**
 * Start from the posts-query envelope — keep **`errors`** from posts only — merge supplementary `data` layers.
 */
export function mergeSubscribeStarIngestGraphqlResponses(
  postsEnvelope: unknown,
  supplementaryResponses: unknown[]
): unknown {
  const root = asRecord(postsEnvelope);
  if (!root) return postsEnvelope;

  const merged: Record<string, unknown> = { ...root };
  const primaryData = asRecord(root.data);
  let acc = primaryData ? { ...primaryData } : undefined;

  for (const sup of supplementaryResponses) {
    const sr = asRecord(sup);
    if (!sr) continue;
    const sdata = asRecord(sr.data);
    if (!sdata || Object.keys(sdata).length === 0) continue;
    acc = mergeSubscribeStarGraphqlDataTrees(acc, sdata) ?? acc;
  }

  if (acc !== undefined) {
    merged.data = acc;
  }
  return merged;
}

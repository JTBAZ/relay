/**
 * Orchestrate env-configured SubscribeStar GraphQL posts query → Explorer wire → canonical ingest (paged).
 */

import { validateIngestBatchBody } from "../ingest/validate-body.js";
import type { ApplyBatchResult, SyncBatchInput } from "../ingest/types.js";
import { buildSubscribeStarSyncBatch } from "./map-subscribestar-to-ingest.js";
import { fetchSubscribeStarPostsGraphqlPage } from "./subscribestar-graphql-ingest-fetch.js";
import { mapSubscribeStarPostsGraphqlResponseToIngestWire } from "./subscribestar-graphql-response-to-wire.js";
import { subscribeStarPostsPageGraphqlQueryFromEnv } from "./subscribestar-ingest-queries.js";

export type RunSubscribeStarPostsGraphqlIngestOk = {
  ok: true;
  pages_fetched: number;
  batches_ingested: number;
  last_cursor: string | null;
  ended_reason: "no_next_page" | "max_pages" | "missing_cursor_with_next_flag";
  last_apply_result: ApplyBatchResult;
};

export type RunSubscribeStarPostsGraphqlIngestErr = {
  ok: false;
  pages_fetched: number;
  batches_ingested: number;
  last_cursor: string | null;
  issue: string;
  last_apply_result?: ApplyBatchResult;
};

export type RunSubscribeStarPostsGraphqlIngestOutcome =
  | RunSubscribeStarPostsGraphqlIngestOk
  | RunSubscribeStarPostsGraphqlIngestErr;

export type RunSubscribeStarPostsGraphqlIngestDeps = {
  graphqlUrl: string;
  fetchImpl: typeof fetch;
  getAccessToken: () => Promise<string>;
  runBatch: (batch: SyncBatchInput, traceId: string) => Promise<ApplyBatchResult>;
};

/**
 * Runs one or more SubscribeStar GraphQL **posts pages** (`$after` cursor when returned), validates + ingests each page.
 *
 * Prerequisites: **`SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY`** or **`SUBSCRIBESTAR_INGEST_QUERIES_JSON.postsPage`**
 * populated with Explorer-approved query text.
 */
export async function runSubscribeStarPostsGraphqlPagedIngest(input: {
  creator_id: string;
  traceId: string;
  max_pages: number;
  deps: RunSubscribeStarPostsGraphqlIngestDeps;
}): Promise<RunSubscribeStarPostsGraphqlIngestOutcome> {
  const creatorId = input.creator_id.trim();
  if (!creatorId) {
    return { ok: false, pages_fetched: 0, batches_ingested: 0, last_cursor: null, issue: "creator_id is empty" };
  }
  if (!subscribeStarPostsPageGraphqlQueryFromEnv()) {
    return {
      ok: false,
      pages_fetched: 0,
      batches_ingested: 0,
      last_cursor: null,
      issue:
        "SubscribeStar ingest posts GraphQL query is not configured (SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY or SUBSCRIBESTAR_INGEST_QUERIES_JSON.postsPage)."
    };
  }

  const maxPages = Math.min(50, Math.max(1, input.max_pages));
  let pagesFetched = 0;
  let batchesIngested = 0;
  let lastCursor: string | null = null;
  let cursor: string | undefined;
  let lastApply: ApplyBatchResult | undefined;

  for (let i = 0; i < maxPages; i += 1) {
    let raw: unknown;
    try {
      const tok = await input.deps.getAccessToken();
      raw = await fetchSubscribeStarPostsGraphqlPage(
        input.deps.graphqlUrl,
        tok,
        input.deps.fetchImpl,
        { after: cursor }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        pages_fetched: pagesFetched,
        batches_ingested: batchesIngested,
        last_cursor: lastCursor,
        issue: `graphql_fetch:${msg}`,
        ...(lastApply ? { last_apply_result: lastApply } : {})
      };
    }

    pagesFetched += 1;
    const mapped = mapSubscribeStarPostsGraphqlResponseToIngestWire({
      creator_id: creatorId,
      response: raw,
      now_iso: new Date().toISOString()
    });

    if (!mapped.ok) {
      return {
        ok: false,
        pages_fetched: pagesFetched,
        batches_ingested: batchesIngested,
        last_cursor: lastCursor,
        issue: mapped.issues.join("; "),
        ...(lastApply ? { last_apply_result: lastApply } : {})
      };
    }

    const batchMapped = buildSubscribeStarSyncBatch(mapped.wire);
    const ingestParsed = validateIngestBatchBody(batchMapped);
    if (!ingestParsed.ok) {
      return {
        ok: false,
        pages_fetched: pagesFetched,
        batches_ingested: batchesIngested,
        last_cursor: lastCursor,
        issue: `ingest_validation:${ingestParsed.details.map((d) => `${d.field}:${d.issue}`).join("; ")}`,
        ...(lastApply ? { last_apply_result: lastApply } : {})
      };
    }

    try {
      lastApply = await input.deps.runBatch(ingestParsed.batch, input.traceId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        pages_fetched: pagesFetched,
        batches_ingested: batchesIngested,
        last_cursor: lastCursor,
        issue: `ingest_run:${msg}`,
        ...(lastApply ? { last_apply_result: lastApply } : {})
      };
    }

    batchesIngested += 1;
    lastCursor = mapped.end_cursor;

    if (!mapped.has_next_page) {
      return {
        ok: true,
        pages_fetched: pagesFetched,
        batches_ingested: batchesIngested,
        last_cursor: lastCursor,
        ended_reason: "no_next_page",
        last_apply_result: lastApply
      };
    }

    if (!mapped.end_cursor?.trim()) {
      return {
        ok: false,
        pages_fetched: pagesFetched,
        batches_ingested: batchesIngested,
        last_cursor: lastCursor,
        issue: "has_next_page_but_empty_end_cursor",
        last_apply_result: lastApply
      };
    }

    cursor = mapped.end_cursor.trim();
  }

  return {
    ok: true,
    pages_fetched: pagesFetched,
    batches_ingested: batchesIngested,
    last_cursor: lastCursor,
    ended_reason: "max_pages",
    last_apply_result: lastApply!
  };
}

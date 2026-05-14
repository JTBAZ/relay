import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { runSubscribeStarPostsGraphqlPagedIngest } from "../src/subscribestar/run-subscribestar-posts-graphql-ingest.js";
import type { ApplyBatchResult, SyncBatchInput } from "../src/ingest/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const stubApply: ApplyBatchResult = {
  job_id: "job_test",
  idempotent_skips: 0,
  campaigns_upserted: 1,
  tiers_upserted: 0,
  posts_written: 1,
  media_upserted: 0,
  tombstones_applied: 0,
  events_emitted: 0
};

function loadFixture(name: string): unknown {
  const path = join(__dirname, "fixtures", name);
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("runSubscribeStarPostsGraphqlPagedIngest", () => {
  afterEach(() => {
    delete process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY;
  });

  it("returns configuration error when posts query env is unset", async () => {
    const r = await runSubscribeStarPostsGraphqlPagedIngest({
      creator_id: "c1",
      traceId: "t1",
      max_pages: 5,
      deps: {
        graphqlUrl: "https://subscribestar.adult/api/graphql/v1",
        fetchImpl: fetch,
        getAccessToken: async () => "tok",
        runBatch: async () => stubApply
      }
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issue).toMatch(/not configured/i);
  });

  it("ingests one page then stops when hasNextPage is false", async () => {
    process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY = `query { contentProviderProfile { id } }`;
    const raw = loadFixture("subscribestar-hypothesis-posts-graphql.json");
    const fetchMock: typeof fetch = async () =>
      new Response(JSON.stringify(raw), { status: 200, headers: { "content-type": "application/json" } });

    const batches: SyncBatchInput[] = [];
    const r = await runSubscribeStarPostsGraphqlPagedIngest({
      creator_id: "cr_a",
      traceId: "t2",
      max_pages: 10,
      deps: {
        graphqlUrl: "https://subscribestar.adult/api/graphql/v1",
        fetchImpl: fetchMock,
        getAccessToken: async () => "access",
        runBatch: async (b) => {
          batches.push(b);
          return stubApply;
        }
      }
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pages_fetched).toBe(1);
    expect(r.batches_ingested).toBe(1);
    expect(r.ended_reason).toBe("no_next_page");
    expect(batches).toHaveLength(1);
    expect(batches[0].creator_id).toBe("cr_a");
  });

  it("follows cursor for a second page when hasNextPage stays true", async () => {
    process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY = `query P($after:String)`;
    const page1 = loadFixture("subscribestar-hypothesis-posts-graphql.json") as Record<string, unknown>;
    const data1 = (page1 as { data: Record<string, unknown> }).data;
    const cpp1 = data1.contentProviderProfile as Record<string, unknown>;
    const conn1 = cpp1.postsConnection as Record<string, unknown>;
    const pi1 = conn1.pageInfo as Record<string, unknown>;
    pi1.hasNextPage = true;
    pi1.endCursor = "curB";

    const page2 = structuredClone(page1) as { data: { contentProviderProfile: Record<string, unknown> } };
    const conn2 = page2.data.contentProviderProfile.postsConnection as Record<string, unknown>;
    const pi2 = conn2.pageInfo as Record<string, unknown>;
    pi2.hasNextPage = false;
    pi2.endCursor = null;
    const edge2 = (conn2.edges as { node: Record<string, unknown> }[])[0];
    edge2.node.id = "9002";
    edge2.node.title = "Second";

    let calls = 0;
    const fetchMock: typeof fetch = async (_url, init) => {
      calls += 1;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (calls === 1) {
        expect(body.variables?.after).toBeUndefined();
        return new Response(JSON.stringify(page1), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      expect(body.variables?.after).toBe("curB");
      return new Response(JSON.stringify(page2), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const r = await runSubscribeStarPostsGraphqlPagedIngest({
      creator_id: "cr_b",
      traceId: "t3",
      max_pages: 5,
      deps: {
        graphqlUrl: "https://subscribestar.adult/api/graphql/v1",
        fetchImpl: fetchMock,
        getAccessToken: async () => "access",
        runBatch: async () => stubApply
      }
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(calls).toBe(2);
    expect(r.pages_fetched).toBe(2);
    expect(r.batches_ingested).toBe(2);
    expect(r.ended_reason).toBe("no_next_page");
  });
});

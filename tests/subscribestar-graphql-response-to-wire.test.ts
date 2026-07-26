import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ingestPostsVariablesFromCursor,
  subscribeStarPostsPageGraphqlQueryFromEnv,
  subscribeStarSupplementalIngestGraphqlQueriesFromEnv
} from "../src/subscribestar/subscribestar-ingest-queries.js";
import {
  fetchSubscribeStarPostsGraphqlPage
} from "../src/subscribestar/subscribestar-graphql-ingest-fetch.js";
import {
  mapSubscribeStarPostsGraphqlResponseToIngestWire
} from "../src/subscribestar/subscribestar-graphql-response-to-wire.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadHypothesisFixture(): unknown {
  const path = join(__dirname, "fixtures", "subscribestar-hypothesis-posts-graphql.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("mapSubscribeStarPostsGraphqlResponseToIngestWire", () => {
  it("maps hypothesis Explorer-shaped response to ingest wire", () => {
    const raw = loadHypothesisFixture();
    const r = mapSubscribeStarPostsGraphqlResponseToIngestWire({
      creator_id: "cr_demo",
      response: raw,
      now_iso: "2026-01-03T00:00:00.000Z"
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wire.creator_id).toBe("cr_demo");
    expect(r.wire.campaign.external_campaign_id).toBe("404");
    expect(r.wire.tiers?.[0]?.external_tier_id).toBe("10");
    expect(r.wire.posts).toHaveLength(1);
    expect(r.wire.posts[0].external_post_id).toBe("9001");
    expect(r.wire.posts[0].tier_external_ids).toContain("10");
    expect(r.wire.posts[0].media?.[0]?.external_media_id).toBe("500");
    expect(r.has_next_page).toBe(false);
    expect(r.end_cursor).toBeNull();
    expect(r.supplemental_graphql_data).toBeUndefined();
  });

  it("returns supplemental_graphql_data when merged roots exist beside contentProviderProfile", () => {
    const raw = loadHypothesisFixture() as Record<string, unknown>;
    const data = { ...(raw as { data: Record<string, unknown> }).data };
    data.otherSub = { k: 1 };
    const r = mapSubscribeStarPostsGraphqlResponseToIngestWire({
      creator_id: "cr_x",
      response: { data },
      now_iso: "2026-01-03T00:00:00.000Z"
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.supplemental_graphql_data).toEqual({ otherSub: { k: 1 } });
  });

  it("fails without content provider profile root", () => {
    const r = mapSubscribeStarPostsGraphqlResponseToIngestWire({
      creator_id: "c1",
      response: { data: { subscriber: { id: "z" } } }
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.some((x) => x.includes("missing_content"))).toBe(true);
  });

  it("reports graphql errors when there are zero posts and zero tiers", () => {
    const r = mapSubscribeStarPostsGraphqlResponseToIngestWire({
      creator_id: "c1",
      response: {
        errors: [{ message: "not allowed" }],
        data: {
          contentProviderProfile: {
            id: "1",
            name: "Empty",
            postsConnection: { edges: [], pageInfo: { hasNextPage: false } }
          }
        }
      }
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContain("no_posts_in_response");
    expect(r.issues.some((x) => x.startsWith("graphql:"))).toBe(true);
  });

  it("maps tiers with zero posts when GraphQL returns no errors (catalog bootstrap)", () => {
    const r = mapSubscribeStarPostsGraphqlResponseToIngestWire({
      creator_id: "c1",
      response: {
        data: {
          contentProviderProfile: {
            id: "81015",
            title: "Studio",
            plans: [{ id: "501", title: "Gallery Seat", amount: 5 }],
            postsConnection: { edges: [], pageInfo: { hasNextPage: false } }
          }
        }
      },
      now_iso: "2026-05-14T12:00:00.000Z"
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wire.posts).toHaveLength(0);
    expect(r.wire.tiers?.length).toBeGreaterThan(0);
    expect(r.wire.tiers?.[0]?.external_tier_id).toBe("501");
  });
});

describe("subscribeStar ingest query env helpers", () => {
  afterEach(() => {
    delete process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY;
    delete process.env.SUBSCRIBESTAR_INGEST_QUERIES_JSON;
    delete process.env.SUBSCRIBESTAR_INGEST_SUBSCRIPTIONS_GRAPHQL_QUERY;
    delete process.env.SUBSCRIBESTAR_INGEST_PAYMENTS_GRAPHQL_QUERY;
  });

  it("prefer direct SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY over JSON bundle", () => {
    process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY = `{ direct }`;
    process.env.SUBSCRIBESTAR_INGEST_QUERIES_JSON = JSON.stringify({ postsPage: "{ bundled }" });
    expect(subscribeStarPostsPageGraphqlQueryFromEnv()).toBe("{ direct }");
  });

  it("reads postsPage from SUBSCRIBESTAR_INGEST_QUERIES_JSON", () => {
    process.env.SUBSCRIBESTAR_INGEST_QUERIES_JSON = JSON.stringify({ postsPage: "{ bundled_posts }" });
    expect(subscribeStarPostsPageGraphqlQueryFromEnv()).toBe("{ bundled_posts }");
  });

  it("prefer direct supplemental env over bundle subscriptionsRead", () => {
    process.env.SUBSCRIBESTAR_INGEST_SUBSCRIPTIONS_GRAPHQL_QUERY = "query DirectSub{}";
    process.env.SUBSCRIBESTAR_INGEST_QUERIES_JSON = JSON.stringify({
      subscriptionsRead: "query BundledSub{}"
    });
    expect(subscribeStarSupplementalIngestGraphqlQueriesFromEnv().map((x) => x.query)).toEqual([
      "query DirectSub{}"
    ]);
  });

  it("reads subscriptionsRead and paymentsRead from bundle ordered", () => {
    process.env.SUBSCRIBESTAR_INGEST_QUERIES_JSON = JSON.stringify({
      subscriptionsRead: "query S{}",
      paymentsRead: "query P{}"
    });
    expect(subscribeStarSupplementalIngestGraphqlQueriesFromEnv()).toEqual([
      { label: "content_provider_profile.subscriptions.read", query: "query S{}" },
      { label: "content_provider_profile.payments.read", query: "query P{}" }
    ]);
  });

  it("builds variables for cursor paging", () => {
    expect(ingestPostsVariablesFromCursor(undefined)).toEqual({});
    expect(ingestPostsVariablesFromCursor("abc")).toEqual({ after: "abc" });
  });
});

describe("fetchSubscribeStarPostsGraphqlPage", () => {
  afterEach(() => {
    delete process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY;
    delete process.env.SUBSCRIBESTAR_INGEST_SUBSCRIPTIONS_GRAPHQL_QUERY;
    delete process.env.SUBSCRIBESTAR_INGEST_PAYMENTS_GRAPHQL_QUERY;
    delete process.env.SUBSCRIBESTAR_INGEST_QUERIES_JSON;
  });

  it("throws when no posts query configured", async () => {
    await expect(
      fetchSubscribeStarPostsGraphqlPage("https://subscribestar.adult/api/graphql/v1", "tok", fetch)
    ).rejects.toThrow(/not configured/i);
  });

  it("POSTs bearer query when env configured", async () => {
    process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY = `query Posts($after:String){noop}`;
    let posted: RequestInit | undefined;
    const fetchMock: typeof fetch = async (url: string | URL | Request, init?: RequestInit) => {
      posted = init ?? {};
      return new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
    await fetchSubscribeStarPostsGraphqlPage(
      "https://subscribestar.adult/api/graphql/v1",
      "tokXYZ",
      fetchMock,
      { after: "cur1" }
    );
    expect(posted?.method ?? "POST").toBe("POST");
    const hdrs = posted?.headers as Record<string, string> | undefined;
    expect(hdrs?.Authorization ?? "").toContain("tokXYZ");
    const parsed = JSON.parse(String(posted?.body)) as {
      variables?: { after: string };
    };
    expect(parsed.variables?.after).toBe("cur1");
  });

  it("runs supplemental queries after posts and merges data", async () => {
    process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY = `query Posts($after:String){noop}`;
    process.env.SUBSCRIBESTAR_INGEST_SUBSCRIPTIONS_GRAPHQL_QUERY = `{ sub }`;
    process.env.SUBSCRIBESTAR_INGEST_PAYMENTS_GRAPHQL_QUERY = `{ pay }`;
    let call = 0;
    const bodies: unknown[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      call += 1;
      bodies.push(JSON.parse(String(init?.body)));
      if (call === 1) {
        return new Response(JSON.stringify({ data: { contentProviderProfile: { id: "1" } } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (call === 2) {
        return new Response(JSON.stringify({ data: { subscriptionMetrics: { n: 1 } } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ data: { paymentMetrics: { n: 2 } } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
    const out = (await fetchSubscribeStarPostsGraphqlPage(
      "https://subscribestar.adult/api/graphql/v1",
      "tokXYZ",
      fetchMock,
      { after: "cur1" }
    )) as { data?: Record<string, unknown>; errors?: unknown[] };
    expect(call).toBe(3);
    expect(out.data).toEqual({
      contentProviderProfile: { id: "1" },
      subscriptionMetrics: { n: 1 },
      paymentMetrics: { n: 2 }
    });
    expect(out.errors).toBeUndefined();
    const first = bodies[0] as { query: string; variables?: { after: string } };
    expect(first.variables?.after).toBe("cur1");
    expect((bodies[1] as { query: string }).query).toBe("{ sub }");
    expect((bodies[2] as { query: string }).query).toBe("{ pay }");
  });
});

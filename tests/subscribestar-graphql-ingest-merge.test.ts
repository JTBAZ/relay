import { describe, expect, it } from "vitest";

import {
  mergeSubscribeStarGraphqlDataTrees,
  mergeSubscribeStarIngestGraphqlResponses
} from "../src/subscribestar/subscribestar-graphql-ingest-merge.js";

describe("mergeSubscribeStarGraphqlDataTrees", () => {
  it("merges sibling top-level data keys", () => {
    const merged = mergeSubscribeStarGraphqlDataTrees(
      { contentProviderProfile: { id: "1", posts: ["a"] } },
      { subscriptionMetrics: { count: 2 } }
    );
    expect(merged).toEqual({
      contentProviderProfile: { id: "1", posts: ["a"] },
      subscriptionMetrics: { count: 2 }
    });
  });

  it("merges nested plain objects under the same root key once", () => {
    const merged = mergeSubscribeStarGraphqlDataTrees(
      { contentProviderProfile: { id: "9", tiers: [{ x: 1 }] } },
      { contentProviderProfile: { paymentsSummary: "ok", id: "9" } }
    );
    expect(merged).toEqual({
      contentProviderProfile: { id: "9", tiers: [{ x: 1 }], paymentsSummary: "ok" }
    });
  });
});

describe("mergeSubscribeStarIngestGraphqlResponses", () => {
  it("keeps posts errors and drops supplemental errors", () => {
    const merged = mergeSubscribeStarIngestGraphqlResponses(
      { errors: [{ message: "posts partial" }], data: { contentProviderProfile: { id: "1" } } },
      [{ errors: [{ message: "no permission" }], data: { extra: { n: 1 } } }]
    ) as { errors?: unknown[]; data?: Record<string, unknown> };
    expect(merged.errors).toEqual([{ message: "posts partial" }]);
    expect(merged.data).toEqual({
      contentProviderProfile: { id: "1" },
      extra: { n: 1 }
    });
  });
});

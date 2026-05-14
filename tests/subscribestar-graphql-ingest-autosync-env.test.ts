import { describe, expect, it } from "vitest";
import {
  subscribeStarGraphqlAutosyncMaxPagesFromEnv,
  subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv
} from "../src/subscribestar/subscribestar-graphql-ingest-autosync.js";

describe("subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv", () => {
  const base = (): NodeJS.ProcessEnv => ({
    SUBSCRIBESTAR_INGEST_ENABLED: "1",
    RELAY_SUBSCRIBESTAR_GRAPHQL_INGEST_MS: "3600000",
    SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY: "query Q { viewer { __typename }}"
  });

  it("returns null when ingest flag is off", () => {
    expect(
      subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv({
        ...base(),
        SUBSCRIBESTAR_INGEST_ENABLED: "0"
      })
    ).toBeNull();
  });

  it("returns null when posts query missing", () => {
    expect(
      subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv({
        ...base(),
        SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY: ""
      })
    ).toBeNull();
  });

  it("returns null when repeat ms unset", () => {
    expect(
      subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv({
        ...base(),
        RELAY_SUBSCRIBESTAR_GRAPHQL_INGEST_MS: undefined
      })
    ).toBeNull();
  });

  it("returns null when repeat ms below 10 minutes", () => {
    expect(
      subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv({
        ...base(),
        RELAY_SUBSCRIBESTAR_GRAPHQL_INGEST_MS: "599999"
      })
    ).toBeNull();
  });

  it("floors finite repeat ms when valid", () => {
    expect(
      subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv({
        ...base(),
        RELAY_SUBSCRIBESTAR_GRAPHQL_INGEST_MS: "600000.7"
      })
    ).toBe(600_000);
  });
});

describe("subscribeStarGraphqlAutosyncMaxPagesFromEnv", () => {
  it("defaults to 5", () => {
    expect(subscribeStarGraphqlAutosyncMaxPagesFromEnv({})).toBe(5);
  });

  it("clamps to 1–50", () => {
    expect(
      subscribeStarGraphqlAutosyncMaxPagesFromEnv({
        SUBSCRIBESTAR_GRAPHQL_AUTOSYNC_MAX_PAGES: "0"
      })
    ).toBe(5);
    expect(
      subscribeStarGraphqlAutosyncMaxPagesFromEnv({
        SUBSCRIBESTAR_GRAPHQL_AUTOSYNC_MAX_PAGES: "999"
      })
    ).toBe(50);
  });
});

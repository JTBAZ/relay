import { describe, expect, it } from "vitest";
import {
  buildPatronFeedTelemetryBody,
  readPatronTelemetrySessionKey,
  shouldEmitPatronFeedOpen
} from "./patron-feed-telemetry";

describe("patron feed telemetry (PMD-043)", () => {
  it("builds feed_open payload with actor and session dimensions", () => {
    const storage = new Map<string, string>();
    const mock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    };
    readPatronTelemetrySessionKey(mock);

    const body = buildPatronFeedTelemetryBody({
      event_name: "feed_open",
      actor_key: "acct_patron_1",
      surface: "patron_feed"
    });

    expect(body.event_name).toBe("feed_open");
    expect(body.actor_key).toBe("acct_patron_1");
    expect(body.payload).toMatchObject({
      surface: "patron_feed",
      actor_key: "acct_patron_1"
    });
  });

  it("dedupes feed_open per browser session", () => {
    const storage = new Map<string, string>();
    const mock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    };
    expect(shouldEmitPatronFeedOpen(mock)).toBe(true);
    expect(shouldEmitPatronFeedOpen(mock)).toBe(false);
  });

  it("builds post_view payload with creator and post ids", () => {
    const body = buildPatronFeedTelemetryBody({
      event_name: "post_view",
      actor_key: "acct_patron_1",
      creator_id: "creator_a",
      post_id: "post_b",
      surface: "patron_feed_post_detail"
    });
    expect(body.payload).toMatchObject({
      creator_id: "creator_a",
      post_id: "post_b",
      surface: "patron_feed_post_detail"
    });
  });
});

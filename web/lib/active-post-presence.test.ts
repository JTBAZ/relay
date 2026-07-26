import { describe, expect, it } from "vitest";
import {
  autopostMediaIdsFromItems,
  isDestinationPresent,
  summaryToPresence,
} from "./active-post-presence";

describe("active-post-presence", () => {
  it("treats posted or external_url as present", () => {
    expect(isDestinationPresent({ attempt_status: "posted", external_url: null })).toBe(true);
    expect(
      isDestinationPresent({ attempt_status: null, external_url: "https://x.com/1" })
    ).toBe(true);
    expect(isDestinationPresent({ attempt_status: "fill_pending", external_url: null })).toBe(
      false
    );
    expect(isDestinationPresent({ attempt_status: null, external_url: "  " })).toBe(false);
  });

  it("maps summary to present/missing across product destinations", () => {
    const { present, missing } = summaryToPresence({
      destinations: [
        {
          destination: "patreon",
          attempt_status: "posted",
          external_url: "https://patreon.com/posts/1",
        },
        { destination: "x", attempt_status: "fill_sent", external_url: null },
        { destination: "bluesky", attempt_status: null, external_url: "https://bsky.app/1" },
      ],
    });

    expect(present.map((p) => p.destination)).toEqual(["patreon", "bluesky"]);
    expect(present.find((p) => p.destination === "patreon")?.external_url).toBe(
      "https://patreon.com/posts/1"
    );
    expect(missing).toEqual(["x", "deviantart"]);
  });

  it("treats empty / missing summary as all ghosts", () => {
    expect(summaryToPresence(null).present).toEqual([]);
    expect(summaryToPresence(null).missing).toEqual([
      "patreon",
      "x",
      "deviantart",
      "bluesky",
    ]);
    expect(summaryToPresence({ destinations: [] }).present).toEqual([]);
    expect(summaryToPresence(undefined as never).missing).toHaveLength(4);
  });

  it("ignores unknown destinations and prefers present row on duplicates", () => {
    const { present, missing } = summaryToPresence({
      destinations: [
        { destination: "x", attempt_status: "draft", external_url: null },
        { destination: "x", attempt_status: "posted", external_url: "https://x.com/ok" },
        { destination: "myspace" as never, attempt_status: "posted", external_url: null },
      ],
    });
    expect(present).toEqual([{ destination: "x", external_url: "https://x.com/ok" }]);
    expect(missing).toEqual(["patreon", "deviantart", "bluesky"]);
  });

  it("filters post_only media ids for Autopost entry", () => {
    expect(
      autopostMediaIdsFromItems([
        { media_id: "relay_m_1" },
        { media_id: "post_only_abc" },
        { media_id: "  " },
        { media_id: "relay_m_2" },
      ])
    ).toEqual(["relay_m_1", "relay_m_2"]);
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapSubscribeStarPatronSubscriptionDataToRelayTierIds } from "../src/subscribestar/map-subscribestar-subscription-to-relay-tier-ids.js";

const _dir = dirname(fileURLToPath(import.meta.url));

describe("mapSubscribeStarPatronSubscriptionDataToRelayTierIds", () => {
  it("maps hypothesis fixture plan id to substar_tier_* for matching creator profile", () => {
    const raw = readFileSync(
      join(_dir, "fixtures/subscribestar-patron/hypothesis-subscriptions.json"),
      "utf8"
    );
    const root = JSON.parse(raw) as { data: unknown };
    const ids = mapSubscribeStarPatronSubscriptionDataToRelayTierIds(root.data, {
      creatorSubscribeStarProfileId: "887766"
    });
    expect(ids).toEqual(["substar_tier_501"]);
  });

  it("returns empty when creator profile does not match", () => {
    const raw = readFileSync(
      join(_dir, "fixtures/subscribestar-patron/hypothesis-subscriptions.json"),
      "utf8"
    );
    const root = JSON.parse(raw) as { data: unknown };
    const ids = mapSubscribeStarPatronSubscriptionDataToRelayTierIds(root.data, {
      creatorSubscribeStarProfileId: "999999"
    });
    expect(ids).toEqual([]);
  });
});

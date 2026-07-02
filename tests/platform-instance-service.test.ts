import { describe, expect, it, vi } from "vitest";
import {
  ensureRelayPlatformInstanceForPost,
  platformInstanceIdForAttempt,
  relayPlatformInstanceIdForPost,
  touchPlatformInstanceLastRefreshed,
  upsertPlatformInstanceFromAttempt
} from "../src/analytics/platform-instance-service.js";

const ATTEMPT_ID = "attempt_1";
const POST_ID = "post_alpha";
const CREATOR_ID = "creator_a";

describe("platform-instance-service", () => {
  it("builds deterministic ids", () => {
    expect(platformInstanceIdForAttempt(ATTEMPT_ID)).toBe("pi_attempt_attempt_1");
    expect(relayPlatformInstanceIdForPost(POST_ID)).toBe("pi_relay_post_alpha");
  });

  it("skips upsert when external URL is missing for non-relay destinations", async () => {
    const upsert = vi.fn();
    const db = { platformInstance: { findUnique: vi.fn(), upsert } };

    await expect(
      upsertPlatformInstanceFromAttempt(db as never, {
        attemptId: ATTEMPT_ID,
        creatorId: CREATOR_ID,
        postId: POST_ID,
        destination: "x",
        externalUrl: null
      })
    ).resolves.toBeNull();

    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts platform instance from posted attempt", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn().mockResolvedValue({});
    const db = { platformInstance: { findUnique, upsert } };

    const result = await upsertPlatformInstanceFromAttempt(db as never, {
      attemptId: ATTEMPT_ID,
      creatorId: CREATOR_ID,
      postId: POST_ID,
      destination: "patreon",
      externalUrl: "https://patreon.com/posts/1",
      externalId: "ext_1"
    });

    expect(result).toEqual({
      platformInstanceId: platformInstanceIdForAttempt(ATTEMPT_ID),
      created: true
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId_destination: { postId: POST_ID, destination: "patreon" } },
        create: expect.objectContaining({
          id: platformInstanceIdForAttempt(ATTEMPT_ID),
          externalUrl: "https://patreon.com/posts/1",
          linkSource: "autopost_success"
        })
      })
    );
  });

  it("ensures relay-native instance per post", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "pi_relay_post_alpha" });
    const upsert = vi.fn().mockResolvedValue({});
    const db = { platformInstance: { findUnique, upsert } };

    const result = await ensureRelayPlatformInstanceForPost(db as never, {
      postId: POST_ID,
      creatorId: CREATOR_ID
    });

    expect(result).toEqual({
      platformInstanceId: relayPlatformInstanceIdForPost(POST_ID),
      created: false
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId_destination: { postId: POST_ID, destination: "relay" } },
        create: expect.objectContaining({
          linkSource: "relay_native",
          externalUrl: null
        })
      })
    );
  });

  it("touches lastRefreshedAt", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = { platformInstance: { updateMany } };
    const at = new Date("2026-07-01T12:00:00.000Z");

    await touchPlatformInstanceLastRefreshed(db as never, "pi_attempt_1", at);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "pi_attempt_1" },
      data: { lastRefreshedAt: at, updatedAt: at }
    });
  });
});

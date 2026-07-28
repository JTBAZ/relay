import { describe, expect, it, vi } from "vitest";
import {
  ensurePatreonPlatformInstanceForIngestedPost,
  ensureRelayPlatformInstanceForPost,
  patreonIngestExternalIdentity,
  platformInstanceIdForAttempt,
  platformInstanceIdForManualLink,
  relayPlatformInstanceIdForPost,
  touchPlatformInstanceLastRefreshed,
  upsertPlatformInstanceFromAttempt
} from "../src/analytics/platform-instance-service.js";

const ATTEMPT_ID = "attempt_1";
const POST_ID = "post_alpha";
const CREATOR_ID = "creator_a";
const PATREON_POST_ID = "patreon_post_165070564";

describe("platform-instance-service", () => {
  it("builds deterministic ids", () => {
    expect(platformInstanceIdForAttempt(ATTEMPT_ID)).toBe("pi_attempt_attempt_1");
    expect(relayPlatformInstanceIdForPost(POST_ID)).toBe("pi_relay_post_alpha");
    expect(platformInstanceIdForManualLink(PATREON_POST_ID, "patreon")).toBe(
      "pi_manual_patreon_post_165070564_patreon"
    );
  });

  it("parses patreon ingest external identity", () => {
    expect(patreonIngestExternalIdentity(PATREON_POST_ID)).toEqual({
      externalId: "165070564",
      externalUrl: "https://www.patreon.com/posts/165070564"
    });
    expect(patreonIngestExternalIdentity("relay_post_1")).toBeNull();
  });

  it("creates Patreon Platform Instance for ingested post", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({});
    const db = { platformInstance: { findUnique, create, update: vi.fn() } };

    const result = await ensurePatreonPlatformInstanceForIngestedPost(db as never, {
      postId: PATREON_POST_ID,
      creatorId: CREATOR_ID,
      linkedAt: new Date("2026-06-01T00:00:00.000Z")
    });

    expect(result).toEqual({
      platformInstanceId: platformInstanceIdForManualLink(PATREON_POST_ID, "patreon"),
      created: true
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: platformInstanceIdForManualLink(PATREON_POST_ID, "patreon"),
        creatorId: CREATOR_ID,
        postId: PATREON_POST_ID,
        destination: "patreon",
        externalUrl: "https://www.patreon.com/posts/165070564",
        externalId: "165070564",
        linkSource: "api_identity",
        status: "active"
      })
    });
  });

  it("does not clobber autopost Patreon instance URL", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "pi_attempt_1",
      externalUrl: "https://www.patreon.com/posts/custom",
      externalId: "custom",
      linkSource: "autopost_success",
      status: "active"
    });
    const update = vi.fn().mockResolvedValue({});
    const create = vi.fn();
    const db = { platformInstance: { findUnique, create, update } };

    const result = await ensurePatreonPlatformInstanceForIngestedPost(db as never, {
      postId: PATREON_POST_ID,
      creatorId: CREATOR_ID
    });

    expect(result).toEqual({ platformInstanceId: "pi_attempt_1", created: false });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
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
          linkSource: "autopost_success",
          contentVariantRole: null
        }),
        update: expect.objectContaining({
          contentVariantRole: null
        })
      })
    );
  });

  it("persists contentVariantRole when provided", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn().mockResolvedValue({});
    const db = { platformInstance: { findUnique, upsert } };

    await upsertPlatformInstanceFromAttempt(db as never, {
      attemptId: ATTEMPT_ID,
      creatorId: CREATOR_ID,
      postId: POST_ID,
      destination: "x",
      externalUrl: "https://x.com/handle/status/1",
      externalId: "1",
      contentVariantRole: "promo"
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ contentVariantRole: "promo" }),
        update: expect.objectContaining({ contentVariantRole: "promo" })
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

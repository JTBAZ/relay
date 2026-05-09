import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueRelayEngagementEvent } from "../src/analytics/relay-engagement-event.js";

describe("enqueueRelayEngagementEvent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no-ops when prisma is missing", () => {
    const create = vi.fn();
    enqueueRelayEngagementEvent(
      { prisma: null, relay_db_store_analytics: true },
      { creatorId: "c1", eventType: "gallery_view" }
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("no-ops when analytics DB writes are disabled", () => {
    const create = vi.fn();
    enqueueRelayEngagementEvent(
      {
        prisma: { relayEngagementEvent: { create } } as never,
        relay_db_store_analytics: false
      },
      { creatorId: "c1", eventType: "gallery_view" }
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a row when prisma and analytics flag are on", async () => {
    const create = vi.fn().mockResolvedValue({ id: "evt1" });
    enqueueRelayEngagementEvent(
      {
        prisma: { relayEngagementEvent: { create } } as never,
        relay_db_store_analytics: true
      },
      {
        creatorId: "creator_x",
        eventType: "profile_view",
        postId: null,
        sessionKey: "opaque"
      }
    );
    expect(create).toHaveBeenCalledWith({
      data: {
        creatorId: "creator_x",
        eventType: "profile_view",
        occurredAt: expect.any(Date) as Date,
        postId: null,
        mediaId: null,
        sessionKey: "opaque"
      }
    });
    await Promise.resolve();
  });

  it("defaults sessionKey blank to null", async () => {
    const create = vi.fn().mockResolvedValue({ id: "evt2" });
    enqueueRelayEngagementEvent(
      {
        prisma: { relayEngagementEvent: { create } } as never,
        relay_db_store_analytics: true
      },
      { creatorId: "c2", eventType: "gallery_view", sessionKey: "   " }
    );
    expect(create.mock.calls[0][0].data.sessionKey).toBeNull();
    await Promise.resolve();
  });

  it("uses RELAY_DB_STORE_ANALYTICS when relay_db_store_analytics is unset", async () => {
    vi.stubEnv("RELAY_DB_STORE_ANALYTICS", "1");
    const create = vi.fn().mockResolvedValue({ id: "evt3" });
    enqueueRelayEngagementEvent(
      { prisma: { relayEngagementEvent: { create } } as never },
      { creatorId: "c3", eventType: "gallery_view" }
    );
    expect(create).toHaveBeenCalled();
    await Promise.resolve();
  });
});

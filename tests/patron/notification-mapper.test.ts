import { describe, expect, it, vi } from "vitest";
import {
  mapOutboxEventToNotifications,
  PEG_EVENT_NAMES
} from "../../src/patron/notification-mapper.js";

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    eventName: PEG_EVENT_NAMES.TIER_CHANGED,
    tenantId: "creator-1",
    primaryId: "membership-1",
    payload: {},
    ...over
  };
}

function prismaWith(overrides: Record<string, unknown> = {}) {
  return {
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null) // no row -> default enabled
    },
    comment: { findUnique: vi.fn() },
    tenantMembership: { findMany: vi.fn() },
    ...overrides
  } as never;
}

describe("mapOutboxEventToNotifications", () => {
  it("returns [] for an unknown event name", async () => {
    const out = await mapOutboxEventToNotifications(prismaWith(), event({ eventName: "nope" }));
    expect(out).toEqual([]);
  });

  describe("tier_changed", () => {
    it("emits a single notification keyed on the patron membership; never clusters", async () => {
      const out = await mapOutboxEventToNotifications(
        prismaWith(),
        event({
          payload: {
            prior_tier_ids: ["t1"],
            next_tier_ids: ["t2"],
            prior_active: true,
            next_active: false,
            source: "webhook"
          }
        })
      );
      expect(out).toHaveLength(1);
      expect(out[0].kind).toBe("tier_changed");
      expect(out[0].recipientMembershipId).toBe("membership-1");
      expect(out[0].relayCreatorId).toBe("creator-1");
      expect(out[0].clusterKey).toBeNull();
      expect(out[0].sourceEventId).toBe("ev1");
      expect(out[0].payload).toEqual({
        prior_tier_ids: ["t1"],
        next_tier_ids: ["t2"],
        prior_active: true,
        next_active: false,
        source: "webhook"
      });
    });

    it("respects a disabled preference (returns empty array)", async () => {
      const prisma = prismaWith({
        notificationPreference: {
          findUnique: vi.fn().mockResolvedValue({ enabled: false })
        }
      });
      const out = await mapOutboxEventToNotifications(prisma, event());
      expect(out).toEqual([]);
    });
  });

  describe("comment_replied", () => {
    it("returns [] for top-level comments (no parent)", async () => {
      const out = await mapOutboxEventToNotifications(
        prismaWith(),
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_CREATED,
          payload: {
            comment_id: "c1",
            post_id: "p1",
            author_membership_id: "m-author",
            parent_comment_id: null
          }
        })
      );
      expect(out).toEqual([]);
    });

    it("notifies the parent comment author with a clusterKey", async () => {
      const prisma = prismaWith({
        comment: {
          findUnique: vi.fn().mockResolvedValue({
            patronUserId: "m-parent-author",
            relayCreatorId: "creator-1",
            postId: "p1"
          })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_CREATED,
          payload: {
            comment_id: "c-reply",
            post_id: "p1",
            parent_comment_id: "c-parent",
            author_membership_id: "m-replier"
          }
        })
      );
      expect(out).toHaveLength(1);
      expect(out[0].recipientMembershipId).toBe("m-parent-author");
      expect(out[0].kind).toBe("comment_replied");
      expect(out[0].clusterKey).toBe("comment_replied:c-parent");
    });

    it("does NOT notify when the replier is replying to their own comment", async () => {
      const prisma = prismaWith({
        comment: {
          findUnique: vi.fn().mockResolvedValue({
            patronUserId: "same-author",
            relayCreatorId: "creator-1",
            postId: "p1"
          })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_CREATED,
          payload: {
            comment_id: "c-reply",
            parent_comment_id: "c-parent",
            author_membership_id: "same-author"
          }
        })
      );
      expect(out).toEqual([]);
    });

    it("returns [] when the parent comment has been deleted", async () => {
      const prisma = prismaWith({
        comment: { findUnique: vi.fn().mockResolvedValue(null) }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_CREATED,
          payload: { comment_id: "c", parent_comment_id: "c-parent", author_membership_id: "m" }
        })
      );
      expect(out).toEqual([]);
    });
  });

  describe("comment_liked", () => {
    it("notifies the comment author with a clusterKey", async () => {
      const prisma = prismaWith({
        comment: {
          findUnique: vi.fn().mockResolvedValue({
            patronUserId: "m-author",
            relayCreatorId: "creator-1",
            postId: "p1"
          })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_REACTION_ADDED,
          payload: { comment_id: "c1", account_id: "acc-fan", kind: "heart" }
        })
      );
      expect(out).toHaveLength(1);
      expect(out[0].recipientMembershipId).toBe("m-author");
      expect(out[0].kind).toBe("comment_liked");
      expect(out[0].clusterKey).toBe("comment_liked:c1");
      expect(out[0].payload.latest_actor_account_id).toBe("acc-fan");
      expect(out[0].payload.latest_kind).toBe("heart");
    });

    it("does NOT notify when the reactor is the comment author", async () => {
      const prisma = prismaWith({
        comment: {
          findUnique: vi.fn().mockResolvedValue({
            patronUserId: "self",
            relayCreatorId: "creator-1",
            postId: "p1"
          })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_REACTION_ADDED,
          payload: { comment_id: "c1", account_id: "self", kind: "like" }
        })
      );
      expect(out).toEqual([]);
    });
  });

  describe("new_follower", () => {
    it("fans out to every membership owned by the followed account", async () => {
      const prisma = prismaWith({
        tenantMembership: {
          findMany: vi.fn().mockResolvedValue([
            { id: "m-a", tenant: { relayCreatorId: "creator-a" } },
            { id: "m-b", tenant: { relayCreatorId: "creator-b" } }
          ])
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.ACCOUNT_FOLLOW_CREATED,
          tenantId: "",
          primaryId: "acc-followed",
          payload: { follower_account_id: "acc-fan", followed_account_id: "acc-followed" }
        })
      );
      expect(out).toHaveLength(2);
      expect(out.map((n) => n.recipientMembershipId).sort()).toEqual(["m-a", "m-b"]);
      for (const n of out) {
        expect(n.kind).toBe("new_follower");
        expect(n.clusterKey).toBe("new_follower:acc-followed");
      }
    });

    it("returns [] when payload is missing required fields", async () => {
      const out = await mapOutboxEventToNotifications(
        prismaWith(),
        event({
          eventName: PEG_EVENT_NAMES.ACCOUNT_FOLLOW_CREATED,
          payload: { follower_account_id: "acc-fan" } // missing followed
        })
      );
      expect(out).toEqual([]);
    });
  });
});

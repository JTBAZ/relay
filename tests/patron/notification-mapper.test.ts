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
    account: { findFirst: vi.fn().mockResolvedValue(null) },
    comment: { findUnique: vi.fn() },
    tenantMembership: { findMany: vi.fn(), findUnique: vi.fn() },
    // mapPostPublished fetches post overrides and the post row for visibility/mature checks.
    postOverride: { findMany: vi.fn().mockResolvedValue([]) },
    post: { findFirst: vi.fn().mockResolvedValue(null) },
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

  describe("comment_replied + post_commented", () => {
    it("notifies the creator for top-level comments", async () => {
      const prisma = prismaWith({
        account: {
          findFirst: vi.fn().mockResolvedValue({ id: "creator-acc" })
        },
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue({ accountId: "patron-acc" })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_CREATED,
          payload: {
            comment_id: "c1",
            post_id: "p1",
            relay_creator_id: "creator-1",
            author_membership_id: "m-author",
            parent_comment_id: null
          }
        })
      );
      expect(out).toHaveLength(1);
      expect(out[0]?.recipientCreatorAccountId).toBe("creator-acc");
      expect(out[0]?.kind).toBe("post_commented");
      expect(out[0]?.clusterKey).toBe("post_commented:p1");
    });

    it("returns [] for top-level comments when author is the creator account", async () => {
      const prisma = prismaWith({
        account: {
          findFirst: vi.fn().mockResolvedValue({ id: "creator-acc" })
        },
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue({ accountId: "creator-acc" })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_CREATED,
          payload: {
            comment_id: "c1",
            post_id: "p1",
            relay_creator_id: "creator-1",
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
        },
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue({ accountId: "acc-author" })
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

    it("does NOT notify when the reactor is the comment author (account match)", async () => {
      const prisma = prismaWith({
        comment: {
          findUnique: vi.fn().mockResolvedValue({
            patronUserId: "m-author",
            relayCreatorId: "creator-1",
            postId: "p1"
          })
        },
        tenantMembership: {
          findUnique: vi.fn().mockResolvedValue({ accountId: "acc-author" })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_REACTION_ADDED,
          payload: { comment_id: "c1", account_id: "acc-author", kind: "like" }
        })
      );
      expect(out).toEqual([]);
    });
  });

  describe("mention", () => {
    it("notifies the resolved recipient membership and respects mention preference shape", async () => {
      const out = await mapOutboxEventToNotifications(
        prismaWith(),
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_MENTIONED,
          tenantId: "creator-1",
          payload: {
            post_id: "p1",
            comment_id: "c1",
            recipient_membership_id: "mentioned-m",
            author_membership_id: "author-m",
            mentioned_handle: "dev-milo",
            target_kind: "creator"
          }
        })
      );

      expect(out).toHaveLength(1);
      expect(out[0].recipientMembershipId).toBe("mentioned-m");
      expect(out[0].kind).toBe("mention");
      expect(out[0].relayCreatorId).toBe("creator-1");
      expect(out[0].clusterKey).toBe("mention:c1:mentioned-m");
      expect(out[0].payload).toEqual({
        post_id: "p1",
        comment_id: "c1",
        author_membership_id: "author-m",
        mentioned_handle: "dev-milo",
        target_kind: "creator"
      });
    });

    it("does NOT notify when the mentioned recipient is the author", async () => {
      const out = await mapOutboxEventToNotifications(
        prismaWith(),
        event({
          eventName: PEG_EVENT_NAMES.COMMENT_MENTIONED,
          payload: {
            post_id: "p1",
            comment_id: "c1",
            recipient_membership_id: "same-m",
            author_membership_id: "same-m"
          }
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

  describe("new_subscriber", () => {
    it("emits creator notification when entitlement becomes active", async () => {
      const prisma = prismaWith({
        account: {
          findFirst: vi.fn().mockResolvedValue({ id: "creator-acc" })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          payload: {
            prior_tier_ids: [],
            next_tier_ids: ["t1"],
            prior_active: false,
            next_active: true
          }
        })
      );
      expect(out).toHaveLength(2);
      expect(out.some((n) => n.kind === "tier_changed")).toBe(true);
      const creator = out.find((n) => n.kind === "new_subscriber");
      expect(creator?.recipientCreatorAccountId).toBe("creator-acc");
    });
  });

  describe("post_favorited", () => {
    it("routes favorites to the studio owner account", async () => {
      const prisma = prismaWith({
        account: {
          findFirst: vi.fn().mockResolvedValue({ id: "creator-acc" })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.PATRON_FAVORITE_ADDED,
          tenantId: "creator-1",
          payload: {
            relay_creator_id: "creator-1",
            target_kind: "post",
            target_id: "post-1",
            post_id: "post-1",
            actor_account_id: "fan-acc"
          }
        })
      );
      expect(out).toHaveLength(1);
      expect(out[0]?.kind).toBe("post_favorited");
      expect(out[0]?.recipientCreatorAccountId).toBe("creator-acc");
    });
  });

  describe("post_published", () => {
    it("notifies instant-mode followers only", async () => {
      const prisma = prismaWith({
        patronFollow: {
          findMany: vi.fn().mockResolvedValue([{ patronMembershipId: "m-instant" }, { patronMembershipId: "m-digest" }])
        },
        patronProfile: {
          findMany: vi.fn().mockResolvedValue([
            { tenantMembershipId: "m-instant", notificationDigestEnabled: false },
            { tenantMembershipId: "m-digest", notificationDigestEnabled: true }
          ])
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.POST_PUBLISHED,
          tenantId: "creator-1",
          primaryId: "post-1",
          payload: { post_id: "post-1", relay_creator_id: "creator-1", title: "Hello" }
        })
      );
      expect(out).toHaveLength(1);
      expect(out[0]?.recipientMembershipId).toBe("m-instant");
      expect(out[0]?.kind).toBe("new_post_followed");
    });
  });

  describe("reveal_expiring", () => {
    it("emits reveal_expiring with clusterKey and offer attach", async () => {
      const prisma = prismaWith({
        tenantMembership: {
          findFirst: vi.fn().mockResolvedValue({ id: "m-fan" })
        },
        postMarketingOffer: {
          findFirst: vi.fn().mockResolvedValue({
            headline: "Join for 20% off",
            ctaText: "Upgrade",
            redirectSlug: "offer-slug"
          })
        },
        creatorProfile: {
          findFirst: vi.fn().mockResolvedValue({ displayName: "Ada" })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.REVEAL_EXPIRING,
          tenantId: "creator-1",
          primaryId: "rev-1",
          payload: {
            reveal_id: "rev-1",
            post_id: "post-9",
            creator_id: "creator-1",
            patron_account_id: "acct-fan",
            expires_at: "2026-07-17T12:00:00.000Z",
            cluster_key: "reveal_expiring:rev-1"
          }
        })
      );
      expect(out).toHaveLength(1);
      expect(out[0]?.kind).toBe("reveal_expiring");
      expect(out[0]?.recipientMembershipId).toBe("m-fan");
      expect(out[0]?.clusterKey).toBe("reveal_expiring:rev-1");
      expect(String(out[0]?.payload.body)).toMatch(/Ada.*closes tomorrow/i);
      expect(out[0]?.payload.offer).toEqual({
        headline: "Join for 20% off",
        cta_text: "Upgrade",
        slug: "offer-slug"
      });
    });

    it("respects disabled reveal_expiring preference", async () => {
      const prisma = prismaWith({
        tenantMembership: {
          findFirst: vi.fn().mockResolvedValue({ id: "m-fan" })
        },
        notificationPreference: {
          findUnique: vi.fn().mockResolvedValue({ enabled: false })
        }
      });
      const out = await mapOutboxEventToNotifications(
        prisma,
        event({
          eventName: PEG_EVENT_NAMES.REVEAL_EXPIRING,
          payload: {
            reveal_id: "rev-1",
            post_id: "post-9",
            creator_id: "creator-1",
            patron_account_id: "acct-fan"
          }
        })
      );
      expect(out).toEqual([]);
    });
  });
});

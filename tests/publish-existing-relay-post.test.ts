import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostPublishState, PostSource } from "@prisma/client";
import {
  PublishExistingRelayPostError,
  publishExistingRelayPost
} from "../src/relay/publish-existing-relay-post.js";

vi.mock("../src/patron/notification-event-emit.js", () => ({
  emitPostPublishedEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../src/autopost/posting-goal-service.js", () => ({
  reconcilePostingGoalNudgesAfterPublish: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../src/relay/update-post-audience-tier-gate.js", () => ({
  updatePostAudienceTierGate: vi.fn().mockResolvedValue({
    postId: "post_1",
    isPublic: true,
    tierIds: []
  })
}));

vi.mock("../src/relay/create-relay-post.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/relay/create-relay-post.js")>();
  return {
    ...mod,
    resolveRelayPostTier: vi.fn()
  };
});

import { emitPostPublishedEvent } from "../src/patron/notification-event-emit.js";
import { reconcilePostingGoalNudgesAfterPublish } from "../src/autopost/posting-goal-service.js";
import { updatePostAudienceTierGate } from "../src/relay/update-post-audience-tier-gate.js";
import { resolveRelayPostTier } from "../src/relay/create-relay-post.js";

const mockedEmit = vi.mocked(emitPostPublishedEvent);
const mockedNudge = vi.mocked(reconcilePostingGoalNudgesAfterPublish);
const mockedAudience = vi.mocked(updatePostAudienceTierGate);
const mockedResolveTier = vi.mocked(resolveRelayPostTier);

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

describe("publishExistingRelayPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudience.mockResolvedValue({
      postId: "post_1",
      isPublic: true,
      tierIds: []
    });
  });

  it("publishes a draft Relay post in place (no second post)", async () => {
    const postUpdate = vi.fn().mockResolvedValue({});
    const versionUpdate = vi.fn().mockResolvedValue({});
    const prisma = prismaStub({
      post: {
        findFirst: vi.fn().mockResolvedValue({
          id: "post_1",
          source: PostSource.RELAY,
          publishState: PostPublishState.draft,
          campaignId: "camp_1"
        }),
        update: postUpdate
      },
      postVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ver_1",
          versionSeq: 1,
          title: "Scheduled title",
          description: "Body",
          tagIds: ["art"]
        }),
        update: versionUpdate
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          post: { update: postUpdate },
          postVersion: { update: versionUpdate }
        })
      )
    });

    const out = await publishExistingRelayPost(prisma, {
      creatorId: "cr_1",
      postId: "post_1",
      isPublic: true,
      tierIds: []
    });

    expect(out).toMatchObject({
      post_id: "post_1",
      publish_state: "published",
      is_public: true,
      tier_ids: []
    });
    expect(postUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "post_1" },
        data: { publishState: PostPublishState.published }
      })
    );
    expect(versionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedAt: expect.any(Date),
          title: "Scheduled title"
        })
      })
    );
    expect(mockedAudience).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        creatorId: "cr_1",
        postId: "post_1",
        isPublic: true,
        tierIds: []
      })
    );
    expect(mockedEmit).toHaveBeenCalled();
    expect(mockedNudge).toHaveBeenCalledWith(prisma, "cr_1");
  });

  it("rejects already-published posts", async () => {
    const prisma = prismaStub({
      post: {
        findFirst: vi.fn().mockResolvedValue({
          id: "post_1",
          source: PostSource.RELAY,
          publishState: PostPublishState.published,
          campaignId: "camp_1"
        })
      }
    });

    await expect(
      publishExistingRelayPost(prisma, {
        creatorId: "cr_1",
        postId: "post_1",
        isPublic: true
      })
    ).rejects.toMatchObject({
      name: "PublishExistingRelayPostError",
      code: "ALREADY_PUBLISHED",
      statusCode: 409
    });
  });

  it("rejects wrong creator (not found)", async () => {
    const prisma = prismaStub({
      post: { findFirst: vi.fn().mockResolvedValue(null) }
    });

    await expect(
      publishExistingRelayPost(prisma, {
        creatorId: "other",
        postId: "post_1",
        isPublic: true
      })
    ).rejects.toBeInstanceOf(PublishExistingRelayPostError);
  });

  it("applies gated audience via resolved relay tier ids", async () => {
    mockedResolveTier.mockResolvedValue({
      id: "tier_prisma_1",
      relayTierId: "relay_tier_1"
    });
    mockedAudience.mockResolvedValue({
      postId: "post_1",
      isPublic: false,
      tierIds: ["relay_tier_1"]
    });

    const postUpdate = vi.fn().mockResolvedValue({});
    const versionUpdate = vi.fn().mockResolvedValue({});
    const prisma = prismaStub({
      post: {
        findFirst: vi.fn().mockResolvedValue({
          id: "post_1",
          source: PostSource.RELAY,
          publishState: PostPublishState.draft,
          campaignId: "camp_1"
        }),
        update: postUpdate
      },
      postVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ver_1",
          versionSeq: 1,
          title: "T",
          description: null,
          tagIds: []
        }),
        update: versionUpdate
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          post: { update: postUpdate },
          postVersion: { update: versionUpdate }
        })
      )
    });

    const out = await publishExistingRelayPost(prisma, {
      creatorId: "cr_1",
      postId: "post_1",
      isPublic: false,
      tierIds: ["tier_prisma_1"]
    });

    expect(mockedResolveTier).toHaveBeenCalledWith(
      prisma,
      "cr_1",
      "tier_prisma_1",
      "camp_1"
    );
    expect(mockedAudience).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        isPublic: false,
        tierIds: ["relay_tier_1"]
      })
    );
    expect(out.is_public).toBe(false);
    expect(out.tier_ids).toEqual(["relay_tier_1"]);
  });

  it("rejects gated publish without tiers", async () => {
    const prisma = prismaStub({
      post: {
        findFirst: vi.fn().mockResolvedValue({
          id: "post_1",
          source: PostSource.RELAY,
          publishState: PostPublishState.draft,
          campaignId: "camp_1"
        })
      }
    });

    await expect(
      publishExistingRelayPost(prisma, {
        creatorId: "cr_1",
        postId: "post_1",
        isPublic: false,
        tierIds: []
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
  });
});

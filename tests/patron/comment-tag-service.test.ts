import { describe, expect, it, vi } from "vitest";
import {
  POST_LEVEL_MEDIA_ID,
  countDistinctTagContributors,
  revokeCommentTag,
  unrevokeCommentTag
} from "../../src/patron/comment-tag-service.js";

function buildOverridesStub() {
  return {
    load: vi.fn(),
    save: vi.fn(),
    mergePostTagDelta: vi.fn(),
    mergeBulkMediaTagDelta: vi.fn()
  };
}

describe("countDistinctTagContributors", () => {
  it("counts distinct patron contributors for a (creator, post, media, tag) cell", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { patronUserId: "u1" },
      { patronUserId: "u1" },
      { patronUserId: "u2" }
    ]);
    const prisma = { comment: { findMany } } as never;
    const out = await countDistinctTagContributors(prisma, {
      creatorId: "c1",
      postId: "p1",
      mediaId: "m1",
      tagId: "soft-light"
    });
    expect(out).toBe(2);
    expect(findMany).toHaveBeenCalledOnce();
    const args = findMany.mock.calls[0][0];
    expect(args.where.mediaId).toBe("m1");
    expect(args.where.tagIds).toEqual({ has: "soft-light" });
  });

  it("uses mediaId=null in the query when called with the post-level marker", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { comment: { findMany } } as never;
    await countDistinctTagContributors(prisma, {
      creatorId: "c1",
      postId: "p1",
      mediaId: POST_LEVEL_MEDIA_ID,
      tagId: "x"
    });
    expect(findMany.mock.calls[0][0].where.mediaId).toBeNull();
  });
});

describe("revokeCommentTag", () => {
  it("appends the tag to PostOverride.removeTagIds when no contributors remain", async () => {
    // Single contributor commented this tag; revoking drops the count to 0.
    const comment = {
      id: "cmt1",
      relayCreatorId: "c1",
      postId: "p1",
      mediaId: "m1",
      patronUserId: "u1",
      tagIds: ["soft-light"],
      tagsRevokedByOwner: []
    };
    const findUniqueComment = vi.fn().mockResolvedValue(comment);
    const updateComment = vi.fn().mockResolvedValue({ ...comment });
    const findManyComment = vi.fn().mockResolvedValue([]);
    const findFirstSuggestion = vi.fn().mockResolvedValue({
      id: "sug1",
      rejectedAt: null
    });
    const updateSuggestion = vi.fn();
    const prisma = {
      comment: {
        findUnique: findUniqueComment,
        update: updateComment,
        findMany: findManyComment
      },
      tagSuggestion: {
        findFirst: findFirstSuggestion,
        create: vi.fn(),
        update: updateSuggestion
      }
    } as never;
    const overrides = buildOverridesStub();
    const out = await revokeCommentTag(prisma, overrides, "cmt1", "soft-light");
    expect(out.stillBacked).toBe(false);
    expect(overrides.mergeBulkMediaTagDelta).toHaveBeenCalledWith(
      "c1",
      [{ post_id: "p1", media_id: "m1" }],
      { add_tag_ids: [], remove_tag_ids: ["soft-light"] }
    );
    expect(updateSuggestion).toHaveBeenCalledWith({
      where: { id: "sug1" },
      data: { rejectedAt: expect.any(Date), confidence: 0 }
    });
  });

  it("does NOT mutate PostOverride when other contributors still back the tag", async () => {
    const comment = {
      id: "cmt2",
      relayCreatorId: "c1",
      postId: "p1",
      mediaId: "m1",
      patronUserId: "u1",
      tagIds: ["soft-light"],
      tagsRevokedByOwner: []
    };
    const findUniqueComment = vi.fn().mockResolvedValue(comment);
    const updateComment = vi.fn().mockResolvedValue(comment);
    const findManyComment = vi.fn().mockResolvedValue([{ patronUserId: "u2" }]);
    const findFirstSuggestion = vi
      .fn()
      .mockResolvedValue({ id: "sug2", rejectedAt: null });
    const updateSuggestion = vi.fn();
    const prisma = {
      comment: {
        findUnique: findUniqueComment,
        update: updateComment,
        findMany: findManyComment
      },
      tagSuggestion: {
        findFirst: findFirstSuggestion,
        create: vi.fn(),
        update: updateSuggestion
      }
    } as never;
    const overrides = buildOverridesStub();
    const out = await revokeCommentTag(prisma, overrides, "cmt2", "soft-light");
    expect(out.stillBacked).toBe(true);
    expect(overrides.mergeBulkMediaTagDelta).not.toHaveBeenCalled();
    expect(overrides.mergePostTagDelta).not.toHaveBeenCalled();
  });

  it("uses the post-level merge path when comment.mediaId is null", async () => {
    const comment = {
      id: "cmt3",
      relayCreatorId: "c1",
      postId: "p1",
      mediaId: null,
      patronUserId: "u1",
      tagIds: ["lighting"],
      tagsRevokedByOwner: []
    };
    const prisma = {
      comment: {
        findUnique: vi.fn().mockResolvedValue(comment),
        update: vi.fn().mockResolvedValue(comment),
        findMany: vi.fn().mockResolvedValue([])
      },
      tagSuggestion: {
        findFirst: vi.fn().mockResolvedValue({ id: "sug3", rejectedAt: null }),
        create: vi.fn(),
        update: vi.fn()
      }
    } as never;
    const overrides = buildOverridesStub();
    await revokeCommentTag(prisma, overrides, "cmt3", "lighting");
    expect(overrides.mergePostTagDelta).toHaveBeenCalledWith("c1", "p1", {
      add_tag_ids: [],
      remove_tag_ids: ["lighting"]
    });
    expect(overrides.mergeBulkMediaTagDelta).not.toHaveBeenCalled();
  });
});

describe("unrevokeCommentTag", () => {
  it("removes the tag from tagsRevokedByOwner without auto-popping the override", async () => {
    const comment = {
      id: "cmt4",
      relayCreatorId: "c1",
      postId: "p1",
      mediaId: "m1",
      patronUserId: "u1",
      tagIds: ["soft-light"],
      tagsRevokedByOwner: ["soft-light"]
    };
    const updateComment = vi.fn();
    const prisma = {
      comment: {
        findUnique: vi.fn().mockResolvedValue(comment),
        update: updateComment,
        findMany: vi.fn().mockResolvedValue([{ patronUserId: "u1" }])
      },
      tagSuggestion: {
        findFirst: vi.fn().mockResolvedValue({ id: "sug4", rejectedAt: new Date() }),
        create: vi.fn(),
        update: vi.fn()
      }
    } as never;
    const overrides = buildOverridesStub();
    await unrevokeCommentTag(prisma, overrides, "cmt4", "soft-light");
    expect(updateComment).toHaveBeenCalledWith({
      where: { id: "cmt4" },
      data: { tagsRevokedByOwner: { set: [] } }
    });
    expect(overrides.mergeBulkMediaTagDelta).not.toHaveBeenCalled();
    expect(overrides.mergePostTagDelta).not.toHaveBeenCalled();
  });
});

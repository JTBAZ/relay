import { describe, expect, it, vi } from "vitest";
import {
  COMMENT_EDIT_WINDOW_MS,
  CommentEditWindowClosedError,
  CommentForbiddenError,
  CommentValidationError,
  createComment,
  listComments,
  patchComment
} from "../../src/patron/comment-service.js";

function overridesStub() {
  return {
    load: vi.fn(),
    save: vi.fn(),
    mergePostTagDelta: vi.fn(),
    mergeBulkMediaTagDelta: vi.fn()
  };
}

describe("createComment", () => {
  it("rejects empty body", async () => {
    await expect(
      createComment({} as never, overridesStub(), {
        relayCreatorId: "c",
        postId: "p",
        patronUserId: "u",
        body: "   "
      })
    ).rejects.toBeInstanceOf(CommentValidationError);
  });

  it("requires anchor_x / anchor_y when media_id is set", async () => {
    await expect(
      createComment({} as never, overridesStub(), {
        relayCreatorId: "c",
        postId: "p",
        patronUserId: "u",
        body: "ok",
        mediaId: "m1"
      })
    ).rejects.toBeInstanceOf(CommentValidationError);
  });

  it("clamps invalid anchor coordinates", async () => {
    await expect(
      createComment({} as never, overridesStub(), {
        relayCreatorId: "c",
        postId: "p",
        patronUserId: "u",
        body: "ok",
        mediaId: "m1",
        anchorX: 150,
        anchorY: 50
      })
    ).rejects.toBeInstanceOf(CommentValidationError);
  });

  it("rejects media_id not attached to post", async () => {
    const prisma = {
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([
          { id: "m1", primaryPostId: "other_post", postIds: [] }
        ])
      }
    } as never;
    await expect(
      createComment(prisma, overridesStub(), {
        relayCreatorId: "c",
        postId: "p",
        patronUserId: "u",
        body: "ok",
        mediaId: "m1",
        anchorX: 10,
        anchorY: 20
      })
    ).rejects.toBeInstanceOf(CommentValidationError);
  });

  it("creates a comment with auto-mod hidden state when body has banned token", async () => {
    const created = {
      id: "cmt1",
      relayCreatorId: "c",
      postId: "p",
      mediaId: null,
      anchorX: null,
      anchorY: null,
      patronUserId: "u",
      body: "buy-now-cheap",
      parentCommentId: null,
      tagIds: [],
      tagsRevokedByOwner: [],
      creatorPinnedAt: null,
      requiredTierId: null,
      visibility: "everyone",
      autoModFlagsJson: [],
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
      modState: "hidden"
    };
    const prisma = {
      comment: {
        create: vi.fn().mockResolvedValue(created)
      }
    } as never;
    const result = await createComment(prisma, overridesStub(), {
      relayCreatorId: "c",
      postId: "p",
      patronUserId: "u",
      body: "buy-now-cheap"
    });
    expect(result.record.modState).toBe("hidden");
    expect(result.autoModFlags.some((f) => f.severity === "block")).toBe(true);
  });
});

describe("patchComment", () => {
  it("rejects edits past the 15-minute edit window", async () => {
    const old = new Date(Date.now() - COMMENT_EDIT_WINDOW_MS - 1_000);
    const existing = {
      id: "cmt1",
      relayCreatorId: "c",
      postId: "p",
      mediaId: null,
      patronUserId: "u",
      body: "hi",
      tagIds: [],
      tagsRevokedByOwner: [],
      createdAt: old,
      deletedAt: null,
      modState: "visible"
    };
    const prisma = {
      comment: { findUnique: vi.fn().mockResolvedValue(existing) }
    } as never;
    await expect(
      patchComment(prisma, overridesStub(), {
        commentId: "cmt1",
        actorUserId: "u",
        patch: { body: "updated" }
      })
    ).rejects.toBeInstanceOf(CommentEditWindowClosedError);
  });

  it("rejects edits by non-author", async () => {
    const existing = {
      id: "cmt1",
      relayCreatorId: "c",
      postId: "p",
      mediaId: null,
      patronUserId: "owner",
      body: "hi",
      tagIds: [],
      tagsRevokedByOwner: [],
      createdAt: new Date(),
      deletedAt: null,
      modState: "visible"
    };
    const prisma = {
      comment: { findUnique: vi.fn().mockResolvedValue(existing) }
    } as never;
    await expect(
      patchComment(prisma, overridesStub(), {
        commentId: "cmt1",
        actorUserId: "someone-else",
        patch: { body: "updated" }
      })
    ).rejects.toBeInstanceOf(CommentForbiddenError);
  });
});

describe("listComments", () => {
  it("narrows to post-level threads when postLevelOnly is set", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { comment: { findMany } } as never;
    await listComments(prisma, {
      relayCreatorId: "c",
      postId: "p",
      options: { postLevelOnly: true }
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          relayCreatorId: "c",
          postId: "p",
          mediaId: null
        })
      })
    );
  });

  it("filters out comments authored AFTER a block edge timestamp (D14 future-only)", async () => {
    const now = Date.now();
    const beforeBlock = new Date(now - 10_000);
    const afterBlock = new Date(now + 10_000);
    const blockAt = new Date(now);
    const rows = [
      {
        id: "old",
        relayCreatorId: "c",
        postId: "p",
        mediaId: null,
        anchorX: null,
        anchorY: null,
        patronUserId: "blocked",
        body: "old",
        parentCommentId: null,
        tagIds: [],
        tagsRevokedByOwner: [],
        creatorPinnedAt: null,
        requiredTierId: null,
        visibility: "everyone",
        autoModFlagsJson: null,
        createdAt: beforeBlock,
        editedAt: null,
        deletedAt: null,
        modState: "visible"
      },
      {
        id: "new",
        relayCreatorId: "c",
        postId: "p",
        mediaId: null,
        anchorX: null,
        anchorY: null,
        patronUserId: "blocked",
        body: "new",
        parentCommentId: null,
        tagIds: [],
        tagsRevokedByOwner: [],
        creatorPinnedAt: null,
        requiredTierId: null,
        visibility: "everyone",
        autoModFlagsJson: null,
        createdAt: afterBlock,
        editedAt: null,
        deletedAt: null,
        modState: "visible"
      }
    ];
    const prisma = {
      comment: { findMany: vi.fn().mockResolvedValue(rows) }
    } as never;
    const out = await listComments(prisma, {
      relayCreatorId: "c",
      postId: "p",
      options: {
        blockEdges: [{ blockedAccountId: "blocked", createdAt: blockAt }]
      }
    });
    expect(out.map((c) => c.id)).toEqual(["old"]);
  });

  it("hides tier-gated comments when viewer is missing the tier", async () => {
    const rows = [
      {
        id: "tier-only",
        relayCreatorId: "c",
        postId: "p",
        mediaId: null,
        anchorX: null,
        anchorY: null,
        patronUserId: "u",
        body: "secret",
        parentCommentId: null,
        tagIds: [],
        tagsRevokedByOwner: [],
        creatorPinnedAt: null,
        requiredTierId: "tier_gold",
        visibility: "patrons_only",
        autoModFlagsJson: null,
        createdAt: new Date(),
        editedAt: null,
        deletedAt: null,
        modState: "visible"
      }
    ];
    const prisma = {
      comment: { findMany: vi.fn().mockResolvedValue(rows) }
    } as never;
    const out = await listComments(prisma, {
      relayCreatorId: "c",
      postId: "p",
      options: { viewerTierIds: ["tier_silver"] }
    });
    expect(out).toHaveLength(0);
  });
});

/** @vitest-environment happy-dom */

import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listPostComments = vi.fn();
const apiCreateComment = vi.fn();
const apiPatchComment = vi.fn();
const apiDeleteComment = vi.fn();
const apiToggleReaction = vi.fn();
const apiRevokeTag = vi.fn();
const apiCreateReport = vi.fn();
const apiBlock = vi.fn();

vi.mock("@/lib/relay-api", () => ({
  listPostComments: (...a: unknown[]) => listPostComments(...a),
  createComment: (...a: unknown[]) => apiCreateComment(...a),
  patchComment: (...a: unknown[]) => apiPatchComment(...a),
  deleteComment: (...a: unknown[]) => apiDeleteComment(...a),
  toggleCommentReaction: (...a: unknown[]) => apiToggleReaction(...a),
  revokeCommentTag: (...a: unknown[]) => apiRevokeTag(...a),
  createContentReport: (...a: unknown[]) => apiCreateReport(...a),
  blockAccount: (...a: unknown[]) => apiBlock(...a)
}));

import { useLiveComments } from "../../web/components/patron/relay/use-live-comments";

const RECORD = {
  id: "cmt1",
  relayCreatorId: "c",
  postId: "p",
  mediaId: null,
  anchorX: null,
  anchorY: null,
  patronUserId: "u1",
  body: "hi",
  parentCommentId: null,
  tagIds: ["foo"],
  tagsRevokedByOwner: [],
  creatorPinnedAt: null,
  requiredTierId: null,
  visibility: "everyone" as const,
  autoModFlagsJson: null,
  createdAt: new Date().toISOString(),
  editedAt: null,
  deletedAt: null,
  modState: "visible" as const,
  reactions: []
};

describe("useLiveComments", () => {
  beforeEach(() => {
    listPostComments.mockReset();
    apiCreateComment.mockReset();
    apiPatchComment.mockReset();
    apiDeleteComment.mockReset();
    apiToggleReaction.mockReset();
    apiRevokeTag.mockReset();
    apiCreateReport.mockReset();
    apiBlock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays idle when scope is null and never calls the API", async () => {
    const { result } = renderHook(() => useLiveComments(null));
    // Yield once so any (incorrectly scheduled) effect would have run.
    await waitFor(() => {
      expect(result.current.status).toBe("idle");
    });
    expect(listPostComments).not.toHaveBeenCalled();
    expect(result.current.records).toEqual([]);
    expect(result.current.positional).toEqual([]);
  });

  it("loads on mount and exposes adapted positional comments", async () => {
    listPostComments.mockResolvedValue([RECORD]);
    const scope = {
      relayCreatorId: "c",
      postId: "p",
      viewerAccountId: "u1",
      isCreatorOwner: false
    };
    const { result } = renderHook(() => useLiveComments(scope));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.records).toHaveLength(1);
    expect(result.current.positional[0].id).toBe("cmt1");
    // Post-level (mediaId=null) records get the (50, 95) fallback anchor so the existing
    // pin renderer keeps working.
    expect(result.current.positional[0].position).toEqual({ x: 50, y: 95 });
    expect(result.current.positional[0].tags).toEqual(["foo"]);
  });

  it("transitions to error and surfaces errorMessage when the API throws", async () => {
    listPostComments.mockRejectedValue(new Error("boom"));
    const scope = {
      relayCreatorId: "c",
      postId: "p",
      viewerAccountId: null,
      isCreatorOwner: false
    };
    const { result } = renderHook(() => useLiveComments(scope));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toBe("boom");
  });

  it("submit triggers create + refresh and stores returned auto-mod flags", async () => {
    // initial mount returns empty; after submit we return the new record
    listPostComments
      .mockResolvedValueOnce([])
      .mockResolvedValue([RECORD]);
    apiCreateComment.mockResolvedValue({
      item: RECORD,
      auto_mod_flags: [{ rule_id: "many_links", severity: "warn", snippet: "x" }]
    });
    const scope = {
      relayCreatorId: "c",
      postId: "p",
      viewerAccountId: "u1",
      isCreatorOwner: false
    };
    const { result } = renderHook(() => useLiveComments(scope));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.submit({ body: "hi", tagIds: ["foo"] });
    });
    expect(apiCreateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        relayCreatorId: "c",
        postId: "p",
        body: "hi",
        tagIds: ["foo"]
      })
    );
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.lastAutoModFlags).toHaveLength(1);
  });

  it("clearAutoModFlags resets the banner state", async () => {
    listPostComments.mockResolvedValue([]);
    apiCreateComment.mockResolvedValue({
      item: RECORD,
      auto_mod_flags: [{ rule_id: "all_caps_shouting", severity: "info", snippet: "x" }]
    });
    const scope = {
      relayCreatorId: "c",
      postId: "p",
      viewerAccountId: "u1",
      isCreatorOwner: false
    };
    const { result } = renderHook(() => useLiveComments(scope));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.submit({ body: "LOUD" });
    });
    expect(result.current.lastAutoModFlags).toHaveLength(1);
    act(() => result.current.clearAutoModFlags());
    expect(result.current.lastAutoModFlags).toHaveLength(0);
  });
});

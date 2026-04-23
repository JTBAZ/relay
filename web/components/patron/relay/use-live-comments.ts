"use client";

/**
 * PE-E (BO-P2-04) — live comments hook.
 *
 * Owns the API state machine for one (creator, post) scope so `<GalleryView>` and
 * `<CommentThreadPanel>` can stay declarative. The hook also adapts each
 * `PatronCommentRecord` into the existing `PositionalComment` shape so the polished
 * `<CommentPin />` renderer keeps working unchanged.
 *
 * Lifecycle:
 *   - On mount + scope change → fetch via listPostComments, replace local list.
 *   - submit / patch / delete / react / mod actions → optimistic UI deferred to a future
 *     pass; today we await the call and refetch the list. Skeletal-UI scope.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  blockAccount as apiBlockAccount,
  createComment as apiCreateComment,
  createContentReport as apiCreateContentReport,
  deleteComment as apiDeleteComment,
  listPostComments as apiListPostComments,
  patchComment as apiPatchComment,
  revokeCommentTag as apiRevokeCommentTag,
  toggleCommentReaction as apiToggleCommentReaction,
  type AutoModFlag,
  type CommentReactionKind,
  type ContentReportTargetKind,
  type PatronCommentRecord
} from "@/lib/relay-api";
import type { PositionalComment } from "@/lib/relay-fixtures";

/**
 * Scope passed from `<GalleryView>`. When `null`, the hook is dormant and the parent
 * keeps using fixture-driven local state.
 */
export interface LiveCommentsScope {
  relayCreatorId: string;
  postId: string;
  /** Caller's account id; when null, reactions/edit/delete/block are disabled at the UI layer. */
  viewerAccountId: string | null;
  /** True when the caller's session owns this relay_creator_id (creator/studio actions). */
  isCreatorOwner: boolean;
}

export type LiveStatus = "idle" | "loading" | "ready" | "error";

export interface UseLiveCommentsResult {
  status: LiveStatus;
  errorMessage: string | null;
  /** Raw API records for mod surfaces. */
  records: PatronCommentRecord[];
  /** Records adapted to the existing fixture shape so `<CommentPin />` renders unchanged. */
  positional: PositionalComment[];
  /** Last server-side auto-mod flags for the most recent submit (transient banner). */
  lastAutoModFlags: AutoModFlag[];
  refresh(): Promise<void>;
  submit(input: {
    body: string;
    mediaId?: string | null;
    anchorX?: number | null;
    anchorY?: number | null;
    parentCommentId?: string | null;
    tagIds?: string[];
  }): Promise<void>;
  edit(commentId: string, patch: { body?: string; tagIds?: string[] }): Promise<void>;
  remove(commentId: string): Promise<void>;
  react(commentId: string, kind: CommentReactionKind): Promise<void>;
  /** Creator-only. */
  pin(commentId: string, pinned: boolean): Promise<void>;
  /** Creator-only. */
  setModState(commentId: string, modState: "visible" | "hidden" | "removed"): Promise<void>;
  /** Creator-only. */
  revokeTag(commentId: string, tagId: string, unrevoke?: boolean): Promise<void>;
  report(input: {
    targetKind: ContentReportTargetKind;
    targetId: string;
    reasonCode: string;
    body?: string;
  }): Promise<void>;
  block(blockedAccountId: string): Promise<void>;
  clearAutoModFlags(): void;
}

/**
 * Adapt a server-side `PatronCommentRecord` into the local `PositionalComment` shape so the
 * existing pin renderer keeps working without changes. Records without anchor coordinates are
 * returned as post-level pseudo-pins anchored at (50, 95) so they stay visible but out of the
 * art's main composition area; the thread panel is the canonical surface for non-anchored ones.
 */
function adaptToPositional(record: PatronCommentRecord): PositionalComment {
  const x = record.anchorX === null ? 50 : record.anchorX;
  const y = record.anchorY === null ? 95 : record.anchorY;
  const visibleTags = record.tagIds.filter((t) => !record.tagsRevokedByOwner.includes(t));
  return {
    id: record.id,
    author: {
      id: record.patronUserId,
      // Skeletal-UI placeholder — display name resolution lives in PE-K notification copy lookup.
      displayName: `Patron · ${record.patronUserId.slice(-6)}`,
      handle: record.patronUserId,
      avatarUrl: "/placeholder.svg?height=32&width=32"
    },
    text: record.body,
    position: { x, y },
    createdAt: humaniseTimestamp(record.createdAt),
    tags: visibleTags.length > 0 ? visibleTags : undefined
  };
}

function humaniseTimestamp(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function useLiveComments(scope: LiveCommentsScope | null): UseLiveCommentsResult {
  const [status, setStatus] = useState<LiveStatus>(scope ? "loading" : "idle");
  const [records, setRecords] = useState<PatronCommentRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAutoModFlags, setLastAutoModFlags] = useState<AutoModFlag[]>([]);

  // Memoize scope by VALUE rather than identity so callers passing a fresh object literal each
  // render don't accidentally re-trigger loads. The four primitive fields fully describe the scope.
  const scopeKey = scope
    ? `${scope.relayCreatorId}\0${scope.postId}\0${scope.viewerAccountId ?? ""}\0${scope.isCreatorOwner ? "1" : "0"}`
    : null;

  const refresh = useCallback(async () => {
    if (!scope) return;
    setStatus("loading");
    try {
      const items = await apiListPostComments({
        relayCreatorId: scope.relayCreatorId,
        postId: scope.postId
      });
      setRecords(Array.isArray(items) ? items : []);
      setErrorMessage(null);
      setStatus("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
    // scope is intentionally captured by closure; scopeKey is the dep so identity churn doesn't
    // refire the effect when the scope's primitive values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  useEffect(() => {
    if (!scope) {
      setStatus("idle");
      setRecords([]);
      setErrorMessage(null);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, refresh]);

  const submit = useCallback<UseLiveCommentsResult["submit"]>(
    async (input) => {
      if (!scope) return;
      const result = await apiCreateComment({
        relayCreatorId: scope.relayCreatorId,
        postId: scope.postId,
        body: input.body,
        mediaId: input.mediaId ?? null,
        anchorX: input.anchorX ?? null,
        anchorY: input.anchorY ?? null,
        parentCommentId: input.parentCommentId ?? null,
        tagIds: input.tagIds ?? []
      });
      setLastAutoModFlags(result.auto_mod_flags);
      await refresh();
    },
    [scope, refresh]
  );

  const edit = useCallback<UseLiveCommentsResult["edit"]>(
    async (commentId, patch) => {
      await apiPatchComment(commentId, patch);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback<UseLiveCommentsResult["remove"]>(
    async (commentId) => {
      await apiDeleteComment(commentId);
      await refresh();
    },
    [refresh]
  );

  const react = useCallback<UseLiveCommentsResult["react"]>(
    async (commentId, kind) => {
      await apiToggleCommentReaction(commentId, kind);
      await refresh();
    },
    [refresh]
  );

  const pin = useCallback<UseLiveCommentsResult["pin"]>(
    async (commentId, pinned) => {
      await apiPatchComment(commentId, { creatorPinned: pinned });
      await refresh();
    },
    [refresh]
  );

  const setModState = useCallback<UseLiveCommentsResult["setModState"]>(
    async (commentId, modState) => {
      await apiPatchComment(commentId, { modState });
      await refresh();
    },
    [refresh]
  );

  const revokeTag = useCallback<UseLiveCommentsResult["revokeTag"]>(
    async (commentId, tagId, unrevoke) => {
      await apiRevokeCommentTag(commentId, tagId, { unrevoke });
      await refresh();
    },
    [refresh]
  );

  const report = useCallback<UseLiveCommentsResult["report"]>(
    async (input) => {
      if (!scope) return;
      await apiCreateContentReport({
        relayCreatorId: scope.relayCreatorId,
        targetKind: input.targetKind,
        targetId: input.targetId,
        reasonCode: input.reasonCode,
        body: input.body
      });
    },
    [scope]
  );

  const block = useCallback<UseLiveCommentsResult["block"]>(async (blockedAccountId) => {
    await apiBlockAccount(blockedAccountId);
  }, []);

  const positional = useMemo(() => records.map(adaptToPositional), [records]);

  const clearAutoModFlags = useCallback(() => setLastAutoModFlags([]), []);

  return {
    status,
    errorMessage,
    records,
    positional,
    lastAutoModFlags,
    refresh,
    submit,
    edit,
    remove,
    react,
    pin,
    setModState,
    revokeTag,
    report,
    block,
    clearAutoModFlags
  };
}

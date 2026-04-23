/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  blockAccount,
  createComment,
  createContentReport,
  deleteComment,
  listContentReports,
  listPostComments,
  patchComment,
  resolveContentReport,
  revokeCommentTag,
  toggleCommentReaction,
  unblockAccount,
  type PatronCommentRecord
} from "../../web/lib/relay-api";

const performRelayLogout = vi.fn().mockResolvedValue(undefined);
vi.mock("../../web/lib/relay-session-logout.ts", () => ({
  performRelayLogout: (...args: unknown[]) => performRelayLogout(...args)
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function envelope<T>(data: T) {
  return { data, meta: { trace_id: "trace-test" } };
}

const SAMPLE_RECORD: PatronCommentRecord = {
  id: "cmt1",
  relayCreatorId: "creatorA",
  postId: "post1",
  mediaId: null,
  anchorX: null,
  anchorY: null,
  patronUserId: "user1",
  body: "hello",
  parentCommentId: null,
  tagIds: [],
  tagsRevokedByOwner: [],
  creatorPinnedAt: null,
  requiredTierId: null,
  visibility: "everyone",
  autoModFlagsJson: null,
  createdAt: "2026-04-22T18:00:00.000Z",
  editedAt: null,
  deletedAt: null,
  modState: "visible",
  reactions: []
};

describe("PE-E API client (web/lib/relay-api.ts)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listPostComments", () => {
    it("encodes creator_id and media_id query params and returns items array", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [SAMPLE_RECORD] }))
      );
      const items = await listPostComments({
        relayCreatorId: "creator A",
        postId: "post 1",
        mediaId: "media 9"
      });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("cmt1");
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain("/api/v1/patron/posts/post%201/comments");
      expect(url).toContain("creator_id=creator+A");
      expect(url).toContain("media_id=media+9");
    });

    it("omits media_id when not provided", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [] }))
      );
      await listPostComments({ relayCreatorId: "c", postId: "p" });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).not.toContain("media_id=");
    });
  });

  describe("createComment", () => {
    it("posts JSON body matching backend snake_case contract", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ item: SAMPLE_RECORD, auto_mod_flags: [] }))
      );
      await createComment({
        relayCreatorId: "c1",
        postId: "p1",
        body: "hi",
        mediaId: "m1",
        anchorX: 12.5,
        anchorY: 88,
        tagIds: ["lighting"],
        visibility: "patrons_only",
        requiredTierId: "tier_gold"
      });
      const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        creator_id: "c1",
        body: "hi",
        media_id: "m1",
        anchor_x: 12.5,
        anchor_y: 88,
        parent_comment_id: null,
        tag_ids: ["lighting"],
        required_tier_id: "tier_gold",
        visibility: "patrons_only"
      });
    });

    it("returns the auto_mod_flags from the envelope so the UI can surface review state", async () => {
      const flags = [{ rule_id: "banned_token", severity: "block" as const, snippet: "x" }];
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ item: SAMPLE_RECORD, auto_mod_flags: flags }))
      );
      const result = await createComment({
        relayCreatorId: "c",
        postId: "p",
        body: "blocked"
      });
      expect(result.auto_mod_flags).toEqual(flags);
    });
  });

  describe("patchComment", () => {
    it("only sends fields explicitly provided", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ item: SAMPLE_RECORD }))
      );
      await patchComment("cmt1", { body: "edited" });
      const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
      const sent = JSON.parse(init.body as string);
      expect(sent).toEqual({ body: "edited" });
      expect(init.method).toBe("PATCH");
    });

    it("translates camelCase patch keys to snake_case wire format", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ item: SAMPLE_RECORD }))
      );
      await patchComment("cmt1", { creatorPinned: true, modState: "hidden" });
      const sent = JSON.parse(
        (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
      );
      expect(sent).toEqual({ creator_pinned: true, mod_state: "hidden" });
    });
  });

  describe("deleteComment", () => {
    it("issues DELETE and returns the soft-deleted record", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ item: { ...SAMPLE_RECORD, deletedAt: "now" } }))
      );
      const out = await deleteComment("cmt1");
      expect(out.deletedAt).toBe("now");
      expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
    });
  });

  describe("toggleCommentReaction", () => {
    it("posts kind and returns active flag", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ active: true }))
      );
      const out = await toggleCommentReaction("cmt1", "heart");
      expect(out).toEqual({ active: true });
      const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({ kind: "heart" });
    });
  });

  describe("revokeCommentTag", () => {
    it("defaults unrevoke to false and sends tag_id payload", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ tag_id: "x", unrevoked: false }))
      );
      await revokeCommentTag("cmt1", "x");
      const sent = JSON.parse(
        (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
      );
      expect(sent).toEqual({ tag_id: "x", unrevoke: false });
    });

    it("forwards explicit unrevoke flag for restore path", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ tag_id: "x", unrevoked: true }))
      );
      await revokeCommentTag("cmt1", "x", { unrevoke: true });
      const sent = JSON.parse(
        (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
      );
      expect(sent.unrevoke).toBe(true);
    });
  });

  describe("createContentReport / listContentReports / resolveContentReport", () => {
    it("create posts the report payload + defaults relay_creator_id to empty", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(envelope({ id: "rep1" })));
      await createContentReport({
        targetKind: "comment",
        targetId: "cmt1",
        reasonCode: "spam"
      });
      const sent = JSON.parse(
        (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
      );
      expect(sent).toEqual({
        target_kind: "comment",
        target_id: "cmt1",
        reason_code: "spam",
        body: null,
        relay_creator_id: ""
      });
    });

    it("list builds the status + cursor query string", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [], nextCursor: "rep2" }))
      );
      await listContentReports({
        relayCreatorId: "creator-A",
        status: "open",
        cursor: "rep1"
      });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain("relay_creator_id=creator-A");
      expect(url).toContain("status=open");
      expect(url).toContain("cursor=rep1");
    });

    it("resolve posts the outcome and returns server confirmation", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ resolved: true, outcome: "actioned" }))
      );
      const out = await resolveContentReport("rep1", "actioned");
      expect(out).toEqual({ resolved: true, outcome: "actioned" });
      const sent = JSON.parse(
        (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
      );
      expect(sent).toEqual({ outcome: "actioned" });
    });
  });

  describe("blockAccount / unblockAccount", () => {
    it("block posts blocked_account_id", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(envelope({ created: true })));
      const out = await blockAccount("acct-blocked");
      expect(out).toEqual({ created: true });
      const sent = JSON.parse(
        (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
      );
      expect(sent).toEqual({ blocked_account_id: "acct-blocked" });
    });

    it("unblock issues DELETE on the encoded account id", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(envelope({ removed: true })));
      const out = await unblockAccount("acct blocked");
      expect(out).toEqual({ removed: true });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain("/api/v1/patron/blocks/acct%20blocked");
      expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
    });
  });
});

/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPatronAccountDeletion,
  deleteCreatorRelationship,
  downloadPatronAccountExport,
  getPendingPatronAccountDeletion,
  requestPatronAccountDeletion,
  type CreatorRelationshipDeletionCounts
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

const ZERO_COUNTS: CreatorRelationshipDeletionCounts = {
  favorites: 0,
  collections: 0,
  collectionEntries: 0,
  comments: 0,
  commentReactions: 0,
  contentReports: 0,
  notificationPreferences: 0,
  notifications: 0,
  memberships: 0
};

describe("PE-J PatronSettings API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("downloadPatronAccountExport", () => {
    it("returns a Blob + filename parsed from Content-Disposition", async () => {
      const payload = JSON.stringify({ schema_version: "1.0" });
      const res = new Response(payload, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-disposition":
            'attachment; filename="relay-account-acc1-2026-04-23.json"'
        }
      });
      vi.mocked(fetch).mockResolvedValue(res);
      const out = await downloadPatronAccountExport();
      expect(out.filename).toBe("relay-account-acc1-2026-04-23.json");
      expect(await out.blob.text()).toBe(payload);
    });

    it("falls back to a synthesized filename when the header is missing", async () => {
      const res = new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
      vi.mocked(fetch).mockResolvedValue(res);
      const out = await downloadPatronAccountExport();
      expect(out.filename).toMatch(/^relay-account-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it("throws RelayApiError on non-2xx", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("nope", { status: 500 })
      );
      await expect(downloadPatronAccountExport()).rejects.toThrow();
    });
  });

  describe("deleteCreatorRelationship", () => {
    it("issues DELETE on encoded relay_creator_id and returns counts", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          envelope({
            counts: { ...ZERO_COUNTS, favorites: 4, comments: 2, memberships: 1 }
          })
        )
      );
      const out = await deleteCreatorRelationship("creator A");
      expect(out.counts.favorites).toBe(4);
      expect(out.counts.comments).toBe(2);
      expect(out.counts.memberships).toBe(1);
      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
      expect(url).toContain("/api/v1/patron/memberships/creator%20A");
      expect((init as RequestInit).method).toBe("DELETE");
    });
  });

  describe("getPendingPatronAccountDeletion", () => {
    it("returns null when no pending deletion exists", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ pending_deletion: null }))
      );
      const out = await getPendingPatronAccountDeletion();
      expect(out.pending_deletion).toBeNull();
    });

    it("unwraps the pending row when one exists", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          envelope({
            pending_deletion: {
              id: "del1",
              requested_at: "2026-04-22T00:00:00.000Z",
              scheduled_for: "2026-04-29T00:00:00.000Z",
              reason: "moving on"
            }
          })
        )
      );
      const out = await getPendingPatronAccountDeletion();
      expect(out.pending_deletion?.id).toBe("del1");
      expect(out.pending_deletion?.reason).toBe("moving on");
    });
  });

  describe("requestPatronAccountDeletion", () => {
    it("posts the optional reason and returns the persisted state", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          envelope({
            created: true,
            id: "del1",
            requested_at: "2026-04-22T00:00:00.000Z",
            scheduled_for: "2026-04-29T00:00:00.000Z",
            reason: "leaving"
          })
        )
      );
      const out = await requestPatronAccountDeletion({ reason: "leaving" });
      expect(out.created).toBe(true);
      expect(out.id).toBe("del1");
      const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe("POST");
      const sent = JSON.parse(init.body as string);
      expect(sent).toEqual({ reason: "leaving" });
    });

    it("sends reason: null when no reason provided", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ created: true, id: "del2", requested_at: "x", scheduled_for: "y", reason: null }))
      );
      await requestPatronAccountDeletion();
      const sent = JSON.parse(
        (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
      );
      expect(sent).toEqual({ reason: null });
    });
  });

  describe("cancelPatronAccountDeletion", () => {
    it("issues DELETE and returns the cancellation envelope", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          envelope({
            cancelled: true,
            id: "del1",
            cancelled_at: "2026-04-22T05:00:00.000Z"
          })
        )
      );
      const out = await cancelPatronAccountDeletion();
      expect(out).toEqual({
        cancelled: true,
        id: "del1",
        cancelled_at: "2026-04-22T05:00:00.000Z"
      });
      expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
    });

    it("returns cancelled:false when no pending deletion existed", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ cancelled: false, id: null, cancelled_at: null }))
      );
      const out = await cancelPatronAccountDeletion();
      expect(out.cancelled).toBe(false);
      expect(out.id).toBeNull();
    });
  });
});

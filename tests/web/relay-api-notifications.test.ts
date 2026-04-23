/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPatronNotificationUnreadCount,
  listPatronNotifications,
  listPatronNotificationPreferences,
  markPatronNotificationsRead,
  setPatronNotificationPreference,
  type NotificationRecord
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

const SAMPLE: NotificationRecord = {
  id: "n1",
  recipientMembershipId: "m1",
  relayCreatorId: "c1",
  kind: "comment_liked",
  payload: { comment_id: "cmt", post_id: "p" },
  clusterKey: "comment_liked:cmt",
  clusterCount: 3,
  sourceEventId: "ev1",
  readAt: null,
  createdAt: "2026-04-22T20:00:00.000Z",
  updatedAt: "2026-04-22T20:30:00.000Z"
};

describe("PE-G notifications API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listPatronNotifications", () => {
    it("issues GET with no query string when no params provided", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [SAMPLE], nextCursor: null }))
      );
      const out = await listPatronNotifications();
      expect(out.items).toHaveLength(1);
      expect(out.items[0]).toEqual(SAMPLE);
      expect(out.nextCursor).toBeNull();
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toMatch(/\/api\/v1\/patron\/notifications$/);
    });

    it("encodes unread_only=true + limit + cursor + relay_creator_id", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [], nextCursor: null }))
      );
      await listPatronNotifications({
        unreadOnly: true,
        limit: 25,
        cursor: "abc",
        relayCreatorId: "creator A"
      });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain("unread_only=true");
      expect(url).toContain("limit=25");
      expect(url).toContain("cursor=abc");
      expect(url).toContain("relay_creator_id=creator+A");
    });

    it("does not set unread_only when false (omit, don't send false)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [], nextCursor: null }))
      );
      await listPatronNotifications({ unreadOnly: false });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).not.toContain("unread_only=");
    });
  });

  describe("getPatronNotificationUnreadCount", () => {
    it("returns the unread_count from the envelope", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ unread_count: 7 }))
      );
      const out = await getPatronNotificationUnreadCount();
      expect(out).toEqual({ unread_count: 7 });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain("/api/v1/patron/notifications/unread-count");
    });
  });

  describe("markPatronNotificationsRead", () => {
    it("posts notification_ids when provided; all_unread defaults to false", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ updatedCount: 2 }))
      );
      const out = await markPatronNotificationsRead({ notificationIds: ["a", "b"] });
      expect(out).toEqual({ updatedCount: 2 });
      const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe("POST");
      const sent = JSON.parse(init.body as string);
      expect(sent).toEqual({ notification_ids: ["a", "b"], all_unread: false });
    });

    it("sets all_unread=true when requested; falls back to empty notification_ids", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ updatedCount: 5 }))
      );
      await markPatronNotificationsRead({ allUnread: true });
      const sent = JSON.parse(
        (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
      );
      expect(sent).toEqual({ notification_ids: [], all_unread: true });
    });
  });

  describe("preferences", () => {
    it("listPatronNotificationPreferences forwards relay_creator_id when provided", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(envelope({ items: [] }))
      );
      await listPatronNotificationPreferences({ relayCreatorId: "c1" });
      const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
      expect(url).toContain("relay_creator_id=c1");
    });

    it("setPatronNotificationPreference issues PATCH with snake_case body", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          envelope({
            relayCreatorId: "c1",
            preferenceType: "comment_liked",
            enabled: false,
            updatedAt: "2026-04-22T20:00:00.000Z"
          })
        )
      );
      const out = await setPatronNotificationPreference({
        relayCreatorId: "c1",
        preferenceType: "comment_liked",
        enabled: false
      });
      expect(out.enabled).toBe(false);
      const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe("PATCH");
      const sent = JSON.parse(init.body as string);
      expect(sent).toEqual({
        relay_creator_id: "c1",
        preference_type: "comment_liked",
        enabled: false
      });
    });
  });
});

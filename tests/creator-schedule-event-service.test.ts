import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  extensionTransportActionForEventType,
  isCreatorScheduleDestination,
  isCreatorScheduleEventType,
  parseManualEventReminderId,
  reminderIdForManualEvent,
  transportActionForEventType
} from "../src/distribution/creator-schedule-event-contract.js";
import {
  canonicalizeLooseExternalUrl,
  canonicalizeScheduleExternalUrl,
  createCreatorScheduleEvent
} from "../src/distribution/creator-schedule-event-service.js";

vi.mock("../src/billing/creator-plan-entitlement-service.js", () => ({
  requireCreatorPlanAtLeast: vi.fn().mockResolvedValue({ ok: true, plan: "studio_core" })
}));

describe("creator-schedule-event-contract", () => {
  it("maps exact types to transport families", () => {
    expect(transportActionForEventType("make_post")).toBe("post");
    expect(transportActionForEventType("schedule_post")).toBe("schedule");
    expect(transportActionForEventType("engage_comments")).toBe("pin_comment");
    expect(transportActionForEventType("pin_comment")).toBe("pin_comment");
    expect(transportActionForEventType("repost")).toBe("repost");
    expect(transportActionForEventType("custom")).toBe("custom");
  });

  it("maps custom to post for extension four-value transport", () => {
    expect(extensionTransportActionForEventType("custom")).toBe("post");
    expect(extensionTransportActionForEventType("engage_comments")).toBe("pin_comment");
  });

  it("parses manual reminder ids", () => {
    const id = reminderIdForManualEvent("evt_abc");
    expect(id).toBe("schedule_reminder:manual:evt_abc");
    expect(parseManualEventReminderId(id)).toBe("evt_abc");
    expect(parseManualEventReminderId("schedule_reminder:task:x")).toBeNull();
  });

  it("validates event type and destination helpers", () => {
    expect(isCreatorScheduleEventType("make_post")).toBe(true);
    expect(isCreatorScheduleEventType("post")).toBe(false);
    expect(isCreatorScheduleDestination("x")).toBe(true);
    expect(isCreatorScheduleDestination("tiktok")).toBe(false);
  });
});

describe("canonicalizeLooseExternalUrl", () => {
  it("accepts any http(s) host for custom reminders", () => {
    const out = canonicalizeLooseExternalUrl("https://mail.google.com/mail/u/0/#inbox");
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.url).toContain("mail.google.com");
  });

  it("rejects dangerous schemes", () => {
    const out = canonicalizeLooseExternalUrl("javascript:alert(1)");
    expect(out.ok).toBe(false);
  });
});

describe("canonicalizeScheduleExternalUrl", () => {
  it("accepts X status URLs", () => {
    const out = canonicalizeScheduleExternalUrl(
      "x",
      "https://x.com/someuser/status/1234567890123456789"
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.url).toContain("status/1234567890123456789");
    }
  });

  it("rejects host mismatch without logging the URL", () => {
    const out = canonicalizeScheduleExternalUrl("patreon", "https://x.com/foo/status/1");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.message.toLowerCase()).not.toContain("https://");
    }
  });

  it("accepts bluesky app hosts", () => {
    const out = canonicalizeScheduleExternalUrl(
      "bluesky",
      "https://bsky.app/profile/alice.bsky.social/post/abc123"
    );
    expect(out.ok).toBe(true);
  });
});

describe("createCreatorScheduleEvent with a trusted Library attachment", () => {
  it("inserts the ordered attachment atomically without source-row writes or URL lookup", async () => {
    const created = {
      id: "bench_event_" + "a".repeat(64),
      eventType: "make_post",
      destination: "x",
      title: "Post the study",
      note: null,
      dueAt: new Date("2026-11-01T12:00:00.000Z"),
      postId: "p1",
      mediaIds: ["m2", "m1"],
      externalUrl: null,
      remindMe: false,
      status: "pending",
      createdAt: new Date("2026-10-18T12:00:00.000Z"),
      updatedAt: new Date("2026-10-18T12:00:00.000Z")
    };
    const eventCreate = vi.fn().mockResolvedValue(created);
    const tx = {
      post: { findFirst: vi.fn().mockResolvedValue({ id: "p1", upstreamStatus: "active", versions: [{ id: "v1", title: "Study", mediaIds: ["m1", "m2"] }] }) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([
        { id: "m1", upstreamStatus: "active", primaryPostId: "p1", postIds: ["p1"], currentMimeType: "image/png", currentRole: null, processingStatus: "READY" },
        { id: "m2", upstreamStatus: "active", primaryPostId: "p1", postIds: ["p1"], currentMimeType: "image/png", currentRole: null, processingStatus: "READY" }
      ]), update: vi.fn() },
      postVersion: { update: vi.fn() },
      creatorScheduleEvent: { create: eventCreate }
    };
    const transaction = vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx));
    const platformLookup = vi.fn();
    const db = {
      $transaction: transaction,
      post: { findFirst: vi.fn() },
      platformInstance: { findFirst: platformLookup },
      postDistributionAttempt: { findFirst: platformLookup }
    } as unknown as PrismaClient;

    const result = await createCreatorScheduleEvent(db, "creator-1", {
      event_type: "make_post",
      destination: "x",
      due_at: "2026-11-01T12:00:00.000Z",
      title: "Post the study",
      remind_me: false,
      target_mode: "existing_post",
      post_id: "p1",
      external_url: null
    }, {
      trustedEventId: created.id,
      trustedLibraryAttachment: { postId: "p1", versionId: "v1", mediaIds: ["m2", "m1"] }
    });

    expect(result.ok).toBe(true);
    expect(eventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: created.id, postId: "p1", mediaIds: ["m2", "m1"], externalUrl: null, remindMe: false
      })
    }));
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(platformLookup).not.toHaveBeenCalled();
    expect(tx.postVersion.update).not.toHaveBeenCalled();
    expect(tx.mediaAsset.update).not.toHaveBeenCalled();
  });

  it("refuses a stale source version before creating an event", async () => {
    const eventCreate = vi.fn();
    const tx = {
      post: { findFirst: vi.fn().mockResolvedValue({ id: "p1", upstreamStatus: "active", versions: [{ id: "v2", title: "Changed", mediaIds: ["m1"] }] }) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([{ id: "m1", upstreamStatus: "active", primaryPostId: "p1", postIds: ["p1"], currentMimeType: "image/png", currentRole: null, processingStatus: "READY" }]) },
      creatorScheduleEvent: { create: eventCreate }
    };
    const db = { $transaction: (fn: (client: unknown) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
    await expect(createCreatorScheduleEvent(db, "creator-1", {
      event_type: "make_post", destination: "x", due_at: "2026-11-01T12:00:00.000Z",
      remind_me: false, target_mode: "existing_post", post_id: "p1"
    }, {
      trustedEventId: "bench_event_" + "b".repeat(64),
      trustedLibraryAttachment: { postId: "p1", versionId: "v1", mediaIds: ["m1"] }
    })).rejects.toThrow(/changed/i);
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import {
  extensionTransportActionForEventType,
  isCreatorScheduleDestination,
  isCreatorScheduleEventType,
  parseManualEventReminderId,
  reminderIdForManualEvent,
  transportActionForEventType
} from "../src/distribution/creator-schedule-event-contract.js";
import { canonicalizeLooseExternalUrl, canonicalizeScheduleExternalUrl } from "../src/distribution/creator-schedule-event-service.js";

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

import { describe, expect, it } from "vitest";
import {
  isNotificationDigestCadenceId,
  isNotificationDigestSlotId,
  normalizeNotificationDigestCadence,
  normalizeNotificationCadencePreference,
  normalizeNotificationDigestSlot,
  notificationDeliveryModeFromDigestEnabled,
  notificationDeliveryModeFromProfile,
  notificationDigestEnabledFromDeliveryMode,
  resolveNotificationDigestCadence,
  resolveNotificationDigestSlot,
} from "../../src/patron/notification-digest-preferences.js";

describe("notification-digest-preferences", () => {
  it("accepts known cadence slugs", () => {
    expect(isNotificationDigestCadenceId("monthly")).toBe(true);
    expect(normalizeNotificationDigestCadence(" Weekly ")).toBe("weekly");
  });

  it("rejects unknown cadence slugs", () => {
    expect(normalizeNotificationDigestCadence("daily")).toBeNull();
  });

  it("accepts the muted notification cadence sentinel", () => {
    expect(normalizeNotificationCadencePreference(" Never ")).toBe("never");
    expect(normalizeNotificationDigestCadence("never")).toBeNull();
  });

  it("accepts known browse-window slugs", () => {
    expect(isNotificationDigestSlotId("evening")).toBe(true);
    expect(normalizeNotificationDigestSlot(" Morning ")).toBe("morning");
  });

  it("rejects unknown slugs", () => {
    expect(normalizeNotificationDigestSlot("weekend")).toBeNull();
    expect(isNotificationDigestSlotId("weekend")).toBe(false);
  });

  it("falls back to defaults when unset", () => {
    expect(resolveNotificationDigestCadence(null)).toBe("weekly");
    expect(resolveNotificationDigestCadence("bogus")).toBe("weekly");
    expect(resolveNotificationDigestSlot(null)).toBe("evening");
    expect(resolveNotificationDigestSlot("bogus")).toBe("evening");
  });

  it("maps delivery mode to digest enabled flag", () => {
    expect(notificationDeliveryModeFromDigestEnabled(true)).toBe("scheduled");
    expect(notificationDeliveryModeFromDigestEnabled(false)).toBe("instant");
    expect(notificationDeliveryModeFromProfile(false, "never")).toBe("never");
    expect(notificationDeliveryModeFromProfile(false, "weekly")).toBe("instant");
    expect(notificationDigestEnabledFromDeliveryMode("scheduled")).toBe(true);
    expect(notificationDigestEnabledFromDeliveryMode("instant")).toBe(false);
    expect(notificationDigestEnabledFromDeliveryMode("never")).toBe(false);
  });
});

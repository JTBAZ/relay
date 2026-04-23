import { describe, expect, it, vi } from "vitest";
import {
  isPreferenceEnabled,
  listPreferences,
  setPreference
} from "../../src/patron/notification-prefs-service.js";

describe("notification-prefs-service", () => {
  describe("isPreferenceEnabled", () => {
    it("defaults to ENABLED when no row exists (silent-mute requires explicit opt-out)", async () => {
      const findUnique = vi.fn().mockResolvedValue(null);
      const prisma = { notificationPreference: { findUnique } } as never;
      const out = await isPreferenceEnabled(prisma, {
        membershipId: "m1",
        relayCreatorId: "c1",
        preferenceType: "comment_liked"
      });
      expect(out).toBe(true);
    });

    it("returns the persisted enabled flag when a row exists", async () => {
      const findUnique = vi.fn().mockResolvedValue({ enabled: false });
      const prisma = { notificationPreference: { findUnique } } as never;
      const out = await isPreferenceEnabled(prisma, {
        membershipId: "m1",
        relayCreatorId: "c1",
        preferenceType: "tier_changed"
      });
      expect(out).toBe(false);
    });
  });

  describe("setPreference", () => {
    it("upserts on the (membership, creator, type) composite", async () => {
      const upsert = vi.fn().mockResolvedValue({
        preferenceType: "tier_changed",
        relayCreatorId: "c1",
        enabled: false,
        updatedAt: new Date()
      });
      const prisma = { notificationPreference: { upsert } } as never;
      const out = await setPreference(prisma, {
        membershipId: "m1",
        relayCreatorId: "c1",
        preferenceType: "tier_changed",
        enabled: false
      });
      expect(out.enabled).toBe(false);
      const args = upsert.mock.calls[0][0];
      expect(args.where.patronMembershipId_relayCreatorId_preferenceType).toEqual({
        patronMembershipId: "m1",
        relayCreatorId: "c1",
        preferenceType: "tier_changed"
      });
      expect(args.create.enabled).toBe(false);
      expect(args.update.enabled).toBe(false);
    });
  });

  describe("listPreferences", () => {
    it("filters by membership when no creator scope provided", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { notificationPreference: { findMany } } as never;
      await listPreferences(prisma, { membershipId: "m1" });
      expect(findMany.mock.calls[0][0].where).toEqual({ patronMembershipId: "m1" });
    });

    it("scopes by relayCreatorId when provided", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { notificationPreference: { findMany } } as never;
      await listPreferences(prisma, { membershipId: "m1", relayCreatorId: "c1" });
      expect(findMany.mock.calls[0][0].where).toEqual({
        patronMembershipId: "m1",
        relayCreatorId: "c1"
      });
    });
  });
});

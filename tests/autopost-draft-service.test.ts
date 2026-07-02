import { describe, expect, it, vi } from "vitest";
import {
  AutopostDraftConflictError,
  AutopostDraftDiscardWarningError,
  discardAutopostDraft,
  saveAutopostDraft
} from "../src/autopost/autopost-draft-service.js";
import { StyleProfileValidationError } from "../src/autopost/style-profile-service.js";

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

describe("autopost-draft-service", () => {
  it("requires a style profile before generating a draft", async () => {
    const prisma = prismaStub({
      creatorStyleProfile: { findFirst: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      saveAutopostDraft(prisma, "cr1", { media_ids: ["m1"] })
    ).rejects.toBeInstanceOf(StyleProfileValidationError);
  });

  it("allows manual drafts without a style profile", async () => {
    const now = new Date("2026-06-30T12:00:00.000Z");
    const created = {
      id: "d1",
      creatorId: "cr1",
      status: "previewing",
      mediaIds: ["m1"],
      title: null,
      bodyText: null,
      styleProfileId: null,
      enhancements: {},
      distributionLog: {},
      publishedPostId: null,
      createdAt: now,
      updatedAt: now
    };
    const prisma = prismaStub({
      creatorStyleProfile: { findFirst: vi.fn() },
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "m1", discordCaptureJson: null }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      autopostDraft: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created)
      },
      $transaction: vi.fn(async (fn) => fn(prisma))
    });

    await expect(
      saveAutopostDraft(prisma, "cr1", { media_ids: ["m1"], generate: false })
    ).resolves.toMatchObject({
      draft_id: "d1",
      style_profile_id: null
    });
    expect(prisma.creatorStyleProfile.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a second active draft", async () => {
    const prisma = prismaStub({
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "m1", discordCaptureJson: null }])
      },
      autopostDraft: {
        findFirst: vi.fn().mockResolvedValue({ id: "d-existing" })
      }
    });
    await expect(
      saveAutopostDraft(prisma, "cr1", { media_ids: ["m1"], generate: false })
    ).rejects.toMatchObject({ name: "AutopostDraftConflictError", active_draft_id: "d-existing" });
  });

  it("warns on discard when distribution log is non-empty", async () => {
    const prisma = prismaStub({
      autopostDraft: {
        findFirst: vi.fn().mockResolvedValue({
          id: "d1",
          creatorId: "cr1",
          status: "previewing",
          mediaIds: ["m1"],
          title: null,
          bodyText: null,
          styleProfileId: "sp1",
          enhancements: {},
          distributionLog: { patreon: "2026-06-28T12:00:00.000Z" },
          publishedPostId: null,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }
    });
    await expect(discardAutopostDraft(prisma, "cr1", "d1", false)).rejects.toBeInstanceOf(
      AutopostDraftDiscardWarningError
    );
  });
});

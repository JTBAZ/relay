import { describe, expect, it, vi } from "vitest";
import {
  AUTOPOST_ACTIVE_DRAFT_SOFT_CAP,
  AutopostDraftValidationError,
  AutopostDraftDiscardWarningError,
  ConversationalDraftReservationError,
  discardAutopostDraft,
  getAutopostDraft,
  listAutopostDrafts,
  patchAutopostDraft,
  saveAutopostDraft
} from "../src/autopost/autopost-draft-service.js";
import { StyleProfileValidationError } from "../src/autopost/style-profile-service.js";

function prismaStub(over: Record<string, unknown>) {
  // resolveLinkedPostIds always queries postDistributionPlan; default empty so unit
  // stubs without distribution setup still round-trip draft mapping.
  return {
    postDistributionPlan: { findMany: vi.fn().mockResolvedValue([]) },
    ...over
  } as any;
}

function baseDraft(over: Record<string, unknown> = {}) {
  const now = new Date("2026-06-30T12:00:00.000Z");
  return {
    id: "d1",
    creatorId: "cr1",
    status: "previewing",
    mediaIds: ["m1"],
    title: null,
    bodyText: null,
    styleProfileId: null,
    intent: null,
    performanceGoalId: null,
    composerStep: "draft-post",
    workspace: {},
    enhancements: {},
    distributionLog: {},
    publishedPostId: null,
    createdAt: now,
    updatedAt: now,
    ...over
  };
}

describe("autopost-draft-service", () => {
  it("keeps saved copy untouched when regeneration is skipped", async () => {
    const prisma = prismaStub({
      autopostDraft: { findFirst: vi.fn().mockResolvedValue(baseDraft({ bodyText: "Keep this copy" })), update: vi.fn() },
      creatorStyleProfile: { findFirst: vi.fn().mockResolvedValue({ id: "style", creatorId: "cr1", label: "Manual", tonePreset: "none", voiceScript: "", userPrompt: null, updatedAt: new Date() }) },
      creatorStudioBrief: { findUnique: vi.fn().mockResolvedValue(null) },
      postDistributionPlan: { findFirst: vi.fn().mockResolvedValue(null) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([{ discordCaptureJson: null }]) }
    });
    await expect(patchAutopostDraft(prisma, "cr1", "d1", { regenerate: true })).rejects.toThrow("saved copy is unchanged");
    expect(prisma.autopostDraft.update).not.toHaveBeenCalled();
  });

  it("requires a style profile before generating a draft", async () => {
    const prisma = prismaStub({
      creatorStyleProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      autopostDraft: { count: vi.fn().mockResolvedValue(0) }
    });
    await expect(
      saveAutopostDraft(prisma, "cr1", { media_ids: ["m1"] })
    ).rejects.toBeInstanceOf(StyleProfileValidationError);
  });

  it("allows manual drafts without a style profile", async () => {
    const created = baseDraft();
    const prisma = prismaStub({
      creatorStyleProfile: { findFirst: vi.fn() },
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "m1", discordCaptureJson: null }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      autopostDraft: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue(created)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    });

    await expect(
      saveAutopostDraft(prisma, "cr1", { media_ids: ["m1"], generate: false })
    ).resolves.toMatchObject({
      draft_id: "d1",
      style_profile_id: null,
      composer_step: "draft-post",
      intent: null,
      workspace: {}
    });
    expect(prisma.creatorStyleProfile.findFirst).not.toHaveBeenCalled();
  });

  it("allows a second active draft (multi-draft)", async () => {
    const created = baseDraft({ id: "d2", mediaIds: ["m2"] });
    const prisma = prismaStub({
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "m2", discordCaptureJson: null }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      autopostDraft: {
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn().mockResolvedValue(created)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    });
    await expect(
      saveAutopostDraft(prisma, "cr1", { media_ids: ["m2"], generate: false })
    ).resolves.toMatchObject({ draft_id: "d2" });
  });

  it("enforces active draft soft-cap", async () => {
    const prisma = prismaStub({
      autopostDraft: {
        count: vi.fn().mockResolvedValue(AUTOPOST_ACTIVE_DRAFT_SOFT_CAP)
      }
    });
    await expect(
      saveAutopostDraft(prisma, "cr1", { media_ids: ["m1"], generate: false })
    ).rejects.toMatchObject({
      name: "AutopostDraftValidationError",
      details: [{ field: "active_draft_limit", issue: String(AUTOPOST_ACTIVE_DRAFT_SOFT_CAP) }]
    });
  });

  it("creates nudged drafts with empty media", async () => {
    const created = baseDraft({
      id: "dn",
      status: "nudged",
      mediaIds: [],
      composerStep: "pick-media",
      intent: "June continuation #1"
    });
    const prisma = prismaStub({
      mediaAsset: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      autopostDraft: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue(created)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    });
    const draft = await saveAutopostDraft(prisma, "cr1", {
      media_ids: [],
      status: "nudged",
      intent: "June continuation #1",
      generate: false
    });
    expect(draft).toMatchObject({
      draft_id: "dn",
      status: "nudged",
      media_ids: [],
      intent: "June continuation #1"
    });
    expect(prisma.autopostDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "nudged",
          mediaIds: [],
          intent: "June continuation #1"
        })
      })
    );
  });

  it("lists and gets drafts", async () => {
    const row = baseDraft();
    const prisma = prismaStub({
      autopostDraft: {
        findMany: vi.fn().mockResolvedValue([row]),
        findFirst: vi.fn().mockResolvedValue(row)
      }
    });
    const listed = await listAutopostDrafts(prisma, "cr1", { status: "active" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.draft_id).toBe("d1");
    const got = await getAutopostDraft(prisma, "cr1", "d1");
    expect(got.draft_id).toBe("d1");
  });

  it("patches media onto nudged draft and moves to drafting", async () => {
    const nudged = baseDraft({
      id: "dn",
      status: "nudged",
      mediaIds: [],
      composerStep: "pick-media"
    });
    const updated = baseDraft({
      id: "dn",
      status: "drafting",
      mediaIds: ["m9"],
      composerStep: "draft-post"
    });
    const prisma = prismaStub({
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "m9", discordCaptureJson: null }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      autopostDraft: {
        findFirst: vi.fn().mockResolvedValue(nudged),
        update: vi.fn().mockResolvedValue(updated)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    });

    const draft = await patchAutopostDraft(prisma, "cr1", "dn", {
      media_ids: ["m9"],
      composer_step: "draft-post"
    });
    expect(draft.status).toBe("drafting");
    expect(draft.media_ids).toEqual(["m9"]);
    expect(prisma.mediaAsset.findMany).toHaveBeenCalled();
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalled();
  });

  it("autosave patch persists title and composer_step on reload", async () => {
    const row = baseDraft({ title: null, composerStep: "pick-media" });
    const after = baseDraft({
      title: "Saved title",
      composerStep: "draft-post",
      workspace: { selected_destinations: ["x"] }
    });
    const prisma = prismaStub({
      mediaAsset: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      autopostDraft: {
        findFirst: vi.fn().mockResolvedValueOnce(row).mockResolvedValueOnce(after),
        update: vi.fn().mockResolvedValue(after)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    });

    await patchAutopostDraft(prisma, "cr1", "d1", {
      title: "Saved title",
      composer_step: "draft-post",
      workspace: { selected_destinations: ["x"] }
    });
    const reloaded = await getAutopostDraft(prisma, "cr1", "d1");
    expect(reloaded.title).toBe("Saved title");
    expect(reloaded.composer_step).toBe("draft-post");
    expect(reloaded.workspace.selected_destinations).toEqual(["x"]);
  });

  it("warns on discard when distribution log is non-empty", async () => {
    const prisma = prismaStub({
      autopostDraft: {
        findFirst: vi.fn().mockResolvedValue(
          baseDraft({
            distributionLog: { patreon: "2026-06-28T12:00:00.000Z" }
          })
        )
      }
    });
    await expect(discardAutopostDraft(prisma, "cr1", "d1", false)).rejects.toBeInstanceOf(
      AutopostDraftDiscardWarningError
    );
  });

  it("force discard succeeds after distribution warning", async () => {
    const row = baseDraft({
      distributionLog: { x: "2026-06-28T12:00:00.000Z" }
    });
    const discarded = { ...row, status: "discarded" };
    const prisma = prismaStub({
      mediaAsset: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      autopostDraft: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue(discarded)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    });
    const out = await discardAutopostDraft(prisma, "cr1", "d1", true);
    expect(out.status).toBe("discarded");
  });

  it("rejects empty media unless nudged", async () => {
    const prisma = prismaStub({
      autopostDraft: { count: vi.fn().mockResolvedValue(0) }
    });
    await expect(
      saveAutopostDraft(prisma, "cr1", {
        media_ids: [],
        status: "drafting",
        generate: false
      })
    ).rejects.toMatchObject({
      name: "AutopostDraftValidationError",
      details: [{ field: "media_ids", issue: "required" }]
    });
  });

  it("rejects a save when the transactional media claim no longer matches the precheck", async () => {
    const draft = baseDraft({ mediaIds: ["m1"] });
    const prisma = prismaStub({
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "m1", discordCaptureJson: null }]),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 })
      },
      autopostDraft: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue(draft) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    });

    await expect(saveAutopostDraft(prisma, "cr1", { media_ids: ["m1"], generate: false }))
      .rejects.toBeInstanceOf(ConversationalDraftReservationError);
    expect(prisma.mediaAsset.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({
      creatorId: "cr1", id: { in: ["m1"] }, ingestOrigin: { in: ["DISCORD", "RELAY_UPLOAD"] },
      processingStatus: "READY", primaryPostId: null
    }) }));
  });

  it("rejects a media-changing patch when the transactional claim fails after releasing prior reservations", async () => {
    const row = baseDraft({ mediaIds: ["old-media"] });
    const prisma = prismaStub({
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "new-media", discordCaptureJson: null }]),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
      },
      autopostDraft: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue({ ...row, mediaIds: ["new-media"] })
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    });

    await expect(patchAutopostDraft(prisma, "cr1", "d1", { media_ids: ["new-media"] }))
      .rejects.toBeInstanceOf(AutopostDraftValidationError);
    expect(prisma.mediaAsset.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({
      creatorId: "cr1", id: { in: ["new-media"] }, ingestOrigin: { in: ["DISCORD", "RELAY_UPLOAD"] },
      processingStatus: "READY", primaryPostId: null
    }) }));
    expect(prisma.autopostDraft.update).not.toHaveBeenCalled();
  });
});

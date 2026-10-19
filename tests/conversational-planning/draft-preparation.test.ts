import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  AUTOPOST_ACTIVE_DRAFT_SOFT_CAP,
  AutopostDraftValidationError,
  ConversationalDraftReservationError,
  saveConversationalDraftInTransaction,
  type ConversationalDraftInput
} from "../../src/autopost/autopost-draft-service.js";

const forbiddenCalls = vi.hoisted(() => ({
  generateCopy: vi.fn(),
  requireStyleProfile: vi.fn(),
  loadMountedContext: vi.fn()
}));
vi.mock("../../src/autopost/autopost-draft-ai.js", () => ({
  collectMediaCaptions: vi.fn(),
  generateAutopostDraftCopy: forbiddenCalls.generateCopy
}));
vi.mock("../../src/autopost/style-profile-service.js", () => ({
  requireCreatorStyleProfile: forbiddenCalls.requireStyleProfile
}));
vi.mock("../../src/creator/studio-mounted-context.js", () => ({
  loadStudioMountedContext: forbiddenCalls.loadMountedContext
}));

const creatorId = "creator-a";
const stepKey = "plan:plan-a:step:step-a";
const input: ConversationalDraftInput = { creatorId, stepKey, mediaIds: ["media-b", "media-a"], title: "Approved title" };
const createdAt = new Date("2026-10-17T10:00:00.000Z");
const createdRow = (overrides: Record<string, unknown> = {}) => ({
  id: "draft-a", creatorId, status: "drafting", mediaIds: ["media-a", "media-b"], title: "Approved title",
  bodyText: null, styleProfileId: null, intent: null, performanceGoalId: null, composerStep: "draft-post",
  workspace: {}, enhancements: {}, distributionLog: {}, publishedPostId: null,
  createdAt, updatedAt: createdAt, conversationalStepKey: stepKey, ...overrides
});

function transaction(overrides: {
  existing?: { id: string; creatorId: string } | null;
  activeCount?: number;
  lockRows?: Array<{ id: string }>;
  mediaRows?: Array<{ id: string }>;
  claimCount?: number;
} = {}) {
  const db = {
    autopostDraft: {
      findFirst: vi.fn().mockResolvedValue(overrides.existing ?? null),
      count: vi.fn().mockResolvedValue(overrides.activeCount ?? 0),
      create: vi.fn().mockResolvedValue(createdRow())
    },
    mediaAsset: {
      findMany: vi.fn().mockResolvedValue(overrides.mediaRows ?? [{ id: "media-a" }, { id: "media-b" }]),
      updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: overrides.claimCount ?? 2 })
    },
    $queryRaw: vi.fn().mockResolvedValue(overrides.lockRows ?? [{ id: "media-a" }, { id: "media-b" }])
  };
  return db as unknown as Prisma.TransactionClient & typeof db;
}

describe("transaction-owned conversational draft preparation", () => {
  it("creates one forced manual draft and claims sorted eligible media in the supplied transaction", async () => {
    const tx = transaction();
    await expect(saveConversationalDraftInTransaction(tx, input)).resolves.toEqual({ kind: "ready", draftId: "draft-a", reused: false });

    expect(tx.autopostDraft.findFirst).toHaveBeenCalledWith({ where: { conversationalStepKey: stepKey }, select: { id: true, creatorId: true } });
    expect(tx.autopostDraft.count).toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    const raw = tx.$queryRaw.mock.calls[0]?.[0] as { values?: readonly unknown[] };
    expect(raw.values).toEqual([creatorId, "media-a", "media-b"]);
    expect(tx.mediaAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      creatorId, id: { in: ["media-b", "media-a"] }, ingestOrigin: { in: ["DISCORD", "RELAY_UPLOAD"] },
      primaryPostId: null, processingStatus: "READY", OR: [{ autopostDraftId: null }]
    }) }));
    expect(tx.autopostDraft.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      creatorId, conversationalStepKey: stepKey, status: "drafting", mediaIds: ["media-b", "media-a"],
      title: "Approved title", bodyText: null, styleProfileId: null, intent: null, performanceGoalId: null,
      composerStep: "draft-post", workspace: {}
    }) });
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.mediaAsset.updateMany.mock.calls[1]?.[0]).toMatchObject({ where: {
      id: { in: ["media-b", "media-a"] }, creatorId, ingestOrigin: { in: ["DISCORD", "RELAY_UPLOAD"] },
      processingStatus: "READY", primaryPostId: null, OR: [{ autopostDraftId: null }, { autopostDraftId: "draft-a" }]
    }, data: { autopostDraftId: "draft-a" } });
    expect("$transaction" in tx).toBe(false);
    expect(forbiddenCalls.generateCopy).not.toHaveBeenCalled();
    expect(forbiddenCalls.requireStyleProfile).not.toHaveBeenCalled();
    expect(forbiddenCalls.loadMountedContext).not.toHaveBeenCalled();
  });

  it("rejects malformed internal ids, key shapes, and media lists before any database operation", async () => {
    const invalid: unknown[] = [
      { ...input, creatorId: " creator-a" },
      { ...input, stepKey: "plan:plan-a:step:" },
      { ...input, stepKey: `plan:${"p".repeat(160)}:step:${"s".repeat(160)}x` },
      { ...input, mediaIds: [] },
      { ...input, mediaIds: ["media-a", "media-a"] },
      { ...input, mediaIds: ["media-a", " media-b"] },
      { ...input, mediaIds: ["m".repeat(161)] },
      { ...input, mediaIds: ["a", "b", "c", "d"] },
      { ...input, extra: true }
    ];
    for (const bad of invalid) {
      const tx = transaction();
      await expect(saveConversationalDraftInTransaction(tx, bad as ConversationalDraftInput)).rejects.toBeInstanceOf(AutopostDraftValidationError);
      expect(tx.autopostDraft.findFirst).not.toHaveBeenCalled();
      expect(tx.autopostDraft.count).not.toHaveBeenCalled();
      expect(tx.autopostDraft.create).not.toHaveBeenCalled();
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    }
  });

  it("reuses the exact-key row before title, cap, lock, or media eligibility checks", async () => {
    const tx = transaction({ existing: { id: "already-edited", creatorId } });
    await expect(saveConversationalDraftInTransaction(tx, { ...input, title: " " })).resolves.toEqual({ kind: "ready", draftId: "already-edited", reused: true });
    expect(tx.autopostDraft.count).not.toHaveBeenCalled();
    expect(tx.autopostDraft.create).not.toHaveBeenCalled();
    expect(tx.mediaAsset.findMany).not.toHaveBeenCalled();
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns a bounded owner conflict for a key owned by another creator", async () => {
    const tx = transaction({ existing: { id: "foreign-draft", creatorId: "creator-b" } });
    await expect(saveConversationalDraftInTransaction(tx, input)).resolves.toEqual({ kind: "conflict", code: "authority_conflict" });
    expect(tx.autopostDraft.count).not.toHaveBeenCalled();
    expect(tx.autopostDraft.create).not.toHaveBeenCalled();
  });

  it("preserves an exact maximum-length title and caller media order at the accepted three-media bound", async () => {
    const title = "T".repeat(500);
    const tx = transaction({
      lockRows: [{ id: "media-a" }, { id: "media-b" }, { id: "media-c" }],
      mediaRows: [{ id: "media-a" }, { id: "media-b" }, { id: "media-c" }],
      claimCount: 3
    });
    await expect(saveConversationalDraftInTransaction(tx, {
      creatorId, stepKey, mediaIds: ["media-c", "media-a", "media-b"], title
    })).resolves.toMatchObject({ kind: "ready", reused: false });
    expect(tx.autopostDraft.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      mediaIds: ["media-c", "media-a", "media-b"], title
    }) });
    expect(tx.mediaAsset.updateMany.mock.calls[1]?.[0]).toMatchObject({ where: { id: { in: ["media-c", "media-a", "media-b"] } } });
    const raw = tx.$queryRaw.mock.calls[0]?.[0] as { values?: readonly unknown[] };
    expect(raw.values).toEqual([creatorId, "media-a", "media-b", "media-c"]);
  });

  it("returns title and soft-cap blocks before media locks or writes", async () => {
    const titleTx = transaction();
    await expect(saveConversationalDraftInTransaction(titleTx, { ...input, title: "  title  " })).resolves.toEqual({ kind: "blocked", code: "title_normalization_gap" });
    expect(titleTx.autopostDraft.count).not.toHaveBeenCalled();
    expect(titleTx.$queryRaw).not.toHaveBeenCalled();

    const capTx = transaction({ activeCount: AUTOPOST_ACTIVE_DRAFT_SOFT_CAP });
    await expect(saveConversationalDraftInTransaction(capTx, input)).resolves.toEqual({ kind: "blocked", code: "active_draft_limit" });
    expect(capTx.$queryRaw).not.toHaveBeenCalled();
    expect(capTx.autopostDraft.create).not.toHaveBeenCalled();
  });

  it("blocks unavailable media before inserting a draft", async () => {
    const tx = transaction({ lockRows: [{ id: "media-a" }], mediaRows: [{ id: "media-a" }] });
    await expect(saveConversationalDraftInTransaction(tx, input)).resolves.toEqual({ kind: "blocked", code: "media_not_available" });
    expect(tx.autopostDraft.create).not.toHaveBeenCalled();
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
  });

  it("blocks when a locked candidate disappears from the fresh eligibility read", async () => {
    const tx = transaction({ lockRows: [{ id: "media-a" }, { id: "media-b" }], mediaRows: [{ id: "media-a" }] });
    await expect(saveConversationalDraftInTransaction(tx, input)).resolves.toEqual({ kind: "blocked", code: "media_not_available" });
    expect(tx.autopostDraft.create).not.toHaveBeenCalled();
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
  });

  it("propagates unexpected staging-reader errors instead of treating them as ordinary ineligibility", async () => {
    const tx = transaction();
    tx.mediaAsset.findMany.mockRejectedValueOnce(new Error("staging reader unavailable"));
    await expect(saveConversationalDraftInTransaction(tx, input)).rejects.toThrow("staging reader unavailable");
    expect(tx.autopostDraft.create).not.toHaveBeenCalled();
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
  });

  it("throws the owning reservation error on an exact-claim mismatch after create so the caller transaction rolls back", async () => {
    const tx = transaction({ claimCount: 1 });
    await expect(saveConversationalDraftInTransaction(tx, input)).rejects.toBeInstanceOf(ConversationalDraftReservationError);
    await expect(saveConversationalDraftInTransaction(transaction({ claimCount: 0 }), input)).rejects.toMatchObject({
      name: "AutopostDraftValidationError", code: "media_not_available", details: [{ field: "media_ids", issue: "not_staging_ready" }]
    });
  });
});

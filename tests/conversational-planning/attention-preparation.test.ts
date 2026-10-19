import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  CreatorScheduleEventValidationError,
  createConversationalAttentionEventInTransaction,
  type ConversationalAttentionInput
} from "../../src/distribution/creator-schedule-event-service.js";

const forbiddenCalls = vi.hoisted(() => ({
  requireCreatorPlanAtLeast: vi.fn(),
  confirmPlatformInstanceLink: vi.fn()
}));
vi.mock("../../src/billing/creator-plan-entitlement-service.js", () => ({
  requireCreatorPlanAtLeast: forbiddenCalls.requireCreatorPlanAtLeast
}));
vi.mock("../../src/analytics/platform-instance-link-service.js", () => ({
  confirmPlatformInstanceLink: forbiddenCalls.confirmPlatformInstanceLink
}));

const creatorId = "creator-a";
const stepKey = "plan:plan-a:step:step-a";
const dueAtUtc = "2026-10-20T09:00:00.000Z";
const input: ConversationalAttentionInput = { creatorId, stepKey, dueAtUtc, note: "Review this draft", source: { kind: "existing_post", postId: "post-a" } };
const createdAt = new Date("2026-10-17T10:00:00.000Z");

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-a", creatorId, conversationalStepKey: stepKey, eventType: "make_post", destination: "patreon",
    title: "Review Patreon post", note: input.note, dueAt: new Date(dueAtUtc), postId: "post-a", externalUrl: null,
    remindMe: true, status: "pending", reminderSentAt: null, snoozedUntil: null, createdAt, updatedAt: createdAt,
    ...overrides
  };
}

function transaction(overrides: {
  post?: { id: string } | null;
  draft?: { id: string; creatorId: string; conversationalStepKey: string; publishedPostId: string | null } | null;
  existing?: ReturnType<typeof event> | null;
} = {}) {
  const db = {
    post: { findFirst: vi.fn().mockResolvedValue(overrides.post === undefined ? { id: "post-a" } : overrides.post) },
    autopostDraft: { findFirst: vi.fn().mockResolvedValue(overrides.draft === undefined ? null : overrides.draft) },
    creatorScheduleEvent: {
      findFirst: vi.fn().mockResolvedValue(overrides.existing ?? null),
      create: vi.fn().mockResolvedValue(event())
    }
  };
  return { db, tx: db as unknown as Prisma.TransactionClient };
}

describe("transaction-owned conversational attention event", () => {
  it("creates only the fixed Patreon review event linked to an owned existing post", async () => {
    const { db, tx } = transaction();
    await expect(createConversationalAttentionEventInTransaction(tx, input)).resolves.toEqual({ kind: "ready", eventId: "event-a", reused: false });
    expect(db.post.findFirst).toHaveBeenCalledWith({ where: { id: "post-a", creatorId }, select: { id: true } });
    expect(db.creatorScheduleEvent.create).toHaveBeenCalledWith({ data: {
      creatorId, conversationalStepKey: stepKey, eventType: "make_post", destination: "patreon",
      title: "Review Patreon post", note: input.note, dueAt: new Date(dueAtUtc), postId: "post-a",
      externalUrl: null, status: "pending", remindMe: true
    } });
    expect(db.creatorScheduleEvent.findFirst).toHaveBeenCalledWith({ where: { creatorId, conversationalStepKey: stepKey } });
    expect("$transaction" in tx).toBe(false);
    expect(forbiddenCalls.requireCreatorPlanAtLeast).not.toHaveBeenCalled();
    expect(forbiddenCalls.confirmPlatformInstanceLink).not.toHaveBeenCalled();
  });

  it("creates an unpublished staged-draft reminder with a null canonical post parent and exact note", async () => {
    const { db, tx } = transaction({ draft: { id: "draft-a", creatorId, conversationalStepKey: stepKey, publishedPostId: null } });
    const result = await createConversationalAttentionEventInTransaction(tx, {
      creatorId, stepKey, dueAtUtc, note: "  ", source: { kind: "staged_draft", draftId: "draft-a" }
    });
    expect(result).toEqual({ kind: "ready", eventId: "event-a", reused: false });
    expect(db.autopostDraft.findFirst).toHaveBeenCalledWith({
      where: { id: "draft-a", creatorId, conversationalStepKey: stepKey },
      select: { id: true, creatorId: true, conversationalStepKey: true, publishedPostId: true }
    });
    expect(db.creatorScheduleEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ postId: null, note: "  " }) });
    expect(db.post.findFirst).not.toHaveBeenCalled();
  });

  it.each([null, "", "   "] as const)("preserves approved note value %j exactly", async (note) => {
    const { db, tx } = transaction();
    await expect(createConversationalAttentionEventInTransaction(tx, { ...input, note })).resolves.toMatchObject({ kind: "ready", reused: false });
    expect(db.creatorScheduleEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ note }) });
  });

  it("reuses a matching event while preserving all live manual content and status drift", async () => {
    const live = event({
      title: "Creator-edited title", note: "Creator-edited note", dueAt: new Date("2026-11-01T12:30:00.000Z"),
      externalUrl: "https://creator-added.example/reminder", remindMe: false, status: "done"
    });
    const { db, tx } = transaction({ existing: live });
    await expect(createConversationalAttentionEventInTransaction(tx, input)).resolves.toEqual({ kind: "ready", eventId: "event-a", reused: true });
    expect(db.creatorScheduleEvent.create).not.toHaveBeenCalled();
  });

  it("conflicts on wrong event purpose, destination, or parent identity", async () => {
    for (const existing of [
      event({ eventType: "schedule_post" }),
      event({ destination: "x" }),
      event({ postId: "post-b" })
    ]) {
      const { db, tx } = transaction({ existing });
      await expect(createConversationalAttentionEventInTransaction(tx, input)).resolves.toEqual({ kind: "conflict", code: "authority_conflict" });
      expect(db.creatorScheduleEvent.create).not.toHaveBeenCalled();
    }
  });

  it("conflicts when the unique key is occupied by another creator", async () => {
    const { db, tx } = transaction({ existing: event({ creatorId: "creator-b" }) });
    await expect(createConversationalAttentionEventInTransaction(tx, input)).resolves.toEqual({ kind: "conflict", code: "authority_conflict" });
    expect(db.creatorScheduleEvent.create).not.toHaveBeenCalled();
  });

  it("checks owned sources and blocks a staged draft that has crossed into a canonical post", async () => {
    const foreignPost = transaction({ post: null });
    await expect(createConversationalAttentionEventInTransaction(foreignPost.tx, input)).resolves.toEqual({ kind: "conflict", code: "authority_conflict" });
    expect(foreignPost.db.creatorScheduleEvent.create).not.toHaveBeenCalled();

    const missingDraft = transaction({ draft: null });
    await expect(createConversationalAttentionEventInTransaction(missingDraft.tx, {
      ...input, source: { kind: "staged_draft", draftId: "draft-a" }
    })).resolves.toEqual({ kind: "conflict", code: "authority_conflict" });

    const publishedDraft = transaction({ draft: { id: "draft-a", creatorId, conversationalStepKey: stepKey, publishedPostId: "post-a" } });
    await expect(createConversationalAttentionEventInTransaction(publishedDraft.tx, {
      ...input, source: { kind: "staged_draft", draftId: "draft-a" }
    })).resolves.toEqual({ kind: "blocked", code: "authority_gap" });
    expect(publishedDraft.db.creatorScheduleEvent.create).not.toHaveBeenCalled();
  });

  it("rejects staged-draft query rows whose owner or correlation key does not match", async () => {
    for (const draft of [
      { id: "draft-a", creatorId: "creator-b", conversationalStepKey: stepKey, publishedPostId: null },
      { id: "draft-a", creatorId, conversationalStepKey: "plan:plan-a:step:other", publishedPostId: null }
    ]) {
      const { db, tx } = transaction({ draft });
      await expect(createConversationalAttentionEventInTransaction(tx, {
        ...input, source: { kind: "staged_draft", draftId: "draft-a" }
      })).resolves.toEqual({ kind: "conflict", code: "authority_conflict" });
      expect(db.creatorScheduleEvent.create).not.toHaveBeenCalled();
    }
  });

  it("returns finite missing-time and note-normalization outcomes without writes", async () => {
    for (const dueAtUtc of ["", "2026-10-20T09:00:00Z", "2026-02-30T09:00:00.000Z", "2026-10-20T09:00:00.001+00:00"]) {
      const badTime = transaction();
      await expect(createConversationalAttentionEventInTransaction(badTime.tx, { ...input, dueAtUtc }))
        .resolves.toEqual({ kind: "blocked", code: "missing_absolute_time" });
      expect(badTime.db.post.findFirst).not.toHaveBeenCalled();
      expect(badTime.db.creatorScheduleEvent.create).not.toHaveBeenCalled();
    }

    const badNote = transaction();
    await expect(createConversationalAttentionEventInTransaction(badNote.tx, { ...input, note: "x".repeat(2_001) }))
      .resolves.toEqual({ kind: "blocked", code: "note_normalization_gap" });
    expect(badNote.db.post.findFirst).not.toHaveBeenCalled();
    expect(badNote.db.creatorScheduleEvent.create).not.toHaveBeenCalled();
  });

  it("rejects malformed internal ids, step keys, and source arms before queries", async () => {
    const invalid: unknown[] = [
      { ...input, creatorId: " creator-a" },
      { ...input, stepKey: "plan:plan-a:step:" },
      { ...input, source: { kind: "existing_post", postId: "post-a", extra: true } },
      { ...input, source: { kind: "staged_draft", draftId: "" } },
      { ...input, extra: true }
    ];
    for (const bad of invalid) {
      const { db, tx } = transaction();
      await expect(createConversationalAttentionEventInTransaction(tx, bad as ConversationalAttentionInput))
        .rejects.toBeInstanceOf(CreatorScheduleEventValidationError);
      expect(db.post.findFirst).not.toHaveBeenCalled();
      expect(db.autopostDraft.findFirst).not.toHaveBeenCalled();
      expect(db.creatorScheduleEvent.findFirst).not.toHaveBeenCalled();
      expect(db.creatorScheduleEvent.create).not.toHaveBeenCalled();
    }
  });
});

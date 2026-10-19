import { CreatorPlan, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPlanningContextSource, derivePlanningEditDescriptors } from "../../src/conversational-planning/context.js";
import { validatePlanShape, validatePlanWithContext, type PlanSnapshot, type PlanStep } from "../../src/conversational-planning/contract.js";

const creatorId = "creator-context-a";
const now = new Date("2026-10-16T10:30:00.000Z");
const templateConfig = { schemaVersion: 1, preset: "tight_crop", aspectKey: "1:1", compositionId: null, compositionProps: null, compositionVariantIndex: null, overlayDoc: {}, templateOptions: {}, destination: { selectedDestinationId: "x", customDestinationUrl: null } };

function draftStep(id = "step-a"): PlanStep {
  return { step_id: id, depends_on: [], enabled: true, title: { mode: "literal", value: "Proposed title", origin: "creator" }, note: null, time: { kind: "absolute", at_utc: "2026-10-20T09:00:00.000Z", timezone: "Europe/London", local: "2026-10-20T10:00" }, capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: ["media-a"], target_post_id: null };
}
function plan(overrides: Partial<PlanSnapshot> = {}): PlanSnapshot {
  return { schema_version: 1, plan_id: "plan-a", creator_id: creatorId, revision: 2, review: "proposed", source: { kind: "existing_post", post_id: "post-a", selected_media_ids: ["media-a"], creative_work_id: null, creative_series_member_id: null, source_revision: "old-source-fingerprint" }, steps: [draftStep()], distribution_groups: [], unresolved_requests: [], clarifications: [], requested_text_quote: "Make a post titled Proposed title", created_at: "2026-10-16T10:00:00.000Z", updated_at: "2026-10-16T10:00:00.000Z", ...overrides };
}
async function freshPlan(source: ReturnType<typeof createPlanningContextSource>, value = plan()): Promise<PlanSnapshot> {
  const loaded = await source.loadContext(creatorId, value);
  return { ...value, source: { ...value.source, source_revision: loaded.sourceFingerprint } };
}

function mockPrisma(overrides: { postIds?: string[]; currentUpstreamRevision?: string; draftReservation?: string | null; timezone?: string | null; templateConfig?: unknown; foreignWork?: boolean; templateRows?: number; templateCatalogSize?: number; processingStatus?: string; publishState?: string } = {}) {
  const postIds = overrides.postIds ?? ["post-a"];
  const postRow = (id: string) => ({ id, creatorId, publishState: overrides.publishState ?? "published", versions: [{ versionSeq: 7, upstreamRevision: "post-upstream-7", title: "Source title", mediaIds: [id === "post-b" ? "media-b" : "media-a"] }], presentation: null, creativeWorkMember: null });
  const db = {
    mediaAsset: { findMany: vi.fn(async (args: { select?: Record<string, unknown>; where?: { id?: { in?: string[] }; OR?: Array<{ primaryPostId?: { in?: string[] }; postIds?: { hasSome?: string[] } }> }; take?: number }) => {
      if (args.select?.currentVersionSeq) return (args.where?.id?.in ?? ["media-a"]).map(id => ({ id, creatorId, processingStatus: overrides.processingStatus ?? "READY", ingestOrigin: "RELAY_UPLOAD", currentVersionSeq: id === "media-a" ? 3 : 1, currentUpstreamRevision: overrides.currentUpstreamRevision ?? "media-upstream-3", currentMimeType: "image/png", currentRole: "primary", primaryPostId: "post-a", postIds }));
      if (args.select?.processingStatus) return [{ id: "media-a", creatorId, processingStatus: overrides.processingStatus ?? "READY", ingestOrigin: "RELAY_UPLOAD", primaryPostId: postIds[0] ?? null, postIds, autopostDraftId: overrides.draftReservation ?? null, currentMimeType: "image/png", filename: "should-not-be-present.png" }];
      if (args.where?.id?.in) return [{ id: "media-a", primaryPostId: postIds[0] ?? null, postIds }];
      const wanted = args.where?.OR?.[0]?.primaryPostId?.in ?? args.where?.OR?.[1]?.postIds?.hasSome ?? [];
      return wanted.map(postId => ({ id: postId === "post-b" ? "media-b" : "media-a", primaryPostId: postId, postIds: [postId] }));
    }) },
    post: { findMany: vi.fn(async (args: { select?: Record<string, unknown>; where?: { id?: { in?: string[] } } }) => {
      const requested = args.where?.id?.in ?? ["post-a"];
      if (args.select && Object.keys(args.select).length === 1 && args.select.id === true) return requested.map(id => ({ id }));
      return requested.map(id => postRow(id));
    }) },
    creativeWorkMember: { findMany: vi.fn(async () => overrides.foreignWork ? [{ postId: "post-a", creativeWorkId: "foreign-work", creativeWork: { creatorId: "creator-context-b", seriesMember: null } }] : []) },
    creatorPreviewTemplate: { findMany: vi.fn(async (args: { where?: { id?: { in?: string[] } }; take?: number }) => {
      const ids = args.where?.id?.in ?? Array.from({ length: overrides.templateCatalogSize ?? 1 }, (_, index) => `template-${String.fromCharCode(97 + index)}`);
      return ids.slice(0, overrides.templateRows ?? ids.length).map(id => ({ id, creatorId, name: `Preview ${id}`, config: overrides.templateConfig ?? templateConfig, updatedAt: now }));
    }) },
    creatorPlanEntitlement: { findUnique: vi.fn(async () => ({ plan: CreatorPlan.autopost, source: "pilot", expiresAt: null })), upsert: vi.fn(), delete: vi.fn() },
    account: { findFirst: vi.fn(async () => ({ id: "account-a" })) },
    planSubscription: { findFirst: vi.fn(async () => ({ creatorPlan: CreatorPlan.autopost })) },
    creatorPostingGoal: { findUnique: vi.fn(async () => ({ timezone: overrides.timezone === undefined ? "Europe/London" : overrides.timezone })) },
    creatorBlueskyCredential: { findUnique: vi.fn(async () => null) },
    creatorProfile: { findFirst: vi.fn(async () => ({ patreonCampaignId: "campaign-a" })) }
  };
  return db as unknown as PrismaClient;
}

describe("production planning context source", () => {
  it("computes deterministic fresh fingerprints without echoing the stored revision or reservation state", async () => {
    const firstDb = mockPrisma({ draftReservation: "draft-one" });
    const secondDb = mockPrisma({ draftReservation: "draft-two" });
    const a = await createPlanningContextSource(firstDb, { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: ["media-a"], selectedPostIds: [], receivedAtUtc: now.toISOString() });
    const b = await createPlanningContextSource(secondDb, { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: ["media-a"], selectedPostIds: [], receivedAtUtc: now.toISOString() });
    expect(a.kind).toBe("ok"); expect(b.kind).toBe("ok");
    if (a.kind !== "ok" || b.kind !== "ok") return;
    expect(a.sourceFingerprint).toMatch(/^src1_[a-f0-9]{64}$/);
    expect(a.sourceFingerprint).toBe(b.sourceFingerprint);
    const loaded = await createPlanningContextSource(firstDb).loadContext(creatorId, plan());
    expect(loaded.sourceFingerprint).not.toBe("old-source-fingerprint");
    expect(loaded.context.currentSourceRevision).toBe(loaded.sourceFingerprint);
    const currentSnapshot = await freshPlan(createPlanningContextSource(mockPrisma(), { now: () => now }));
    const stale = await createPlanningContextSource(mockPrisma({ currentUpstreamRevision: "media-upstream-4" }), { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot: currentSnapshot, receivedAtUtc: now.toISOString() });
    expect(stale).toEqual({ kind: "conflict", code: "stale_snapshot" });
  });

  it("changes fingerprints when source version identity changes and keeps relation ordering canonical", async () => {
    const one = await createPlanningContextSource(mockPrisma({ postIds: ["post-a", "post-b"] }), { now: () => now }).loadContext(creatorId, plan());
    const reordered = await createPlanningContextSource(mockPrisma({ postIds: ["post-b", "post-a"] }), { now: () => now }).loadContext(creatorId, plan());
    const changed = await createPlanningContextSource(mockPrisma({ currentUpstreamRevision: "media-upstream-4" }), { now: () => now }).loadContext(creatorId, plan());
    const associationChanged = await createPlanningContextSource(mockPrisma({ postIds: ["post-a"] }), { now: () => now }).loadContext(creatorId, plan());
    expect(one.sourceFingerprint).toBe(reordered.sourceFingerprint);
    expect(one.sourceFingerprint).not.toBe(changed.sourceFingerprint);
    expect(one.sourceFingerprint).not.toBe(associationChanged.sourceFingerprint);
    const postOnlyInput = { authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: ["post-a"], receivedAtUtc: now.toISOString() };
    const postOnlyA = await createPlanningContextSource(mockPrisma(), { now: () => now }).buildRequestContext(postOnlyInput);
    const postOnlyB = await createPlanningContextSource(mockPrisma({ currentUpstreamRevision: "media-upstream-8" }), { now: () => now }).buildRequestContext(postOnlyInput);
    const postStateChanged = await createPlanningContextSource(mockPrisma({ publishState: "draft" }), { now: () => now }).buildRequestContext(postOnlyInput);
    expect(postOnlyA.kind).toBe("ok"); expect(postOnlyB.kind).toBe("ok");
    if (postOnlyA.kind === "ok" && postOnlyB.kind === "ok") expect(postOnlyA.sourceFingerprint).not.toBe(postOnlyB.sourceFingerprint);
    expect(postOnlyA.kind).toBe("ok"); expect(postStateChanged.kind).toBe("ok");
    if (postOnlyA.kind === "ok" && postStateChanged.kind === "ok") expect(postOnlyA.sourceFingerprint).not.toBe(postStateChanged.sourceFingerprint);
  });

  it("scopes context to the creator, rejects foreign plan ownership, and does not leak media URLs", async () => {
    const db = mockPrisma({ foreignWork: true });
    const source = createPlanningContextSource(db, { now: () => now });
    const result = await source.buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: ["media-a"], selectedPostIds: [], receivedAtUtc: now.toISOString() });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.modelContext.selected.work_id).toBeNull();
      expect(JSON.stringify(result.modelContext)).not.toMatch(/https?:\/\/|storageKey|should-not-be-present/);
    }
    expect(await source.buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot: plan({ creator_id: "creator-context-b" }) })).toEqual({ kind: "conflict", code: "foreign_plan" });
  });

  it("fails closed on ambiguous linked posts and over-limit source selections", async () => {
    const ambiguous = await createPlanningContextSource(mockPrisma({ postIds: ["post-a", "post-b"] }), { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: ["media-a"], selectedPostIds: [], receivedAtUtc: now.toISOString() });
    expect(ambiguous).toMatchObject({ kind: "clarification", code: "ambiguous_source" });
    const tooMany = await createPlanningContextSource(mockPrisma(), { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: ["m1", "m2", "m3", "m4"], selectedPostIds: [], receivedAtUtc: now.toISOString() });
    expect(tooMany).toMatchObject({ kind: "clarification", code: "narrow_selection" });
  });

  it("rejects non-ready selected media and asks for an explicit template choice when the catalog is too large", async () => {
    const pending = await createPlanningContextSource(mockPrisma({ processingStatus: "PROCESSING" }), { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: ["media-a"], selectedPostIds: [], receivedAtUtc: now.toISOString() });
    expect(pending).toEqual({ kind: "unavailable", code: "source_scope" });
    const largeCatalog = await createPlanningContextSource(mockPrisma({ templateCatalogSize: 4 }), { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], receivedAtUtc: now.toISOString() });
    expect(largeCatalog).toMatchObject({ kind: "clarification", code: "narrow_selection", question: "Choose up to three saved templates for this request." });
  });

  it("loads selected templates exactly and projects them in accepted command order", async () => {
    const db = mockPrisma({ templateCatalogSize: 4 });
    const result = await createPlanningContextSource(db, { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], selectedTemplateIds: ["template-c", "template-a"], receivedAtUtc: now.toISOString() });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.modelContext.templates.map(row => row.id)).toEqual(["template-c", "template-a"]);
    expect(db.creatorPreviewTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { creatorId, id: { in: ["template-c", "template-a"] } }, take: 4 }));
  });

  it("scopes retained templates to selected edit dependencies and ignores unrelated large catalogs", async () => {
    const primaryOnlySource = createPlanningContextSource(mockPrisma({ templateCatalogSize: 4 }), { now: () => now });
    const primaryOnly = await freshPlan(primaryOnlySource);
    const primaryEdit = await primaryOnlySource.buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot: primaryOnly, targetHandleRefs: [{ handle: `node_${createHash("sha256").update(JSON.stringify({ binding: [creatorId, primaryOnly.plan_id, primaryOnly.revision, "step-a"], v: 1 })).digest("hex").slice(0, 24)}` }], receivedAtUtc: now.toISOString() });
    expect(primaryEdit.kind).toBe("ok");
    if (primaryEdit.kind === "ok") expect(primaryEdit.modelContext.templates).toEqual([]);

    const draft = { ...draftStep("draft-a"), depends_on: [] } as PlanStep;
    const preview: PlanStep = { step_id: "preview-a", depends_on: ["draft-a"], enabled: true, title: { mode: "literal", value: "Preview", origin: "creator" }, note: null, time: null, capability: "prepare_preview", source_step_id: "draft-a", template_id: "template-a", template_config_snapshot: templateConfig as never };
    const distribution: PlanStep = { step_id: "x-dist", depends_on: ["draft-a", "preview-a"], enabled: true, title: { mode: "literal", value: "X post", origin: "creator" }, note: null, time: null, capability: "prepare_distribution", source_step_id: "draft-a", preview_step_id: "preview-a", distribution_group_id: "group-a", destination: "x", copy_title: { mode: "literal", value: "X post", origin: "creator" } };
    const relatedSource = createPlanningContextSource(mockPrisma({ templateCatalogSize: 4 }), { now: () => now });
    const withDistribution = await freshPlan(relatedSource, plan({ steps: [draft, preview, distribution], distribution_groups: [{ group_id: "group-a", source_step_id: "draft-a", preview_step_id: "preview-a", destination_step_ids: ["x-dist"] }] }));
    const distributionHandle = `node_${createHash("sha256").update(JSON.stringify({ binding: [creatorId, withDistribution.plan_id, withDistribution.revision, "x-dist"], v: 1 })).digest("hex").slice(0, 24)}`;
    const targeted = await relatedSource.buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot: withDistribution, targetHandleRefs: [{ handle: distributionHandle }], receivedAtUtc: now.toISOString() });
    expect(targeted.kind).toBe("ok");
    if (targeted.kind === "ok") expect(targeted.modelContext.templates.map(row => row.id)).toEqual(["template-a"]);
  });

  it("reconstructs revision-bound aliases across restarts and never gives raw step IDs to the model", async () => {
    const source = createPlanningContextSource(mockPrisma(), { now: () => now });
    const snapshot = await freshPlan(source);
    const input = { authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot, receivedAtUtc: now.toISOString() };
    const first = await source.buildRequestContext(input);
    const restarted = await createPlanningContextSource(mockPrisma(), { now: () => now }).buildRequestContext(input);
    expect(first.kind).toBe("ok"); expect(restarted.kind).toBe("ok");
    if (first.kind !== "ok" || restarted.kind !== "ok") return;
    const handle = first.modelContext.editable_nodes[0]!.handle;
    expect(handle).toMatch(/^node_[a-f0-9]{24}$/);
    expect(first.modelContext.editable_nodes.map(row => row.handle)).toEqual(restarted.modelContext.editable_nodes.map(row => row.handle));
    expect(first.handleMap.get(handle)).toEqual({ creatorId, planId: "plan-a", revision: 2, stepId: "step-a" });
    expect(first.modelContext.editable_nodes[0]!.time_origin).toBeNull();
    expect(JSON.stringify(first.modelContext)).not.toContain("step-a");
    const stale = await createPlanningContextSource(mockPrisma(), { now: () => now }).buildRequestContext({ ...input, snapshot: { ...snapshot, revision: 3 }, targetHandleRefs: [{ handle }] });
    expect(stale).toEqual({ kind: "conflict", code: "invalid_handle" });
  });

  it("derives read descriptors for up to 32 validated steps without model-context bounds", () => {
    const longTitle = { mode: "literal", value: "T".repeat(240), origin: "creator" } as const;
    const steps = Array.from({ length: 32 }, (_, index) => ({ ...draftStep(`read-step-${index}`), title: longTitle }));
    const result = derivePlanningEditDescriptors(plan({ steps }), creatorId);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.descriptors).toHaveLength(32);
      expect(result.descriptors[0]?.title).toHaveLength(240);
      expect(JSON.stringify(result.descriptors)).not.toContain("read-step-");
      expect(result.descriptors[0]).toEqual(expect.objectContaining({ handle: expect.stringMatching(/^node_[a-f0-9]{24}$/), capability: "prepare_post_draft" }));
    }
    expect(derivePlanningEditDescriptors(plan(), "creator-context-b")).toEqual({ kind: "conflict", code: "foreign_plan" });
    expect(derivePlanningEditDescriptors(plan({ steps: [...steps, { ...draftStep("read-step-over") }] }), creatorId)).toEqual({ kind: "conflict", code: "invalid_snapshot" });
  });

  it("requires narrow scope above eight editable items and accepts a current bounded target", async () => {
    const source = createPlanningContextSource(mockPrisma(), { now: () => now });
    const steps = Array.from({ length: 9 }, (_, i) => draftStep(`step-${i}`));
    const snapshot = await freshPlan(source, plan({ steps }));
    const broad = await source.buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot, receivedAtUtc: now.toISOString() });
    expect(broad).toMatchObject({ kind: "clarification", code: "narrow_edit_scope" });
    const alias = `node_${createHash("sha256").update(JSON.stringify({ binding: [creatorId, "plan-a", 2, "step-0"], v: 1 })).digest("hex").slice(0, 24)}`;
    const narrow = await source.buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot, targetHandleRefs: [{ handle: alias }], receivedAtUtc: now.toISOString() });
    expect(narrow).toMatchObject({ kind: "ok" });
    if (narrow.kind === "ok") expect(narrow.modelContext.editable_nodes).toHaveLength(1);
  });

  it("loads current template config independently and rejects stale snapshots", async () => {
    const preview: PlanStep = { step_id: "preview-a", depends_on: [], enabled: true, title: { mode: "literal", value: "Preview", origin: "creator" }, note: null, time: null, capability: "prepare_preview", source_step_id: "draft-a", template_id: "template-a", template_config_snapshot: templateConfig as never };
    const draft = { ...draftStep("draft-a"), depends_on: [] } as PlanStep;
    const withPreview = plan({ steps: [draft, { ...preview, depends_on: ["draft-a"] }] });
    const changed = { ...templateConfig, preset: "blur_outside" };
    const loaded = await createPlanningContextSource(mockPrisma({ templateConfig: changed }), { now: () => now }).loadContext(creatorId, withPreview);
    expect(validatePlanWithContext(withPreview, loaded.context)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "stale_template_config" })]) });
    const originalSource = createPlanningContextSource(mockPrisma(), { now: () => now });
    const fresh = await freshPlan(originalSource, withPreview);
    const stalePrompt = await createPlanningContextSource(mockPrisma({ templateConfig: changed }), { now: () => now }).buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot: fresh, receivedAtUtc: now.toISOString() });
    expect(stalePrompt).toEqual({ kind: "conflict", code: "stale_snapshot" });
  });

  it("uses a UTC structural date with no zone and emits no time confirmation provenance", async () => {
    const source = createPlanningContextSource(mockPrisma({ timezone: null }), { now: () => now });
    const snapshot = await freshPlan(source);
    const result = await source.buildRequestContext({ authenticatedCreatorId: creatorId, selectedMediaIds: [], selectedPostIds: [], snapshot, receivedAtUtc: now.toISOString() });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.requestClock).toEqual({ receivedAtUtc: now.toISOString(), timezone: null });
      expect(result.modelContext.creator_timezone).toBeNull();
      expect(result.modelContext.request_clock.local_date).toBe("2026-10-16");
      expect(result.modelContext.editable_nodes[0]!.time_origin).toBeNull();
    }
  });
});

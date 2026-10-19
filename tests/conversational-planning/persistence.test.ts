import { describe, expect, it, vi } from "vitest";
import { createConversationalPlanRepository, createConversationalPreparationRepository, type ConversationalPlanRepository, type PersistenceDb, type PlanRow, type RevisionRow } from "../../src/conversational-planning/persistence.js";
import { type PlanSnapshot, type PlanStep, type StepPointer, type TrustedPlanContext } from "../../src/conversational-planning/contract.js";
import { createPlanningContextSource } from "../../src/conversational-planning/context.js";

const creatorId = "creator-1";
const sourceRevision = "fp-v1";
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function snapshot(overrides: Partial<PlanSnapshot> = {}): PlanSnapshot {
  return {
    schema_version: 1, plan_id: "plan-1", creator_id: creatorId, revision: 0, review: "proposed",
    source: { kind: "existing_post", post_id: "post-1", selected_media_ids: ["media-1"], creative_work_id: null, creative_series_member_id: null, source_revision: sourceRevision },
    steps: [{ step_id: "step-1", capability: "prepare_post_draft", depends_on: [], enabled: true, title: { mode: "literal", value: "Title", origin: "creator" }, note: null, time: null, intended_destination: "patreon", source_media_ids: ["media-1"], target_post_id: null }],
    distribution_groups: [], unresolved_requests: [], clarifications: [], requested_text_quote: "Create a post", created_at: "2026-10-16T10:00:00.000Z", updated_at: "2026-10-16T10:00:00.000Z", ...overrides
  };
}
function trustedContext(plan: PlanSnapshot): TrustedPlanContext {
  const config = { schemaVersion: 1 as const, preset: "tight_crop" as const, aspectKey: "1:1" as const, compositionId: null, compositionProps: null, compositionVariantIndex: null, overlayDoc: {}, templateOptions: {}, destination: { selectedDestinationId: "x", customDestinationUrl: null } };
  const hasPreview = plan.steps.some(step => step.capability === "prepare_preview");
  return { authenticatedCreatorId: creatorId, ownedMediaIds: new Set(["media-1"]), sourceMediaRelations: new Map([["media-1", { post_ids: new Set(["post-1"]), creative_work_ids: new Set(), creative_series_member_ids: new Set() }]]), ownedPostIds: new Set(["post-1"]), ownedTemplateIds: new Set(hasPreview ? ["template-1"] : []), ownedCreativeWorkIds: new Set(), ownedCreativeSeriesMemberIds: new Set(), verifiedSeriesMemberPartLabels: new Map(), currentTemplateConfigs: new Map(hasPreview ? [["template-1", config]] : []), connectedDestinations: new Set(["patreon", "x"]), hasAutopostEntitlement: true, currentSourceRevision: plan.source.source_revision, ownedTargetPostIds: new Set(["post-1"]) };
}
function xDistributionSnapshot(): PlanSnapshot {
  const base = snapshot();
  const draft = base.steps[0]!;
  const title = { mode: "literal" as const, value: "Original X teaser copy", origin: "creator" as const };
  return { ...base, plan_id: "plan-x", steps: [draft, { step_id: "preview-1", capability: "prepare_preview", depends_on: [draft.step_id], enabled: true, title, note: null, time: null, source_step_id: draft.step_id, template_id: "template-1", template_config_snapshot: { schemaVersion: 1, preset: "tight_crop", aspectKey: "1:1", compositionId: null, compositionProps: null, compositionVariantIndex: null, overlayDoc: {}, templateOptions: {}, destination: { selectedDestinationId: "x", customDestinationUrl: null } } }, { step_id: "dist-1", capability: "prepare_distribution", depends_on: [draft.step_id, "preview-1"], enabled: true, title, note: null, time: null, source_step_id: draft.step_id, preview_step_id: "preview-1", distribution_group_id: "group-1", destination: "x", copy_title: title }], distribution_groups: [{ group_id: "group-1", source_step_id: draft.step_id, preview_step_id: "preview-1", destination_step_ids: ["dist-1"] }] };
}
function xHandoffSnapshot(): PlanSnapshot {
  const plan = xDistributionSnapshot();
  const handoff: PlanStep = { step_id: "handoff-1", capability: "publish_handoff", depends_on: ["dist-1"], enabled: true, title: { mode: "literal", value: "Publish X", origin: "creator" }, note: null, time: null, distribution_step_id: "dist-1", destination: "x" };
  const engagement: PlanStep = { step_id: "engagement-1", capability: "engagement_check", depends_on: [handoff.step_id], enabled: true, title: { mode: "literal", value: "Check replies", origin: "creator" }, note: null, time: { kind: "after_publication_calendar_days", anchor_step_id: handoff.step_id, day_offset: 1, timezone: "Europe/London", local_time: "10:00" }, publication_step_id: handoff.step_id, destination: "x", target_post_id: null };
  return { ...plan, steps: [...plan.steps, handoff, engagement] };
}
async function createApproved(repo: ConversationalPlanRepository, plan: PlanSnapshot) {
  await repo.create({ ...createMutation(), snapshot: plan });
  const result = await repo.approve({ creatorId, clientMutationKey: `approve-${plan.plan_id}`, command: { operation: "approve", planId: plan.plan_id, baseRevision: 0 } });
  if (result.kind !== "ok") throw new Error(`Could not approve pointer fixture: ${result.kind}`);
}

type State = { plans: PlanRow[]; revisions: RevisionRow[]; tenant: boolean; pointers: Record<string, unknown>[]; drafts: Record<string, unknown>[]; posts: Record<string, unknown>[]; distributionPlans: Record<string, unknown>[]; variants: Record<string, unknown>[]; attempts: Record<string, unknown>[] };
type FakeOptions = { loseCas?: boolean; losePointerLock?: boolean; throwOn?: "plan_find_first" | "tenant"; failRevisionInsert?: (rootState: State, attempted: RevisionRow) => void; failPointerInsert?: (rootState: State, attempted: Record<string, unknown>) => void };
const pointerSlotOrder = ["draft", "attention_event", "relay_post", "preview_media", "distribution_plan", "variant", "current_attempt", "engagement_event"];
function fakeDb(seed: Partial<State> = {}, options: FakeOptions = {}) {
  let state: State = { plans: [], revisions: [], tenant: true, pointers: [], drafts: [], posts: [], distributionPlans: [], variants: [], attempts: [], ...seed };
  let serial = 0;
  const make = (s: State): PersistenceDb => {
    const plan = {
      async findUnique(args: Record<string, unknown>) { return plan.findFirst(args); },
      async findFirst(args: Record<string, unknown>) { if (options.throwOn === "plan_find_first") throw new Error("database unavailable"); const w = args.where as Record<string, unknown>; return s.plans.find(x => Object.entries(w).every(([k, v]) => (x as unknown as Record<string, unknown>)[k] === v)) ?? null; },
      async findMany(args: Record<string, unknown>) {
        const w = args.where as Record<string, unknown>;
        let rows = s.plans.filter(x => x.creatorId === w.creatorId);
        if (Array.isArray(w.OR)) rows = rows.filter(row => (w.OR as Record<string, unknown>[]).some(or => {
          if (isRecord(or.updatedAt) && !(or.updatedAt instanceof Date)) return new Date(row.updatedAt).getTime() < new Date(or.updatedAt.lt as string | number | Date).getTime();
          return new Date(row.updatedAt).getTime() === new Date(or.updatedAt as string | number | Date).getTime() && row.id < (or.id as Record<string, string>).lt;
        }));
        rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id.localeCompare(a.id));
        return rows.slice(0, args.take as number);
      },
      async create(args: Record<string, unknown>) { const row = args.data as PlanRow; if (s.plans.some(x => x.creatorId === row.creatorId && x.clientCreateKey === row.clientCreateKey)) throw Object.assign(new Error("unique"), { code: "P2002" }); s.plans.push(structuredClone(row)); return row; },
      async updateMany(args: Record<string, unknown>) { const w = args.where as Record<string, unknown>, row = s.plans.find(x => x.id === w.id && x.creatorId === w.creatorId && x.revision === w.revision); if (options.loseCas || !row) return { count: 0 }; Object.assign(row, args.data); return { count: 1 }; }
    };
    const revision = {
      async findUnique(args: Record<string, unknown>) { return revision.findFirst(args); },
      async findFirst(args: Record<string, unknown>) { const w = args.where as Record<string, unknown>; return s.revisions.find(x => Object.entries(w).every(([k, v]) => (x as unknown as Record<string, unknown>)[k] === v)) ?? null; },
      async findMany(args: Record<string, unknown>) { const found = await revision.findFirst(args); return found ? [found] : []; },
      async create(args: Record<string, unknown>) { const row = { id: `revision-${++serial}`, ...(args.data as Omit<RevisionRow, "id">) } as RevisionRow; if (s.revisions.some(x => (x.creatorId === row.creatorId && x.clientMutationKey === row.clientMutationKey) || (x.planId === row.planId && x.revision === row.revision))) throw Object.assign(new Error("unique"), { code: "P2002" }); if (row.revision > 0 && options.failRevisionInsert) { options.failRevisionInsert(state, row); throw Object.assign(new Error("unique revision race"), { code: "P2002" }); } s.revisions.push(structuredClone(row)); return row; }
    };
    const pointers = {
      async findFirst(args: Record<string, unknown>) { const w = args.where as Record<string, unknown>; return s.pointers.find(p => Object.entries(w).every(([k, v]) => (p as Record<string, unknown>)[k] === v)) ?? null; },
      async findMany(args: Record<string, unknown>) { const w = args.where as Record<string, unknown>; const rows = s.pointers.filter(p => Object.entries(w).every(([k, v]) => (p as Record<string, unknown>)[k] === v)); const order = args.orderBy as Record<string, "asc" | "desc">[] | undefined; if (order) rows.sort((a, b) => { for (const item of order) { const [field, direction] = Object.entries(item)[0]!; const aValue = (a as Record<string, unknown>)[field], bValue = (b as Record<string, unknown>)[field]; const cmp = field === "slot" ? pointerSlotOrder.indexOf(String(aValue)) - pointerSlotOrder.indexOf(String(bValue)) : String(aValue).localeCompare(String(bValue)); if (cmp) return direction === "asc" ? cmp : -cmp; } return 0; }); return rows; },
      async create(args: Record<string, unknown>) { const row: Record<string, unknown> = { id: `pointer-${s.pointers.length + 1}`, createdAt: new Date(), ...(args.data as Record<string, unknown>) }; if (s.pointers.some(p => p.planId === row.planId && p.nodeId === row.nodeId && p.slot === row.slot)) throw Object.assign(new Error("unique pointer"), { code: "P2002" }); if (options.failPointerInsert) { options.failPointerInsert(state, row); throw Object.assign(new Error("pointer unique race"), { code: "P2002" }); } s.pointers.push(structuredClone(row)); return row; }
    };
    const authorityDelegate = (rows: Record<string, unknown>[]) => ({ async findFirst(args: Record<string, unknown>) { const where = args.where as Record<string, unknown>; return rows.find(row => Object.entries(where).every(([k, v]) => row[k] === v)) ?? null; } });
    return {
      tenant: { async findFirst() { if (options.throwOn === "tenant") throw new Error("tenant query unavailable"); return s.tenant ? { id: "tenant-1" } : null; } },
      creatorConversationalPlan: plan,
      creatorConversationalPlanRevision: revision,
      creatorConversationalPlanPointer: pointers,
      autopostDraft: authorityDelegate(s.drafts),
      creatorScheduleEvent: authorityDelegate([]),
      post: authorityDelegate(s.posts),
      postDistributionPlan: authorityDelegate(s.distributionPlans),
      postDistributionVariant: authorityDelegate(s.variants),
      postDistributionAttempt: authorityDelegate(s.attempts),
      async $queryRaw() { return options.losePointerLock ? [] : [{ id: "plan-1" }]; },
      async $transaction<T>(work: (tx: PersistenceDb) => Promise<T>): Promise<T> { const staged = structuredClone(s); const result = await work(make(staged)); s.plans = staged.plans; s.revisions = staged.revisions; s.tenant = staged.tenant; s.pointers = staged.pointers; s.drafts = staged.drafts; s.posts = staged.posts; s.distributionPlans = staged.distributionPlans; s.variants = staged.variants; s.attempts = staged.attempts; return result; }
    } as unknown as PersistenceDb;
  };
  const db = make(state);
  return { db, state: () => state, repository: (fingerprint = sourceRevision) => createConversationalPlanRepository(db, async (_id, plan) => ({ context: { ...trustedContext(plan), currentSourceRevision: fingerprint }, sourceFingerprint: fingerprint })) };
}
function planRow(id: string, updatedAt = "2026-10-16T10:00:00.000Z", owner = creatorId): PlanRow {
  const plan = snapshot({ plan_id: id, creator_id: owner, created_at: updatedAt, updated_at: updatedAt });
  return { id, creatorId: owner, schemaVersion: 1, revision: 0, review: "proposed", sourceRef: plan.source, snapshot: plan, clientCreateKey: `create-${id}`, createdAt: new Date(updatedAt), updatedAt: new Date(updatedAt) };
}

const createMutation = (key = "key-create") => ({ creatorId, clientMutationKey: key, command: { operation: "create" as const, latestRequest: "Create a post", selectedPostIds: ["post-1"], selectedMediaIds: ["media-1"] } });

describe("bounded conversational plan persistence", () => {
  it("creates atomically and same-key create replay returns recorded and current revision", async () => {
    const f = fakeDb(), repo = f.repository(), initial = snapshot();
    const created = await repo.create({ ...createMutation(), snapshot: initial });
    expect(created).toMatchObject({ kind: "ok", recordedRevision: 0 });
    const approved = await repo.approve({ creatorId, clientMutationKey: "key-approve", command: { operation: "approve", planId: "plan-1", baseRevision: 0 } });
    expect(approved).toMatchObject({ kind: "ok", recordedRevision: 1, current: { review: "approved_for_preparation" } });
    const replay = await repo.lookupReplay(createMutation());
    expect(replay).toMatchObject({ kind: "replay", recordedRevision: 0, current: { revision: 1 } });
    expect(f.state().revisions).toHaveLength(2);
  });

  it("rejects changed hashes and create/revise key collisions", async () => {
    const f = fakeDb(), repo = f.repository();
    await repo.create({ ...createMutation(), snapshot: snapshot() });
    expect(await repo.lookupReplay({ ...createMutation(), command: { ...createMutation().command, latestRequest: "Different request" } })).toEqual({ kind: "idempotency_conflict" });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "key-create", command: { operation: "approve", planId: "plan-1", baseRevision: 0 } })).toEqual({ kind: "idempotency_conflict" });
  });

  it("replays an AI revision from its original request after later revisions without re-running against the stale base", async () => {
    const f = fakeDb(), repo = f.repository(), initial = snapshot();
    await repo.create({ ...createMutation(), snapshot: initial });
    const original = { creatorId, clientMutationKey: "ai-original", command: { operation: "revise_ai" as const, planId: "plan-1", baseRevision: 0, latestRequest: "Change the draft note", selectedPostIds: ["post-1"], selectedMediaIds: ["media-1"], targetHandleRefs: [{ handle: "draft-handle" }] } };
    const firstCandidate = structuredClone(initial); firstCandidate.revision = 1; firstCandidate.steps[0]!.note = "First compiled result";
    const first = await repo.revise({ ...original, candidate: firstCandidate });
    expect(first).toMatchObject({ kind: "ok", recordedRevision: 1 });
    const laterCommand = { creatorId, clientMutationKey: "ai-later", command: { ...original.command, baseRevision: 1, latestRequest: "Change the title instead", targetHandleRefs: [{ handle: "new-draft-handle" }] } };
    const laterCandidate = structuredClone(firstCandidate); laterCandidate.revision = 2; laterCandidate.steps[0]!.title = { mode: "literal", value: "Later revision", origin: "creator" };
    expect(await repo.revise({ ...laterCommand, candidate: laterCandidate })).toMatchObject({ kind: "ok", recordedRevision: 2 });
    const replay = await repo.revise({ ...original, candidate: firstCandidate });
    expect(replay).toMatchObject({ kind: "ok", recordedRevision: 1, current: { revision: 2, steps: [{ note: "First compiled result", title: { value: "Later revision" } }] } });
    expect(f.state().revisions).toHaveLength(3);
    expect(await repo.lookupReplay({ ...original, command: { ...original.command, targetHandleRefs: [{ handle: "changed-handle" }] } })).toEqual({ kind: "idempotency_conflict" });
  });

  it("normalizes omitted and empty target-handle references to the same AI request identity", async () => {
    const f = fakeDb(), repo = f.repository(), initial = snapshot();
    await repo.create({ ...createMutation(), snapshot: initial });
    const command = { operation: "revise_ai" as const, planId: "plan-1", baseRevision: 0, latestRequest: "Change the note", selectedPostIds: ["post-1"], selectedMediaIds: ["media-1"] };
    const candidate = structuredClone(initial); candidate.revision = 1; candidate.steps[0]!.note = "Updated";
    await repo.revise({ creatorId, clientMutationKey: "ai-empty-handles", command, candidate });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "ai-empty-handles", command: { ...command, targetHandleRefs: [] } })).toMatchObject({ kind: "replay", recordedRevision: 1 });
  });

  it("preserves hardcoded pre-amendment v1 hashes for omitted and empty template selections", async () => {
    const f = fakeDb(), repo = f.repository(), initial = snapshot();
    const create = createMutation();
    await repo.create({ ...create, snapshot: initial });
    expect(f.state().revisions[0]?.requestHash).toBe("313b33abc6f3ec8f7faba6e06739bb44608855b6f570a56b7f7b141224ea000c");
    expect(await repo.lookupReplay({ ...create, command: { ...create.command, selectedTemplateIds: [] } })).toMatchObject({ kind: "replay", recordedRevision: 0 });

    const command = { operation: "revise_ai" as const, planId: "plan-1", baseRevision: 0, latestRequest: "Change the note", selectedPostIds: ["post-1"], selectedMediaIds: ["media-1"] };
    const candidate = structuredClone(initial); candidate.revision = 1; candidate.steps[0]!.note = "Updated";
    await repo.revise({ creatorId, clientMutationKey: "ai-template-v1", command, candidate });
    expect(f.state().revisions[1]?.requestHash).toBe("7c9d1eb602ff2b7901b427f05db4c9fe678a3923945986ef2475da79d527c398");
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "ai-template-v1", command: { ...command, selectedTemplateIds: [] } })).toMatchObject({ kind: "replay", recordedRevision: 1 });
  });

  it("hashes selected template IDs in exact declared order for create and AI revise", async () => {
    const f = fakeDb(), repo = f.repository(), initial = snapshot();
    const command = { ...createMutation().command, selectedTemplateIds: ["template-a", "template-b"] };
    await repo.create({ creatorId, clientMutationKey: "create-with-templates", command, snapshot: initial });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "create-with-templates", command })).toMatchObject({ kind: "replay", recordedRevision: 0 });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "create-with-templates", command: { ...command, selectedTemplateIds: ["template-b", "template-a"] } })).toEqual({ kind: "idempotency_conflict" });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "create-with-templates", command: { ...command, selectedTemplateIds: ["template-c"] } })).toEqual({ kind: "idempotency_conflict" });

    const aiCommand = { operation: "revise_ai" as const, planId: "plan-1", baseRevision: 0, latestRequest: "Change the note", selectedPostIds: ["post-1"], selectedMediaIds: ["media-1"], selectedTemplateIds: ["template-a", "template-b"] };
    const candidate = structuredClone(initial); candidate.revision = 1; candidate.steps[0]!.note = "Updated";
    await repo.revise({ creatorId, clientMutationKey: "ai-with-templates", command: aiCommand, candidate });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "ai-with-templates", command: aiCommand })).toMatchObject({ kind: "replay", recordedRevision: 1 });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "ai-with-templates", command: { ...aiCommand, selectedTemplateIds: ["template-b", "template-a"] } })).toEqual({ kind: "idempotency_conflict" });
  });

  it("rejects invalid template selections and does not widen manual or review commands", async () => {
    const repo = fakeDb().repository();
    const baseCreate = createMutation().command;
    const invalidCommands = [
      { ...baseCreate, selectedTemplateIds: ["template-a", "template-a"] },
      { ...baseCreate, selectedTemplateIds: ["template-a", "template-b", "template-c", "template-d"] },
      { ...baseCreate, selectedTemplateIds: [" template-a"] },
      { ...baseCreate, selectedTemplateIds: ["x".repeat(161)] },
      { ...baseCreate, unexpected: true }
    ];
    for (const command of invalidCommands) expect(await repo.lookupReplay({ creatorId, clientMutationKey: "invalid-create", command } as never)).toMatchObject({ kind: "invalid_snapshot", code: "invalid_command" });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "manual-extra", command: { operation: "revise_manual", planId: "plan-1", baseRevision: 0, patch: [{ step_id: "step-1", field: "enabled", value: true }], selectedTemplateIds: ["template-a"] } as never })).toMatchObject({ kind: "invalid_snapshot", code: "invalid_command" });
    expect(await repo.lookupReplay({ creatorId, clientMutationKey: "review-extra", command: { operation: "approve", planId: "plan-1", baseRevision: 0, selectedTemplateIds: [] } as never })).toMatchObject({ kind: "invalid_snapshot", code: "invalid_command" });
  });

  it("rolls back a failed revision insert and re-reads a concurrent same-key winner", async () => {
    const base = fakeDb(), baseRepo = base.repository();
    await baseRepo.create({ ...createMutation(), snapshot: snapshot() });
    const seed = structuredClone(base.state());
    const winner = fakeDb(seed), winnerRepo = winner.repository();
    const mutation = { creatorId, clientMutationKey: "approve-race", command: { operation: "approve" as const, planId: "plan-1", baseRevision: 0 } };
    await winnerRepo.approve(mutation);
    const contender = fakeDb(seed, { failRevisionInsert(root) { root.plans = structuredClone(winner.state().plans); root.revisions = structuredClone(winner.state().revisions); } });
    const result = await contender.repository().approve(mutation);
    expect(result).toMatchObject({ kind: "ok", recordedRevision: 1, current: { revision: 1, review: "approved_for_preparation" } });
    expect(contender.state().plans[0]?.revision).toBe(1);
    expect(contender.state().revisions).toHaveLength(2);
  });

  it("rolls back on a unique-key race with a different winner hash", async () => {
    const base = fakeDb();
    await base.repository().create({ ...createMutation(), snapshot: snapshot() });
    const seed = structuredClone(base.state()), winner = fakeDb(seed), winnerRepo = winner.repository();
    await winnerRepo.cancel({ creatorId, clientMutationKey: "shared-review-key", command: { operation: "cancel", planId: "plan-1", baseRevision: 0 } });
    const contender = fakeDb(seed, { failRevisionInsert(root) { root.plans = structuredClone(winner.state().plans); root.revisions = structuredClone(winner.state().revisions); } });
    const result = await contender.repository().approve({ creatorId, clientMutationKey: "shared-review-key", command: { operation: "approve", planId: "plan-1", baseRevision: 0 } });
    expect(result).toEqual({ kind: "idempotency_conflict" });
    expect(contender.state().plans[0]?.review).toBe("cancelled");
    expect(contender.state().revisions).toHaveLength(2);
  });

  it("surfaces database outages instead of classifying them as missing plans", async () => {
    const planFailure = fakeDb({}, { throwOn: "plan_find_first" });
    await expect(planFailure.repository().get(creatorId, "plan-1")).rejects.toThrow("database unavailable");
    const tenantFailure = fakeDb({}, { throwOn: "tenant" });
    await expect(tenantFailure.repository().get(creatorId, "plan-1")).rejects.toThrow("tenant query unavailable");
  });

  it("scopes get/list by creator and paginates equal update times by descending id", async () => {
    const rows = ["plan-a", "plan-b", "plan-c", "plan-d"].map(id => planRow(id));
    const f = fakeDb({ plans: rows }), repo = f.repository();
    expect(await repo.get("creator-2", "plan-a")).toEqual({ kind: "not_found" });
    expect(await repo.listCurrent("creator-2", { limit: 2 })).toMatchObject({ kind: "ok", items: [], nextCursor: null });
    const firstPage = await repo.listCurrent(creatorId, { limit: 2 });
    expect(firstPage).toMatchObject({ kind: "ok", items: [{ plan_id: "plan-d" }, { plan_id: "plan-c" }], nextCursor: { updatedAt: "2026-10-16T10:00:00.000Z", id: "plan-c" } });
    if (firstPage.kind !== "ok" || !firstPage.nextCursor) throw new Error("Expected second page cursor");
    const secondPage = await repo.listCurrent(creatorId, { limit: 2, cursor: firstPage.nextCursor });
    expect(secondPage).toMatchObject({ kind: "ok", items: [{ plan_id: "plan-b" }, { plan_id: "plan-a" }], nextCursor: null });
  });

  it("rejects AI revisions after approval/cancellation and rejects any source projection change at the same fingerprint", async () => {
    for (const transition of ["approve", "cancel"] as const) {
      const f = fakeDb(), repo = f.repository(), initial = snapshot();
      await repo.create({ ...createMutation(), snapshot: initial });
      if (transition === "approve") await repo.approve({ creatorId, clientMutationKey: "review-approve", command: { operation: "approve", planId: "plan-1", baseRevision: 0 } });
      else await repo.cancel({ creatorId, clientMutationKey: "review-cancel", command: { operation: "cancel", planId: "plan-1", baseRevision: 0 } });
      const candidate = structuredClone(initial); candidate.revision = 2; candidate.steps[0]!.note = "Should not be accepted";
      const result = await repo.revise({ creatorId, clientMutationKey: `ai-after-${transition}`, command: { operation: "revise_ai", planId: "plan-1", baseRevision: 1, latestRequest: "Change note", selectedPostIds: ["post-1"], selectedMediaIds: ["media-1"] }, candidate });
      expect(result).toMatchObject({ kind: "invalid_snapshot", code: "revision_identity_mismatch" });
    }
    const f = fakeDb(), repo = f.repository(), initial = snapshot();
    await repo.create({ ...createMutation(), snapshot: initial });
    const candidate = structuredClone(initial); candidate.revision = 1; candidate.source.post_id = "post-2";
    expect(await repo.revise({ creatorId, clientMutationKey: "ai-source-change", command: { operation: "revise_ai", planId: "plan-1", baseRevision: 0, latestRequest: "Change note", selectedPostIds: ["post-1"], selectedMediaIds: ["media-1"] }, candidate })).toMatchObject({ kind: "invalid_snapshot", code: "revision_identity_mismatch" });
  });

  it("applies exact sparse manual edits and preserves sibling steps", async () => {
    const second = { ...snapshot().steps[0]!, step_id: "step-2", title: { mode: "literal" as const, value: "Sibling", origin: "creator" as const } };
    const f = fakeDb(), repo = f.repository(), initial = snapshot({ steps: [snapshot().steps[0]!, second] });
    await repo.create({ ...createMutation(), snapshot: initial });
    const candidate = structuredClone(initial); candidate.revision = 1; candidate.steps[0]!.title = { mode: "literal", value: "Edited", origin: "creator" };
    const result = await repo.revise({ creatorId, clientMutationKey: "manual-1", command: { operation: "revise_manual", planId: "plan-1", baseRevision: 0, patch: [{ step_id: "step-1", field: "title", value: { mode: "literal", value: "Edited", origin: "creator" } }] }, candidate });
    expect(result).toMatchObject({ kind: "ok", current: { revision: 1 } });
    if (result.kind === "ok") expect(result.current.steps[1]?.title).toEqual(second.title);
  });

  it("updates X distribution display and copy together, then preserves copy on a later note edit", async () => {
    const f = fakeDb(), repo = f.repository(), initial = xDistributionSnapshot();
    await repo.create({ ...createMutation(), snapshot: initial });
    const editedTitle = { mode: "literal" as const, value: "Revised X copy", origin: "creator" as const };
    const first = structuredClone(initial); first.revision = 1;
    const firstDist = first.steps.find(step => step.step_id === "dist-1");
    if (!firstDist || firstDist.capability !== "prepare_distribution") throw new Error("Expected X distribution step");
    firstDist.title = editedTitle; firstDist.copy_title = editedTitle;
    const edit = await repo.revise({ creatorId, clientMutationKey: "manual-title", command: { operation: "revise_manual", planId: "plan-x", baseRevision: 0, patch: [{ step_id: "dist-1", field: "title", value: editedTitle }] }, candidate: first });
    expect(edit.kind).toBe("ok");
    const second = structuredClone(first); second.revision = 2; second.steps[2]!.note = "Keep this note";
    const later = await repo.revise({ creatorId, clientMutationKey: "manual-note", command: { operation: "revise_manual", planId: "plan-x", baseRevision: 1, patch: [{ step_id: "dist-1", field: "note", value: "Keep this note" }] }, candidate: second });
    expect(later).toMatchObject({ kind: "ok", current: { revision: 2 } });
    if (later.kind === "ok") {
      const laterDist = later.current.steps.find(step => step.step_id === "dist-1");
      expect(laterDist).toMatchObject({ capability: "prepare_distribution", title: editedTitle, copy_title: editedTitle, note: "Keep this note" });
    }
  });

  it("does not retry a lost CAS and reports missing tenant or stale source clearly", async () => {
    const absent = fakeDb({ tenant: false });
    expect(await absent.repository().create({ ...createMutation(), snapshot: snapshot() })).toEqual({ kind: "creator_not_provisioned" });
    const stale = fakeDb();
    expect(await stale.repository("new-fp").create({ ...createMutation(), snapshot: snapshot() })).toMatchObject({ kind: "stale_source" });
  });

  it("reports a zero-row CAS as a conflict without inserting history", async () => {
    const f = fakeDb({}, { loseCas: true }), repo = f.repository();
    await repo.create({ ...createMutation(), snapshot: snapshot() });
    const result = await repo.approve({ creatorId, clientMutationKey: "approve-cas", command: { operation: "approve", planId: "plan-1", baseRevision: 0 } });
    expect(result).toMatchObject({ kind: "revision_conflict", current: { revision: 0 } });
    expect(f.state().revisions).toHaveLength(1);
  });

  it("keeps cancellation a composition review transition and rejects later approval", async () => {
    const f = fakeDb(), repo = f.repository();
    await repo.create({ ...createMutation(), snapshot: snapshot() });
    const cancelled = await repo.cancel({ creatorId, clientMutationKey: "cancel-1", command: { operation: "cancel", planId: "plan-1", baseRevision: 0 } });
    expect(cancelled).toMatchObject({ kind: "ok", recordedRevision: 1, current: { review: "cancelled" } });
    expect(await repo.approve({ creatorId, clientMutationKey: "approve-after-cancel", command: { operation: "approve", planId: "plan-1", baseRevision: 1 } })).toMatchObject({ kind: "revision_conflict" });
    expect(await repo.cancel({ creatorId, clientMutationKey: "cancel-1", command: { operation: "cancel", planId: "plan-1", baseRevision: 0 } })).toMatchObject({ kind: "ok", recordedRevision: 1, current: { review: "cancelled" } });
  });

  it("fails closed when an existing pointer cannot yet be checked", async () => {
    const f = fakeDb({ pointers: [{ planId: "plan-1", creatorId }] }), repo = f.repository();
    await repo.create({ ...createMutation(), snapshot: snapshot() });
    expect(await repo.get(creatorId, "plan-1")).toMatchObject({ kind: "authority_gap" });
  });

  it("writes and rereads every supported slot only after checking exact live ownership and parent links", async () => {
    const plan = xHandoffSnapshot();
    const f = fakeDb({
      drafts: [{ id: "draft-1", creatorId, conversationalStepKey: "plan:plan-x:step:step-1", publishedPostId: null }],
      posts: [{ id: "post-1", creatorId }],
      distributionPlans: [{ id: "distribution-1", creatorId, conversationalGroupKey: "plan:plan-x:group:group-1", postId: "post-1", sourceDraftId: "draft-1" }],
      variants: [{ id: "variant-1", creatorId, planId: "distribution-1", postId: "post-1", destination: "x" }],
      attempts: [{ id: "attempt-1", creatorId, variantId: "variant-1", postId: "post-1", destination: "x" }]
    });
    const repo = f.repository();
    await createApproved(repo, plan);
    const pointers: StepPointer[] = [
      { node_id: "step-1", slot: "draft", kind: "autopost_draft", authority_id: "draft-1" },
      { node_id: "step-1", slot: "relay_post", kind: "relay_post", authority_id: "post-1" },
      { node_id: "group-1", slot: "distribution_plan", kind: "distribution_plan", authority_id: "distribution-1" },
      { node_id: "dist-1", slot: "variant", kind: "distribution_variant", authority_id: "variant-1" },
      { node_id: "handoff-1", slot: "current_attempt", kind: "distribution_attempt", authority_id: "attempt-1" }
    ];
    for (const pointer of pointers) expect((await repo.putCheckedPointer(creatorId, plan.plan_id, pointer)).kind).toBe("ok");
    expect(await repo.putCheckedPointer(creatorId, plan.plan_id, pointers[0]!)).toMatchObject({ kind: "ok", pointer: pointers[0] });
    const checked = await repo.listCheckedPointers(creatorId, plan.plan_id);
    const sortedPointers = [...pointers].sort((a, b) => a.node_id.localeCompare(b.node_id) || pointerSlotOrder.indexOf(a.slot) - pointerSlotOrder.indexOf(b.slot));
    expect(checked).toMatchObject({ kind: "ok", pointers: sortedPointers });
    const read = await repo.get(creatorId, plan.plan_id);
    expect(read).toMatchObject({ kind: "ok", current: { revision: 1, review: "approved_for_preparation" }, pointers: sortedPointers });
    expect(f.state().plans[0]?.revision).toBe(1); // Pointer writes do not advance the composition revision.
    expect(await repo.putCheckedPointer(creatorId, plan.plan_id, { ...pointers[4]!, authority_id: "attempt-replacement" })).toMatchObject({ kind: "pointer_conflict", code: "occupied_slot_immutable" });
    expect(await repo.cancel({ creatorId, clientMutationKey: "cancel-with-pointers", command: { operation: "cancel", planId: plan.plan_id, baseRevision: 1 } })).toMatchObject({ kind: "ok", current: { revision: 2, review: "cancelled" }, pointers: sortedPointers });
    expect(await repo.listCheckedPointers(creatorId, plan.plan_id)).toMatchObject({ kind: "ok", pointers: sortedPointers });
  });

  it("rejects unapproved pointers, group/step misuse, foreign and missing authorities, and reassignment", async () => {
    const plan = xDistributionSnapshot();
    const draft = { id: "draft-1", creatorId, conversationalStepKey: "plan:plan-x:step:step-1", publishedPostId: null };
    const draftPointer: StepPointer = { node_id: "step-1", slot: "draft", kind: "autopost_draft", authority_id: "draft-1" };
    const proposed = fakeDb({ drafts: [draft] }), proposedRepo = proposed.repository();
    await proposedRepo.create({ ...createMutation(), snapshot: plan });
    expect(await proposedRepo.putCheckedPointer(creatorId, plan.plan_id, draftPointer)).toMatchObject({ kind: "revision_conflict", code: "plan_not_approved" });

    const approved = fakeDb({ drafts: [draft] }), repo = approved.repository();
    await createApproved(repo, plan);
    expect(await repo.putCheckedPointer(creatorId, plan.plan_id, { node_id: "step-1", slot: "distribution_plan", kind: "distribution_plan", authority_id: "dp-1" })).toMatchObject({ kind: "authority_gap", code: "distribution_plan_group_mismatch" });
    expect(await repo.putCheckedPointer(creatorId, plan.plan_id, draftPointer)).toMatchObject({ kind: "ok" });
    expect(await repo.putCheckedPointer(creatorId, plan.plan_id, { ...draftPointer, authority_id: "draft-foreign" })).toMatchObject({ kind: "pointer_conflict", code: "occupied_slot_immutable" });

    const foreign = fakeDb({ drafts: [{ ...draft, creatorId: "creator-2" }] }), foreignRepo = foreign.repository();
    await createApproved(foreignRepo, plan);
    expect(await foreignRepo.putCheckedPointer(creatorId, plan.plan_id, draftPointer)).toMatchObject({ kind: "authority_gap", code: "draft_owner_or_correlation_mismatch" });
    const missing = fakeDb(), missingRepo = missing.repository();
    await createApproved(missingRepo, plan);
    expect(await missingRepo.putCheckedPointer(creatorId, plan.plan_id, draftPointer)).toMatchObject({ kind: "authority_gap", code: "draft_owner_or_correlation_mismatch" });
  });

  it("rejects wrong distribution parent/destination and stale stored pointers", async () => {
    const plan = xDistributionSnapshot();
    const badVariant = fakeDb({ posts: [{ id: "post-1", creatorId }], distributionPlans: [{ id: "distribution-1", creatorId, conversationalGroupKey: "plan:plan-x:group:group-1", postId: "post-1", sourceDraftId: null }], variants: [{ id: "variant-1", creatorId, planId: "distribution-1", postId: "post-1", destination: "patreon" }] });
    const repo = badVariant.repository(); await createApproved(repo, plan);
    const groupPointer: StepPointer = { node_id: "group-1", slot: "distribution_plan", kind: "distribution_plan", authority_id: "distribution-1" };
    await repo.putCheckedPointer(creatorId, plan.plan_id, groupPointer);
    expect(await repo.putCheckedPointer(creatorId, plan.plan_id, { node_id: "dist-1", slot: "variant", kind: "distribution_variant", authority_id: "variant-1" })).toMatchObject({ kind: "authority_gap", code: "variant_parent_or_destination_mismatch" });

    const stalePointer = { id: "ptr-1", planId: "plan-1", creatorId, nodeId: "step-1", slot: "draft", authorityKind: "autopost_draft", authorityId: "gone", createdAt: new Date() };
    const stale = fakeDb({ plans: [planRow("plan-1", "2026-10-16T10:00:00.000Z")], pointers: [stalePointer] });
    expect(await stale.repository().get(creatorId, "plan-1")).toMatchObject({ kind: "authority_gap", code: "draft_owner_or_correlation_mismatch" });
  });

  it("keeps preview provenance and uncorrelated schedule pointers as explicit gaps on inserts and reads", async () => {
    const plan = xHandoffSnapshot(), f = fakeDb(), repo = f.repository();
    await createApproved(repo, plan);
    const gaps: Array<[StepPointer, string]> = [
      [{ node_id: "preview-1", slot: "preview_media", kind: "preview_media", authority_id: "media-1" }, "preview_export_provenance_unaccepted"],
      [{ node_id: "step-1", slot: "attention_event", kind: "schedule_event", authority_id: "event-1" }, "attention_event_owner_or_correlation_mismatch"],
      [{ node_id: "engagement-1", slot: "engagement_event", kind: "schedule_event", authority_id: "event-2" }, "schedule_event_mapping_unaccepted"]
    ];
    for (const [pointer, code] of gaps) expect(await repo.putCheckedPointer(creatorId, plan.plan_id, pointer)).toMatchObject({ kind: "authority_gap", code });
    for (const [pointer] of gaps) {
      f.state().pointers.push({ id: `read-${pointer.slot}`, planId: plan.plan_id, creatorId, nodeId: pointer.node_id, slot: pointer.slot, authorityKind: pointer.kind, authorityId: pointer.authority_id, createdAt: new Date() });
      expect(await repo.listCheckedPointers(creatorId, plan.plan_id)).toMatchObject({ kind: "authority_gap" });
      f.state().pointers.pop();
    }
  });

  it("re-reads an exact same-pointer winner after a unique race without replacing it", async () => {
    const pointer: StepPointer = { node_id: "step-1", slot: "draft", kind: "autopost_draft", authority_id: "draft-1" };
    const f = fakeDb({ drafts: [{ id: "draft-1", creatorId, conversationalStepKey: "plan:plan-1:step:step-1", publishedPostId: null }] }, { failPointerInsert(root, row) { root.pointers.push({ id: "race-winner", createdAt: new Date(), ...row }); } });
    const repo = f.repository(); await createApproved(repo, snapshot());
    expect(await repo.putCheckedPointer(creatorId, "plan-1", pointer)).toMatchObject({ kind: "ok", pointer });
    expect(f.state().pointers).toHaveLength(1);
  });

  it("returns a revision conflict when the plan changed before the pointer-write row lock", async () => {
    const f = fakeDb({ drafts: [{ id: "draft-1", creatorId, conversationalStepKey: "plan:plan-1:step:step-1", publishedPostId: null }] }, { losePointerLock: true });
    const repo = f.repository(); await createApproved(repo, snapshot());
    expect(await repo.putCheckedPointer(creatorId, "plan-1", { node_id: "step-1", slot: "draft", kind: "autopost_draft", authority_id: "draft-1" })).toMatchObject({ kind: "revision_conflict", current: { revision: 1 } });
    expect(f.state().pointers).toHaveLength(0);
  });

  it("rejects corrupt row projections rather than repairing them", async () => {
    const f = fakeDb(), repo = f.repository();
    await repo.create({ ...createMutation(), snapshot: snapshot() });
    f.state().plans[0]!.revision = 4;
    expect(await repo.get(creatorId, "plan-1")).toEqual({ kind: "invalid_snapshot", code: "projection_mismatch" });
  });
});

function preparationFixture(staged = false) {
  const fingerprint = "src1_" + "0".repeat(64);
  const step = snapshot().steps[0] as Extract<PlanStep, { capability: "prepare_post_draft" }>;
  const value = snapshot({ review: "approved_for_preparation", revision: 1, source: { kind: staged ? "staged_media" : "existing_post", post_id: staged ? null : "post-1", selected_media_ids: ["media-1"], creative_work_id: null, creative_series_member_id: null, source_revision: fingerprint }, steps: [{ ...step, target_post_id: staged ? null : "post-1", time: { kind: "absolute", at_utc: "2026-10-20T09:00:00.000Z", timezone: "UTC", local: "2026-10-20T09:00" } }] });
  const row: PlanRow = { id: value.plan_id, creatorId, schemaVersion: 1, revision: value.revision, review: value.review, sourceRef: value.source, snapshot: value, clientCreateKey: "create-plan-1", createdAt: new Date(value.created_at), updatedAt: new Date(value.updated_at) };
  const pointerRows: Record<string, unknown>[] = [];
  const eventRows: Record<string, unknown>[] = [];
  const draftRows: Record<string, unknown>[] = [];
  const lockOrder: string[] = [];
  const transactionErrors: unknown[] = [];
  let transactionCount = 0;
  let hideEventAfterCreate = false;
  let removeEventAfterCommit = false;
  const mediaRow = (id = "media-1") => ({ id, creatorId, processingStatus: "READY", ingestOrigin: "RELAY_UPLOAD", primaryPostId: staged ? null : "post-1", postIds: staged ? [] : ["post-1"], autopostDraftId: null, currentMimeType: "image/png", currentVersionSeq: 1, currentUpstreamRevision: "media-v1", currentRole: "primary" });
  const postRow = (id = "post-1") => ({ id, creatorId, publishState: "published", versions: [{ versionSeq: 1, upstreamRevision: "post-v1", title: "Source", mediaIds: ["media-1"] }], presentation: null, creativeWorkMember: null });
  const db = {
    tenant: { findFirst: vi.fn(async () => ({ id: "tenant-1" })) },
    creatorConversationalPlan: { findFirst: vi.fn(async () => row) },
    creatorConversationalPlanPointer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => pointerRows.find(item => Object.entries(where).every(([key, expected]) => item[key] === expected)) ?? null),
      findMany: vi.fn(async () => pointerRows),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const created = { id: `pointer-${pointerRows.length + 1}`, createdAt: new Date(), ...data }; pointerRows.push(created); return created; })
    },
    creatorScheduleEvent: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => hideEventAfterCreate && Object.hasOwn(where, "id") ? null : eventRows.find(item => Object.entries(where).every(([key, expected]) => item[key] === expected)) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const created = { id: "event-1", ...data }; eventRows.push(created); return created; })
    },
    autopostDraft: {
      findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => draftRows.find(item => Object.entries(where ?? {}).every(([key, expected]) => item[key] === expected)) ?? null),
      count: vi.fn(async () => draftRows.filter(item => item.creatorId === creatorId && item.status === "drafting").length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const created = { id: "draft-1", ...data }; draftRows.push(created); return created; })
    },
    post: {
      findFirst: vi.fn(async () => ({ id: "post-1", creatorId })),
      findMany: vi.fn(async ({ select, where }: { select?: Record<string, unknown>; where?: { id?: { in?: string[] } } }) => (where?.id?.in ?? ["post-1"]).map(id => select && Object.keys(select).length === 1 && select.id ? { id } : postRow(id)))
    },
    mediaAsset: { findMany: vi.fn(async ({ select, where }: { select?: Record<string, unknown>; where?: Record<string, unknown> }) => {
      const idsFilter = where?.id as { in?: string[] } | undefined;
      const ids = idsFilter?.in ?? ["media-1"];
      return ids.map(id => {
        const rowValue = mediaRow(id);
        if (select?.currentVersionSeq) return rowValue;
        if (select?.processingStatus) return rowValue;
        if (where?.ingestOrigin) return rowValue;
        return { id, primaryPostId: rowValue.primaryPostId, postIds: rowValue.postIds };
      });
    }), updateMany: vi.fn(async () => ({ count: 1 })) },
    creativeWorkMember: { findMany: vi.fn(async () => []) },
    creatorPreviewTemplate: { findMany: vi.fn(async () => []) },
    creatorPlanEntitlement: { findUnique: vi.fn(async () => ({ plan: "autopost", source: "pilot", expiresAt: null })) },
    account: { findFirst: vi.fn(async () => ({ id: "account-1" })) },
    planSubscription: { findFirst: vi.fn(async () => ({ creatorPlan: "autopost" })) },
    creatorPostingGoal: { findUnique: vi.fn(async () => ({ timezone: "UTC" })) },
    creatorBlueskyCredential: { findUnique: vi.fn(async () => null) },
    creatorProfile: { findFirst: vi.fn(async () => ({ patreonCampaignId: "campaign-1" })) },
    async $queryRaw(query: { sql?: string }) { lockOrder.push(query.sql ?? "unknown"); return [{ id: "locked" }]; },
    async $transaction<T>(work: (tx: never) => Promise<T>): Promise<T> { transactionCount++; try { const result = await work(this as never); if (removeEventAfterCommit && eventRows.length) eventRows.length = 0; return result; } catch (error) { transactionErrors.push(error); throw error; } }
  };
  return { db, row, value, pointerRows, eventRows, draftRows, lockOrder, transactionErrors, get transactionCount() { return transactionCount; }, hideEventAfterCreate: () => { hideEventAfterCreate = true; }, removeEventAfterCommit: () => { removeEventAfterCommit = true; } };
}

describe("transaction-bound preparation repository", () => {
  it("rechecks the approved source inside each transaction and atomically links an existing-post attention event", async () => {
    const fixture = preparationFixture();
    const context = createPlanningContextSource(fixture.db as never);
    const loaded = await context.loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const repository = createConversationalPreparationRepository(fixture.db as never);
    const sourceOutput = await repository.prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "relay_post" });
    expect(sourceOutput).toMatchObject({ kind: "linked", pointer: { slot: "relay_post", authority_id: "post-1" }, reused: true });
    const result = await repository.prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(result).toMatchObject({ kind: "linked", pointer: { node_id: "step-1", slot: "attention_event", kind: "schedule_event", authority_id: "event-1" }, current: { revision: 1, review: "approved_for_preparation" }, reused: false });
    expect(fixture.lockOrder[0]).toContain("tenants");
    expect(fixture.lockOrder[1]).toContain("creator_conversational_plans");
    expect(fixture.eventRows[0]).toMatchObject({ creatorId, conversationalStepKey: "plan:plan-1:step:step-1", eventType: "make_post", destination: "patreon", postId: "post-1" });
    expect(fixture.pointerRows).toHaveLength(2);
    const replay = await repository.prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(replay).toMatchObject({ kind: "linked", pointer: { authority_id: "event-1" }, reused: true });
    expect(fixture.eventRows).toHaveLength(1);
    fixture.value.revision = 2;
    fixture.value.review = "cancelled";
    fixture.value.updated_at = "2026-10-17T10:00:00.000Z";
    fixture.row.revision = 2;
    fixture.row.review = "cancelled";
    fixture.row.updatedAt = new Date(fixture.value.updated_at);
    fixture.row.snapshot = fixture.value;
    const cancelled = await repository.prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(cancelled).toEqual({ kind: "conflict", code: "approved_revision_conflict" });
    expect(fixture.eventRows).toHaveLength(1);
  });

  it("rejects an existing-post pointer when the approved step targets a sibling post", async () => {
    const fixture = preparationFixture();
    fixture.value.steps[0] = { ...(fixture.value.steps[0] as Extract<PlanStep, { capability: "prepare_post_draft" }>), target_post_id: "post-2" };
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const context = createPlanningContextSource(fixture.db as never);
    const loaded = await context.loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "relay_post" });
    expect(result).toEqual({ kind: "blocked", code: "source_intent_gap" });
    expect(fixture.pointerRows).toHaveLength(0);
  });

  it("preserves creator-supplied part substitutions when deriving a staged draft title", async () => {
    const fixture = preparationFixture(true);
    fixture.value.steps[0] = { ...(fixture.value.steps[0] as Extract<PlanStep, { capability: "prepare_post_draft" }>), title: { mode: "part_substitution", prefix: "Chapter ", part: "4", suffix: "", part_source: "creator" } };
    fixture.row.snapshot = fixture.value;
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "draft" });
    expect(result).toMatchObject({ kind: "linked", pointer: { slot: "draft", kind: "autopost_draft", authority_id: "draft-1" } });
    expect(fixture.draftRows[0]).toMatchObject({ title: "Chapter 4", status: "drafting", bodyText: null, composerStep: "draft-post", workspace: {} });
  });

  it("rejects a staged draft whose approved source step also targets a post", async () => {
    const fixture = preparationFixture(true);
    fixture.value.steps[0] = { ...(fixture.value.steps[0] as Extract<PlanStep, { capability: "prepare_post_draft" }>), target_post_id: "post-1" };
    fixture.row.snapshot = fixture.value;
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "draft" });
    expect(result).toEqual({ kind: "blocked", code: "attached_media_reuse_gap" });
    expect(fixture.draftRows).toHaveLength(0);
  });

  it("keeps an existing-post draft output blocked even when that step already has a draft pointer", async () => {
    const fixture = preparationFixture();
    fixture.draftRows.push({ id: "draft-existing", creatorId, conversationalStepKey: "plan:plan-1:step:step-1", publishedPostId: null });
    fixture.pointerRows.push({ id: "draft-pointer", planId: "plan-1", creatorId, nodeId: "step-1", slot: "draft", authorityKind: "autopost_draft", authorityId: "draft-existing", createdAt: new Date() });
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "draft" });
    expect(result).toEqual({ kind: "blocked", code: "attached_media_reuse_gap" });
    expect(fixture.draftRows).toHaveLength(1);
  });

  it("blocks disabled stored steps before creating any authority", async () => {
    const fixture = preparationFixture();
    fixture.value.steps[0] = { ...(fixture.value.steps[0] as Extract<PlanStep, { capability: "prepare_post_draft" }>), enabled: false };
    fixture.row.snapshot = fixture.value;
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(result).toEqual({ kind: "blocked", code: "dependency_blocked" });
    expect(fixture.eventRows).toHaveLength(0);
    expect(fixture.pointerRows).toHaveLength(0);
  });

  it("blocks unresolved slots attached to the requested source step and requires its checked source pointer before attention", async () => {
    const fixture = preparationFixture();
    fixture.value.unresolved_requests = [{ request_id: "request-source", requested_text_quote: "Use the post", intended_capability: "prepare_post_draft", intended_destination: "patreon", blocking_slot_ids: ["source-slot"] }];
    fixture.value.clarifications = [{ slot_id: "source-slot", field: "source", question: "Confirm the source post.", affected_node_ids: ["request-source", "step-1"], blocking: true, reason: "ambiguous_source" }];
    fixture.row.snapshot = fixture.value;
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const blocked = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(blocked).toEqual({ kind: "blocked", code: "dependency_blocked" });
    expect(fixture.eventRows).toHaveLength(0);
    fixture.value.unresolved_requests = [];
    fixture.value.clarifications = [];
    fixture.row.snapshot = fixture.value;
    const needsSourcePointer = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(needsSourcePointer).toEqual({ kind: "blocked", code: "dependency_blocked" });
    expect(fixture.eventRows).toHaveLength(0);
  });

  it("blocks a directly affected source clarification even when no unresolved request remains", async () => {
    const fixture = preparationFixture();
    fixture.value.clarifications = [{ slot_id: "direct-source-slot", field: "source", question: "Choose the source post.", affected_node_ids: ["step-1"], blocking: true, reason: "ambiguous_source" }];
    fixture.value.unresolved_requests = [];
    fixture.row.snapshot = fixture.value;
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "relay_post" });
    expect(result).toEqual({ kind: "blocked", code: "dependency_blocked" });
    expect(fixture.pointerRows).toHaveLength(0);
  });

  it("blocks staged-source attention when its step targets a post, even with valid occupied source and attention pointers", async () => {
    const fixture = preparationFixture(true);
    fixture.value.steps[0] = { ...(fixture.value.steps[0] as Extract<PlanStep, { capability: "prepare_post_draft" }>), target_post_id: "post-1" };
    fixture.draftRows.push({ id: "draft-1", creatorId, conversationalStepKey: "plan:plan-1:step:step-1", publishedPostId: null });
    fixture.eventRows.push({ id: "event-1", creatorId, conversationalStepKey: "plan:plan-1:step:step-1", eventType: "make_post", destination: "patreon", postId: null });
    fixture.pointerRows.push(
      { id: "draft-pointer", planId: "plan-1", creatorId, nodeId: "step-1", slot: "draft", authorityKind: "autopost_draft", authorityId: "draft-1", createdAt: new Date() },
      { id: "attention-pointer", planId: "plan-1", creatorId, nodeId: "step-1", slot: "attention_event", authorityKind: "schedule_event", authorityId: "event-1", createdAt: new Date() }
    );
    fixture.row.snapshot = fixture.value;
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(result).toEqual({ kind: "blocked", code: "source_intent_gap" });
    expect(fixture.db.creatorScheduleEvent.create).not.toHaveBeenCalled();
    expect(fixture.pointerRows).toHaveLength(2);
  });

  it("recovers one exact-key attention winner after a pointer unique race without creating a replacement", async () => {
    const fixture = preparationFixture();
    fixture.eventRows.push({ id: "event-1", creatorId, conversationalStepKey: "plan:plan-1:step:step-1", eventType: "make_post", destination: "patreon", postId: "post-1" });
    fixture.pointerRows.push({ id: "source-pointer", planId: "plan-1", creatorId, nodeId: "step-1", slot: "relay_post", authorityKind: "relay_post", authorityId: "post-1", createdAt: new Date() });
    const pointerCreate = fixture.db.creatorConversationalPlanPointer.create as ReturnType<typeof vi.fn>;
    pointerCreate.mockImplementationOnce(async () => { throw Object.assign(new Error("unique"), { code: "P2002" }); });
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(result).toMatchObject({ kind: "linked", pointer: { authority_id: "event-1" }, reused: true });
    expect(fixture.eventRows).toHaveLength(1);
    expect(fixture.pointerRows).toHaveLength(2);
    expect(pointerCreate).toHaveBeenCalledTimes(2);
    expect(fixture.transactionCount).toBe(3);
    expect(fixture.db.creatorScheduleEvent.create).not.toHaveBeenCalled();
  });

  it("rejects the transaction callback when a newly created authority fails live pointer validation", async () => {
    const fixture = preparationFixture();
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const repo = createConversationalPreparationRepository(fixture.db as never);
    await repo.prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "relay_post" });
    fixture.hideEventAfterCreate();
    const result = await repo.prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(result).toEqual({ kind: "conflict", code: "authority_conflict" });
    expect(fixture.transactionErrors.length).toBeGreaterThan(0);
    expect(fixture.pointerRows).toHaveLength(1);
  });

  it("returns conflict when the fresh postcommit resolver no longer finds the committed attention authority", async () => {
    const fixture = preparationFixture();
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const repo = createConversationalPreparationRepository(fixture.db as never);
    await repo.prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "relay_post" });
    fixture.removeEventAfterCommit();
    const result = await repo.prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "attention_event" });
    expect(result).toEqual({ kind: "conflict", code: "authority_conflict" });
    expect(fixture.pointerRows).toHaveLength(2);
    expect(fixture.eventRows).toHaveLength(0);
  });

  it("does not retry an unexpected transaction/commit failure", async () => {
    const fixture = preparationFixture();
    const loaded = await createPlanningContextSource(fixture.db as never).loadContext(creatorId, fixture.value);
    fixture.value.source.source_revision = loaded.sourceFingerprint;
    fixture.row.sourceRef = fixture.value.source;
    fixture.row.snapshot = fixture.value;
    const failedTransaction = vi.fn(async () => { throw new Error("transport failed"); });
    Object.defineProperty(fixture.db, "$transaction", { value: failedTransaction });
    const result = await createConversationalPreparationRepository(fixture.db as never).prepareOutput({ creatorId, planId: fixture.value.plan_id, approvedRevision: 1, stepId: "step-1", output: "relay_post" });
    expect(result).toEqual({ kind: "unavailable", code: "preparation_unavailable" });
    expect(failedTransaction).toHaveBeenCalledTimes(1);
  });
});

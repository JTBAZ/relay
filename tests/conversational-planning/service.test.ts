import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createConversationalPlanningService } from "../../src/conversational-planning/service.js";
import type { PlanSnapshot, TrustedPlanContext } from "../../src/conversational-planning/contract.js";
import { derivePlanningEditDescriptors, type PlanningContextSource } from "../../src/conversational-planning/context.js";
import type { TrustedLookup } from "../../src/conversational-planning/compiler.js";
import type { CalendarResolver } from "../../src/conversational-planning/compiler.js";
import type { PlanningProviderInput, PlanningProviderResponse } from "../../src/conversational-planning/intent.js";
import { EditorError } from "../../src/gallery-editor/types.js";
import type { ConversationalPlanRepository, Mutation } from "../../src/conversational-planning/persistence.js";
import type { PlanPreparationAdapter } from "../../src/conversational-planning/service.js";

const principal = { accountId: "account-1", creatorId: "creator-1" };
const plan = (): PlanSnapshot => ({ schema_version: 1, plan_id: "plan-1", creator_id: principal.creatorId, revision: 0, review: "proposed", source: { kind: "existing_post", post_id: "post-1", selected_media_ids: ["media-1"], creative_work_id: null, creative_series_member_id: null, source_revision: "fp-1" }, steps: [{ step_id: "draft-1", capability: "prepare_post_draft", depends_on: [], enabled: true, title: { mode: "literal", value: "Original", origin: "creator" }, note: "keep", time: null, intended_destination: "patreon", source_media_ids: ["media-1"], target_post_id: null }], distribution_groups: [], unresolved_requests: [], clarifications: [], requested_text_quote: "make it", created_at: "2026-10-16T10:00:00.000Z", updated_at: "2026-10-16T10:00:00.000Z" });
const context: TrustedPlanContext = { authenticatedCreatorId: principal.creatorId, ownedMediaIds: new Set(["media-1"]), sourceMediaRelations: new Map([["media-1", { post_ids: new Set(["post-1"]), creative_work_ids: new Set(), creative_series_member_ids: new Set() }]]), ownedPostIds: new Set(["post-1"]), ownedTemplateIds: new Set(), ownedCreativeWorkIds: new Set(), ownedCreativeSeriesMemberIds: new Set(), verifiedSeriesMemberPartLabels: new Map(), currentTemplateConfigs: new Map(), connectedDestinations: new Set(["patreon", "bluesky"]), hasAutopostEntitlement: true, currentSourceRevision: "fp-1", ownedTargetPostIds: new Set(["post-1"]) };
function harness(options: { replay?: unknown; current?: PlanSnapshot; provider?: boolean; providerResponses?: Array<{ text: string; usage: { inputTokens: number; outputTokens: number; costUsd: number }; finishReason: "stop" }>; providerResponder?: (input: PlanningProviderInput) => Promise<PlanningProviderResponse>; lookup?: TrustedLookup; calendarResolver?: CalendarResolver; preparation?: PlanPreparationAdapter } = {}) {
  let current = options.current ?? plan();
  const repository = {
    lookupReplay: vi.fn(async (_m: Mutation) => options.replay ?? { kind: "new" }),
    get: vi.fn(async () => ({ kind: "ok", current, pointers: [] })),
    create: vi.fn(async ({ snapshot }: { snapshot: PlanSnapshot }) => { current = snapshot; return { kind: "ok", current: snapshot, recordedRevision: snapshot.revision, pointers: [] }; }),
    revise: vi.fn(async ({ candidate }: { candidate: PlanSnapshot }) => { current = candidate; return { kind: "ok", current: candidate, recordedRevision: candidate.revision, pointers: [] }; }),
    approve: vi.fn(async () => { current = { ...current, revision: current.revision + 1, review: "approved_for_preparation" }; return { kind: "ok", current, recordedRevision: current.revision, pointers: [] }; }),
    cancel: vi.fn(async () => { current = { ...current, revision: current.revision + 1, review: "cancelled" }; return { kind: "ok", current, recordedRevision: current.revision, pointers: [] }; }),
    listCurrent: vi.fn(async () => ({ kind: "ok", items: [current], nextCursor: null })),
    listCheckedPointers: vi.fn(async () => ({ kind: "ok", pointers: [] }))
  } as unknown as ConversationalPlanRepository;
  const source = { lookup: options.lookup ?? {}, loadContext: vi.fn(async () => ({ context, sourceFingerprint: "fp-1" })), buildRequestContext: vi.fn(async (input: { snapshot?: PlanSnapshot; selectedMediaIds: readonly string[]; selectedPostIds: readonly string[] }) => {
    const snapshot = input.snapshot;
    const handles = snapshot ? derivePlanningEditDescriptors(snapshot, principal.creatorId) : { kind: "ok" as const, descriptors: [] };
    const handleMap = new Map<string, { creatorId: string; planId: string; revision: number; stepId: string }>();
    const editable_nodes = snapshot && handles.kind === "ok" ? snapshot.steps.map(step => {
      const handle = `node_${createHash("sha256").update(JSON.stringify({ binding: [principal.creatorId, snapshot.plan_id, snapshot.revision, step.step_id], v: 1 })).digest("hex").slice(0, 24)}`;
      handleMap.set(handle, { creatorId: principal.creatorId, planId: snapshot.plan_id, revision: snapshot.revision, stepId: step.step_id });
      return { handle, capability: step.capability, destination: "destination" in step ? step.destination : null, title: step.title.mode === "literal" ? step.title.value : `${step.title.prefix}{part}${step.title.suffix}`, title_origin: step.title.mode === "literal" ? step.title.origin : "creator", local_date: step.time?.kind === "absolute" ? step.time.local.slice(0, 10) : null, local_time: step.time?.kind === "absolute" ? step.time.local.slice(11) : step.time?.kind === "after_publication_calendar_days" ? step.time.local_time : null, timezone: step.time?.timezone ?? null, time_origin: null, template_name: null, enabled: step.enabled };
    }) : [];
    return { kind: "ok" as const, modelContext: { request_clock: { received_at_utc: "2026-10-16T10:00:00.000Z", local_date: "2026-10-16", timezone: "Europe/London" }, plan_revision: snapshot?.revision ?? null, selected: { media_ids: [...input.selectedMediaIds], post_ids: [...input.selectedPostIds], work_id: null }, media: input.selectedMediaIds.map(id => ({ id, filename: "file.png", mime: "image/png", processing_status: "READY", primary_post_id: "post-1", linked_post_ids: ["post-1"] })), posts: input.selectedPostIds.map(id => ({ id, effective_title: "Existing source", publish_state: "published" as const, series_member_id: null, part_label: null, selected_media_ids: ["media-1"] })), templates: [], destinations: [{ id: "patreon" as const, readiness: "available" as const }], creator_timezone: "Europe/London", editable_nodes, allowed_request_kinds: ["primary_draft" as const, "teaser" as const, "followup" as const], allowed_social_actions: ["reply_block" as const, "engagement_check" as const], prior_clarification: null }, sourceFingerprint: "fp-1", requestClock: { receivedAtUtc: "2026-10-16T10:00:00.000Z", timezone: "Europe/London" }, frozenCreatorTimezone: "Europe/London", handleMap, editDescriptors: handles.kind === "ok" ? handles.descriptors : [] };
  }) } as unknown as PlanningContextSource;
  const provider = { respond: vi.fn().mockImplementation(async (input: PlanningProviderInput) => options.providerResponder ? options.providerResponder(input) : options.providerResponses?.shift() ?? { text: "{}", usage: { inputTokens: 10, outputTokens: 10, costUsd: 0.001 }, finishReason: "stop" as const }) };
  const service = createConversationalPlanningService({ repository, context: source, ...(options.provider ? { provider } : {}), ...(options.calendarResolver ? { calendarResolver: options.calendarResolver } : {}), ...(options.preparation ? { preparation: options.preparation } : {}), now: () => new Date("2026-10-16T11:00:00.000Z") });
  return { service, repository, source, provider };
}
const intentFields = (quote: string, title: string, targetHandle: string | null = null) => ({
  command: targetHandle ? "revise" : "add", target_handle: targetHandle, changed_fields: targetHandle ? ["title"] : [], kind: "primary_draft", source_ref: { mode: "selection", id: null }, destination: "patreon", title_mode: "literal", title_text: title, template_ref: { mode: "none", value: null }, enabled: targetHandle ? null : true, delivery_intent: targetHandle ? "none" : "prepare_for_creator_handoff", social_action: null, time_kind: "none", local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null, local_time: null, time_text: null, request_quote: quote
});
const output = (quote: string, title: string, targetHandle: string | null = null, revision: number | null = null) => JSON.stringify({ base_revision: revision, outcome: "proposal", question: null, requests: [intentFields(quote, title, targetHandle)] });
const dateIntentOutput = (quote: string, handle: string, explicit = false) => JSON.stringify({ base_revision: 0, outcome: "proposal", question: null, requests: [{ ...intentFields(quote, "", handle), changed_fields: ["time"], title_mode: "none", title_text: null, enabled: null, delivery_intent: "none", time_kind: "weekday", weekday: "friday", weekday_qualifier: "next", timezone: "Europe/London", local_time: explicit ? "17:30" : null, time_text: explicit ? "next Friday at 17:30" : "next Friday" }] });
const lookup: TrustedLookup = {
  async loadMedia(_creator, ids) { return ids.includes("media-1") ? [{ id: "media-1", creatorId: principal.creatorId, processingStatus: "READY", ingestOrigin: "library", primaryPostId: "post-1", postIds: ["post-1"], autopostDraftId: null, filename: "file.png", mimeType: "image/png" }] : []; },
  async loadPosts(_creator, ids) { return ids.includes("post-1") ? [{ id: "post-1", creatorId: principal.creatorId, publishState: "published" as const, effectiveTitle: "Existing source", mediaIds: ["media-1"], creativeWorkId: null, seriesMemberId: null, verifiedPartLabel: null }] : []; },
  async loadSourceRelations(_creator, ids) { return new Map(ids.map(id => [id, { postIds: new Set(["post-1"]), creativeWorkIds: new Set<string>(), creativeSeriesMemberIds: new Set<string>() }])); },
  async loadTemplates() { return []; }, async listTemplatesByName() { return []; },
  async destinationReadiness() { return new Map([["patreon", "available" as const]]); }, async hasAutopostEntitlement() { return true; }
};
function distributionPlan(): PlanSnapshot {
  const base = plan();
  const source = base.steps[0]!;
  const title = { mode: "literal" as const, value: "Bluesky title", origin: "creator" as const };
  return { ...base, steps: [source, { step_id: "dist-blue", capability: "prepare_distribution", depends_on: [source.step_id], enabled: true, title, note: null, time: null, source_step_id: source.step_id, preview_step_id: null, distribution_group_id: "group-blue", destination: "bluesky", copy_title: title }], distribution_groups: [{ group_id: "group-blue", source_step_id: source.step_id, preview_step_id: null, destination_step_ids: ["dist-blue"] }] };
}

describe("conversational planning lifecycle service", () => {
  it("replays before provider availability or context construction", async () => {
    const replay = { kind: "replay", recordedRevision: 0, current: plan(), pointers: [] };
    const h = harness({ replay });
    const result = await h.service.create(principal, { clientMutationKey: "key-1", latestRequest: "Create a Patreon draft", selectedPostIds: [], selectedMediaIds: [] }, new AbortController().signal);
    expect(result).toMatchObject({ kind: "stored", recordedRevision: 0, current: { plan_id: "plan-1" } });
    expect(h.source.buildRequestContext).not.toHaveBeenCalled();
  });

  it("returns a key collision before provider or context work", async () => {
    const h = harness({ replay: { kind: "idempotency_conflict" }, provider: true });
    const result = await h.service.create(principal, { clientMutationKey: "reused-key", latestRequest: "Different request", selectedPostIds: [], selectedMediaIds: [] }, new AbortController().signal);
    expect(result).toMatchObject({ kind: "error", code: "idempotency_conflict" });
    expect(h.provider.respond).not.toHaveBeenCalled();
    expect(h.source.buildRequestContext).not.toHaveBeenCalled();
  });

  it("creates and revises through the injected provider, trusted lookup and repository", async () => {
    const createQuote = "Create a Patreon draft titled Clear title";
    const reviseQuote = "Change the draft title to Updated title";
    let calls = 0;
    const h = harness({ provider: true, lookup, providerResponder: async input => {
      calls++;
      const handle = input.context.editable_nodes[0]?.handle ?? null;
      return { text: calls === 1 ? output(createQuote, "Clear title") : output(reviseQuote, "Updated title", handle, 0), usage: { inputTokens: 40, outputTokens: 60, costUsd: 0.002 }, finishReason: "stop" };
    } });
    const created = await h.service.create(principal, { clientMutationKey: "create-live", latestRequest: createQuote, selectedPostIds: [], selectedMediaIds: ["media-1"] }, new AbortController().signal);
    expect(created).toMatchObject({ kind: "stored", current: { revision: 0 } });
    if (created.kind !== "stored") throw new Error("Expected the create command to store a plan");
    expect(created.current.steps[0]?.title).toMatchObject({ value: "Clear title" });
    const createdPlanId = created.current.plan_id;
    const revised = await h.service.revise(principal, createdPlanId, { mode: "ai", clientMutationKey: "revise-live", baseRevision: 0, latestRequest: reviseQuote, selectedPostIds: [], selectedMediaIds: ["media-1"] }, new AbortController().signal);
    expect(revised).toMatchObject({ kind: "stored", current: { revision: 1 } });
    if (revised.kind === "stored") expect(revised.current.steps.find(step => step.capability === "prepare_post_draft")?.title).toMatchObject({ value: "Updated title" });
    expect(h.provider.respond).toHaveBeenCalledTimes(2);
    expect(h.repository.create).toHaveBeenCalledOnce();
    expect(h.repository.revise).toHaveBeenCalledOnce();
    expect(h.repository.revise).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ planId: createdPlanId }) }));
  });

  it("passes selected template ids unchanged into both mutation command and trusted context", async () => {
    const h = harness({ provider: true, providerResponder: async () => ({ text: "{}", usage: { inputTokens: 10, outputTokens: 10, costUsd: 0.001 }, finishReason: "stop" }) });
    const selectedTemplateIds = ["template-a", "template-b", "template-c"];
    await h.service.create(principal, { clientMutationKey: "template-pass", latestRequest: "Create a draft", selectedPostIds: [], selectedMediaIds: [], selectedTemplateIds }, new AbortController().signal);
    expect(h.repository.lookupReplay).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ selectedTemplateIds }) }));
    expect(h.source.buildRequestContext).toHaveBeenCalledWith(expect.objectContaining({ selectedTemplateIds }));
    const tooMany = await h.service.create(principal, { clientMutationKey: "template-bound", latestRequest: "Create a draft", selectedPostIds: [], selectedMediaIds: [], selectedTemplateIds: ["a", "b", "c", "d"] }, new AbortController().signal);
    expect(tooMany).toMatchObject({ kind: "error", code: "invalid_request" });
    expect(h.repository.lookupReplay).toHaveBeenCalledTimes(1);
  });

  it("asks for local time when a saved time has no confirmation evidence", async () => {
    const base = plan();
    base.steps = base.steps.map(step => step.capability === "prepare_post_draft" ? { ...step, source_media_ids: [], time: { kind: "absolute", at_utc: "2026-10-16T16:30:00.000Z", timezone: "Europe/London", local: "2026-10-16T17:30" } } : step);
    const dateOnly = "Move the Patreon draft to next Friday";
    const explicit = "Move the Patreon draft to next Friday at 17:30";
    const h = harness({ current: base, lookup, provider: true, calendarResolver: { resolve: ({ request }) => request.local_time ? { kind: "absolute", at_utc: "2026-10-23T16:30:00.000Z", timezone: "Europe/London", local: "2026-10-23T17:30" } : null }, providerResponder: async input => ({ text: dateIntentOutput(input.request, input.context.editable_nodes[0]!.handle, input.request === explicit), usage: { inputTokens: 30, outputTokens: 40, costUsd: 0.001 }, finishReason: "stop" }) });
    const clarification = await h.service.revise(principal, "plan-1", { mode: "ai", clientMutationKey: "time-date-only", baseRevision: 0, latestRequest: dateOnly, selectedPostIds: [], selectedMediaIds: ["media-1"] }, new AbortController().signal);
    expect(clarification).toMatchObject({ kind: "clarification" });
    expect(h.repository.revise).not.toHaveBeenCalled();
    const accepted = await h.service.revise(principal, "plan-1", { mode: "ai", clientMutationKey: "time-explicit", baseRevision: 0, latestRequest: explicit, selectedPostIds: [], selectedMediaIds: ["media-1"] }, new AbortController().signal);
    expect(accepted).toMatchObject({ kind: "stored", current: { revision: 1 } });
    expect(h.repository.revise).toHaveBeenCalledOnce();
  });

  it("checks stale base revision before provider use", async () => {
    const h = harness({ current: { ...plan(), revision: 2 }, provider: true });
    const result = await h.service.revise(principal, "plan-1", { mode: "ai", clientMutationKey: "key-2", baseRevision: 1, latestRequest: "Change title", selectedPostIds: [], selectedMediaIds: [] }, new AbortController().signal);
    expect(result).toMatchObject({ kind: "error", code: "revision_conflict" });
    expect(h.provider.respond).not.toHaveBeenCalled();
    expect(h.source.buildRequestContext).not.toHaveBeenCalled();
  });

  it("applies sparse manual edits and preserves unrelated fields", async () => {
    const h = harness();
    const result = await h.service.revise(principal, "plan-1", { mode: "manual", clientMutationKey: "key-3", baseRevision: 0, patch: [{ step_id: "draft-1", field: "title", value: { mode: "literal", value: "Edited", origin: "creator" } }] }, new AbortController().signal);
    expect(result).toMatchObject({ kind: "stored", current: { revision: 1, updated_at: "2026-10-16T11:00:00.000Z", steps: [{ title: { value: "Edited" }, note: "keep" }] } });
    expect(h.repository.revise).toHaveBeenCalledOnce();
  });

  it("rejects empty manual patches before replay lookup or repository work", async () => {
    const h = harness({ provider: true });
    const result = await h.service.revise(principal, "plan-1", { mode: "manual", clientMutationKey: "empty-manual-patch", baseRevision: 0, patch: [] }, new AbortController().signal);
    expect(result).toMatchObject({ kind: "error", code: "invalid_request" });
    expect(h.repository.lookupReplay).not.toHaveBeenCalled();
    expect(h.repository.get).not.toHaveBeenCalled();
    expect(h.repository.revise).not.toHaveBeenCalled();
    expect(h.provider.respond).not.toHaveBeenCalled();
  });

  it("keeps distribution title and copy_title in sync", async () => {
    const h = harness({ current: distributionPlan() });
    const result = await h.service.revise(principal, "plan-1", { mode: "manual", clientMutationKey: "key-copy", baseRevision: 0, patch: [{ step_id: "dist-blue", field: "title", value: { mode: "literal", value: "Changed title", origin: "creator" } }] }, new AbortController().signal);
    expect(result).toMatchObject({ kind: "stored", current: { steps: [{}, { title: { value: "Changed title" }, copy_title: { value: "Changed title" } }] } });
  });

  it("rejects oversized and unsupported wire data without writes", async () => {
    const h = harness({ provider: true });
    const oversized = await h.service.create(principal, { clientMutationKey: "key", latestRequest: "x".repeat(4001), selectedPostIds: [], selectedMediaIds: [] }, new AbortController().signal);
    const unknown = await h.service.create(principal, { clientMutationKey: "key", latestRequest: "valid", selectedPostIds: [], selectedMediaIds: [], snapshot: plan() } as never, new AbortController().signal);
    expect(oversized).toMatchObject({ kind: "error", code: "too_large" });
    expect(unknown).toMatchObject({ kind: "error", code: "invalid_request" });
    expect(h.repository.create).not.toHaveBeenCalled();
    expect(h.provider.respond).not.toHaveBeenCalled();
  });

  it("uses only the interpreter's single schema repair attempt", async () => {
    const h = harness({ provider: true, providerResponses: [
      { text: "not-json", usage: { inputTokens: 10, outputTokens: 10, costUsd: 0.001 }, finishReason: "stop" },
      { text: "still-not-json", usage: { inputTokens: 11, outputTokens: 12, costUsd: 0.001 }, finishReason: "stop" }
    ] });
    const result = await h.service.create(principal, { clientMutationKey: "key-schema", latestRequest: "Create a Patreon draft", selectedPostIds: [], selectedMediaIds: [] }, new AbortController().signal);
    expect(result).toMatchObject({ kind: "error", code: "provider_failure" });
    expect(h.provider.respond).toHaveBeenCalledTimes(2);
    expect(h.provider.respond.mock.calls[1]?.[0]).toMatchObject({ repairError: "invalid_json_or_shape" });
    expect(h.repository.create).not.toHaveBeenCalled();
  });

  it("returns bounded terminal budget and abort errors without a service retry", async () => {
    const budget = harness({ provider: true, providerResponder: async () => { throw new EditorError("BUDGET_EXHAUSTED", "private budget detail", 429); } });
    const budgetResult = await budget.service.create(principal, { clientMutationKey: "key-budget", latestRequest: "Create a Patreon draft", selectedPostIds: [], selectedMediaIds: [] }, new AbortController().signal);
    expect(budgetResult).toMatchObject({ kind: "error", code: "provider_budget_exhausted" });
    expect(budget.provider.respond).toHaveBeenCalledOnce();
    const locked = harness({ provider: true, providerResponder: async () => { throw new EditorError("BUDGET_LOCKED", "private lock detail", 503); } });
    const lockedResult = await locked.service.create(principal, { clientMutationKey: "key-locked", latestRequest: "Create a Patreon draft", selectedPostIds: [], selectedMediaIds: [] }, new AbortController().signal);
    expect(lockedResult).toMatchObject({ kind: "error", code: "provider_budget_unavailable" });
    expect(locked.provider.respond).toHaveBeenCalledOnce();
    const aborted = harness({ provider: true });
    const controller = new AbortController(); controller.abort();
    const abortResult = await aborted.service.create(principal, { clientMutationKey: "key-abort", latestRequest: "Create a Patreon draft", selectedPostIds: [], selectedMediaIds: [] }, controller.signal);
    expect(abortResult).toMatchObject({ kind: "error", code: "provider_timeout" });
    expect(aborted.provider.respond).not.toHaveBeenCalled();
  });

  it("confirm without a materializer leaves review unchanged", async () => {
    const h = harness();
    const result = await h.service.confirm(principal, "plan-1", { clientMutationKey: "key-4", baseRevision: 0 });
    expect(result).toEqual({ kind: "preparation_unavailable" });
    expect(h.repository.approve).not.toHaveBeenCalled();
  });

  it("resumes only the exact approved revision without approval or request-ledger writes", async () => {
    const approved = { ...plan(), revision: 1, review: "approved_for_preparation" as const };
    const prepare = vi.fn(async () => ({ kind: "authorities_linked" as const }));
    const h = harness({ current: approved, preparation: { prepare } });
    const linkedPointer = { node_id: "draft-1", kind: "autopost_draft" as const, authority_id: "draft-authority-1", slot: "draft" as const };
    (h.repository.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: "ok", current: approved, pointers: [] })
      .mockResolvedValueOnce({ kind: "ok", current: approved, pointers: [linkedPointer] });
    const body = { approvedRevision: 1 };
    const result = await h.service.resumePreparation(principal, approved.plan_id, body);
    expect(result).toMatchObject({ kind: "stored", recordedRevision: 1, current: { review: "approved_for_preparation", revision: 1 }, pointers: [linkedPointer] });
    expect(prepare).toHaveBeenCalledWith({ creatorId: principal.creatorId, planId: approved.plan_id, approvedRevision: 1 });
    expect(h.repository.lookupReplay).not.toHaveBeenCalled();
    expect(h.repository.approve).not.toHaveBeenCalled();
    expect(h.repository.revise).not.toHaveBeenCalled();
    expect(h.source.loadContext).toHaveBeenCalledTimes(2);
    expect(h.repository.get).toHaveBeenCalledTimes(2);
    await h.service.resumePreparation(principal, approved.plan_id, body);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenNthCalledWith(2, { creatorId: principal.creatorId, planId: approved.plan_id, approvedRevision: 1 });
    expect(h.repository.approve).not.toHaveBeenCalled();
  });

  it("rejects malformed, proposed, cancelled, stale, and wrong-revision resume requests before preparation", async () => {
    const prepare = vi.fn(async () => ({ kind: "authorities_linked" as const }));
    const approved = { ...plan(), revision: 1, review: "approved_for_preparation" as const };
    const h = harness({ current: approved, preparation: { prepare } });
    expect(await h.service.resumePreparation(principal, "plan-1", { approvedRevision: 1, clientMutationKey: "forbidden" } as any)).toMatchObject({ kind: "error", code: "invalid_request" });
    expect(await h.service.resumePreparation(principal, "plan-1", { approvedRevision: -1 })).toMatchObject({ kind: "error", code: "invalid_request" });
    expect(await h.service.resumePreparation(principal, "plan-1", { approvedRevision: 0 })).toMatchObject({ kind: "error", code: "revision_conflict" });
    expect(await harness({ current: plan(), preparation: { prepare } }).service.resumePreparation(principal, "plan-1", { approvedRevision: 0 })).toMatchObject({ kind: "error", code: "revision_conflict" });
    const cancelled = { ...approved, revision: 2, review: "cancelled" as const };
    expect(await harness({ current: cancelled, preparation: { prepare } }).service.resumePreparation(principal, "plan-1", { approvedRevision: 2 })).toMatchObject({ kind: "error", code: "revision_conflict" });
    expect(prepare).not.toHaveBeenCalled();
    const stale = harness({ current: approved, preparation: { prepare } });
    (stale.source.loadContext as ReturnType<typeof vi.fn>).mockResolvedValue({ context: { ...context, authenticatedCreatorId: "other-creator" }, sourceFingerprint: "fp-1" });
    expect(await stale.service.resumePreparation(principal, "plan-1", { approvedRevision: 1 })).toMatchObject({ kind: "error", code: "stale_source" });
    expect(prepare).not.toHaveBeenCalled();
    const foreign = harness({ current: approved, preparation: { prepare } });
    (foreign.repository.get as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: "not_found" });
    expect(await foreign.service.resumePreparation(principal, "foreign-plan", { approvedRevision: 1 })).toMatchObject({ kind: "error", code: "not_found" });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("reports missing/blocked preparation and rechecks revision and pointers after the adapter", async () => {
    const approved = { ...plan(), revision: 1, review: "approved_for_preparation" as const };
    const missing = harness({ current: approved });
    expect(await missing.service.resumePreparation(principal, "plan-1", { approvedRevision: 1 })).toEqual({ kind: "preparation_unavailable" });
    expect(missing.repository.get).not.toHaveBeenCalled();
    for (const outcome of [{ kind: "blocked", code: "authority_gap" }, { kind: "blocked", code: "preparation_unavailable" }] as const) {
      const h = harness({ current: approved, preparation: { prepare: async () => outcome } });
      expect(await h.service.resumePreparation(principal, "plan-1", { approvedRevision: 1 })).toMatchObject({ kind: "error", code: outcome.code });
      expect(h.repository.get).toHaveBeenCalledOnce();
    }
    const raced = harness({ current: approved, preparation: { prepare: async () => ({ kind: "authorities_linked" }) } });
    const cancelled = { ...approved, revision: 2, review: "cancelled" as const };
    (raced.repository.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: "ok", current: approved, pointers: [] })
      .mockResolvedValueOnce({ kind: "ok", current: cancelled, pointers: [{ node_id: "draft-1", kind: "autopost_draft", authority_id: "draft-1", slot: "draft" }] });
    expect(await raced.service.resumePreparation(principal, "plan-1", { approvedRevision: 1 })).toMatchObject({ kind: "error", code: "revision_conflict", current: { review: "cancelled" } });
    expect(raced.source.loadContext).toHaveBeenCalledOnce();
    const sourceChanged = harness({ current: approved, preparation: { prepare: async () => ({ kind: "authorities_linked" }) } });
    (sourceChanged.source.loadContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ context, sourceFingerprint: "fp-1" })
      .mockResolvedValueOnce({ context, sourceFingerprint: "changed-fingerprint" });
    expect(await sourceChanged.service.resumePreparation(principal, "plan-1", { approvedRevision: 1 })).toMatchObject({ kind: "error", code: "stale_source" });
    expect(sourceChanged.repository.get).toHaveBeenCalledTimes(2);
  });

  it("recovers a recorded approval replay and prepares only that approved revision", async () => {
    const approved = { ...plan(), revision: 1, review: "approved_for_preparation" as const };
    const prepare = vi.fn(async () => ({ kind: "authorities_linked" as const }));
    const h = harness({ current: approved, replay: { kind: "replay", recordedRevision: 1, current: approved, pointers: [] }, preparation: { prepare } });
    const result = await h.service.confirm(principal, "plan-1", { clientMutationKey: "recorded-approval", baseRevision: 0 });
    expect(result).toMatchObject({ kind: "stored", recordedRevision: 1, current: { review: "approved_for_preparation", revision: 1 } });
    expect(prepare).toHaveBeenCalledWith({ creatorId: principal.creatorId, planId: "plan-1", approvedRevision: 1 });
    expect(h.repository.approve).not.toHaveBeenCalled();
    expect(h.repository.get).toHaveBeenCalledOnce();
  });

  it("keeps fresh-key confirm conflicts unchanged after an approval has already been recorded", async () => {
    const approved = { ...plan(), revision: 1, review: "approved_for_preparation" as const };
    const prepare = vi.fn(async () => ({ kind: "authorities_linked" as const }));
    const h = harness({ current: approved, preparation: { prepare } });
    const result = await h.service.confirm(principal, "plan-1", { clientMutationKey: "new-confirm-key", baseRevision: 1 });
    expect(result).toMatchObject({ kind: "error", code: "revision_conflict" });
    expect(h.repository.approve).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rechecks the approved revision after preparation and blocks a concurrent cancel", async () => {
    const h = harness({ preparation: { prepare: async () => ({ kind: "authorities_linked" }) } });
    const result = await h.service.confirm(principal, "plan-1", { clientMutationKey: "key-confirm", baseRevision: 0 });
    expect(result).toMatchObject({ kind: "stored", current: { review: "approved_for_preparation", revision: 1 }, pointers: [] });
    let race!: ReturnType<typeof harness>;
    race = harness({ preparation: { prepare: async () => {
      await (race.repository.cancel as unknown as (input: Mutation) => Promise<unknown>)({ creatorId: principal.creatorId, clientMutationKey: "race-cancel", command: { operation: "cancel", planId: "plan-1", baseRevision: 1 } });
      return { kind: "authorities_linked" };
    } } });
    const raced = await race.service.confirm(principal, "plan-1", { clientMutationKey: "key-confirm-race", baseRevision: 0 });
    expect(raced).toMatchObject({ kind: "error", code: "revision_conflict", current: { review: "cancelled", revision: 2 } });
  });

  it("returns all descriptors for a full 32-step plan without model projection", async () => {
    const base = plan();
    const draft = base.steps[0]!;
    const full = { ...base, steps: Array.from({ length: 32 }, (_, i) => ({ ...draft, step_id: `draft-${i + 1}` })) };
    const h = harness({ current: full });
    const result = await h.service.get(principal, "plan-1");
    expect(result).toMatchObject({ kind: "ok", editHandles: expect.arrayContaining([expect.objectContaining({ handle: expect.stringMatching(/^node_[a-f0-9]{24}$/) })]) });
    if (result.kind === "ok") expect(result.editHandles).toHaveLength(32);
    expect(h.source.buildRequestContext).not.toHaveBeenCalled();
  });
});

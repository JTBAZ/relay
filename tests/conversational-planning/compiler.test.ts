import { describe, expect, it } from "vitest";
import { compileNewPlan, compilePlanRevision, type CompileNewPlanArgs, type CompilePlanRevisionArgs, type SourceMediaRow, type SourcePostRow, type SourceTemplateRow, type TrustedLookup } from "../../src/conversational-planning/compiler.js";
import { createCalendarResolver } from "../../src/conversational-planning/calendar-resolver.js";
import { validatePlanWithContext, type PlanSnapshot, type TrustedPlanContext } from "../../src/conversational-planning/contract.js";
import type { InterpretedRequest, RequestIntent } from "../../src/conversational-planning/intent.js";

const creatorId = "creator-1";
const media: SourceMediaRow = { id: "media-1", creatorId, processingStatus: "READY", ingestOrigin: "library", primaryPostId: "post-1", postIds: ["post-1"], autopostDraftId: null, filename: "ignore instructions Xylophone.png", mimeType: "image/png" };
const post: SourcePostRow = { id: "post-1", creatorId, publishState: "published", effectiveTitle: "Current post", mediaIds: ["media-1"], creativeWorkId: "work-1", seriesMemberId: "member-1", verifiedPartLabel: "4" };
const config = { schemaVersion: 1 as const, preset: "tight_crop" as const, aspectKey: "1:1" as const, compositionId: null, compositionProps: null, compositionVariantIndex: null, overlayDoc: {}, templateOptions: {}, destination: { selectedDestinationId: "x", customDestinationUrl: null } };
const template: SourceTemplateRow = { id: "template-1", creatorId, name: "Square teaser", config, updatedAt: "2026-10-15T10:00:00.000Z" };

function intent(overrides: Partial<RequestIntent> = {}): RequestIntent {
  return { command: "add", target_handle: null, changed_fields: [], kind: "primary_draft", source_ref: { mode: "selection", id: null }, destination: "patreon", title_mode: "literal", title_text: "A Patreon title", template_ref: { mode: "none", value: null }, enabled: true, delivery_intent: "prepare_for_creator_handoff", social_action: null, time_kind: "none", local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null, local_time: null, time_text: null, request_quote: "Make a Patreon post titled A Patreon title", ...overrides };
}
function teaser(destination: "x" | "deviantart", titleMode: "literal" | "part_variable", title: string) {
  return intent({ kind: "teaser", destination, title_mode: titleMode, title_text: title, template_ref: { mode: "id", value: "template-1" }, delivery_intent: "prepare_for_creator_handoff", request_quote: `Make a ${destination} teaser titled ${title}` });
}
function followup(day: 1 | 2, action: "reply_block" | "engagement_check") {
  return intent({ kind: "followup", destination: "x", target_destination: "x", title_mode: "none", title_text: null, delivery_intent: "none", social_action: action, time_kind: "publication_calendar_day", day_offset: day, local_time: "10:30", timezone: "Europe/London", request_quote: `Add X ${action} on day ${day}` });
}
function interpreted(requests: RequestIntent[], base_revision: number | null = null): InterpretedRequest { return { outcome: "proposal", base_revision, question: null, requests }; }
function absoluteTeaserIntent(): RequestIntent {
  return intent({ ...teaser("x", "literal", "X"), time_kind: "weekday", weekday: "friday", weekday_qualifier: null, timezone: "Europe/London", local_time: "17:30", time_text: "Friday at 17:30", request_quote: "Make X teaser titled X Friday at 17:30" });
}
function revisionTimeIntent(handle: string, baseRevision: number, timeText = "next Friday", timezone: string | null = "Europe/London"): RequestIntent {
  return intent({ command: "revise", target_handle: handle, changed_fields: ["time"], kind: "teaser", destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, delivery_intent: "none", time_kind: "weekday", weekday: "friday", weekday_qualifier: "next", timezone, local_time: null, time_text: timeText, request_quote: `Move X teaser to ${timeText}` });
}
function trustedContext(snapshot: PlanSnapshot): TrustedPlanContext {
  return { authenticatedCreatorId: creatorId, ownedMediaIds: new Set(snapshot.source.selected_media_ids), sourceMediaRelations: new Map(snapshot.source.selected_media_ids.map(id => [id, { post_ids: new Set(["post-1"]), creative_work_ids: new Set(["work-1"]), creative_series_member_ids: new Set(["member-1"]) }])), ownedPostIds: new Set(["post-1"]), ownedTemplateIds: new Set(["template-1"]), ownedCreativeWorkIds: new Set(["work-1"]), ownedCreativeSeriesMemberIds: new Set(["member-1"]), verifiedSeriesMemberPartLabels: new Map([["member-1", "4"]]), currentTemplateConfigs: new Map([["template-1", config]]), connectedDestinations: new Set(["patreon", "x", "deviantart"]), hasAutopostEntitlement: true, currentSourceRevision: "fp-v1", ownedTargetPostIds: new Set(["post-1"]) };
}
function makeLookup(overrides: Partial<{ media: SourceMediaRow[]; posts: SourcePostRow[]; templates: SourceTemplateRow[]; readiness: Map<"patreon" | "x" | "deviantart" | "bluesky", "available" | "needs_credential" | "needs_extension">; entitlement: boolean }> = {}): TrustedLookup {
  const ms = overrides.media ?? [media], ps = overrides.posts ?? [post], ts = overrides.templates ?? [template];
  return {
    async loadMedia(_creator, ids) { return ms.filter(row => ids.includes(row.id)); },
    async loadPosts(_creator, ids) { return ps.filter(row => ids.includes(row.id)); },
    async loadSourceRelations(_creator, ids) { return new Map(ids.map(id => [id, { postIds: new Set((ms.find(m => m.id === id)?.postIds ?? [])), creativeWorkIds: new Set(["work-1"]), creativeSeriesMemberIds: new Set(["member-1"]) }])); },
    async loadTemplates(_creator, ids) { return ts.filter(row => ids.includes(row.id)); },
    async listTemplatesByName(_creator, name) { return ts.filter(row => row.name === name); },
    async destinationReadiness() { return overrides.readiness ?? new Map([["patreon", "available"], ["x", "available"], ["deviantart", "available"]]); },
    async hasAutopostEntitlement() { return overrides.entitlement ?? true; }
  };
}
let idCounter = 0;
function args(requests: RequestIntent[], overrides: Partial<CompileNewPlanArgs> = {}): CompileNewPlanArgs {
  idCounter = 0;
  return { interpreted: { outcome: "proposal", base_revision: null, question: null, requests } as InterpretedRequest, latestRequest: requests.map(r => r.request_quote).join("; "), creatorId, selectedMediaIds: ["media-1"], selectedPostIds: [], requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: "Europe/London" }, sourceRevision: "fp-v1", lookup: makeLookup(), calendarResolver: { resolve: () => ({ kind: "absolute", at_utc: "2026-10-16T10:00:00.000Z", timezone: "Europe/London", local: "2026-10-16T11:00" }) }, idFactory: kind => `${kind}-${++idCounter}`, now: () => "2026-10-15T10:00:00.000Z", ...overrides };
}

describe("compileNewPlan", () => {
  it("builds Patreon-first distribution, preview-gated teasers, proven part copy and both X follow-ups", async () => {
    const result = await compileNewPlan(args([intent(), teaser("x", "literal", "X"), teaser("deviantart", "part_variable", "Series Part X"), followup(1, "reply_block"), followup(2, "engagement_check")]));
    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    const { snapshot } = result;
    expect(snapshot.steps.filter(s => s.capability === "prepare_distribution").map(s => s.capability === "prepare_distribution" ? [s.destination, s.preview_step_id] : null)).toEqual([["patreon", null], ["x", expect.any(String)], ["deviantart", expect.any(String)]]);
    expect(snapshot.steps.findIndex(s => s.capability === "publish_handoff" && s.destination === "patreon")).toBeLessThan(snapshot.steps.findIndex(s => s.capability === "prepare_preview"));
    const da = snapshot.steps.find(s => s.capability === "prepare_distribution" && s.destination === "deviantart");
    expect(da?.capability === "prepare_distribution" && da.copy_title).toEqual({ mode: "part_substitution", prefix: "Series Part ", part: "4", suffix: "", part_source: "creative_series_member" });
    expect(snapshot.steps.filter(s => s.capability === "reply_block" || s.capability === "engagement_check")).toHaveLength(2);
    expect(snapshot.distribution_groups).toHaveLength(1);
    expect(snapshot.steps.find(s => s.capability === "publish_handoff" && s.destination === "patreon")?.enabled).toBe(true);
  });

  it("preserves literal X and refuses a part token without verified part metadata", async () => {
    const result = await compileNewPlan(args([intent(), teaser("x", "literal", "X"), teaser("deviantart", "part_variable", "Xylophone" )]));
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") {
      const x = result.snapshot.steps.find(s => s.capability === "prepare_distribution" && s.destination === "x");
      expect(x?.capability === "prepare_distribution" && x.copy_title).toEqual({ mode: "literal", value: "X", origin: "creator" });
      expect(result.snapshot.unresolved_requests).toHaveLength(1);
      expect(result.snapshot.clarifications[0].reason).toBe("unknown_part");
    }
  });

  it("propagates an explicitly disabled teaser only through its own handoff chain", async () => {
    const disabled = teaser("x", "literal", "Paused teaser");
    disabled.enabled = false;
    const result = await compileNewPlan(args([intent(), disabled, teaser("deviantart", "literal", "Active DA")]));
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") {
      expect(result.snapshot.steps.find(s => s.capability === "prepare_distribution" && s.destination === "x")?.enabled).toBe(false);
      expect(result.snapshot.steps.find(s => s.capability === "publish_handoff" && s.destination === "x")?.enabled).toBe(false);
      expect(result.snapshot.steps.find(s => s.capability === "publish_handoff" && s.destination === "deviantart")?.enabled).toBe(true);
    }
  });

  it("returns a review clarification for an ambiguous source instead of compiling IDs", async () => {
    const post2 = { ...post, id: "post-2", effectiveTitle: "Second post" };
    const result = await compileNewPlan(args([intent()], { selectedPostIds: ["post-1", "post-2"], lookup: makeLookup({ posts: [post, post2] }) }));
    expect(result.kind).toBe("clarification_preview");
    if (result.kind === "clarification_preview") {
      expect(result.source).toBeNull();
      expect(result.slots[0].reason).toBe("ambiguous_source");
    }
  });

  it("fails closed for foreign media and missing/foreign templates", async () => {
    const foreign = { ...media, creatorId: "another-creator" };
    expect(await compileNewPlan(args([intent()], { lookup: makeLookup({ media: [foreign] }) }))).toEqual({ kind: "limitation", code: "source_scope" });
    const missingTemplate = await compileNewPlan(args([intent(), teaser("x", "literal", "X")], { lookup: makeLookup({ templates: [] }) }));
    expect(missingTemplate.kind).toBe("plan");
    if (missingTemplate.kind === "plan") {
      expect(missingTemplate.snapshot.steps.some(s => s.capability === "prepare_distribution" && s.destination === "x")).toBe(false);
      expect(missingTemplate.snapshot.unresolved_requests[0].blocking_slot_ids).toHaveLength(1);
      expect(missingTemplate.snapshot.clarifications[0].reason).toBe("missing_template");
    }
  });

  it("keeps unlinked X handoff disabled and preserves independent Patreon and DeviantArt work", async () => {
    const readiness = new Map([["patreon", "available"], ["x", "needs_credential"], ["deviantart", "available"]] as const);
    const result = await compileNewPlan(args([intent(), teaser("x", "literal", "X"), teaser("deviantart", "literal", "DA")], { lookup: makeLookup({ readiness: readiness as never }) }));
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") {
      expect(result.snapshot.steps.find(s => s.capability === "publish_handoff" && s.destination === "x")?.enabled).toBe(false);
      expect(result.snapshot.steps.some(s => s.capability === "publish_handoff" && s.destination === "deviantart" && s.enabled)).toBe(true);
      expect(result.snapshot.clarifications.some(c => c.reason === "unlinked_destination")).toBe(true);
    }
  });

  it("rejects duplicate destination and teaser-only contract-gap requests", async () => {
    expect(await compileNewPlan(args([intent(), teaser("x", "literal", "one"), teaser("x", "literal", "two")]))).toEqual({ kind: "limitation", code: "invalid_interpretation" });
    expect(await compileNewPlan(args([teaser("x", "literal", "X")]))).toEqual({ kind: "limitation", code: "contract_gap" });
  });

  it("rejects forged quotes and does not invent a date when the resolver cannot resolve", async () => {
    const forged = intent({ request_quote: "not contained" });
    expect(await compileNewPlan(args([forged]))).toEqual({ kind: "limitation", code: "invalid_interpretation" });
    const timed = intent({ time_kind: "weekday", weekday: "friday", time_text: "Friday", request_quote: "Make a Patreon post titled A Patreon title Friday" });
    expect(await compileNewPlan(args([timed], { latestRequest: "Make a Patreon post titled A Patreon title Friday", calendarResolver: { resolve: () => null } }))).toMatchObject({ kind: "clarification_preview", slots: [{ reason: "unknown_time" }] });
    const resolved = await compileNewPlan(args([timed]));
    expect(resolved.kind).toBe("plan");
    if (resolved.kind === "plan") expect(resolved.snapshot.steps.find(s => s.capability === "prepare_post_draft")?.time).toEqual({ kind: "absolute", at_utc: "2026-10-16T10:00:00.000Z", timezone: "Europe/London", local: "2026-10-16T11:00" });
  });

  it("returns contract_gap for teaser-only and clarifies draft-only requests from an existing post", async () => {
    expect(await compileNewPlan(args([teaser("x", "literal", "X")]))).toMatchObject({ kind: "limitation", code: "contract_gap" });
    const newDraft = intent({ delivery_intent: "draft_only" });
    expect(await compileNewPlan(args([newDraft]))).toMatchObject({ kind: "clarification_preview", slots: [{ reason: "missing_post", field: "source", question: expect.stringContaining("new draft cannot use an existing Library post") }] });
  });

  it("allows READY unattached staged media without inventing a Post", async () => {
    const staged = { ...media, primaryPostId: null, postIds: [] };
    const result = await compileNewPlan(args([intent({ delivery_intent: "draft_only" })], { lookup: makeLookup({ media: [staged], posts: [] }) }));
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") {
      expect(result.snapshot.source).toMatchObject({ kind: "staged_media", post_id: null });
      expect(result.snapshot.steps.find(s => s.capability === "prepare_post_draft")).toMatchObject({ source_media_ids: ["media-1"], target_post_id: null });
    }
  });

  it("clarifies existing-post draft-only requests with or without selected attached media", async () => {
    const draftOnly = intent({ delivery_intent: "draft_only" });
    const postOnly = await compileNewPlan(args([draftOnly], { selectedPostIds: [post.id], selectedMediaIds: [] }));
    expect(postOnly).toMatchObject({
      kind: "clarification_preview",
      source: { kind: "existing_post", post_id: post.id, selected_media_ids: [] },
      slots: [{ reason: "missing_post", field: "source", question: expect.stringContaining("new draft cannot use an existing Library post") }]
    });
    expect(postOnly).not.toHaveProperty("snapshot");

    const postWithArt = await compileNewPlan(args([draftOnly], { selectedPostIds: [post.id], selectedMediaIds: [media.id] }));
    expect(postWithArt).toMatchObject({
      kind: "clarification_preview",
      source: { kind: "existing_post", post_id: post.id, selected_media_ids: [media.id] },
      slots: [{ reason: "missing_post", field: "source" }]
    });
    expect(postWithArt).not.toHaveProperty("snapshot");
  });

  it("keeps unresolved teaser and follow-up fields inert while preserving valid primary work", async () => {
    const unknownTeaser = intent({ ...teaser("x", "literal", "X"), destination: null, request_quote: "Make a teaser titled X" });
    const vagueFollowup = intent({ kind: "followup", destination: null, target_destination: null, title_mode: "none", title_text: null, delivery_intent: "none", social_action: null, time_kind: "publication_calendar_day", day_offset: 2, request_quote: "Stoke engagement on day two" });
    const request = "Make a Patreon post titled A Patreon title. Make a teaser titled X. Stoke engagement on day two";
    const result = await compileNewPlan(args([intent(), unknownTeaser, vagueFollowup], { latestRequest: request }));
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") {
      expect(result.snapshot.steps.some(s => s.capability === "prepare_post_draft")).toBe(true);
      expect(result.snapshot.steps.some(s => s.capability === "prepare_distribution" && s.destination === "x")).toBe(false);
      expect(result.snapshot.clarifications.map(c => c.reason)).toContain("unlinked_destination");
      expect(result.snapshot.clarifications.map(c => c.reason)).toContain("unknown_engagement_action");
    }
  });

  it("returns stable results for malformed interpretations, typed limitations and missing sources", async () => {
    await expect(compileNewPlan(args([], { interpreted: { requests: null } as unknown as InterpretedRequest }))).resolves.toEqual({ kind: "limitation", code: "invalid_interpretation" });
    expect(await compileNewPlan(args([intent()], { interpreted: { outcome: "limitation", base_revision: null, question: null, requests: [] } }))).toEqual({ kind: "limitation", code: "unsupported_request" });
    expect(await compileNewPlan(args([intent()], { selectedMediaIds: [], selectedPostIds: [] }))).toMatchObject({ kind: "clarification_preview", source: null, slots: [{ reason: "missing_post" }] });
    const conflicting = [intent({ source_ref: { mode: "post_id", id: "post-1" } }), intent({ ...teaser("deviantart", "literal", "DA"), source_ref: { mode: "post_id", id: "post-2" } })];
    expect(await compileNewPlan(args(conflicting))).toMatchObject({ kind: "clarification_preview", slots: [{ reason: "ambiguous_source" }] });
    const wrongTemplate = { ...template, id: "wrong-id" };
    expect(await compileNewPlan(args([intent(), teaser("x", "literal", "X")], { lookup: { ...makeLookup(), async loadTemplates() { return [wrongTemplate]; } } }))).toMatchObject({ kind: "plan", snapshot: { unresolved_requests: [{ intended_capability: "prepare_distribution" }] } });
    const template2 = { ...template, id: "template-2", name: "Tall teaser" };
    const variant = intent({ ...teaser("deviantart", "literal", "DA"), template_ref: { mode: "id", value: "template-2" } });
    expect(await compileNewPlan(args([intent(), teaser("x", "literal", "X"), variant], { lookup: makeLookup({ templates: [template, template2] }) }))).toMatchObject({ kind: "clarification_preview", slots: [{ reason: "missing_template" }] });
    const named = intent({ ...teaser("x", "literal", "X"), template_ref: { mode: "named", value: "Requested exact name" } });
    expect(await compileNewPlan(args([intent(), named], { lookup: { ...makeLookup(), async listTemplatesByName() { return [template]; } } }))).toMatchObject({ kind: "plan", snapshot: { unresolved_requests: [{ intended_capability: "prepare_distribution" }] } });
  });
});

describe("CP-06 compiler integration", () => {
  it("keeps creator-confirmed local time and manual fields while moving only the requested X teaser", async () => {
    const requestIntents = [intent(), absoluteTeaserIntent(), teaser("deviantart", "literal", "DA"), followup(1, "reply_block"), followup(2, "engagement_check")];
    const latestRequest = requestIntents.map(value => value.request_quote).join("; ");
    const initial = await compileNewPlan(args(requestIntents, { latestRequest, calendarResolver: createCalendarResolver() }));
    expect(initial.kind).toBe("plan");
    if (initial.kind !== "plan") return;
    const first = initial.snapshot;
    const xBefore = first.steps.find(s => s.capability === "prepare_distribution" && s.destination === "x");
    expect(xBefore?.time).toEqual({ kind: "absolute", at_utc: "2026-10-16T16:30:00.000Z", timezone: "Europe/London", local: "2026-10-16T17:30" });
    const manuallyEdited: PlanSnapshot = structuredClone(first);
    manuallyEdited.revision = 1;
    manuallyEdited.updated_at = "2026-10-15T11:00:00.000Z";
    const xManual = manuallyEdited.steps.find(s => s.capability === "prepare_distribution" && s.destination === "x");
    expect(xManual?.capability).toBe("prepare_distribution");
    if (xManual?.capability !== "prepare_distribution") return;
    const manualCopy = { mode: "literal", value: "Manual X title", origin: "creator" } as const;
    xManual.title = manualCopy;
    xManual.copy_title = manualCopy;
    const previous = xManual.time;
    expect(previous?.kind).toBe("absolute");
    if (previous?.kind !== "absolute") return;
    const handleMap = new Map([["handle-x", { creatorId, planId: manuallyEdited.plan_id, revision: 1, stepId: xManual.step_id }]]);
    const revise = revisionTimeIntent("handle-x", 1);
    const latest = "Move X teaser to next Friday";
    const result = await compilePlanRevision({
      current: manuallyEdited, authenticatedCreatorId: creatorId, handleMap, expectedRevision: 1,
      interpreted: interpreted([revise], 1), latestRequest: latest,
      requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: "Europe/London" }, frozenCreatorTimezone: "Europe/London", sourceRevision: "fp-v1", lookup: makeLookup(),
      confirmedTimes: new Map([[xManual.step_id, { creatorId, planId: manuallyEdited.plan_id, revision: 1, stepId: xManual.step_id, time: previous }]]),
      calendarResolver: createCalendarResolver(), now: () => "2026-10-15T12:00:00.000Z"
    });
    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    const revised = result.snapshot;
    expect(revised.revision).toBe(2);
    expect(revised.updated_at).toBe("2026-10-15T12:00:00.000Z");
    expect(revised.plan_id).toBe(manuallyEdited.plan_id);
    expect(revised.creator_id).toBe(manuallyEdited.creator_id);
    expect(revised.source).toEqual(manuallyEdited.source);
    expect(revised.review).toBe(manuallyEdited.review);
    expect(revised.created_at).toBe(manuallyEdited.created_at);
    expect(revised.distribution_groups).toEqual(manuallyEdited.distribution_groups);
    const revisedX = revised.steps.find(s => s.step_id === xManual.step_id);
    expect(revisedX?.time).toEqual({ kind: "absolute", at_utc: "2026-10-23T16:30:00.000Z", timezone: "Europe/London", local: "2026-10-23T17:30" });
    expect(revisedX?.title).toEqual(manualCopy);
    expect(revisedX?.capability === "prepare_distribution" && revisedX.copy_title).toEqual(manualCopy);
    expect(revised.steps.filter(s => s.step_id !== xManual.step_id)).toEqual(manuallyEdited.steps.filter(s => s.step_id !== xManual.step_id));
    expect(manuallyEdited.steps.find(s => s.step_id === xManual.step_id)?.time).toEqual(previous);
    expect(validatePlanWithContext(revised, trustedContext(revised)).ok).toBe(true);
    expect(revised.unresolved_requests).toEqual([]);

    const stale = await compilePlanRevision({ current: revised, authenticatedCreatorId: creatorId, handleMap, expectedRevision: 1, interpreted: interpreted([revise], 1), latestRequest: latest, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: "Europe/London" }, frozenCreatorTimezone: "Europe/London", sourceRevision: "fp-v1", lookup: makeLookup(), calendarResolver: createCalendarResolver() });
    expect(stale).toEqual({ kind: "conflict", code: "stale_revision" });
    expect(revised.revision).toBe(2);
  });

  it("does not require a timezone for title-only edits and lets follow-ups inherit the frozen zone", async () => {
    const initial = await compileNewPlan(args([intent()]));
    expect(initial.kind).toBe("plan");
    if (initial.kind !== "plan") return;
    const current = initial.snapshot;
    const primary = current.steps.find(s => s.capability === "prepare_post_draft");
    if (!primary) return;
    const handleMap = new Map([["primary", { creatorId, planId: current.plan_id, revision: 0, stepId: primary.step_id }]]);
    const titleEdit = intent({ command: "revise", target_handle: "primary", changed_fields: ["title"], title_mode: "literal", title_text: "Updated title", request_quote: "Change title to Updated title" });
    const titleResult = await compilePlanRevision({ current, authenticatedCreatorId: creatorId, handleMap, expectedRevision: 0, interpreted: interpreted([titleEdit], 0), latestRequest: "Change title to Updated title", requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: makeLookup(), now: () => "2026-10-15T12:00:00.000Z" });
    expect(titleResult.kind).toBe("plan");

    const withX = await compileNewPlan(args([intent(), teaser("x", "literal", "X")]));
    expect(withX.kind).toBe("plan");
    if (withX.kind !== "plan") return;
    const follow = intent({ kind: "followup", target_handle: null, changed_fields: [], destination: "x", target_destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, enabled: true, delivery_intent: "none", social_action: "reply_block", time_kind: "publication_calendar_day", day_offset: 1, local_time: "10:30", timezone: null, time_text: "one day after publication", request_quote: "Add an X reply block one day after publication" });
    const addResult = await compilePlanRevision({ current: withX.snapshot, authenticatedCreatorId: creatorId, handleMap: new Map(), expectedRevision: 0, interpreted: interpreted([follow], 0), latestRequest: follow.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: "Europe/London" }, frozenCreatorTimezone: "Europe/London", sourceRevision: "fp-v1", lookup: makeLookup(), idFactory: () => "followup-new", now: () => "2026-10-15T12:00:00.000Z" });
    expect(addResult.kind).toBe("plan");
    if (addResult.kind === "plan") {
      const reply = addResult.snapshot.steps.find(s => s.capability === "reply_block");
      expect(reply?.time).toMatchObject({ timezone: "Europe/London", local_time: "10:30" });
      if (!reply) return;
      const remove = intent({ command: "remove", target_handle: "reply", changed_fields: [], kind: "followup", destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, enabled: null, delivery_intent: "none", social_action: "reply_block", time_kind: "none", time_text: null, request_quote: "Remove the X reply block" });
      const removed = await compilePlanRevision({ current: addResult.snapshot, authenticatedCreatorId: creatorId, handleMap: new Map([["reply", { creatorId, planId: addResult.snapshot.plan_id, revision: 1, stepId: reply.step_id }]]), expectedRevision: 1, interpreted: interpreted([remove], 1), latestRequest: remove.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: makeLookup(), now: () => "2026-10-15T13:00:00.000Z" });
      expect(removed).toMatchObject({ kind: "plan", snapshot: { revision: 2 } });
      if (removed.kind === "plan") expect(removed.snapshot.steps.some(s => s.step_id === reply.step_id)).toBe(false);
    }
  });

  it("appends only a scoped new teaser variant and rejects source, delivery, and follow-up time changes", async () => {
    const initial = await compileNewPlan(args([intent(), teaser("x", "literal", "X original")]));
    expect(initial.kind).toBe("plan");
    if (initial.kind !== "plan") return;
    const current = structuredClone(initial.snapshot);
    const x = current.steps.find(s => s.capability === "prepare_distribution" && s.destination === "x");
    if (x?.capability !== "prepare_distribution") return;
    x.title = { mode: "literal", value: "Creator-edited X", origin: "creator" };
    x.copy_title = x.title;
    const before = structuredClone(current);
    const addDa = teaser("deviantart", "literal", "DA variant");
    let addId = 0;
    const added = await compilePlanRevision({ current, authenticatedCreatorId: creatorId, handleMap: new Map(), expectedRevision: 0, interpreted: interpreted([addDa], 0), latestRequest: addDa.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: makeLookup(), idFactory: kind => `${kind}-added-${++addId}`, now: () => "2026-10-15T12:00:00.000Z" });
    expect(added.kind).toBe("plan");
    expect(current).toEqual(before);
    if (added.kind !== "plan") return;
    expect(added.snapshot.plan_id).toBe(current.plan_id);
    expect(added.snapshot.revision).toBe(1);
    expect(added.snapshot.steps.find(s => s.step_id === x.step_id)?.title).toEqual({ mode: "literal", value: "Creator-edited X", origin: "creator" });
    expect(added.snapshot.steps.filter(s => before.steps.some(old => old.step_id === s.step_id))).toEqual(before.steps);
    expect(added.snapshot.distribution_groups[0]?.group_id).toBe(before.distribution_groups[0]?.group_id);
    expect(added.snapshot.distribution_groups[0]?.destination_step_ids).toHaveLength(before.distribution_groups[0]!.destination_step_ids.length + 1);

    const foreignSource = teaser("deviantart", "literal", "DA");
    foreignSource.source_ref = { mode: "post_id", id: "other-post" };
    const rejectedSource = await compilePlanRevision({ current, authenticatedCreatorId: creatorId, handleMap: new Map(), expectedRevision: 0, interpreted: interpreted([foreignSource], 0), latestRequest: foreignSource.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: makeLookup() });
    expect(rejectedSource).toMatchObject({ kind: "limitation", code: "source_scope" });
    const noHandoff = teaser("deviantart", "literal", "DA");
    noHandoff.delivery_intent = "draft_only";
    const rejectedDelivery = await compilePlanRevision({ current, authenticatedCreatorId: creatorId, handleMap: new Map(), expectedRevision: 0, interpreted: interpreted([noHandoff], 0), latestRequest: noHandoff.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: makeLookup() });
    expect(rejectedDelivery).toMatchObject({ kind: "clarification", code: "unsupported_edit" });
    const wrongFollowupTime = intent({ kind: "followup", destination: "x", target_destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, delivery_intent: "none", social_action: "reply_block", time_kind: "weekday", weekday: "friday", day_offset: 1, local_time: "10:30", time_text: "Friday", request_quote: "Add a reply block Friday" });
    const rejectedFollowup = await compilePlanRevision({ current, authenticatedCreatorId: creatorId, handleMap: new Map(), expectedRevision: 0, interpreted: interpreted([wrongFollowupTime], 0), latestRequest: wrongFollowupTime.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: "Europe/London" }, frozenCreatorTimezone: "Europe/London", sourceRevision: "fp-v1", lookup: makeLookup() });
    expect(rejectedFollowup).toMatchObject({ kind: "clarification", code: "missing_evidence" });
    const disconnected = await compilePlanRevision({ current, authenticatedCreatorId: creatorId, handleMap: new Map(), expectedRevision: 0, interpreted: interpreted([Object.assign(teaser("deviantart", "literal", "DA"), { enabled: false })], 0), latestRequest: "Make a deviantart teaser titled DA", requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: makeLookup({ readiness: new Map([["patreon", "available"], ["x", "available"], ["deviantart", "needs_credential"]]) }) });
    expect(disconnected).toMatchObject({ kind: "clarification", code: "unlinked_destination" });
  });

  it("clarifies missing time evidence, zone mismatch, unavailable Patreon, and stale fresh authority", async () => {
    const firstRequests = [intent(), absoluteTeaserIntent()];
    const first = await compileNewPlan(args(firstRequests, { latestRequest: firstRequests.map(value => value.request_quote).join("; "), calendarResolver: createCalendarResolver() }));
    expect(first.kind).toBe("plan");
    if (first.kind !== "plan") return;
    const snapshot = structuredClone(first.snapshot);
    const x = snapshot.steps.find(s => s.capability === "prepare_distribution" && s.destination === "x");
    if (!x) return;
    const handleMap = new Map([["x", { creatorId, planId: snapshot.plan_id, revision: snapshot.revision, stepId: x.step_id }]]);
    const request = revisionTimeIntent("x", snapshot.revision);
    const base = { current: snapshot, authenticatedCreatorId: creatorId, handleMap, expectedRevision: snapshot.revision, interpreted: interpreted([request], snapshot.revision), latestRequest: request.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: "Europe/London" }, frozenCreatorTimezone: "Europe/London", sourceRevision: "fp-v1", lookup: makeLookup(), calendarResolver: createCalendarResolver() } as const;
    const noEvidence = await compilePlanRevision(base);
    expect(noEvidence).toMatchObject({ kind: "clarification", code: "unknown_time" });
    const wrongZone = await compilePlanRevision({ ...base, confirmedTimes: new Map([[x.step_id, { creatorId, planId: snapshot.plan_id, revision: snapshot.revision, stepId: x.step_id, time: x.time as Extract<NonNullable<typeof x.time>, { kind: "absolute" }> }]]), interpreted: interpreted([revisionTimeIntent("x", snapshot.revision, "next Friday", "America/New_York")], snapshot.revision), latestRequest: "Move X teaser to next Friday" });
    expect(wrongZone).toMatchObject({ kind: "clarification", code: "unknown_time" });

    const unavailable = await compileNewPlan(args([intent()], { lookup: makeLookup({ readiness: new Map([["patreon", "needs_credential"], ["x", "available"], ["deviantart", "available"]]) }) }));
    expect(unavailable).toMatchObject({ kind: "plan", snapshot: { clarifications: [{ reason: "unlinked_destination" }] } });
    const staleSource = await compilePlanRevision({ ...base, sourceRevision: "fp-v2", confirmedTimes: new Map([[x.step_id, { creatorId, planId: snapshot.plan_id, revision: snapshot.revision, stepId: x.step_id, time: x.time as Extract<NonNullable<typeof x.time>, { kind: "absolute" }> }]]) });
    expect(staleSource).toMatchObject({ kind: "limitation", code: "validation_failed" });
    const foreign = await compilePlanRevision({ ...base, authenticatedCreatorId: "other-creator" });
    expect(foreign).toMatchObject({ kind: "conflict", code: "creator_or_plan_scope_mismatch" });

    const teaserPlan = await compileNewPlan(args([intent(), teaser("x", "literal", "X")]));
    expect(teaserPlan.kind).toBe("plan");
    if (teaserPlan.kind === "plan") {
      const distribution = teaserPlan.snapshot.steps.find(s => s.capability === "prepare_distribution" && s.destination === "x");
      if (!distribution) return;
      const disable = intent({ command: "revise", target_handle: "d", changed_fields: ["enabled"], kind: "teaser", destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, enabled: false, delivery_intent: "none", request_quote: "Disable the X teaser" });
      const disabledWithChild = await compilePlanRevision({ current: teaserPlan.snapshot, authenticatedCreatorId: creatorId, handleMap: new Map([["d", { creatorId, planId: teaserPlan.snapshot.plan_id, revision: 0, stepId: distribution.step_id }]]), expectedRevision: 0, interpreted: interpreted([disable], 0), latestRequest: disable.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: makeLookup() });
      expect(disabledWithChild).toMatchObject({ kind: "clarification", code: "dependent_repair_required" });
      const duplicateRequest = teaser("x", "literal", "Another X");
      const duplicate = await compilePlanRevision({ current: teaserPlan.snapshot, authenticatedCreatorId: creatorId, handleMap: new Map(), expectedRevision: 0, interpreted: interpreted([duplicateRequest], 0), latestRequest: duplicateRequest.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: makeLookup() });
      expect(duplicate).toEqual({ kind: "conflict", code: "duplicate_delivery" });
      const titleChange = intent({ command: "revise", target_handle: "d", changed_fields: ["title"], kind: "teaser", destination: "x", title_mode: "literal", title_text: "Fresh title", template_ref: { mode: "none", value: null }, delivery_intent: "none", request_quote: "Change X title to Fresh title" });
      const staleTemplateLookup = makeLookup({ templates: [{ ...template, config: { ...config, aspectKey: "4:5" as const } }] });
      const staleTemplate = await compilePlanRevision({ current: teaserPlan.snapshot, authenticatedCreatorId: creatorId, handleMap: new Map([["d", { creatorId, planId: teaserPlan.snapshot.plan_id, revision: 0, stepId: distribution.step_id }]]), expectedRevision: 0, interpreted: interpreted([titleChange], 0), latestRequest: titleChange.request_quote, requestClock: { receivedAtUtc: "2026-10-15T10:00:00.000Z", timezone: null }, frozenCreatorTimezone: null, sourceRevision: "fp-v1", lookup: staleTemplateLookup });
      expect(staleTemplate).toMatchObject({ kind: "limitation", code: "validation_failed" });
    }
  });
});

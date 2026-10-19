import { describe, expect, it } from "vitest";
import { validatePlanShape, type PlanSnapshot, type PlanStep } from "../../src/conversational-planning/contract.js";
import type { InterpretedRequest, RequestIntent } from "../../src/conversational-planning/intent.js";
import { mergePlanRevision, type RevisionHandleMap } from "../../src/conversational-planning/revision-merge.js";

const copy = { mode: "literal", value: "Current teaser", origin: "creator" } as const;
const source: PlanStep = { step_id: "source", depends_on: [], enabled: true, title: copy, note: null, time: null, capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: ["media-1"], target_post_id: null };
const templateConfig = { schemaVersion: 1 as const, preset: "tight_crop" as const, aspectKey: "1:1" as const, compositionId: null, compositionProps: null, compositionVariantIndex: null, overlayDoc: {}, templateOptions: {}, destination: { selectedDestinationId: "x", customDestinationUrl: null } };
const preview: PlanStep = { step_id: "preview", depends_on: ["source"], enabled: true, title: copy, note: null, time: null, capability: "prepare_preview", source_step_id: "source", template_id: "template-1", template_config_snapshot: templateConfig };
const dist: PlanStep = { step_id: "dist-x", depends_on: ["source", "preview"], enabled: true, title: copy, note: null, time: null, capability: "prepare_distribution", source_step_id: "source", preview_step_id: "preview", distribution_group_id: "group-1", destination: "x", copy_title: copy };
const handoff: PlanStep = { step_id: "handoff-x", depends_on: ["dist-x"], enabled: true, title: copy, note: null, time: null, capability: "publish_handoff", distribution_step_id: "dist-x", destination: "x" };
const daDist: PlanStep = { step_id: "dist-da", depends_on: ["source", "preview"], enabled: true, title: copy, note: null, time: null, capability: "prepare_distribution", source_step_id: "source", preview_step_id: "preview", distribution_group_id: "group-1", destination: "deviantart", copy_title: copy };
const daHandoff: PlanStep = { step_id: "handoff-da", depends_on: ["dist-da"], enabled: true, title: copy, note: null, time: null, capability: "publish_handoff", distribution_step_id: "dist-da", destination: "deviantart" };
const followup: PlanStep = { step_id: "followup-x", depends_on: ["handoff-x"], enabled: true, title: copy, note: null, time: { kind: "after_publication_calendar_days", anchor_step_id: "handoff-x", day_offset: 1, timezone: "Europe/London", local_time: "10:30" }, capability: "reply_block", publication_step_id: "handoff-x", destination: "x", target_post_id: null };
const snapshot = (steps: PlanStep[] = [source, preview, dist, handoff, followup]): PlanSnapshot => ({ schema_version: 1, plan_id: "plan-1", creator_id: "creator-1", revision: 3, review: "proposed", source: { kind: "existing_post", post_id: "post-1", selected_media_ids: ["media-1"], creative_work_id: null, creative_series_member_id: null, source_revision: "fp-1" }, steps, distribution_groups: [{ group_id: "group-1", source_step_id: "source", preview_step_id: "preview", destination_step_ids: ["dist-x"] }], unresolved_requests: [], clarifications: [], requested_text_quote: "Original request", created_at: "2026-10-15T10:00:00.000Z", updated_at: "2026-10-15T10:00:00.000Z" });
const ambiguousSnapshot = (): PlanSnapshot => { const result = snapshot([...snapshot().steps, daDist, daHandoff]); result.distribution_groups[0]!.destination_step_ids.push("dist-da"); return result; };
const intent = (overrides: Partial<RequestIntent> = {}): RequestIntent => ({ command: "revise", target_handle: "step-x", changed_fields: ["title"], kind: "teaser", source_ref: { mode: "selection", id: null }, destination: "x", title_mode: "literal", title_text: "New exact title", template_ref: { mode: "none", value: null }, enabled: null, delivery_intent: "none", social_action: null, time_kind: "none", local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null, local_time: null, time_text: null, request_quote: "Rename the X teaser to New exact title", ...overrides });
const root = (requests: RequestIntent[], overrides: Partial<InterpretedRequest> = {}): InterpretedRequest => ({ base_revision: 3, outcome: "proposal", question: null, requests, ...overrides });
const handles: RevisionHandleMap = new Map([["step-x", { creatorId: "creator-1", planId: "plan-1", revision: 3, stepId: "dist-x" }], ["followup-handle", { creatorId: "creator-1", planId: "plan-1", revision: 3, stepId: "followup-x" }]]);
const merge = (requests: RequestIntent[], current = snapshot(), map: RevisionHandleMap = handles, latest = requests.map(r => r.request_quote).join(". "), interpreted = root(requests), expected = 3) => mergePlanRevision(current, map, interpreted, latest, expected);

describe("mergePlanRevision", () => {
  it("returns a sparse title patch and keeps the snapshot untouched", () => {
    const current = snapshot();
    expect(validatePlanShape(current).ok).toBe(true);
    const before = structuredClone(current);
    const result = merge([intent()], current);
    expect(result).toMatchObject({ kind: "patch", baseRevision: 3, operations: [{ kind: "revise", stepId: "dist-x", changes: [{ field: "title", expected: copy }] }] });
    expect(current).toEqual(before);
  });

  it("adds an unhandled request and never asks the model for a step ID", () => {
    const request = intent({ command: "add", target_handle: null, changed_fields: [], kind: "teaser", destination: "bluesky", title_text: "A Bluesky teaser", request_quote: "Add a new Bluesky teaser titled A Bluesky teaser" });
    expect(merge([request])).toMatchObject({ kind: "patch", operations: [{ kind: "add", intent: request }] });
  });

  it("returns unchanged only for an identical add and distinguishes follow-up day/action pairs", () => {
    const retry = intent({ command: "add", target_handle: null, changed_fields: [], kind: "teaser", delivery_intent: "prepare_for_creator_handoff", title_text: "Current teaser", destination: "x", source_ref: { mode: "post_id", id: "post-1" }, template_ref: { mode: "id", value: "template-1" }, request_quote: "Add X teaser titled Current teaser using template template-1 from post-1" });
    expect(merge([retry])).toEqual({ kind: "unchanged", planId: "plan-1", revision: 3 });
    const otherSource = { ...retry, source_ref: { mode: "post_id" as const, id: "post-2" }, request_quote: "Add X teaser titled Current teaser using template template-1 from post-2" };
    expect(merge([otherSource])).toEqual({ kind: "conflict", code: "duplicate_delivery" });
    const changedTime = { ...retry, time_kind: "weekday" as const, time_text: "Friday", request_quote: "Add X teaser titled Current teaser on Friday" };
    expect(merge([changedTime])).toEqual({ kind: "conflict", code: "duplicate_delivery" });
    const dayTwo = intent({ command: "add", target_handle: null, changed_fields: [], kind: "followup", destination: "x", target_destination: "x", title_mode: "none", title_text: null, delivery_intent: "none", social_action: "engagement_check", time_kind: "publication_calendar_day", day_offset: 2, time_text: "day 2", request_quote: "Add X engagement check on day 2" });
    expect(merge([dayTwo])).toMatchObject({ kind: "patch", operations: [{ kind: "add", intent: dayTwo }] });
  });

  it("rejects stale roots, missing or foreign handles, and missing handles", () => {
    expect(merge([intent()], snapshot(), handles, undefined, root([intent()], { base_revision: 2 }))).toEqual({ kind: "conflict", code: "stale_revision" });
    expect(merge([intent()], snapshot(), new Map())).toEqual({ kind: "conflict", code: "invalid_handle" });
    const foreign = new Map([["step-x", { creatorId: "other", planId: "plan-1", revision: 3, stepId: "dist-x" }]]);
    expect(merge([intent()], snapshot(), foreign)).toEqual({ kind: "conflict", code: "invalid_handle" });
    expect(merge([intent({ target_handle: null })])).toMatchObject({ kind: "clarification", code: "missing_handle" });
  });

  it("rejects unknown fields, out-of-quote titles, duplicate handles and duplicate deliveries", () => {
    const unknown = { ...intent(), status: "published" } as RequestIntent;
    expect(merge([unknown])).toEqual({ kind: "conflict", code: "invalid_intent" });
    expect(merge([intent({ title_text: "invented title" })])).toMatchObject({ kind: "clarification", code: "missing_evidence" });
    expect(merge([intent(), intent({ request_quote: "Also rename the X teaser to New exact title" })])).toEqual({ kind: "conflict", code: "conflicting_change" });
    const add = intent({ command: "add", target_handle: null, changed_fields: [], title_mode: "none", title_text: null, request_quote: "Add X teaser" });
    expect(merge([add, { ...add, request_quote: "Add another X teaser" }])).toEqual({ kind: "conflict", code: "duplicate_delivery" });
  });

  it("preserves manual fields outside the mask and supports explicit enable changes", () => {
    const manualTime = { kind: "absolute", at_utc: "2026-10-20T09:00:00.000Z", timezone: "Europe/London", local: "2026-10-20T10:00" } as const;
    const current = snapshot([source, preview, { ...dist, time: manualTime, copy_title: { mode: "literal", value: "Manual title", origin: "creator" } }, handoff, followup]);
    const enableIntent = intent({ changed_fields: ["enabled"], title_mode: "none", title_text: null, enabled: false, request_quote: "Disable the X teaser" });
    expect(merge([enableIntent], current)).toMatchObject({ kind: "patch", operations: [{ kind: "revise", changes: [{ field: "enabled", expected: true }] }] });
    const nullMask = intent({ changed_fields: ["enabled"], enabled: null });
    expect(merge([nullMask], current)).toMatchObject({ kind: "clarification", code: "missing_evidence" });
    expect(merge([intent({ title_text: "Manual title", request_quote: "Rename the X teaser to Manual title" })], current)).toEqual({ kind: "unchanged", planId: "plan-1", revision: 3 });
  });

  it("routes a template-only teaser edit through the related preview handle", () => {
    const templateChange = intent({ target_handle: "preview-handle", changed_fields: ["template"], title_mode: "none", title_text: null, template_ref: { mode: "id", value: "template-2" }, request_quote: "Use template template-2 for the X teaser" });
    const map = new Map([["preview-handle", { creatorId: "creator-1", planId: "plan-1", revision: 3, stepId: "preview" }]]);
    expect(merge([templateChange], snapshot(), map)).toMatchObject({ kind: "patch", operations: [{ kind: "revise", stepId: "preview", changes: [{ field: "template", expected: "template-1" }] }] });
  });

  it("clarifies ambiguous no-handle edits, target/destination replacement and dependency-breaking removal", () => {
    const unqualified = intent({ target_handle: null, destination: null, request_quote: "Move the teaser to Friday" });
    expect(merge([unqualified])).toMatchObject({ kind: "clarification", code: "missing_handle" });
    expect(validatePlanShape(ambiguousSnapshot()).ok).toBe(true);
    expect(merge([unqualified], ambiguousSnapshot())).toMatchObject({ kind: "clarification", code: "ambiguous_target" });
    expect(merge([intent({ changed_fields: ["destination"], destination: "deviantart", request_quote: "Move X teaser to DeviantArt" })])).toMatchObject({ kind: "clarification", code: "dependent_repair_required" });
    const remove = intent({ command: "remove", changed_fields: [], request_quote: "Remove the X teaser" });
    expect(merge([remove])).toMatchObject({ kind: "clarification", code: "dependent_repair_required" });
    const removeFollowup = intent({ command: "remove", changed_fields: [], kind: "followup", target_handle: "followup-handle", destination: "x", social_action: "reply_block", request_quote: "Remove the X reply block" });
    expect(merge([removeFollowup])).toEqual({ kind: "patch", planId: "plan-1", baseRevision: 3, operations: [{ kind: "remove", stepId: "followup-x" }] });
  });

  it("returns unchanged for a no-op retry and never accepts authority status fields", () => {
    expect(merge([intent({ title_text: "Current teaser", request_quote: "Rename the X teaser to Current teaser" })])).toEqual({ kind: "unchanged", planId: "plan-1", revision: 3 });
    expect(merge([intent()], snapshot(), handles, undefined, { ...root([intent()]), review: "approved_for_preparation" } as InterpretedRequest)).toEqual({ kind: "conflict", code: "invalid_intent" });
  });
});

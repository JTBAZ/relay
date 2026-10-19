import { describe, expect, it } from "vitest";
import {
  validatePlanShape,
  validatePlanWithContext,
  validateStepPointer,
  type PlanSnapshot,
  type TrustedPlanContext
} from "../../src/conversational-planning/contract.js";
import type { PreviewTemplateConfigV1 } from "../../src/distribution/preview-template-config.js";

const template: PreviewTemplateConfigV1 = {
  schemaVersion: 1,
  preset: "tight_crop",
  aspectKey: "1:1",
  compositionId: null,
  compositionProps: null,
  compositionVariantIndex: null,
  overlayDoc: {},
  templateOptions: {},
  destination: { selectedDestinationId: null, customDestinationUrl: null }
};

function journey(): PlanSnapshot {
  const title = { mode: "part_substitution" as const, prefix: "Series Part ", part: "4", suffix: "", part_source: "creative_series_member" as const };
  const base = { depends_on: [] as string[], enabled: true, title, note: null, time: null };
  return {
    schema_version: 1,
    plan_id: "plan-1",
    creator_id: "creator-1",
    revision: 0,
    review: "proposed",
    source: {
      kind: "existing_post", post_id: "post-1", selected_media_ids: ["media-1"],
      creative_work_id: "work-1", creative_series_member_id: "member-1", source_revision: "source-rev-7"
    },
    steps: [
      { ...base, step_id: "draft", capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null },
      { ...base, step_id: "preview", depends_on: ["draft"], capability: "prepare_preview", source_step_id: "draft", template_id: "template-1", template_config_snapshot: structuredClone(template) },
      { ...base, step_id: "patreon-dist", depends_on: ["draft"], capability: "prepare_distribution", source_step_id: "draft", preview_step_id: null, distribution_group_id: "group-1", destination: "patreon", copy_title: title },
      { ...base, step_id: "x-dist", depends_on: ["draft", "preview"], capability: "prepare_distribution", source_step_id: "draft", preview_step_id: "preview", distribution_group_id: "group-1", destination: "x", copy_title: { ...title, suffix: " Teaser" } },
      { ...base, step_id: "da-dist", depends_on: ["draft", "preview"], capability: "prepare_distribution", source_step_id: "draft", preview_step_id: "preview", distribution_group_id: "group-1", destination: "deviantart", copy_title: { ...title, suffix: " Teaser" } },
      { ...base, step_id: "patreon-handoff", depends_on: ["patreon-dist"], capability: "publish_handoff", distribution_step_id: "patreon-dist", destination: "patreon" },
      { ...base, step_id: "x-handoff", depends_on: ["x-dist"], capability: "publish_handoff", distribution_step_id: "x-dist", destination: "x" },
      { ...base, step_id: "da-handoff", depends_on: ["da-dist"], capability: "publish_handoff", distribution_step_id: "da-dist", destination: "deviantart" },
      { ...base, step_id: "x-day-1", depends_on: ["x-handoff"], capability: "reply_block", publication_step_id: "x-handoff", destination: "x", target_post_id: null, time: { kind: "after_publication_calendar_days", anchor_step_id: "x-handoff", day_offset: 1, timezone: "Europe/London", local_time: "10:00" } },
      { ...base, step_id: "x-day-2", depends_on: ["x-handoff"], capability: "engagement_check", publication_step_id: "x-handoff", destination: "x", target_post_id: null, time: { kind: "after_publication_calendar_days", anchor_step_id: "x-handoff", day_offset: 2, timezone: "Europe/London", local_time: "10:00" } }
    ],
    distribution_groups: [{ group_id: "group-1", source_step_id: "draft", preview_step_id: "preview", destination_step_ids: ["patreon-dist", "x-dist", "da-dist"] }],
    unresolved_requests: [],
    clarifications: [],
    requested_text_quote: "Prepare the Patreon post and X/DeviantArt teasers, then remind me on the next two days.",
    created_at: "2026-10-15T09:00:00.000Z",
    updated_at: "2026-10-15T09:00:00.000Z"
  };
}

const context = (): TrustedPlanContext => ({
  authenticatedCreatorId: "creator-1",
  ownedMediaIds: new Set(["media-1"]),
  sourceMediaRelations: new Map([["media-1", { post_ids: new Set(["post-1"]), creative_work_ids: new Set(["work-1"]), creative_series_member_ids: new Set(["member-1"]) }]]),
  ownedPostIds: new Set(["post-1"]),
  ownedTemplateIds: new Set(["template-1"]),
  ownedCreativeWorkIds: new Set(["work-1"]),
  ownedCreativeSeriesMemberIds: new Set(["member-1"]),
  verifiedSeriesMemberPartLabels: new Map([["member-1", "4"]]),
  currentTemplateConfigs: new Map([["template-1", structuredClone(template)]]),
  connectedDestinations: new Set(["patreon", "x", "deviantart"]),
  hasAutopostEntitlement: true,
  currentSourceRevision: "source-rev-7",
  ownedTargetPostIds: new Set()
});

const codes = (result: ReturnType<typeof validatePlanShape>) => result.ok ? [] : result.issues.map((x) => x.code);

describe("conversational planning pure contract", () => {
  it("accepts the full Patreon-first preview journey and separates each handoff from X follow-ups", () => {
    const result = validatePlanShape(journey());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const patreon = result.value.steps.find((s) => s.step_id === "patreon-dist");
      expect(patreon?.capability).toBe("prepare_distribution");
      if (patreon?.capability === "prepare_distribution") expect(patreon.preview_step_id).toBeNull();
      expect(result.value.steps.filter((s) => s.capability === "prepare_distribution")).toHaveLength(3);
      expect(result.value.steps.filter((s) => s.capability === "reply_block" || s.capability === "engagement_check")).toHaveLength(2);
    }
  });

  it("requires an unresolved request and matching blocking clarification instead of inventing a missing field", () => {
    const p = journey();
    p.unresolved_requests = [{ request_id: "request-1", requested_text_quote: "Stoke engagement", intended_capability: null, intended_destination: null, blocking_slot_ids: ["action-slot"] }];
    p.clarifications = [{ slot_id: "action-slot", field: "action", question: "Which action should I prepare?", affected_node_ids: ["request-1"], blocking: true, reason: "unknown_engagement_action" }];
    expect(validatePlanShape(p).ok).toBe(true);
    p.clarifications = [];
    expect(codes(validatePlanShape(p))).toContain("missing_matching_blocking_slot");
  });

  it("keeps a missing-template teaser request unresolved while the independent Patreon path remains reviewable", () => {
    const p = journey();
    p.steps = p.steps.filter((s) => !["preview", "x-dist", "da-dist", "x-handoff", "da-handoff", "x-day-1", "x-day-2"].includes(s.step_id));
    p.distribution_groups = [{ group_id: "group-1", source_step_id: "draft", preview_step_id: null, destination_step_ids: ["patreon-dist"] }];
    p.unresolved_requests = [{ request_id: "teaser-request", requested_text_quote: "Make X and DeviantArt teasers", intended_capability: "prepare_preview", intended_destination: null, blocking_slot_ids: ["template-slot"] }];
    p.clarifications = [{ slot_id: "template-slot", field: "template_id", question: "Which saved Previewizer template should I use?", affected_node_ids: ["teaser-request"], blocking: true, reason: "missing_template" }];
    expect(validatePlanShape(p).ok).toBe(true);
    expect(p.steps.some((s) => s.step_id === "patreon-dist")).toBe(true);
    expect(p.steps.some((s) => s.capability === "prepare_preview")).toBe(false);
  });

  it("preserves a literal X title and rejects unknown title, capability, and destination fields", () => {
    const p = journey();
    p.steps[0]!.title = { mode: "literal", value: "Series Part X", origin: "creator" };
    expect(validatePlanShape(p).ok).toBe(true);
    const unknownCapability = journey() as unknown as Record<string, any>;
    unknownCapability.steps[0].capability = "post_anywhere";
    expect(codes(validatePlanShape(unknownCapability))).toContain("unknown_capability");
    const unknownDestination = journey() as unknown as Record<string, any>;
    unknownDestination.steps[2].destination = "instagram";
    expect(codes(validatePlanShape(unknownDestination))).toContain("unknown_destination");
  });

  it("keeps an unknown part unresolved, and rejects cycles, missing prerequisites, and duplicate step IDs", () => {
    const p = journey();
    p.unresolved_requests = [{ request_id: "unknown-part", requested_text_quote: "Series Part X", intended_capability: "prepare_post_draft", intended_destination: "patreon", blocking_slot_ids: ["part-slot"] }];
    p.clarifications = [{ slot_id: "part-slot", field: "part", question: "What part number should I use?", affected_node_ids: ["unknown-part"], blocking: true, reason: "unknown_part" }];
    expect(validatePlanShape(p).ok).toBe(true);
    const cycle = journey();
    cycle.steps[0]!.depends_on = ["preview"];
    expect(codes(validatePlanShape(cycle))).toContain("dependency_cycle");
    const missing = journey();
    missing.steps[1]!.depends_on = [];
    expect(codes(validatePlanShape(missing))).toContain("missing_source_dependency");
    const duplicate = journey();
    duplicate.steps[1]!.step_id = "draft";
    expect(codes(validatePlanShape(duplicate))).toContain("duplicate_step_id");
  });

  it("rejects cross-destination anchors and a teaser variant without preview dependency", () => {
    const cross = journey();
    const social = cross.steps.find((s) => s.step_id === "x-day-1")!;
    if (social.capability === "reply_block") social.publication_step_id = "da-handoff";
    expect(codes(validatePlanShape(cross))).toContain("publication_anchor_mismatch");
    const missingPreview = journey();
    const x = missingPreview.steps.find((s) => s.step_id === "x-dist");
    if (x?.capability === "prepare_distribution") { x.preview_step_id = null; x.depends_on = ["draft"]; }
    expect(codes(validatePlanShape(missingPreview))).toContain("teaser_requires_preview");
    const wrongPreview = journey();
    const xPreview = wrongPreview.steps.find((s) => s.step_id === "x-dist");
    if (xPreview?.capability === "prepare_distribution") xPreview.preview_step_id = "draft";
    expect(codes(validatePlanShape(wrongPreview))).toContain("invalid_preview_step");
    const duplicateDestination = journey();
    const da = duplicateDestination.steps.find((s) => s.step_id === "da-dist");
    if (da?.capability === "prepare_distribution") da.destination = "x";
    expect(codes(validatePlanShape(duplicateDestination))).toContain("duplicate_destination_variant");
  });

  it("checks absolute UTC/local/timezone agreement and rejects normalized impossible dates", () => {
    const valid = { kind: "absolute" as const, at_utc: "2026-10-15T09:00:00.000Z", timezone: "Europe/London", local: "2026-10-15T10:00" };
    const p = journey();
    p.steps[0]!.time = valid;
    expect(validatePlanShape(p).ok).toBe(true);
    p.steps[0]!.time = { ...valid, local: "2026-10-15T09:00" };
    expect(codes(validatePlanShape(p))).toContain("utc_local_timezone_mismatch");
    p.steps[0]!.time = { ...valid, local: "2026-02-30T10:00" };
    expect(codes(validatePlanShape(p))).toContain("invalid_local_datetime");
    p.steps[0]!.time = { ...valid, at_utc: "2026-02-30T09:00:00.000Z", local: "2026-03-02T09:00" };
    expect(codes(validatePlanShape(p))).toContain("invalid_utc_timestamp");
    p.steps[0]!.time = { ...valid, at_utc: "2026-02-30T09:00:00.000Z", local: "2026-03-02T09:00" };
    expect(codes(validatePlanShape(p))).toContain("invalid_utc_timestamp");
  });

  it("requires strict exact template shape and rejects execution status or evidence fields", () => {
    const extraTemplate = journey();
    const preview = extraTemplate.steps.find((s) => s.step_id === "preview");
    if (preview?.capability === "prepare_preview") (preview.template_config_snapshot as any).unexpected = true;
    expect(codes(validatePlanShape(extraTemplate))).toContain("unknown_field");
    const status = journey() as unknown as Record<string, any>;
    status.steps[0].status = "posted";
    expect(codes(validatePlanShape(status))).toContain("unknown_field");
  });

  it("returns validation errors for malformed arrays and nested steps without throwing", () => {
    for (const malformed of [
      { ...journey(), steps: null },
      { ...journey(), distribution_groups: null },
      { ...journey(), unresolved_requests: null },
      { ...journey(), clarifications: null },
      { ...journey(), steps: [null] },
      { ...journey(), steps: [{ ...journey().steps[0], depends_on: null }] }
    ]) {
      expect(() => validatePlanShape(malformed)).not.toThrow();
      expect(validatePlanShape(malformed).ok).toBe(false);
    }
  });

  it("enforces 32 steps, 16 clarification slots, and the 64 KiB snapshot limit", () => {
    const p = journey();
    const draft = p.steps[0]!;
    p.steps = Array.from({ length: 32 }, (_, i) => ({ ...structuredClone(draft), step_id: `draft-${i}` }));
    p.distribution_groups = [];
    expect(validatePlanShape(p).ok).toBe(true);
    p.steps.push({ ...structuredClone(draft), step_id: "draft-33" });
    expect(codes(validatePlanShape(p))).toContain("invalid_step_count");

    const tooManySlots = journey();
    tooManySlots.unresolved_requests = Array.from({ length: 17 }, (_, i) => ({ request_id: `request-${i}`, requested_text_quote: "Specify the missing action", intended_capability: null, intended_destination: null, blocking_slot_ids: [`slot-${i}`] }));
    tooManySlots.clarifications = tooManySlots.unresolved_requests.map((r) => ({ slot_id: r.blocking_slot_ids[0]!, field: "action", question: "Which action?", affected_node_ids: [r.request_id], blocking: true as const, reason: "unknown_engagement_action" as const }));
    expect(codes(validatePlanShape(tooManySlots))).toContain("invalid_clarification_count");

    const tooLarge = journey();
    tooLarge.steps = Array.from({ length: 32 }, (_, i) => ({ ...structuredClone(draft), step_id: `size-${i}`, note: "n".repeat(2_000) }));
    tooLarge.distribution_groups = [];
    expect(codes(validatePlanShape(tooLarge))).toContain("plan_too_large");
  });

  it("validates ownership, entitlement, source freshness, and destination context separately", () => {
    const result = validatePlanWithContext(journey(), context());
    expect(result.ok).toBe(true);
    const unowned = context();
    unowned.ownedMediaIds = new Set();
    expect(validatePlanWithContext(journey(), unowned)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "media_scope_mismatch" })]) });
    const mismatchedRelation = context();
    mismatchedRelation.sourceMediaRelations = new Map([["media-1", { post_ids: new Set(["other-post"]), creative_work_ids: new Set(["work-1"]), creative_series_member_ids: new Set(["member-1"]) }]]);
    expect(validatePlanWithContext(journey(), mismatchedRelation)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "source_media_post_mismatch" })]) });
    const stale = context();
    stale.currentSourceRevision = "newer";
    expect(validatePlanWithContext(journey(), stale)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "stale_source_fingerprint" })]) });
    const noEntitlement = context();
    noEntitlement.hasAutopostEntitlement = false;
    expect(validatePlanWithContext(journey(), noEntitlement)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "autopost_entitlement_required" })]) });
  });

  it("enforces finite pointer slot to authority kind mapping and creator scope", () => {
    const authorities = new Map([["event-1", { creator_id: "creator-1", kind: "schedule_event" as const }]]);
    expect(validateStepPointer({ node_id: "step-1", kind: "schedule_event", authority_id: "event-1", slot: "attention_event" }, "creator-1", authorities).ok).toBe(true);
    expect(codes(validateStepPointer({ node_id: "step-1", kind: "schedule_event", authority_id: "event-1", slot: "current_attempt" }, "creator-1", authorities) as any)).toContain("pointer_slot_kind_mismatch");
    expect(validateStepPointer({ node_id: "step-1", kind: "schedule_event", authority_id: "event-1", slot: "attention_event" }, "creator-2", authorities).ok).toBe(false);
  });

  it("does not let a disconnected teaser destination invalidate its reviewable distribution variant", () => {
    const p = journey(), trusted = context();
    trusted.connectedDestinations = new Set(["patreon"]);
    for (const step of p.steps) if (step.step_id === "x-handoff" || step.step_id === "da-handoff") step.enabled = false;
    p.steps = p.steps.filter((s) => s.step_id !== "x-day-1" && s.step_id !== "x-day-2");
    p.clarifications = ["x-handoff", "da-handoff"].map((stepId, i) => ({ slot_id: `unlinked-${i}`, field: "destination", question: "Connect this destination to continue.", affected_node_ids: [stepId], blocking: true as const, reason: "unlinked_destination" as const }));
    expect(validatePlanWithContext(p, trusted).ok).toBe(true);
  });

  it("allows a clarification-only visual request while keeping it inert", () => {
    const p = journey();
    p.unresolved_requests = [{ request_id: "visual-request", requested_text_quote: "Make the image more dramatic", intended_capability: null, intended_destination: null, blocking_slot_ids: ["visual-slot"] }];
    p.clarifications = [{ slot_id: "visual-slot", field: "request", question: "I cannot infer visual edits from the image. What text action do you want?", affected_node_ids: ["visual-request"], blocking: true, reason: "visual_request" }];
    const result = validatePlanShape(p);
    expect(result.ok).toBe(true);
    expect(p.steps.some((s) => s.step_id === "visual-request")).toBe(false);
  });
});

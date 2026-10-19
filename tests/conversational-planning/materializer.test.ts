import { describe, expect, it, vi } from "vitest";
import { createPlanPreparationAdapter } from "../../src/conversational-planning/materializer.js";
import type { PlanSnapshot, PlanStep, StepPointer } from "../../src/conversational-planning/contract.js";
import type { ConversationalPreparationRepository, PrepareOutputInput, PrepareOutputResult, ReadResult } from "../../src/conversational-planning/persistence.js";

const creatorId = "creator-1";
const planId = "plan-1";
function sourceStep(overrides: Partial<Extract<PlanStep, { capability: "prepare_post_draft" }>> = {}): Extract<PlanStep, { capability: "prepare_post_draft" }> {
  return {
    step_id: "step-1", capability: "prepare_post_draft", depends_on: [], enabled: true,
    title: { mode: "literal", value: "Title", origin: "creator" }, note: null, time: null,
    intended_destination: "patreon", source_media_ids: ["media-1"], target_post_id: "post-1", ...overrides
  };
}
function approvedPlan(overrides: Partial<PlanSnapshot> = {}): PlanSnapshot {
  return {
    schema_version: 1, plan_id: planId, creator_id: creatorId, revision: 4, review: "approved_for_preparation",
    source: { kind: "existing_post", post_id: "post-1", selected_media_ids: ["media-1"], creative_work_id: null, creative_series_member_id: null, source_revision: "src1_" + "a".repeat(64) },
    steps: [sourceStep()], distribution_groups: [], unresolved_requests: [], clarifications: [],
    requested_text_quote: "Create a post", created_at: "2026-10-16T10:00:00.000Z", updated_at: "2026-10-16T10:00:00.000Z", ...overrides
  };
}
function linkedResult(input: PrepareOutputInput, currentPlan = approvedPlan()): PrepareOutputResult {
  const pointer: StepPointer = input.output === "relay_post"
    ? { node_id: input.stepId, slot: "relay_post", kind: "relay_post", authority_id: "post-1" }
    : input.output === "draft"
      ? { node_id: input.stepId, slot: "draft", kind: "autopost_draft", authority_id: `draft-${input.stepId}` }
      : { node_id: input.stepId, slot: "attention_event", kind: "schedule_event", authority_id: `event-${input.stepId}` };
  const current = { ...currentPlan, revision: input.approvedRevision };
  return { kind: "linked", current, pointer, pointers: [pointer], reused: false };
}
function harness(plan = approvedPlan(), prepareOutput?: (input: PrepareOutputInput) => Promise<PrepareOutputResult> | PrepareOutputResult) {
  const get = vi.fn(async (): Promise<ReadResult> => ({ kind: "ok", current: plan, pointers: [] }));
  const prepare = vi.fn(prepareOutput ?? ((input: PrepareOutputInput) => linkedResult(input, plan)));
  const adapter = createPlanPreparationAdapter({ repository: { get }, outputs: { prepareOutput: prepare } as ConversationalPreparationRepository });
  return { adapter, get, prepare };
}
const request = { creatorId, planId, approvedRevision: 4 };

describe("minimal preparation materializer", () => {
  it("reuses the selected existing post, then links its absolute-time attention in order", async () => {
    const plan = approvedPlan({ steps: [sourceStep({ time: { kind: "absolute", at_utc: "2026-10-20T09:00:00.000Z", timezone: "UTC", local: "2026-10-20T09:00" } })] });
    const h = harness(plan);
    expect(await h.adapter.prepare(request)).toEqual({ kind: "authorities_linked" });
    expect(h.prepare.mock.calls.map(([call]) => call.output)).toEqual(["relay_post", "attention_event"]);
    expect(h.prepare.mock.calls[0]![0]).toEqual({ ...request, stepId: "step-1", output: "relay_post" });
  });

  it("requests a staged draft and never invents an attention event for an untimed source", async () => {
    const plan = approvedPlan({ source: { kind: "staged_media", post_id: null, selected_media_ids: ["media-1"], creative_work_id: null, creative_series_member_id: null, source_revision: "src1_" + "a".repeat(64) }, steps: [sourceStep({ target_post_id: null })] });
    const h = harness(plan);
    expect(await h.adapter.prepare(request)).toEqual({ kind: "authorities_linked" });
    expect(h.prepare.mock.calls.map(([call]) => call.output)).toEqual(["draft"]);
  });

  it("uses a bounded dependency order and runs supported sources before reporting unsupported enabled work", async () => {
    const downstream = { step_id: "preview-1", capability: "prepare_preview", depends_on: ["step-1"], enabled: true, title: { mode: "literal", value: "Preview", origin: "creator" }, note: null, time: null, source_step_id: "step-1", template_id: "template-1", template_config_snapshot: {} } as unknown as PlanStep;
    const h = harness(approvedPlan({ steps: [downstream, sourceStep()] }));
    expect(await h.adapter.prepare(request)).toEqual({ kind: "blocked", code: "authority_gap" });
    expect(h.prepare.mock.calls.map(([call]) => call.output)).toEqual(["relay_post"]);
  });

  it("does no output work for disabled source steps and rejects plans without an enabled source", async () => {
    const disabled = harness(approvedPlan({ steps: [sourceStep({ enabled: false })] }));
    expect(await disabled.adapter.prepare(request)).toEqual({ kind: "blocked", code: "authority_gap" });
    expect(disabled.prepare).not.toHaveBeenCalled();
    const unsupported = { step_id: "preview-1", capability: "prepare_preview", depends_on: [], enabled: true, title: { mode: "literal", value: "Preview", origin: "creator" }, note: null, time: null, source_step_id: "step-1", template_id: "template-1", template_config_snapshot: {} } as unknown as PlanStep;
    const noSource = harness(approvedPlan({ steps: [unsupported] }));
    expect(await noSource.adapter.prepare(request)).toEqual({ kind: "blocked", code: "authority_gap" });
    expect(noSource.prepare).not.toHaveBeenCalled();
  });

  it("requires the exact current creator, plan, approved review, and revision before output work", async () => {
    for (const plan of [
      approvedPlan({ creator_id: "creator-2" }),
      approvedPlan({ plan_id: "plan-2" }),
      approvedPlan({ review: "cancelled" }),
      approvedPlan({ revision: 3 })
    ]) {
      const h = harness(plan);
      expect(await h.adapter.prepare(request)).toEqual({ kind: "blocked", code: "authority_gap" });
      expect(h.prepare).not.toHaveBeenCalled();
    }
  });

  it("delegates repeated calls to the owning repository instead of caching success", async () => {
    const h = harness();
    expect(await h.adapter.prepare(request)).toEqual({ kind: "authorities_linked" });
    expect(await h.adapter.prepare(request)).toEqual({ kind: "authorities_linked" });
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(h.prepare).toHaveBeenCalledTimes(2);
  });

  it("preserves a linked source when a later attention operation reports cancellation", async () => {
    const plan = approvedPlan({ steps: [sourceStep({ time: { kind: "absolute", at_utc: "2026-10-20T09:00:00.000Z", timezone: "UTC", local: "2026-10-20T09:00" } })] });
    const h = harness(plan, vi.fn(async (input: PrepareOutputInput): Promise<PrepareOutputResult> => input.output === "relay_post" ? linkedResult(input) : { kind: "conflict", code: "approved_revision_conflict" }));
    expect(await h.adapter.prepare(request)).toEqual({ kind: "blocked", code: "authority_gap" });
    expect(h.prepare.mock.calls.map(([call]) => call.output)).toEqual(["relay_post", "attention_event"]);
  });

  it("maps infrastructure exceptions separately from finite authority gaps", async () => {
    const getFailure = harness();
    getFailure.get.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await getFailure.adapter.prepare(request)).toEqual({ kind: "blocked", code: "preparation_unavailable" });
    expect(getFailure.prepare).not.toHaveBeenCalled();
    const outputFailure = harness(approvedPlan(), async () => { throw new Error("database unavailable"); });
    expect(await outputFailure.adapter.prepare(request)).toEqual({ kind: "blocked", code: "preparation_unavailable" });
  });

  it("rejects malformed inputs before reading the repository", async () => {
    const h = harness();
    expect(await h.adapter.prepare({ ...request, extra: true } as typeof request)).toEqual({ kind: "blocked", code: "authority_gap" });
    expect(await h.adapter.prepare({ ...request, approvedRevision: 0 })).toEqual({ kind: "blocked", code: "authority_gap" });
    expect(h.get).not.toHaveBeenCalled();
  });

  it("maps finite repository and output failures to their bounded adapter results", async () => {
    for (const error of [{ kind: "not_found" }, { kind: "creator_not_provisioned" }]) {
      const h = harness();
      h.get.mockResolvedValueOnce(error as ReadResult);
      expect(await h.adapter.prepare(request)).toEqual({ kind: "blocked", code: "preparation_unavailable" });
      expect(h.prepare).not.toHaveBeenCalled();
    }
    for (const code of ["not_found", "creator_not_provisioned", "preparation_unavailable"] as const) {
      const h = harness(approvedPlan(), async () => ({ kind: "unavailable", code }));
      expect(await h.adapter.prepare(request)).toEqual({ kind: "blocked", code: "preparation_unavailable" });
    }
    for (const code of ["entitlement_required", "invalid_snapshot"] as const) {
      const h = harness(approvedPlan(), async () => ({ kind: "unavailable", code }));
      expect(await h.adapter.prepare(request)).toEqual({ kind: "blocked", code: "authority_gap" });
    }
  });

  it("stops after a blocked source output without attempting attention or a later source", async () => {
    const first = sourceStep({ step_id: "step-1", time: { kind: "absolute", at_utc: "2026-10-20T09:00:00.000Z", timezone: "UTC", local: "2026-10-20T09:00" } });
    const second = sourceStep({ step_id: "step-2", target_post_id: "post-1" });
    const h = harness(approvedPlan({ steps: [first, second] }), async () => ({ kind: "blocked", code: "dependency_blocked" }));
    expect(await h.adapter.prepare(request)).toEqual({ kind: "blocked", code: "authority_gap" });
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.prepare.mock.calls[0]![0].output).toBe("relay_post");
  });

  it("rejects a linked result whose checked pointer identifies another step", async () => {
    const h = harness(approvedPlan(), input => {
      const valid = linkedResult(input);
      if (valid.kind !== "linked") return valid;
      return { ...valid, pointer: { ...valid.pointer, node_id: "other-step" } };
    });
    expect(await h.adapter.prepare(request)).toEqual({ kind: "blocked", code: "authority_gap" });
  });
});

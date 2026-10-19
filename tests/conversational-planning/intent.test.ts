import { describe, expect, it, vi } from "vitest";
import type { EditorProvider } from "../../src/gallery-editor/provider.js";
import { EditorError } from "../../src/gallery-editor/types.js";
import {
  createPlanningProvider, interpretRequest, INTERPRETED_REQUEST_SCHEMA, type InterpretedRequest,
  type PlanningModelContext, type PlanningProvider, type PlanningProviderInput, type PlanningProviderResponse,
} from "../../src/conversational-planning/intent.js";

const context: PlanningModelContext = {
  request_clock: { received_at_utc: "2026-10-15T10:00:00Z", local_date: "2026-10-15", timezone: "Europe/London" }, plan_revision: 3,
  selected: { media_ids: ["m1"], post_ids: ["p1"], work_id: "w1" },
  media: [{ id: "m1", filename: "art.jpg", mime: "image/jpeg", processing_status: "ready", primary_post_id: "p1", linked_post_ids: ["p1"] }],
  posts: [{ id: "p1", effective_title: "Moon", publish_state: "draft", series_member_id: "sm1", part_label: "Part 2", selected_media_ids: ["m1"] }],
  templates: [{ id: "t1", name: "Square crop" }], destinations: [{ id: "patreon", readiness: "available" }, { id: "x", readiness: "available" }, { id: "deviantart", readiness: "available" }],
  creator_timezone: "Europe/London", editable_nodes: [{ handle: "h1", capability: "prepare_distribution", destination: "x", title: "Moon teaser", title_origin: "creator", local_date: null, local_time: "17:30", timezone: "Europe/London", time_origin: "creator", template_name: "Square crop", enabled: true }],
  allowed_request_kinds: ["primary_draft", "teaser", "followup"], allowed_social_actions: ["reply_block", "engagement_check"], prior_clarification: null
};

function intent(overrides: Partial<InterpretedRequest["requests"][number]> = {}): InterpretedRequest["requests"][number] {
  return {
    command: "add", target_handle: null, changed_fields: [], kind: "primary_draft", source_ref: { mode: "selection", id: null }, destination: "patreon",
    title_mode: "literal", title_text: "Moon", template_ref: { mode: "none", value: null }, enabled: true, delivery_intent: "draft_only", social_action: null,
    time_kind: "none", local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null,
    local_time: null, time_text: null, request_quote: "Create a Patreon draft titled Moon", ...overrides
  };
}
function response(requests: InterpretedRequest["requests"], overrides: Partial<InterpretedRequest> = {}): PlanningProviderResponse {
  const value: InterpretedRequest = { base_revision: 3, outcome: "proposal", question: null, requests, ...overrides };
  return { text: JSON.stringify(value), usage: { inputTokens: 500, outputTokens: 100, costUsd: 0.004 }, finishReason: "stop" };
}
function provider(...results: Array<PlanningProviderResponse | Error>): PlanningProvider & { calls: PlanningProviderInput[] } {
  const calls: PlanningProviderInput[] = [];
  return { calls, async respond(input) { calls.push(input); const next = results.shift(); if (!next) throw new Error("unexpected call"); if (next instanceof Error) throw next; return next; } };
}

describe("CP-05 narrow intent boundary", () => {
  it("accepts the full draft, teaser, and two publication-relative follow-up intents", async () => {
    const req = "Create a Patreon draft titled Moon, tease it on X as Moon — Part 2, then reply on X one day after it is published and check engagement two days after it is published.";
    const p = provider(response([
      intent({ request_quote: "Create a Patreon draft titled Moon" }),
      intent({ kind: "teaser", destination: "x", title_text: "Moon — Part 2", title_mode: "part_variable", template_ref: { mode: "id", value: "t1" }, delivery_intent: "prepare_for_creator_handoff", request_quote: "tease it on X as Moon — Part 2" }),
      intent({ kind: "followup", destination: "x", title_mode: "none", title_text: null, delivery_intent: "none", time_kind: "publication_calendar_day", day_offset: 1, target_destination: "x", social_action: "reply_block", request_quote: "reply on X one day after it is published" }),
      intent({ kind: "followup", destination: "x", title_mode: "none", title_text: null, delivery_intent: "none", time_kind: "publication_calendar_day", day_offset: 2, target_destination: "x", social_action: "engagement_check", request_quote: "check engagement two days after it is published" })
    ]));
    const result = await interpretRequest({ latestRequest: req, rawContext: context, provider: p });
    expect(result.outcome).toBe("proposal"); expect(result.base_revision).toBe(3); expect(result.requests).toHaveLength(4); expect(result.attempts).toBe(1);
    expect(p.calls[0].maxOutputTokens).toBe(3000); expect(p.calls[0].responseSchema).toBe(INTERPRETED_REQUEST_SCHEMA);
    const partial = intent({ kind: "followup", destination: "x", title_mode: "none", title_text: null, delivery_intent: "none", time_kind: "publication_calendar_day", day_offset: 1, local_time: "10:00", target_destination: null, social_action: null, time_text: "one day after publication at 10:00", request_quote: "one day after publication at 10:00" });
    const partialResult = await interpretRequest({ latestRequest: "one day after publication at 10:00", rawContext: context, provider: provider(response([partial])) });
    expect(partialResult.outcome).toBe("proposal"); expect(partialResult.requests[0]).toMatchObject({ day_offset: 1, local_time: "10:00", target_destination: null, social_action: null });
  });

  it("accepts handle-bound revisions and removals while rejecting invented handles and quote text", async () => {
    const revise = intent({ command: "revise", target_handle: "h1", changed_fields: ["time"], kind: "teaser", destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, delivery_intent: "none", time_kind: "weekday", weekday: "friday", timezone: "Europe/London", local_time: "17:30", time_text: "Friday", request_quote: "Move the teaser to Friday" });
    const p = provider(response([revise]));
    const result = await interpretRequest({ latestRequest: "Move the teaser to Friday", rawContext: context, provider: p });
    expect(result.requests[0].target_handle).toBe("h1");
    const removal = intent({ command: "remove", target_handle: "h1", changed_fields: [], title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, enabled: null, delivery_intent: "none", social_action: null, time_kind: "none", request_quote: "Remove the X teaser" });
    const removed = await interpretRequest({ latestRequest: "Remove the X teaser", rawContext: context, provider: provider(response([removal])) });
    expect(removed.outcome).toBe("proposal"); expect(removed.requests[0].command).toBe("remove");
    const invalid = provider(response([{ ...revise, target_handle: "step-id-from-model" }]));
    const repaired = await interpretRequest({ latestRequest: "Move the teaser to Friday", rawContext: context, provider: invalid });
    expect(repaired.outcome).toBe("error"); expect(repaired.repairs).toBe(1);
  });

  it("repairs one malformed provider response and records both calls", async () => {
    const p = provider({ text: "{", usage: { inputTokens: 10, outputTokens: 2, costUsd: 0.001 }, finishReason: "stop" }, response([intent()]));
    const result = await interpretRequest({ latestRequest: "Create a Patreon draft titled Moon", rawContext: context, provider: p });
    expect(result.outcome).toBe("proposal"); expect(result.attempts).toBe(2); expect(result.repairs).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 510, outputTokens: 102, costUsd: 0.005, calls: 2, known: true });
    expect(p.calls[1].repairError).toBe("invalid_json_or_shape");
  });

  it("accepts clarification without repairing missing user information", async () => {
    const p = provider(response([], { outcome: "clarification", question: "Which destination?" }));
    const result = await interpretRequest({ latestRequest: "Tease this", rawContext: context, provider: p });
    expect(result.outcome).toBe("clarification"); expect(result.question).toBe("Which destination?"); expect(result.attempts).toBe(1); expect(result.repairs).toBe(0);
    const visual = provider(response([], { outcome: "limitation", question: "<b>Need image understanding</b>" }));
    const limited = await interpretRequest({ latestRequest: "What colors are in this image?", rawContext: context, provider: visual });
    expect(limited.outcome).toBe("limitation"); expect(limited.question).not.toContain("<"); expect(limited.question).not.toContain(">");
  });

  it("rejects oversized input and drops unallowlisted image payloads before provider invocation", async () => {
    const p = provider(response([intent()]));
    const raw = { ...context, image: "data:image/jpeg;base64,SECRET", selected: { ...context.selected, media_ids: ["m1", "m2", "m3", "m4"] } };
    const result = await interpretRequest({ latestRequest: "Create", rawContext: raw, provider: p });
    expect(result.outcome).toBe("clarification"); expect(result.attempts).toBe(0); expect(p.calls).toHaveLength(0);
    const tooManyLinks = { ...context, media: [{ ...context.media[0], linked_post_ids: ["p1", "p2", "p3", "p4", "p5"] }] };
    expect((await interpretRequest({ latestRequest: "Create", rawContext: tooManyLinks, provider: p })).code).toBe("context_not_projectable");
    const tooManySlots = { ...context, prior_clarification: { slot_ids: Array.from({ length: 17 }, (_, i) => `s${i}`), short_questions: ["Which one?"] } };
    expect((await interpretRequest({ latestRequest: "Create", rawContext: tooManySlots, provider: p })).code).toBe("context_not_projectable");
    const largeContext = { ...context, editable_nodes: Array.from({ length: 8 }, (_, i) => ({ ...context.editable_nodes[0], handle: `h${i}`.padEnd(100, "h"), capability: "x".repeat(80), title: "T".repeat(160), local_date: "2026-10-15", timezone: "Europe/London", template_name: "N".repeat(160) })), prior_clarification: { slot_ids: Array.from({ length: 16 }, (_, i) => `s${i}`.padEnd(100, "s")), short_questions: Array.from({ length: 16 }, () => "Q".repeat(200)) } };
    expect((await interpretRequest({ latestRequest: "Create", rawContext: largeContext, provider: p })).code).toBe("context_too_large");
    const normal = provider(response([intent()]));
    await interpretRequest({ latestRequest: "Create a Patreon draft titled Moon", rawContext: { ...context, image: "SECRET" }, provider: normal });
    expect(JSON.stringify(normal.calls[0])).not.toContain("SECRET");
  });

  it("returns an explicit incomplete result at the output boundary and never accepts truncated JSON", async () => {
    const p = provider({ ...response([intent()]), text: "{\"outcome\":", finishReason: "length" });
    const result = await interpretRequest({ latestRequest: "Create a Patreon draft titled Moon", rawContext: context, provider: p });
    expect(result.code).toBe("provider_incomplete"); expect(result.attempts).toBe(1); expect(p.calls[0].maxOutputTokens).toBe(3000);
    const tooMany = provider({ ...response(Array.from({ length: 7 }, (_, i) => intent({ request_quote: `Task ${i + 1}` }))), text: JSON.stringify({ base_revision: 3, outcome: "proposal", question: null, requests: Array.from({ length: 7 }, (_, i) => intent({ request_quote: `Task ${i + 1}` })) }) });
    const narrowed = await interpretRequest({ latestRequest: "Task 1 Task 2 Task 3 Task 4 Task 5 Task 6 Task 7", rawContext: context, provider: tooMany });
    expect(narrowed.code).toBe("too_many_intents"); expect(narrowed.repairs).toBe(0);
    const wrongFinish = provider({ ...response([intent()]), finishReason: "other" });
    expect((await interpretRequest({ latestRequest: "Create a Patreon draft titled Moon", rawContext: context, provider: wrongFinish })).code).toBe("provider_incomplete");
    const missingFinish = provider({ ...response([intent()]), finishReason: undefined } as unknown as PlanningProviderResponse);
    expect((await interpretRequest({ latestRequest: "Create a Patreon draft titled Moon", rawContext: context, provider: missingFinish })).code).toBe("provider_incomplete");
    const overOutput = provider({ ...response([intent()]), usage: { inputTokens: 100, outputTokens: 3001, costUsd: 0.2 } });
    expect((await interpretRequest({ latestRequest: "Create a Patreon draft titled Moon", rawContext: context, provider: overOutput })).code).toBe("provider_incomplete");
  });

  it("makes transport, timeout, abort, missing-usage, and durable-budget failures terminal with safe accounting", async () => {
    const failed = provider(new Error("raw token=secret https://internal.invalid"));
    const failure = await interpretRequest({ latestRequest: "Create", rawContext: context, provider: failed });
    expect(failure.code).toBe("provider_failure"); expect(failure.usage).toMatchObject({ calls: 1, known: false, costUsd: null });
    expect(JSON.stringify(failure)).not.toContain("secret");

    const missingUsage = provider({ ...response([intent()]), usage: null });
    const noUsage = await interpretRequest({ latestRequest: "Create a Patreon draft titled Moon", rawContext: context, provider: missingUsage });
    expect(noUsage.code).toBe("usage_unavailable"); expect(noUsage.usage.known).toBe(false);

    const never = { async respond() { return await new Promise<PlanningProviderResponse>(() => {}); } };
    const timeout = await interpretRequest({ latestRequest: "Create", rawContext: context, provider: never, deadlineMs: 5 });
    expect(timeout.code).toBe("timeout"); expect(timeout.attempts).toBe(1); expect(timeout.usage.costUsd).toBeNull();

    const controller = new AbortController(); controller.abort();
    const aborted = await interpretRequest({ latestRequest: "Create", rawContext: context, provider: provider(response([intent()])), signal: controller.signal });
    expect(aborted.code).toBe("aborted"); expect(aborted.attempts).toBe(0);

    let constructed = 0;
    const budget = { reserve: vi.fn(async (_input: { model: string; amountUsd: number; phase: "development" | "heldout"; signal: AbortSignal }) => "r1"), settle: vi.fn(async (_id: string, _actualUsd: number | null) => {}) };
    expect(() => createPlanningProvider({ modelId: " ", pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 1 }, budget }, () => { constructed++; return { respond: async () => ({ output: [] }) }; })).toThrow("planning_provider_unavailable");
    expect(constructed).toBe(0);
    const captured: { options?: Record<string, unknown>; input?: Record<string, unknown>[]; tools?: Record<string, unknown>[] } = {};
    const configured = createPlanningProvider({ modelId: "exact-model-2026-10", pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 3 }, budget }, options => {
      constructed++;
      captured.options = options as unknown as Record<string, unknown>;
      const mock: EditorProvider = { async respond(input) {
        captured.input = input.input; captured.tools = input.tools;
        return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ base_revision: 3, outcome: "proposal", question: null, requests: [intent()] }) }] }], usage: { inputTokens: 40, outputTokens: 20, costUsd: 0.002 } };
      } };
      return mock;
    });
    const accepted = await interpretRequest({ latestRequest: "Create a Patreon draft titled Moon", rawContext: context, provider: configured });
    expect(accepted.outcome).toBe("proposal"); expect(accepted.base_revision).toBe(3);
    expect(captured.options?.model).toBe("exact-model-2026-10"); expect(captured.options?.maxOutputTokens).toBe(3000); expect(captured.options?.budget).toBe(budget);
    expect(captured.tools).toEqual([]); expect(JSON.stringify(captured.input)).toContain("untrusted data"); expect(JSON.stringify(captured.input)).not.toContain("base64");
    const requestMessage = captured.input?.[1]?.content as Array<{ text: string }>;
    expect(JSON.parse(requestMessage[0].text)).toMatchObject({ latest_user_request: "Create a Patreon draft titled Moon", untrusted_metadata_context: context });
    expect(budget.reserve).not.toHaveBeenCalled(); expect(budget.settle).not.toHaveBeenCalled();
    const budgetRejected = createPlanningProvider({ modelId: "exact-model-2026-10", pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 3 }, budget }, () => ({ respond: async () => { throw new EditorError("BUDGET_EXHAUSTED", "private"); } }));
    const rejected = await interpretRequest({ latestRequest: "Create", rawContext: context, provider: budgetRejected });
    expect(rejected.code).toBe("budget_failure"); expect(rejected.attempts).toBe(1); expect(JSON.stringify(rejected)).not.toContain("private");

    for (const [providerCode, terminalReason] of [["BUDGET_LOCKED", "budget_unavailable"], ["BUDGET_INVALID", "budget_unavailable"], ["provider_budget_overrun", "provider_failure"]] as const) {
      const guardedBudget = { reserve: vi.fn(async () => "unused"), settle: vi.fn(async () => {}) };
      const guardedProvider = createPlanningProvider({ modelId: "exact-model-2026-10", pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 3 }, budget: guardedBudget }, () => ({ respond: async () => { throw new EditorError(providerCode, "private ledger or token detail", 503); } }));
      const classified = await interpretRequest({ latestRequest: "Create", rawContext: context, provider: guardedProvider });
      expect(classified).toMatchObject({ outcome: "error", code: terminalReason, terminalReason, attempts: 1, repairs: 0, usage: { calls: 1, known: false, inputTokens: null, outputTokens: null, costUsd: null } });
      expect(JSON.stringify(classified)).not.toContain("private ledger");
      expect(guardedBudget.reserve).not.toHaveBeenCalled(); expect(guardedBudget.settle).not.toHaveBeenCalled();
    }
    expect(() => createPlanningProvider({ modelId: "model", pricing: { inputUsdPerMillion: 0, outputUsdPerMillion: 1 }, budget })).toThrow("planning_provider_unavailable");
  });

  it("keeps absolute, qualified weekday, and unresolved local time shapes distinct", async () => {
    const absolute = intent({ kind: "teaser", destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, delivery_intent: "none", time_kind: "absolute_local", local_date: "2026-10-16", local_time: "17:30", timezone: "Europe/London", time_text: "2026-10-16 at 17:30", request_quote: "Move the teaser to 2026-10-16 at 17:30" });
    const p = provider(response([absolute]));
    expect((await interpretRequest({ latestRequest: "Move the teaser to 2026-10-16 at 17:30", rawContext: context, provider: p })).outcome).toBe("proposal");
    const weekday = intent({ kind: "teaser", destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, delivery_intent: "none", time_kind: "weekday", weekday: "friday", weekday_qualifier: "next", timezone: "Europe/London", local_time: "17:30", time_text: "next Friday at 17:30", request_quote: "Move it to next Friday at 17:30" });
    const qualified = await interpretRequest({ latestRequest: "Move it to next Friday at 17:30", rawContext: context, provider: provider(response([weekday])) });
    expect(qualified.outcome).toBe("proposal");
    const unresolved = intent({ kind: "teaser", destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, delivery_intent: "none", time_kind: "unresolved_local", time_text: "Friday", request_quote: "Schedule it Friday" });
    const unresolvedResult = await interpretRequest({ latestRequest: "Schedule it Friday", rawContext: context, provider: provider(response([unresolved])) });
    expect(unresolvedResult.outcome).toBe("proposal");
    const unresolvedWeekday = intent({ kind: "teaser", destination: "x", title_mode: "none", title_text: null, template_ref: { mode: "none", value: null }, delivery_intent: "none", time_kind: "weekday", weekday: "friday", weekday_qualifier: "this", timezone: null, local_time: null, time_text: "this Friday", request_quote: "Move it this Friday" });
    const unresolvedWeekdayResult = await interpretRequest({ latestRequest: "Move it this Friday", rawContext: context, provider: provider(response([unresolvedWeekday])) });
    expect(unresolvedWeekdayResult.outcome).toBe("proposal");
  });
});

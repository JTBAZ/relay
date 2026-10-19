import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { matchesSchema } from "../../src/gallery-editor/action-validation.js";
import { INTERPRETED_REQUEST_SCHEMA, interpretRequest, projectPlanningContext, type InterpretedRequest } from "../../src/conversational-planning/intent.js";

type EvalTask = Record<string, any>;
type EvalFixture = { version: string; counts: Record<string, number>; tasks: EvalTask[]; guardProbes: Array<Record<string, unknown>> };
type Schema = Parameters<typeof matchesSchema>[1];
type Scorer = {
  validateDevelopmentFixture(fixture: unknown, schema: Schema): { ok: boolean; errors: string[]; counts?: Record<string, number> };
  scoreRawInterpretation(args: { task: EvalTask; responseText: string; schema: Schema; matchesSchema: typeof matchesSchema }): { correct: boolean | null; status: string; reason: string | null; questionReviewPacket: { latestRequest: string; neededFields: string[]; affectedScope: unknown; question: string } | null };
  observeFirstPassForEvaluation(args: { responseText: string; latestRequest: string; rawContext: unknown }, runtime: { projectPlanningContext: typeof projectPlanningContext; interpretRequest: typeof interpretRequest }): Promise<{ version: string; responseDigest: string; requestDigest: string; contextDigest: string; validation: string; outcome: string | null; attempts: number; repairs: number; mockCalls: number }>;
  scoreRawSemantic(args: { task: EvalTask; responseText: string; observation: unknown; schema: Schema; matchesSchema: typeof matchesSchema; humanReview: unknown }): { correct: boolean | null; status: string; reason: string | null; variantId: string | null; intentMap: number[] | null; validatedResponse: InterpretedRequest | null; questionReviewPacket?: unknown };
  scoreCompiledOutput(args: { task: EvalTask; compiled: unknown }): { correct: boolean | null; status?: string; reason: string | null; failedAssertions: string[] };
  scoreCompiledSemantic(args: { task: EvalTask; compiled: unknown; raw: any; currentPlan: any }): { correct: boolean | null; status: string; reason: string | null; mappingsTried: number };
  buildBehaviorView(observation: unknown): any;
  scoreBehavior(args: { task: EvalTask; observation: unknown; raw: any; humanReview: unknown }): { correct: boolean | null; status: string; reason: string | null };
  summarizeDevelopment(fixture: EvalFixture, results: Map<string, { correct: boolean | null } | undefined>, schema: Schema): any;
  summarizeOracleDevelopment(fixture: EvalFixture, scores: Map<string, any>, schema: Schema): any;
};
const scorer = await import(new URL("../../scripts/conversational-planning-eval-scoring.mjs", import.meta.url).href) as Scorer;
const { buildBehaviorView, observeFirstPassForEvaluation, scoreBehavior, scoreCompiledOutput, scoreCompiledSemantic, scoreRawInterpretation, scoreRawSemantic, summarizeDevelopment, summarizeOracleDevelopment, validateDevelopmentFixture } = scorer;
const fixture = JSON.parse(await readFile(new URL("../fixtures/conversational-planning-development.json", import.meta.url), "utf8")) as EvalFixture;
const getTask = (caseId: string): EvalTask => fixture.tasks.find(row => row.caseId === caseId)!;
const raw = (request: Partial<InterpretedRequest["requests"][number]>, outcome: InterpretedRequest["outcome"] = "proposal", question: string | null = null, baseRevision: number | null = null): string => JSON.stringify({
  base_revision: baseRevision, outcome, question, requests: outcome === "proposal" ? [{
    command: "add", target_handle: null, changed_fields: [], kind: "primary_draft", source_ref: { mode: "selection", id: null }, destination: "patreon",
    title_mode: "literal", title_text: "Cinder / CROWN!", template_ref: { mode: "none", value: null }, enabled: true, delivery_intent: "draft_only", social_action: null,
    time_kind: "none", local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null,
    local_time: null, time_text: null, request_quote: "Create a Patreon draft with the title “Cinder / CROWN!”", ...request
  }] : []
});
const taskWithGold = (intentAssertions: Array<{ index: number; equals: Record<string, unknown>; reason?: string }>, expectedIntentCount = 1) => ({
  input: { latestRequest: "Create a Patreon draft with the title “Cinder / CROWN!”" },
  gold: { raw: { expectedOutcome: "proposal", expectedIntentCount, intentAssertions: intentAssertions.map(assertion => ({ ...assertion, exact: true, equals: {
    command: "add", target_handle: null, changed_fields: [], kind: "primary_draft", source_ref: { mode: "selection", id: null }, destination: "patreon",
    title_mode: "literal", title_text: "Cinder / CROWN!", template_ref: { mode: "none", value: null }, enabled: true, delivery_intent: "draft_only", social_action: null,
    time_kind: "none", local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null,
    local_time: null, time_text: null, request_quote: "Create a Patreon draft with the title “Cinder / CROWN!”", ...assertion.equals
  } })) }, compiled: { expectedKind: "plan", assertions: [] } }
});

describe("CP-14a offline scorer", () => {
  const canonicalJson = (value: any): string => JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child)
    ? Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]])) : child);
  const packetDigest = (packet: unknown) => createHash("sha256").update(canonicalJson(packet)).digest("hex");

  it("freezes exactly 48 semantic tasks and 24 separate ordered guard probes", () => {
    const validation = validateDevelopmentFixture(fixture, INTERPRETED_REQUEST_SCHEMA);
    expect(validation).toMatchObject({ ok: true, counts: { U: 12, C: 12, A: 12, S: 12 } });
    expect(fixture.counts).toEqual({ U: 12, C: 12, A: 12, S: 12, total: 48, guardProbes: 24 });
    expect(fixture.tasks).toHaveLength(48);
    expect(fixture.guardProbes).toHaveLength(24);
  });

  it("validates raw output with the application schema and checks exact declared intent fields", () => {
    const task = getTask("U01");
    const text = raw({});
    const result = scoreRawInterpretation({ task, responseText: text, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema });
    expect(result).toMatchObject({ correct: true, status: "scored", reason: null });
  });

  it("scores only a response accepted by the real first-pass interpreter and binds all inputs", async () => {
    const base = getTask("U01");
    const responseText = raw({});
    const expected = JSON.parse(responseText) as InterpretedRequest;
    const task: EvalTask = { ...base, gold: { ...base.gold, oracle: { version: "cp-oracle.v1", rawVariants: [{ id: "canonical", expected, requestOrder: "exact", domains: [] }], compiled: null, behavior: [] } } };
    const observation = await observeFirstPassForEvaluation({ responseText, latestRequest: task.input.latestRequest, rawContext: task.input.modelContext }, { projectPlanningContext, interpretRequest });
    expect(observation).toMatchObject({ version: "cp-first-pass.v1", validation: "first_pass_accepted", outcome: "proposal", attempts: 1, repairs: 0, mockCalls: 1 });
    expect(scoreRawSemantic({ task, responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: true, status: "scored", reason: null, variantId: "canonical", intentMap: [0] });

    const forged = { ...observation, responseDigest: "0".repeat(64) };
    expect(scoreRawSemantic({ task, responseText, observation: forged, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, status: "unscored", reason: "observation_mismatch" });
    expect(scoreRawSemantic({ task, responseText: responseText + " ", observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "observation_mismatch" });
  });

  it("accepts contained quote spans and mask order while preserving independent intent order mappings", async () => {
    const base = getTask("U01");
    const latestRequest = "Change the title to “Cinder / CROWN!” and move it to 2026-10-22 at 17:30.";
    const context = structuredClone(base.input.modelContext);
    context.plan_revision = 4;
    context.editable_nodes = [{ handle: "node_1", capability: "primary_draft", destination: "patreon", title: "Old title", title_origin: "creator", local_date: null, local_time: null, timezone: null, time_origin: null, template_name: null, enabled: true }];
    const revisionTask: EvalTask = { ...base, input: { ...base.input, latestRequest, modelContext: context, currentPlan: { revision: 4 } } };
    const response = JSON.parse(raw({ command: "revise", target_handle: "node_1", changed_fields: ["time", "title"], time_kind: "absolute_local", local_date: "2026-10-22", local_time: "17:30", timezone: "Europe/London", time_text: "17:30", request_quote: latestRequest.slice(0, -1) }, "proposal", null, 4)) as InterpretedRequest;
    const expected = structuredClone(response);
    expected.requests[0].changed_fields.reverse();
    expected.requests[0].request_quote = latestRequest;
    revisionTask.gold = { ...revisionTask.gold, oracle: { version: "cp-oracle.v1", rawVariants: [{ id: "revision", expected, requestOrder: "exact", domains: [] }], compiled: null, behavior: [] } };
    const revisionText = JSON.stringify(response);
    const revisionObservation = await observeFirstPassForEvaluation({ responseText: revisionText, latestRequest, rawContext: context }, { projectPlanningContext, interpretRequest });
    expect(revisionObservation.validation).toBe("first_pass_accepted");
    expect(scoreRawSemantic({ task: revisionTask, responseText: revisionText, observation: revisionObservation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: true, intentMap: [0] });

    const compoundRequest = "Create a Patreon draft titled ‘Cinder / CROWN!’ and prepare an X teaser.";
    const first = JSON.parse(raw({ request_quote: compoundRequest }, "proposal" )).requests[0];
    const second = { ...structuredClone(first), kind: "teaser", destination: "x", title_mode: "none", title_text: null, delivery_intent: "prepare_for_creator_handoff", request_quote: compoundRequest };
    const actual = { base_revision: null, outcome: "proposal", question: null, requests: [first, second] };
    const expectedIndependent = { ...actual, requests: [second, first] } as InterpretedRequest;
    const compoundTask: EvalTask = { ...base, input: { ...base.input, latestRequest: compoundRequest }, gold: { ...base.gold, oracle: { version: "cp-oracle.v1", rawVariants: [{ id: "compound", expected: expectedIndependent, requestOrder: "independent", domains: [] }], compiled: null, behavior: [] } } };
    const compoundText = JSON.stringify(actual);
    const compoundObservation = await observeFirstPassForEvaluation({ responseText: compoundText, latestRequest: compoundRequest, rawContext: compoundTask.input.modelContext }, { projectPlanningContext, interpretRequest });
    expect(compoundObservation.validation).toBe("first_pass_accepted");
    expect(scoreRawSemantic({ task: compoundTask, responseText: compoundText, observation: compoundObservation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: true, intentMap: [1, 0] });
  });

  it("counts the same malformed text on both mock attempts and never substitutes a repaired answer", async () => {
    const base = getTask("U01");
    const responseText = "not json";
    const task: EvalTask = { ...base, gold: { ...base.gold, oracle: { version: "cp-oracle.v1", rawVariants: [{ id: "canonical", expected: JSON.parse(raw({})), requestOrder: "exact", domains: [] }], compiled: null, behavior: [] } } };
    const observation = await observeFirstPassForEvaluation({ responseText, latestRequest: task.input.latestRequest, rawContext: task.input.modelContext }, { projectPlanningContext, interpretRequest });
    expect(observation).toMatchObject({ validation: "rejected", outcome: null, attempts: 2, repairs: 1, mockCalls: 2 });
    expect(scoreRawSemantic({ task, responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: false, status: "scored", reason: "invalid_output" });
  });

  it("keeps clarification meaning pending and enforces closed semantic gold bounds", async () => {
    const base = getTask("A01");
    const responseText = JSON.stringify({ base_revision: null, outcome: "clarification", question: "What local time should I use?", requests: [] });
    const expected = JSON.parse(responseText) as InterpretedRequest;
    const humanQuestion = { neededFields: ["local_time", "timezone"], affectedScope: ["teaser"] };
    const task: EvalTask = { ...base, gold: { ...base.gold, humanQuestion, oracle: { version: "cp-oracle.v1", rawVariants: [{ id: "direct", expected, requestOrder: "exact", domains: [] }], compiled: null, behavior: [] } } };
    const observation = await observeFirstPassForEvaluation({ responseText, latestRequest: task.input.latestRequest, rawContext: task.input.modelContext }, { projectPlanningContext, interpretRequest });
    expect(scoreRawSemantic({ task, responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, status: "human_review_pending", reason: "human_review_pending", variantId: "direct" });
    const tooMany = { ...task, gold: { ...task.gold, oracle: { ...task.gold.oracle, rawVariants: Array.from({ length: 9 }, (_, i) => ({ ...task.gold.oracle.rawVariants[0], id: `v${i}` })) } } };
    expect(scoreRawSemantic({ task: tooMany, responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
  });

  it("checks source, template, enabled, and timezone domains against authoritative context", async () => {
    const base = getTask("U01");
    const run = async (context: any, latestRequest: string, actualPatch: Record<string, unknown>, expectedPatch: Record<string, unknown>, domains: Array<Record<string, unknown>>, extraInput: Record<string, unknown> = {}) => {
      const actualText = raw({ ...actualPatch, request_quote: latestRequest }, "proposal", null, Number.isSafeInteger(context.plan_revision) ? context.plan_revision : null);
      const actual = JSON.parse(actualText) as InterpretedRequest;
      const expected = structuredClone(actual);
      Object.assign(expected.requests[0], expectedPatch);
      const task: EvalTask = { ...base, input: { ...base.input, ...extraInput, latestRequest, modelContext: context }, gold: { ...base.gold, oracle: { version: "cp-oracle.v1", rawVariants: [{ id: "domain", expected, requestOrder: "exact", domains }], compiled: null, behavior: [] } } };
      const observation = await observeFirstPassForEvaluation({ responseText: actualText, latestRequest, rawContext: context }, { projectPlanningContext, interpretRequest });
      return { task, actualText, observation, score: scoreRawSemantic({ task, responseText: actualText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null }) };
    };

    const sharedPost = structuredClone(base.input.modelContext);
    sharedPost.media[0].primary_post_id = "post-shared";
    sharedPost.media.push({ ...structuredClone(sharedPost.media[0]), id: "media-b" });
    const mediaDomain = await run(sharedPost, base.input.latestRequest,
      { source_ref: { mode: "media_id", id: "media-a" } },
      { source_ref: { mode: "media_id", id: "media-a" } },
      [{ intentIndex: 0, source_ref: [{ mode: "media_id", id: "media-a" }, { mode: "media_id", id: "media-b" }] }]);
    expect(mediaDomain.observation.validation).toBe("first_pass_accepted");
    expect(mediaDomain.score).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    const selectedAlias = await run(sharedPost, base.input.latestRequest,
      { source_ref: { mode: "media_id", id: "media-a" } },
      { source_ref: { mode: "media_id", id: "media-a" } },
      [{ intentIndex: 0, source_ref: [{ mode: "media_id", id: "media-a" }, { mode: "selection", id: null }] }]);
    expect(selectedAlias.score).toMatchObject({ correct: true, variantId: "domain" });

    const templateContext = structuredClone(base.input.modelContext);
    const namedTemplate = await run(templateContext, base.input.latestRequest,
      { template_ref: { mode: "named", value: "Square crop" } },
      { template_ref: { mode: "id", value: "template-square" } },
      [{ intentIndex: 0, template_ref: [{ mode: "id", value: "template-square" }, { mode: "named", value: "Square crop" }] }]);
    expect(namedTemplate.observation.validation).toBe("first_pass_accepted");
    expect(namedTemplate.score).toMatchObject({ correct: true });
    const duplicateNames = structuredClone(templateContext);
    duplicateNames.templates.push({ id: "template-other", name: "Square crop" });
    const duplicateNameDomain = await run(duplicateNames, base.input.latestRequest,
      { template_ref: { mode: "id", value: "template-square" } },
      { template_ref: { mode: "id", value: "template-square" } },
      [{ intentIndex: 0, template_ref: [{ mode: "id", value: "template-square" }, { mode: "named", value: "Square crop" }] }]);
    expect(duplicateNameDomain.score).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    const otherTemplateDomain = await run(templateContext, base.input.latestRequest,
      { template_ref: { mode: "id", value: "template-square" } },
      { template_ref: { mode: "id", value: "template-square" } },
      [{ intentIndex: 0, template_ref: [{ mode: "id", value: "template-square" }, { mode: "id", value: "template-other" }] }]);
    expect(otherTemplateDomain.score).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });

    const latestEdit = "Keep the existing Patreon draft enabled.";
    const enabledContext = structuredClone(base.input.modelContext);
    enabledContext.plan_revision = 4;
    enabledContext.editable_nodes = [{ handle: "node_1", capability: "primary_draft", destination: "patreon", title: "Old", title_origin: "creator", local_date: null, local_time: null, timezone: null, time_origin: null, template_name: null, enabled: true }];
    const enabledDomain = await run(enabledContext, latestEdit,
      { command: "revise", target_handle: "node_1", changed_fields: ["enabled"], title_mode: "none", title_text: null, enabled: true },
      { enabled: null }, [{ intentIndex: 0, enabled: [null, true] }], { currentPlan: { revision: 4 } });
    expect(enabledDomain.observation.validation).toBe("first_pass_accepted");
    expect(enabledDomain.score).toMatchObject({ correct: true });
    const disabledContext = structuredClone(enabledContext);
    disabledContext.editable_nodes[0].enabled = false;
    const wrongEnabledDomain = await run(disabledContext, latestEdit,
      { command: "revise", target_handle: "node_1", changed_fields: ["enabled"], title_mode: "none", title_text: null, enabled: false },
      { enabled: null }, [{ intentIndex: 0, enabled: [null, true] }], { currentPlan: { revision: 4 } });
    expect(wrongEnabledDomain.score).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });

    const latestTime = "Prepare the Patreon draft for Friday at 17:30.";
    const schedule = await run(structuredClone(base.input.modelContext), latestTime,
      { title_mode: "none", title_text: null, time_kind: "weekday", weekday: "friday", local_time: "17:30", timezone: "Europe/London", time_text: "17:30" },
      { timezone: null }, [{ intentIndex: 0, timezone: [null, "Europe/London"] }]);
    expect(schedule.observation.validation).toBe("first_pass_accepted");
    expect(schedule.score).toMatchObject({ correct: true });
    const wrongZone = await run(structuredClone(base.input.modelContext), latestTime,
      { title_mode: "none", title_text: null, time_kind: "weekday", weekday: "friday", local_time: "17:30", timezone: "Europe/London", time_text: "17:30" },
      { timezone: null }, [{ intentIndex: 0, timezone: [null, "UTC"] }]);
    expect(wrongZone.score).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    const absolute = await run(structuredClone(base.input.modelContext), "Prepare the Patreon draft for 2026-10-22 at 17:30.",
      { title_mode: "none", title_text: null, time_kind: "absolute_local", local_date: "2026-10-22", local_time: "17:30", timezone: "Europe/London", time_text: "17:30" },
      { timezone: "Europe/London" }, [{ intentIndex: 0, timezone: ["Europe/London", null] }]);
    expect(absolute.score).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
  });

  it("fails accepted semantic changes to copy, delivery, day, and changed-field membership", async () => {
    const base = getTask("U01");
    const latestRequest = "Create a Patreon draft titled ‘Cinder / CROWN!’ and also call it ‘Cinder / CROWN.’ and ‘Alternate Title’; Friday at 17:30.";
    const expected = JSON.parse(raw({ request_quote: latestRequest }, "proposal")) as InterpretedRequest;
    const task: EvalTask = { ...base, input: { ...base.input, latestRequest }, gold: { ...base.gold, oracle: { version: "cp-oracle.v1", rawVariants: [{ id: "canonical", expected, requestOrder: "exact", domains: [] }], compiled: null, behavior: [] } } };
    const semanticChanges: Partial<InterpretedRequest["requests"][number]>[] = [
      { title_text: "Cinder / CROWN.", request_quote: latestRequest },
      { title_text: "Alternate Title", request_quote: latestRequest },
      { delivery_intent: "prepare_for_creator_handoff", request_quote: latestRequest },
      { time_kind: "weekday", weekday: "friday", local_time: "17:30", timezone: "Europe/London", time_text: "17:30", request_quote: latestRequest },
      { changed_fields: ["title"], request_quote: latestRequest }
    ];
    for (const patch of semanticChanges) {
      const responseText = raw(patch, "proposal");
      const observation = await observeFirstPassForEvaluation({ responseText, latestRequest, rawContext: task.input.modelContext }, { projectPlanningContext, interpretRequest });
      expect(observation.validation).toBe("first_pass_accepted");
      expect(scoreRawSemantic({ task, responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: false, reason: "semantic_mismatch" });
    }
  });

  it("rejects missing or malformed observations and invalid or duplicate bounded gold", async () => {
    const base = getTask("U01");
    const responseText = raw({});
    const expected = JSON.parse(responseText) as InterpretedRequest;
    const variant = { id: "canonical", expected, requestOrder: "exact", domains: [] };
    const makeTask = (rawVariants: unknown[], expectedRoot = expected, inputPatch: Record<string, unknown> = {}): EvalTask => ({
      ...base, input: { ...base.input, ...inputPatch }, gold: { ...base.gold, oracle: { version: "cp-oracle.v1", rawVariants, compiled: null, behavior: [] } }
    });
    const observation = await observeFirstPassForEvaluation({ responseText, latestRequest: base.input.latestRequest, rawContext: base.input.modelContext }, { projectPlanningContext, interpretRequest });
    const validTask = makeTask([variant]);
    expect(scoreRawSemantic({ task: validTask, responseText, observation: null, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "missing_application_observation" });
    expect(scoreRawSemantic({ task: validTask, responseText, observation: { ...observation, attempts: 3 }, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "observation_mismatch" });
    expect(scoreRawSemantic({ task: makeTask([variant, { ...variant, id: "duplicate" }]), responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });

    const fourDomainValues = [{ intentIndex: 0, source_ref: [
      { mode: "selection", id: null }, { mode: "media_id", id: "media-a" }, { mode: "media_id", id: "media-b" }, { mode: "post_id", id: "post-a" }
    ] }];
    expect(scoreRawSemantic({ task: makeTask([{ ...variant, domains: fourDomainValues }]), responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    expect(scoreRawSemantic({ task: makeTask([{ ...variant, expected: { ...expected, requests: Array(7).fill(expected.requests[0]) } }]), responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    const twoExpected = { ...expected, requests: [expected.requests[0], structuredClone(expected.requests[0])] };
    expect(scoreRawSemantic({ task: makeTask([{ ...variant, expected: twoExpected, domains: [{ intentIndex: 0, timezone: [null] }, { intentIndex: 0, enabled: [true] }] }]), responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    const wrongRevision = { ...expected, base_revision: 1 };
    expect(scoreRawSemantic({ task: makeTask([{ ...variant, expected: wrongRevision }]), responseText, observation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    const conflictContext = structuredClone(base.input.modelContext);
    conflictContext.plan_revision = 2;
    const revisionText = raw({}, "proposal", null, 2);
    const revisionObservation = await observeFirstPassForEvaluation({ responseText: revisionText, latestRequest: base.input.latestRequest, rawContext: conflictContext }, { projectPlanningContext, interpretRequest });
    const revisionExpected = JSON.parse(revisionText) as InterpretedRequest;
    const conflictingTask = makeTask([{ ...variant, expected: revisionExpected }], revisionExpected, { currentPlan: { revision: 1 }, modelContext: conflictContext });
    expect(revisionObservation.validation).toBe("first_pass_accepted");
    expect(scoreRawSemantic({ task: conflictingTask, responseText: revisionText, observation: revisionObservation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
  });

  it("requires full semantic-field assertions and fails deviations even when the remaining intent is correct", () => {
    const task = getTask("U01");
    const response = JSON.parse(raw({}));
    response.requests[0].destination = "x";
    expect(scoreRawInterpretation({ task, responseText: JSON.stringify(response), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "unsafe_semantics" });
    const partialGold = taskWithGold([{ index: 0, equals: { command: "add", destination: "patreon" } }]);
    partialGold.gold.raw.intentAssertions[0].exact = false;
    expect(scoreRawInterpretation({ task: partialGold, responseText: raw({}), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "unsafe_semantics" });
    expect(validateDevelopmentFixture({ ...fixture, tasks: fixture.tasks.map(row => row.caseId === "U01" ? { ...row, gold: { ...row.gold, raw: { ...row.gold.raw, intentAssertions: [{ index: 0, equals: { command: "add" }, exact: true }] } } } : row) }, INTERPRETED_REQUEST_SCHEMA).ok).toBe(false);
  });

  it("rejects missing, duplicate, out-of-range and generated-ID raw gold coverage", () => {
    const task = getTask("U01");
    const missing = { ...task, gold: { ...task.gold, raw: { ...task.gold.raw, intentAssertions: [] } } };
    expect(scoreRawInterpretation({ task: missing, responseText: raw({}), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "invalid_gold_assertion" });
    const duplicate = { ...task, gold: { ...task.gold, raw: { ...task.gold.raw, intentAssertions: [task.gold.raw.intentAssertions[0], { ...task.gold.raw.intentAssertions[0] }] } } };
    expect(scoreRawInterpretation({ task: duplicate, responseText: raw({}), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "invalid_gold_assertion" });
    const generated = { ...task, gold: { ...task.gold, raw: { ...task.gold.raw, intentAssertions: [{ ...task.gold.raw.intentAssertions[0], equals: { ...task.gold.raw.intentAssertions[0].equals, source_ref: { mode: "post_id", id: "$generated:source" } } }] } } };
    expect(scoreRawInterpretation({ task: generated, responseText: raw({}), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "invalid_gold_assertion" });
    expect(validateDevelopmentFixture(generated.gold ? { ...fixture, tasks: fixture.tasks.map(row => row.caseId === "U01" ? generated : row) } : fixture, INTERPRETED_REQUEST_SCHEMA).ok).toBe(false);
  });

  it("requires proposal base_revision to match the current stored revision", () => {
    const baseTask = taskWithGold([{ index: 0, equals: { command: "add", destination: "patreon" } }]);
    const task = { ...baseTask, input: { ...baseTask.input, currentPlan: { revision: 4 }, modelContext: { plan_revision: 4 } } };
    expect(scoreRawInterpretation({ task, responseText: raw({}, "proposal", null, 3), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "wrong_base_revision" });
    expect(scoreRawInterpretation({ task, responseText: raw({}, "proposal", null, 4), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: true });
  });

  it("treats invalid JSON, unknown keys, omissions and extra intents as immediate failures", () => {
    const task = taskWithGold([{ index: 0, equals: { command: "add", destination: "patreon" } }]);
    expect(scoreRawInterpretation({ task, responseText: "```json{}", schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "invalid_output" });
    const extraKey = JSON.parse(raw({})); extraKey.requests[0].unexpected = true;
    expect(scoreRawInterpretation({ task, responseText: JSON.stringify(extraKey), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "invalid_output" });
    expect(scoreRawInterpretation({ task, responseText: raw({}, "proposal").replace('"requests":[{', '"requests":[],'), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false });
  });

  it("hard-fails wrong source, target, title copy, part provenance, time and sibling-preservation assertions", () => {
    const cases = [
      [{ source_ref: { mode: "post_id", id: "foreign-post" } }, { source_ref: { mode: "selection", id: null } }],
      [{ target_handle: "node_wrong" }, { target_handle: "node_right" }],
      [{ title_text: "Wrong punctuation!" }, { title_text: "Cinder / CROWN!" }],
      [{ title_mode: "literal" }, { title_mode: "part_variable" }],
      [{ timezone: "UTC", time_kind: "weekday" }, { timezone: "Europe/London", time_kind: "weekday" }]
    ] as const;
    for (const [actualPatch, expected] of cases) {
      const task = taskWithGold([{ index: 0, equals: expected as Record<string, unknown> }]);
      const result = scoreRawInterpretation({ task, responseText: raw(actualPatch as Record<string, unknown>), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema });
      expect(result.correct).toBe(false);
    }
    const siblingTask = { gold: { compiled: { expectedKind: "plan", assertions: [{ path: "", equals: { kind: "plan", snapshot: { steps: [{ title: { value: "Manual sibling title" } }, { enabled: false }] } } }] } } };
    const lostSibling = { kind: "plan", snapshot: { steps: [{ title: { value: "Model title" } }, { enabled: true }] } };
    expect(scoreCompiledOutput({ task: siblingTask, compiled: lostSibling })).toMatchObject({ correct: false, failedAssertions: ["compiled_result"] });
  });

  it("scores compiled copy and dependency graphs without lossy ID normalization", () => {
    const task = { gold: { compiled: { expectedKind: "plan", failureReason: "wrong_copy_or_part_provenance", assertions: [{ path: "", equals: { kind: "plan", snapshot: { steps: [
      { step_id: "$generated:draft", depends_on: [] },
      { step_id: "$generated:teaser", depends_on: ["$generated:draft"], copy_title: { value: "Moon Teaser — Part 2", part_source: "creative_series_member" } }
    ] } } }] } } };
    const correct = { kind: "plan", snapshot: { steps: [
      { step_id: "s-draft", depends_on: [] },
      { step_id: "s-teaser", depends_on: ["s-draft"], copy_title: { value: "Moon Teaser — Part 2", part_source: "creative_series_member" } }
    ] } };
    expect(scoreCompiledOutput({ task, compiled: correct })).toMatchObject({ correct: true });
    const wrongEdge = structuredClone(correct); wrongEdge.snapshot.steps[1].depends_on = ["s-other"];
    expect(scoreCompiledOutput({ task, compiled: wrongEdge })).toMatchObject({ correct: false, failedAssertions: ["compiled_result"] });
    const duplicateGeneratedId = structuredClone(correct); duplicateGeneratedId.snapshot.steps[1].step_id = "s-draft";
    expect(scoreCompiledOutput({ task, compiled: duplicateGeneratedId }).correct).toBe(false);
  });

  it("emits a bounded blinded packet for freeform clarification without judging its wording", () => {
    const task = getTask("A01");
    const result = scoreRawInterpretation({ task, responseText: raw({}, "clarification", "What local time and time zone should I use?"), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema });
    expect(result).toEqual({ correct: null, status: "human_review_pending", reason: null, questionReviewPacket: {
      latestRequest: task.input.latestRequest, neededFields: ["local_time", "timezone"], affectedScope: ["teaser"], question: "What local time and time zone should I use?"
    } });
    expect(JSON.stringify(result.questionReviewPacket)).not.toContain(task.caseId);
    expect(scoreRawInterpretation({ task: { ...task, gold: { ...task.gold, humanQuestion: { neededFields: [], affectedScope: [] } } }, responseText: raw({}, "clarification", "Question?"), schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toMatchObject({ correct: false, reason: "wrong_clarification_or_outcome" });
  });

  it("marks context chooser preflight as not called rather than a raw-model answer", () => {
    const task = getTask("A05");
    expect(scoreRawInterpretation({ task, responseText: "", schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema })).toEqual({ correct: null, status: "not_called", reason: "context_preflight", questionReviewPacket: null });
  });

  it("keeps fixed denominators and reports Wilson uncertainty with unresolved cases as misses", () => {
    const scored = new Map<string, { correct: boolean | null }>(fixture.tasks.map((task, index) => [task.caseId, { correct: index < 46 ? true : false }]));
    scored.set("U01", { correct: null });
    const report = summarizeDevelopment(fixture, scored, INTERPRETED_REQUEST_SCHEMA);
    expect(report.kind).toBe("ok");
    if (report.kind === "ok") {
      expect(report.fixedDenominators).toEqual({ all: 48, U: 12, C: 12, A: 12, S: 12, unambiguous: 24 });
      expect(report.overall).toMatchObject({ correct: 45, denominator: 48, unresolved: 1 });
      expect(report.unambiguous.denominator).toBe(24);
      expect(report.overall.wilson95?.low).toBeLessThan(report.overall.rate);
      expect(report.overall.wilson95?.high).toBeGreaterThan(report.overall.rate);
    }
  });

  it("refuses to score partial compiled gold as complete task correctness", () => {
    const task = getTask("U01");
    expect(scoreCompiledOutput({ task, compiled: { kind: "plan", snapshot: { steps: [{ title: { value: "Cinder / CROWN!", origin: "creator" } }] } } })).toMatchObject({ correct: null, status: "incomplete_gold", reason: "compiled_gold_not_complete" });
  });

  it("keeps compiled clarification wording in incomplete gold until a human-review projection exists", () => {
    const task = { gold: { compiled: { expectedKind: "clarification_preview", assertions: [{ path: "", equals: { kind: "clarification_preview", question: "What time?" } }] } } };
    expect(scoreCompiledOutput({ task, compiled: { kind: "clarification_preview", question: "Which time?" } })).toMatchObject({ correct: null, status: "incomplete_gold", reason: "compiled_question_oracle_requires_human_review" });
  });

  it("scores complete compiled results with typed generated identities and full field equality", () => {
    const makeSnapshot = (planId: string, stepId: string) => ({
      schema_version: 1, plan_id: planId, creator_id: "creator-1", revision: 0, review: "proposed",
      source: { kind: "staged_media", post_id: null, selected_media_ids: [], creative_work_id: null, creative_series_member_id: null, source_revision: "source-v1" },
      steps: [{ step_id: stepId, depends_on: [], enabled: true, title: { mode: "literal", value: "$generated:literal-stays-data", origin: "creator" }, note: "Keep this note", time: null,
        capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null }],
      distribution_groups: [], unresolved_requests: [], clarifications: [], requested_text_quote: "Make a Patreon draft.",
      created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z"
    });
    const expected = { kind: "plan", snapshot: makeSnapshot("$generated:plan", "$generated:draft") };
    const actual = { kind: "plan", snapshot: makeSnapshot("plan-real", "step-real") };
    const rawMatch = { correct: true, variantId: "v1", intentMap: [0], validatedResponse: { requests: [{ request_quote: "Make a Patreon draft." }] } };
    const task = { path: "new_plan", input: { latestRequest: "Make a Patreon draft." }, gold: { oracle: { compiled: { expected, nodeOrder: "exact", unresolvedQuotes: [] } } } };
    expect(scoreCompiledSemantic({ task, compiled: actual, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: true, status: "scored", mappingsTried: 1 });

    const changedCopy = structuredClone(actual); changedCopy.snapshot.steps[0].title.value = "$generated:literal-stays-data!";
    expect(scoreCompiledSemantic({ task, compiled: changedCopy, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
    const mutations = [
      (value: any) => { value.snapshot.steps[0].note = "Changed note"; },
      (value: any) => { value.snapshot.steps[0].enabled = false; },
      (value: any) => { value.snapshot.steps[0].target_post_id = "target-other"; },
      (value: any) => { value.snapshot.source.post_id = "post-other"; },
      (value: any) => { value.snapshot.updated_at = "2026-10-17T10:01:00Z"; },
      (value: any) => { value.snapshot.steps = []; }
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(actual); mutate(changed);
      const result = scoreCompiledSemantic({ task, compiled: changed, raw: rawMatch, currentPlan: null });
      expect(["graph_mismatch", "invalid_graph"]).toContain(result.reason);
      expect(result.correct).toBe(false);
    }
    const extraKey: any = structuredClone(actual); extraKey.snapshot.steps[0].unexpected = true;
    expect(scoreCompiledSemantic({ task, compiled: extraKey, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "invalid_graph" });
    const changedExternalSource = structuredClone(actual); changedExternalSource.snapshot.source.source_revision = "$generated:source";
    const sourceGold = structuredClone(task); sourceGold.gold.oracle.compiled.expected.snapshot.source.source_revision = "$generated:source";
    expect(scoreCompiledSemantic({ task: sourceGold, compiled: changedExternalSource, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: true });
    changedExternalSource.snapshot.source.source_revision = "different-source";
    expect(scoreCompiledSemantic({ task: sourceGold, compiled: changedExternalSource, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
    expect(scoreCompiledSemantic({ task, compiled: actual, raw: { ...rawMatch, correct: false }, currentPlan: null })).toMatchObject({ correct: null, reason: "unsupported_oracle" });
  });

  it("allows only independent DAG presentation reorderings and preserves exact order when requested", () => {
    const step = (id: string, title: string, depends_on: string[] = []) => ({ step_id: id, depends_on, enabled: true, title: { mode: "literal", value: title, origin: "creator" }, note: null, time: null,
      capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null });
    const snapshot = (ids: string[]) => ({ schema_version: 1, plan_id: "$generated:plan", creator_id: "creator-1", revision: 0, review: "proposed",
      source: { kind: "staged_media", post_id: null, selected_media_ids: [], creative_work_id: null, creative_series_member_id: null, source_revision: "v1" },
      steps: ids.map(id => id === "$generated:a" ? step(id, "A") : step(id, "B")), distribution_groups: [], unresolved_requests: [], clarifications: [],
      requested_text_quote: "Two drafts", created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z" });
    const expected = { kind: "plan", snapshot: snapshot(["$generated:a", "$generated:b"]) };
    const actual = { kind: "plan", snapshot: { ...snapshot(["step-b", "step-a"]), plan_id: "plan-real", steps: [step("step-b", "B"), step("step-a", "A")] } };
    const rawMatch = { correct: true, variantId: "v", intentMap: [0], validatedResponse: { requests: [{ request_quote: "Two drafts" }] } };
    const task = (nodeOrder: string) => ({ path: "new_plan", input: { latestRequest: "Two drafts" }, gold: { oracle: { compiled: { expected, nodeOrder, unresolvedQuotes: [] } } } });
    expect(scoreCompiledSemantic({ task: task("dag"), compiled: actual, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: true });
    expect(scoreCompiledSemantic({ task: task("exact"), compiled: actual, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });

    const linkedExpected = structuredClone(expected);
    linkedExpected.snapshot.steps[1].depends_on = ["$generated:a"];
    const linkedActual = structuredClone(actual);
    linkedActual.snapshot.steps[0].depends_on = ["step-a"];
    const linkedTask = { path: "new_plan", input: { latestRequest: "Two drafts" }, gold: { oracle: { compiled: { expected: linkedExpected, nodeOrder: "dag", unresolvedQuotes: [] } } } };
    expect(scoreCompiledSemantic({ task: linkedTask, compiled: linkedActual, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
  });

  it("treats template configuration as opaque data and enforces cross-namespace identity uniqueness", () => {
    const config = { step_id: "$generated:draft", source_step_id: "$generated:draft", question: "Template's own text", nested: { request_id: "$generated:req", blocking_slot_ids: ["$generated:slot"] } };
    const makeResult = (planId: string, draftId: string, previewId: string, configValue: unknown) => ({ kind: "plan", snapshot: {
      schema_version: 1, plan_id: planId, creator_id: "creator-1", revision: 0, review: "proposed",
      source: { kind: "staged_media", post_id: null, selected_media_ids: [], creative_work_id: null, creative_series_member_id: null, source_revision: "v1" },
      steps: [
        { step_id: draftId, depends_on: [], enabled: true, title: { mode: "literal", value: "Draft", origin: "creator" }, note: null, time: null, capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null },
        { step_id: previewId, depends_on: [draftId], enabled: true, title: { mode: "literal", value: "Preview", origin: "creator" }, note: null, time: null, capability: "prepare_preview", source_step_id: draftId, template_id: "template-1", template_config_snapshot: configValue }
      ], distribution_groups: [], unresolved_requests: [], clarifications: [], requested_text_quote: "Build preview", created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z"
    } });
    const expected = makeResult("$generated:plan", "$generated:draft", "$generated:preview", config);
    const compiled = makeResult("plan-real", "step-draft", "step-preview", config);
    const task = { path: "new_plan", input: { latestRequest: "Build preview" }, gold: { oracle: { compiled: { expected, nodeOrder: "exact", unresolvedQuotes: [] } } } };
    const rawMatch = { correct: true, variantId: "v", intentMap: [0], validatedResponse: { requests: [{ request_quote: "Build preview" }] } };
    expect(scoreCompiledSemantic({ task, compiled, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: true });
    const changedOpaque: any = structuredClone(compiled); changedOpaque.snapshot.steps[1].template_config_snapshot.step_id = "step-draft";
    expect(scoreCompiledSemantic({ task, compiled: changedOpaque, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
    const collision = structuredClone(compiled); collision.snapshot.steps[0].step_id = "plan-real";
    expect(scoreCompiledSemantic({ task, compiled: collision, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "invalid_graph" });
  });

  it("binds retained revision identities and finite clarification slots without prose matching", () => {
    const baseSnapshot = { schema_version: 1, plan_id: "plan-existing", creator_id: "creator-1", revision: 1, review: "proposed",
      source: { kind: "staged_media", post_id: null, selected_media_ids: [], creative_work_id: null, creative_series_member_id: null, source_revision: "v1" },
      steps: [{ step_id: "step-retained", depends_on: [], enabled: false, title: { mode: "literal", value: "Manual", origin: "creator" }, note: "Retain", time: null,
        capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null }], distribution_groups: [], unresolved_requests: [], clarifications: [],
      requested_text_quote: "Edit the plan", created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z" };
    const revised = structuredClone(baseSnapshot); revised.revision = 2; revised.updated_at = "2026-10-17T10:01:00Z";
    const task = { path: "revision", input: { latestRequest: "Edit the plan" }, gold: { oracle: { compiled: { expected: { kind: "plan", snapshot: revised }, nodeOrder: "dag", unresolvedQuotes: [] } } } };
    const rawMatch = { correct: true, variantId: "v", intentMap: [0], validatedResponse: { requests: [{ request_quote: "Edit the plan" }] } };
    expect(scoreCompiledSemantic({ task, compiled: { kind: "plan", snapshot: revised }, raw: rawMatch, currentPlan: baseSnapshot })).toMatchObject({ correct: true });
    const changedIdentity = structuredClone(revised); changedIdentity.steps[0].step_id = "step-new";
    expect(scoreCompiledSemantic({ task, compiled: { kind: "plan", snapshot: changedIdentity }, raw: rawMatch, currentPlan: baseSnapshot })).toMatchObject({ correct: false, reason: "graph_mismatch" });

    const expectedQuestion = { kind: "clarification_preview", source: null,
      slots: [{ slot_id: "$generated:slot", field: "time", question: "What time should I use?", affected_node_ids: ["$generated:req"], blocking: true, reason: "unknown_time" }],
      unresolved: [{ request_id: "$generated:req", requested_text_quote: "Edit the plan", intended_capability: null, intended_destination: null, blocking_slot_ids: ["$generated:slot"] }] };
    const actualQuestion = structuredClone(expectedQuestion);
    actualQuestion.slots[0].slot_id = "slot-real"; actualQuestion.slots[0].affected_node_ids = ["request-real"]; actualQuestion.slots[0].question = "Which local time works for you?";
    actualQuestion.unresolved[0].request_id = "request-real"; actualQuestion.unresolved[0].blocking_slot_ids = ["slot-real"];
    const questionTask = { path: "new_plan", input: { latestRequest: "Edit the plan" }, gold: { oracle: { compiled: { expected: expectedQuestion, nodeOrder: "exact", unresolvedQuotes: [{ requestId: "$generated:req", from: "latest_request", intentIndex: null }] } } } };
    expect(scoreCompiledSemantic({ task: questionTask, compiled: actualQuestion, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: true });
    const wrongField = structuredClone(actualQuestion); wrongField.slots[0].field = "timezone";
    expect(scoreCompiledSemantic({ task: questionTask, compiled: wrongField, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
    const wrongScope = structuredClone(actualQuestion); wrongScope.slots[0].affected_node_ids = [];
    expect(scoreCompiledSemantic({ task: questionTask, compiled: wrongScope, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
    const wrongBinding = structuredClone(questionTask); wrongBinding.gold.oracle.compiled.unresolvedQuotes[0].requestId = "$generated:other";
    expect(scoreCompiledSemantic({ task: wrongBinding, compiled: actualQuestion, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    expect(scoreCompiledSemantic({ task: questionTask, compiled: { kind: "clarification", code: "missing_handle", question: "Which plan?" }, raw: rawMatch, currentPlan: baseSnapshot })).toMatchObject({ correct: null, reason: "unsupported_oracle" });
  });

  it("preserves exact group, slot, and unresolved order while allowing their dag permutation", () => {
    const draft = (id: string, title: string) => ({ step_id: id, depends_on: [], enabled: true, title: { mode: "literal", value: title, origin: "creator" }, note: null, time: null,
      capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null });
    const group = (id: string, source: string) => ({ group_id: id, source_step_id: source, preview_step_id: null, destination_step_ids: [] });
    const planSnapshot = (ids: { a: string; b: string; ga: string; gb: string }, reverse: boolean) => ({
      schema_version: 1, plan_id: "$generated:plan", creator_id: "creator-1", revision: 0, review: "proposed",
      source: { kind: "staged_media", post_id: null, selected_media_ids: [], creative_work_id: null, creative_series_member_id: null, source_revision: "v1" },
      steps: [draft(ids.a, "A"), draft(ids.b, "B")], distribution_groups: reverse ? [group(ids.gb, ids.b), group(ids.ga, ids.a)] : [group(ids.ga, ids.a), group(ids.gb, ids.b)],
      unresolved_requests: [], clarifications: [], requested_text_quote: "Two groups", created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z"
    });
    const groupExpected = { kind: "plan", snapshot: planSnapshot({ a: "$generated:a", b: "$generated:b", ga: "$generated:ga", gb: "$generated:gb" }, false) };
    const groupActual = { kind: "plan", snapshot: { ...planSnapshot({ a: "step-a", b: "step-b", ga: "group-a", gb: "group-b" }, true), plan_id: "plan-real" } };
    const rawMatch = { correct: true, variantId: "v", intentMap: [0], validatedResponse: { requests: [{ request_quote: "Two groups" }] } };
    const groupTask = (nodeOrder: string) => ({ path: "new_plan", input: { latestRequest: "Two groups" }, gold: { oracle: { compiled: { expected: groupExpected, nodeOrder, unresolvedQuotes: [] } } } });
    expect(scoreCompiledSemantic({ task: groupTask("exact"), compiled: groupActual, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
    expect(scoreCompiledSemantic({ task: groupTask("dag"), compiled: groupActual, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: true });

    const currentRevision: any = structuredClone(groupActual.snapshot);
    currentRevision.revision = 1;
    currentRevision.unresolved_requests = ["request-a", "request-b"].map(request_id => ({ request_id, requested_text_quote: request_id, intended_capability: null, intended_destination: null, blocking_slot_ids: [] }));
    currentRevision.clarifications = ["slot-a", "slot-b"].map((slot_id, index) => ({ slot_id, field: "time", question: `Question ${index}`, affected_node_ids: [`request-${index === 0 ? "a" : "b"}`], blocking: true, reason: "unknown_time" }));
    const reorderedRevision = structuredClone(currentRevision);
    reorderedRevision.revision = 2; reorderedRevision.updated_at = "2026-10-17T10:01:00Z";
    reorderedRevision.distribution_groups.reverse(); reorderedRevision.unresolved_requests.reverse(); reorderedRevision.clarifications.reverse();
    const retainedTask = { path: "revision", input: { latestRequest: "Edit retained plan" }, gold: { oracle: { compiled: { expected: { kind: "plan", snapshot: reorderedRevision }, nodeOrder: "dag", unresolvedQuotes: [] } } } };
    expect(scoreCompiledSemantic({ task: retainedTask, compiled: { kind: "plan", snapshot: reorderedRevision }, raw: rawMatch, currentPlan: currentRevision })).toMatchObject({ correct: false, reason: "graph_mismatch" });

    const expected = { kind: "clarification_preview", source: null,
      slots: ["$generated:s1", "$generated:s2"].map((slot_id, i) => ({ slot_id, field: "time", question: `Question ${i}`, affected_node_ids: [`$generated:r${i}`], blocking: true, reason: "unknown_time" })),
      unresolved: ["$generated:r0", "$generated:r1"].map((request_id, i) => ({ request_id, requested_text_quote: `Request ${i}`, intended_capability: null, intended_destination: null, blocking_slot_ids: [`$generated:s${i + 1}`] })) };
    const actual = structuredClone(expected);
    actual.slots = [{ ...expected.slots[1], slot_id: "slot-2", affected_node_ids: ["request-2"] }, { ...expected.slots[0], slot_id: "slot-1", affected_node_ids: ["request-1"] }];
    actual.unresolved = [{ ...expected.unresolved[1], request_id: "request-2", blocking_slot_ids: ["slot-2"] }, { ...expected.unresolved[0], request_id: "request-1", blocking_slot_ids: ["slot-1"] }];
    const requestTask = (nodeOrder: string) => ({ path: "new_plan", input: { latestRequest: "Request 0 / Request 1" }, gold: { oracle: { compiled: { expected, nodeOrder, unresolvedQuotes: [] } } } });
    expect(scoreCompiledSemantic({ task: requestTask("exact"), compiled: actual, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
    expect(scoreCompiledSemantic({ task: requestTask("dag"), compiled: actual, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: true });
  });

  it("keeps coded clarification scope reference sets aligned with DAG normalization", () => {
    const expected = { kind: "clarification_preview", source: null,
      slots: [{ slot_id: "$generated:slot", field: "time", question: "Which time?", affected_node_ids: ["$generated:r1", "$generated:r2"], blocking: true, reason: "unknown_time" }],
      unresolved: [
        { request_id: "$generated:r1", requested_text_quote: "First request", intended_capability: null, intended_destination: null, blocking_slot_ids: ["$generated:slot"] },
        { request_id: "$generated:r2", requested_text_quote: "Second request", intended_capability: null, intended_destination: null, blocking_slot_ids: ["$generated:slot"] }
      ] };
    const compiled = { kind: "clarification_preview", source: null,
      slots: [{ slot_id: "slot-real", field: "time", question: "What time should I use?", affected_node_ids: ["request-2", "request-1"], blocking: true, reason: "unknown_time" }],
      unresolved: [
        { request_id: "request-1", requested_text_quote: "First request", intended_capability: null, intended_destination: null, blocking_slot_ids: ["slot-real"] },
        { request_id: "request-2", requested_text_quote: "Second request", intended_capability: null, intended_destination: null, blocking_slot_ids: ["slot-real"] }
      ] };
    const rawMatch = { correct: true, variantId: "v", intentMap: [0], validatedResponse: { requests: [{ request_quote: "First request" }] } };
    const task = (nodeOrder: string) => ({ path: "new_plan", input: { latestRequest: "First request; second request" }, gold: { oracle: { compiled: { expected, nodeOrder, unresolvedQuotes: [] } } } });
    expect(scoreCompiledSemantic({ task: task("exact"), compiled, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: false, reason: "graph_mismatch" });
    expect(scoreCompiledSemantic({ task: task("dag"), compiled, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: true });
  });

  it("stops on ambiguous graph mappings and the 256 complete-attempt cap", () => {
    const makeTaskAndResult = (count: number) => {
      const step = (stepId: string) => ({ step_id: stepId, depends_on: [], enabled: true, title: { mode: "literal", value: "Same independent node", origin: "creator" }, note: null, time: null,
        capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null });
      const snapshot = (planId: string, ids: string[]) => ({ schema_version: 1, plan_id: planId, creator_id: "creator-1", revision: 0, review: "proposed",
        source: { kind: "staged_media", post_id: null, selected_media_ids: [], creative_work_id: null, creative_series_member_id: null, source_revision: "v1" },
        steps: ids.map(step), distribution_groups: [], unresolved_requests: [], clarifications: [], requested_text_quote: "Make several drafts",
        created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z" });
      const expected = { kind: "plan", snapshot: snapshot("$generated:plan", Array.from({ length: count }, (_, index) => `$generated:s${index}`)) };
      const compiled = { kind: "plan", snapshot: snapshot("plan-real", Array.from({ length: count }, (_, index) => `step-${index}`)) };
      const task = { path: "new_plan", input: { latestRequest: "Make several drafts" }, gold: { oracle: { compiled: { expected, nodeOrder: "dag", unresolvedQuotes: [] } } } };
      return { task, compiled };
    };
    const rawMatch = { correct: true, variantId: "v", intentMap: [0], validatedResponse: { requests: [{ request_quote: "Make several drafts" }] } };
    const ambiguous = makeTaskAndResult(2);
    expect(scoreCompiledSemantic({ ...ambiguous, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: null, reason: "ambiguous_graph_match", mappingsTried: 2 });
    const capped = makeTaskAndResult(6);
    expect(scoreCompiledSemantic({ ...capped, raw: rawMatch, currentPlan: null })).toMatchObject({ correct: null, reason: "graph_mapping_limit", mappingsTried: 256 });
  });

  it("rejects an impossible generated-ID bucket before exploring dead-end permutations", () => {
    const step = { step_id: "step-base", depends_on: [], enabled: true, title: { mode: "literal", value: "Base", origin: "creator" }, note: null, time: null,
      capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null };
    const group = (group_id: string) => ({ group_id, source_step_id: "step-base", preview_step_id: null, destination_step_ids: [] });
    const snapshot = (revision: number, groups: any[], updatedAt: string) => ({ schema_version: 1, plan_id: "plan-base", creator_id: "creator-1", revision, review: "proposed",
      source: { kind: "staged_media", post_id: null, selected_media_ids: [], creative_work_id: null, creative_series_member_id: null, source_revision: "v1" },
      steps: [step], distribution_groups: groups, unresolved_requests: [], clarifications: [], requested_text_quote: "Revise groups", created_at: "2026-10-17T10:00:00Z", updated_at: updatedAt });
    const currentPlan = snapshot(1, [group("group-0"), group("group-1")], "2026-10-17T10:00:00Z");
    const expected = { kind: "plan", snapshot: snapshot(2, [group("group-0"), ...Array.from({ length: 31 }, (_, index) => group(`$generated:g${index}`))], "2026-10-17T10:01:00Z") };
    const compiled = { kind: "plan", snapshot: snapshot(2, Array.from({ length: 32 }, (_, index) => group(`group-${index}`)), "2026-10-17T10:01:00Z") };
    const task = { path: "revision", input: { latestRequest: "Revise groups" }, gold: { oracle: { compiled: { expected, nodeOrder: "dag", unresolvedQuotes: [] } } } };
    const rawMatch = { correct: true, variantId: "v", intentMap: [0], validatedResponse: { requests: [{ request_quote: "Revise groups" }] } };
    expect(scoreCompiledSemantic({ task, compiled, raw: rawMatch, currentPlan })).toMatchObject({ correct: false, reason: "graph_mismatch", mappingsTried: 0 });
  });

  it("binds direct-question behavior to the actual raw variant and packet-scoped human evidence", async () => {
    const base = getTask("A01");
    const reviewGold = { neededFields: ["local_time", "timezone"], affectedScope: ["teaser"] };
    const expected = { stage: "interpreter_terminal", compiler: "not_invoked", outcome: "clarification", code: null,
      executableIntentCount: 0, question: { kind: "human_requirement", neededFields: reviewGold.neededFields, affectedScope: reviewGold.affectedScope } };
    const task: EvalTask = { ...base, gold: { ...base.gold, humanQuestion: reviewGold,
      oracle: { version: "cp-oracle.v1", rawVariants: [{ id: "direct", expected: { base_revision: null, outcome: "clarification", question: "What time?", requests: [] }, requestOrder: "exact", domains: [] }], compiled: null,
        behavior: [{ rawVariantIds: ["direct"], expected }] } } };
    const responseText = JSON.stringify({ base_revision: null, outcome: "clarification", question: "Could you tell me the time and zone?", requests: [] });
    const interpretation = await interpretRequest({ latestRequest: task.input.latestRequest, rawContext: task.input.modelContext,
      provider: { async respond() { return { text: responseText, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, finishReason: "stop" as const }; } }, deadlineMs: 30_000 });
    const observation = { stage: "interpreter_terminal", interpretation, currentPlan: null };
    expect(buildBehaviorView(observation)).toMatchObject({ kind: "ok" });
    const rawScore = { correct: null, status: "human_review_pending", reason: "human_review_pending", variantId: "direct", validatedResponse: JSON.parse(responseText) };
    const pending = scoreBehavior({ task, observation, raw: rawScore, humanReview: null });
    expect(pending).toMatchObject({ correct: null, status: "human_review_pending", reason: "human_review_pending" });
    const packet = { latestRequest: task.input.latestRequest, neededFields: reviewGold.neededFields, affectedScope: reviewGold.affectedScope, question: observation.interpretation.question };
    const yes = () => ({ ratings: Array.from({ length: 5 }, () => ({ rating: "yes", rationale: null })) });
    const accepted = { packetDigest: packetDigest(packet), primaryReviews: [yes(), yes()], adjudicator: null };
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: accepted })).toMatchObject({ correct: true, status: "scored" });
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: { accepted: true } })).toMatchObject({ correct: null, status: "human_review_pending" });
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: { ...accepted, primaryReviews: [yes(), { ratings: [] }] } })).toMatchObject({ correct: null, status: "human_review_pending" });
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: { ...accepted, adjudicators: [yes(), yes()] } })).toMatchObject({ correct: null, status: "human_review_pending" });
    expect(scoreBehavior({ task, observation, raw: { ...rawScore, variantId: "other" }, humanReview: accepted })).toMatchObject({ correct: null, reason: "invalid_oracle_gold" });
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: { ...accepted, packetDigest: "0".repeat(64) } })).toMatchObject({ correct: null, reason: "human_review_pending" });
    expect(scoreBehavior({ task, observation: { ...observation, hidden: true }, raw: rawScore, humanReview: accepted })).toMatchObject({ correct: null, reason: "unsupported_oracle" });
    const rejected = { packetDigest: packetDigest(packet), primaryReviews: [
      { ratings: Array.from({ length: 5 }, (_, i) => ({ rating: i === 0 ? "no" : "yes", rationale: i === 0 ? "Does not identify the missing details." : null })) },
      { ratings: Array.from({ length: 5 }, (_, i) => ({ rating: i === 0 ? "no" : "yes", rationale: i === 0 ? "Scope is still unclear." : null })) }
    ], adjudicator: null };
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: rejected })).toMatchObject({ correct: false, reason: "human_review_rejected" });
    const unclear = { packetDigest: packetDigest(packet), primaryReviews: [
      { ratings: Array.from({ length: 5 }, (_, i) => ({ rating: i === 0 ? "unclear" : "yes", rationale: i === 0 ? "Need more context." : null })) }, yes()
    ], adjudicator: { ratings: Array.from({ length: 5 }, (_, i) => ({ rating: i === 0 ? "unclear" : "yes", rationale: i === 0 ? "Still unclear." : null })) } };
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: unclear })).toMatchObject({ correct: false, reason: "human_review_unresolved" });
    const disagreeing = { packetDigest: packetDigest(packet), primaryReviews: [yes(), {
      ratings: Array.from({ length: 5 }, (_, i) => ({ rating: i === 0 ? "no" : "yes", rationale: i === 0 ? "This question misses the required scope." : null }))
    }], adjudicator: null };
    const adjudicate = (rating: "yes" | "no" | "unclear") => ({ ...disagreeing, adjudicator: { ratings: Array.from({ length: 5 }, (_, i) => ({
      rating: i === 0 ? rating : "yes", rationale: i === 0 && rating !== "yes" ? "The required clarification is not established." : null
    })) } });
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: disagreeing })).toMatchObject({ correct: null, status: "human_review_pending" });
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: adjudicate("yes") })).toMatchObject({ correct: true, status: "scored" });
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: adjudicate("no") })).toMatchObject({ correct: false, reason: "human_review_rejected" });
    expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: adjudicate("unclear") })).toMatchObject({ correct: false, reason: "human_review_unresolved" });
    expect(buildBehaviorView({ stage: "interpreter_terminal", interpretation: { outcome: "clarification", question: "" }, currentPlan: null })).toMatchObject({ kind: "unscored" });
    const appObservation = await observeFirstPassForEvaluation({ responseText, latestRequest: task.input.latestRequest, rawContext: task.input.modelContext }, { projectPlanningContext, interpretRequest });
    const rawAccepted = scoreRawSemantic({ task, responseText, observation: appObservation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: accepted });
    expect(rawAccepted).toMatchObject({ correct: true, status: "scored", variantId: "direct" });
  });

  it("keeps behavior stages closed and reports fixed first/final denominators", async () => {
    expect(buildBehaviorView({ stage: "context_preflight", contextResult: { kind: "clarification", code: "narrow_selection", question: "Which one?" } })).toMatchObject({
      kind: "ok", view: { compiler: "not_invoked", question: { kind: "coded", origin: "context", fields: [], affectedIds: [] } }
    });
    expect(buildBehaviorView({ stage: "context_preflight", contextResult: { kind: "clarification", code: "invented", question: "Which one?" } })).toMatchObject({ kind: "unscored", code: "unsupported_oracle" });
    const terminal = async (outcome: "limitation" | "no_change") => interpretRequest({ latestRequest: "Please handle this request.", rawContext: getTask("U01").input.modelContext,
      provider: { async respond() { return { text: JSON.stringify({ base_revision: null, outcome, question: outcome === "limitation" ? "private explanation" : null, requests: [] }),
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, finishReason: "stop" as const }; } }, deadlineMs: 30_000 });
    const limitation = await terminal("limitation");
    expect(buildBehaviorView({ stage: "interpreter_terminal", interpretation: limitation, currentPlan: null })).toMatchObject({ view: { outcome: "limitation", code: "unsupported_request", question: { kind: "none" } } });
    const noChange = await terminal("no_change");
    expect(buildBehaviorView({ stage: "interpreter_terminal", interpretation: noChange, currentPlan: { planId: "p1", revision: 3 } })).toMatchObject({ view: { outcome: "no_change", planId: "p1", revision: 3 } });
    expect(buildBehaviorView({ stage: "interpreter_terminal", interpretation: { ...noChange, requests: [{}] }, currentPlan: { planId: "p1", revision: 3 } })).toMatchObject({ kind: "unscored" });
    expect(buildBehaviorView({ stage: "interpreter_terminal", interpretation: { outcome: "no_change" }, currentPlan: { planId: "p1", revision: 3 }, compiled: { kind: "plan" } })).toMatchObject({ kind: "unscored" });
    const scores = new Map<string, any>(fixture.tasks.map(task => {
      const preflight = task.path === "context_preflight";
      return [task.caseId, {
        rawFirst: preflight ? { correct: null, status: "not_called", reason: "context_preflight" } : { correct: true, status: "scored", reason: null },
        compiledFirst: preflight ? null : { correct: true, status: "scored", reason: null },
        behaviorFirst: { correct: true, status: "scored", reason: null },
        rawFinal: preflight ? { correct: null, status: "not_called", reason: "context_preflight" } : { correct: true, status: "scored", reason: null },
        compiledFinal: preflight ? null : { correct: true, status: "scored", reason: null },
        behaviorFinal: { correct: true, status: "scored", reason: null, view: { stage: preflight ? "context_preflight" : "compiler_result", compiler: preflight ? "not_invoked" : "invoked" } }
      }];
    }));
    const report = summarizeOracleDevelopment(fixture, scores, INTERPRETED_REQUEST_SCHEMA);
    expect(report).toMatchObject({ kind: "ok", fixedDenominators: { all: 48, unambiguous: 24, compound: 12, clarifications: 12, safety: 12 },
      rawFirst: { all: { correct: 45, denominator: 48, notCalled: 3 }, compound: { denominator: 12 } }, finalTask: { all: { correct: 48, denominator: 48 } } });
    expect(summarizeOracleDevelopment(fixture, new Map(), INTERPRETED_REQUEST_SCHEMA).finalTask.all).toMatchObject({ correct: 0, denominator: 48, unscored: 48 });
    expect(summarizeOracleDevelopment(fixture, scores, INTERPRETED_REQUEST_SCHEMA).finalTask.all.correct).toBe(48);
    scores.set("U01", { ...scores.get("U01")!, rawFinal: { correct: null, status: "not_called", reason: "context_preflight" },
      behaviorFinal: { correct: true, status: "scored", reason: null, view: { stage: "context_preflight", compiler: "not_invoked" } }, compiledFinal: null });
    expect(summarizeOracleDevelopment(fixture, scores, INTERPRETED_REQUEST_SCHEMA).finalTask.all).toMatchObject({ correct: 47, denominator: 48, reasons: { unexpected_context_preflight: 1 } });
    scores.set("U02", { ...scores.get("U02")!, behaviorFinal: { correct: null, status: "human_review_pending", reason: "human_review_pending", view: { stage: "compiler_result", compiler: "invoked" } } });
    expect(summarizeOracleDevelopment(fixture, scores, INTERPRETED_REQUEST_SCHEMA).finalTask.all).toMatchObject({ correct: 46, pending: 1, reasons: { human_review_pending: 1 } });
    expect(summarizeOracleDevelopment(fixture, new Map([["U01", { ...scores.get("U01")!, rawFirst: { correct: true, status: "unscored", reason: "bad" } }]]), INTERPRETED_REQUEST_SCHEMA)).toMatchObject({ kind: "invalid_scores" });
  });

  it("uses the compiled graph bijection once for behavior despite generated IDs and question wording", () => {
    const makeSnapshot = (planId: string, stepId: string, slotId: string, question: string) => ({
      schema_version: 1, plan_id: planId, creator_id: "creator-1", revision: 0, review: "proposed",
      source: { kind: "staged_media", post_id: null, selected_media_ids: [], creative_work_id: null, creative_series_member_id: null, source_revision: "source-v1" },
      steps: [{ step_id: stepId, depends_on: [], enabled: true, title: { mode: "literal", value: "Draft", origin: "creator" }, note: null, time: null,
        capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: [], target_post_id: null }],
      distribution_groups: [], unresolved_requests: [], clarifications: [{ slot_id: slotId, field: "timezone", question, affected_node_ids: [], blocking: true, reason: "unknown_time" }],
      requested_text_quote: "Draft this for Patreon.", created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z"
    });
    const expectedResult = { kind: "plan", snapshot: makeSnapshot("$generated:plan", "$generated:step", "$generated:slot", "Which timezone should I use?") };
    const compiled = { kind: "plan", snapshot: makeSnapshot("plan-real", "step-real", "slot-real", "What timezone applies here?") };
    const rawMatch = { correct: true, status: "scored", reason: null, variantId: "v1", intentMap: [0], validatedResponse: { outcome: "proposal", requests: [{ request_quote: "Draft this for Patreon." }] } };
    const expectedBehavior = { stage: "compiler_result", compiler: "invoked", result: expectedResult };
    const task = { path: "new_plan", input: { latestRequest: "Draft this for Patreon." }, gold: { oracle: {
      compiled: { expected: expectedResult, nodeOrder: "exact", unresolvedQuotes: [] },
      behavior: [{ rawVariantIds: ["v1"], expected: expectedBehavior }]
    } } };
    expect(scoreBehavior({ task, observation: { stage: "compiler_result", compiled, raw: rawMatch }, raw: rawMatch, humanReview: null })).toMatchObject({ correct: true, status: "scored" });
  });

  it("binds limitation and no-change terminal behavior to validated raw outcomes", async () => {
    const base = getTask("U01");
    for (const outcome of ["limitation", "no_change"] as const) {
      const question = outcome === "limitation" ? "A private explanation that is discarded." : null;
      const responseText = JSON.stringify({ base_revision: null, outcome, question, requests: [] });
      const expectedRaw = JSON.parse(responseText) as InterpretedRequest;
      const behavior = [] as any[];
      const task: EvalTask = { ...base, gold: { ...base.gold, oracle: { version: "cp-oracle.v1",
        rawVariants: [{ id: outcome, expected: expectedRaw, requestOrder: "exact", domains: [] }], compiled: null, behavior } } };
      const appObservation = await observeFirstPassForEvaluation({ responseText, latestRequest: task.input.latestRequest, rawContext: task.input.modelContext }, { projectPlanningContext, interpretRequest });
      const rawScore = scoreRawSemantic({ task, responseText, observation: appObservation, schema: INTERPRETED_REQUEST_SCHEMA, matchesSchema, humanReview: null });
      expect(rawScore).toMatchObject({ correct: true, variantId: outcome });
      const interpretation = await interpretRequest({ latestRequest: task.input.latestRequest, rawContext: task.input.modelContext,
        provider: { async respond() { return { text: responseText, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, finishReason: "stop" as const }; } }, deadlineMs: 30_000 });
      const currentPlan = outcome === "no_change" ? { planId: "plan-current", revision: 4 } : null;
      const observation = { stage: "interpreter_terminal", interpretation, currentPlan };
      const view = buildBehaviorView(observation);
      expect(view.kind).toBe("ok");
      if (view.kind !== "ok") continue;
      const expected = { ...view.view };
      task.gold.oracle.behavior.push({ rawVariantIds: [outcome], expected });
      expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: null })).toMatchObject({ correct: true, status: "scored" });
      if (outcome === "no_change") {
        task.gold.oracle.behavior[0].expected = { ...expected, revision: 5 };
        expect(scoreBehavior({ task, observation, raw: rawScore, humanReview: null })).toMatchObject({ correct: false, reason: "behavior_mismatch" });
      }
      expect(scoreBehavior({ task, observation, raw: { ...rawScore, validatedResponse: { ...expectedRaw, outcome: "proposal" } }, humanReview: null })).toMatchObject({ correct: false, reason: "behavior_mismatch" });
    }
  });
});

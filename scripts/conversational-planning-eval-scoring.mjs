import { createHash } from "node:crypto";

const COHORTS = ["U", "C", "A", "S"];
const GUARD_GROUPS = ["transport_bounds", "strict_output", "ownership_target", "revision_preservation", "graph_publication", "failure_accounting"];
const EXPECTED_GUARDS = Array.from({ length: 24 }, (_, index) => `G${String(index + 1).padStart(2, "0")}`);
const GENERATED_ID = /^\$generated:[a-z0-9_-]+$/;
const MAX_GRAPH_COMPLETE_MAPPINGS = 256;
const MAX_GRAPH_PARTIAL_STATES = 32_768;
export const ORACLE_REASONS = Object.freeze([
  "invalid_output", "application_rejected", "missing_application_observation", "observation_mismatch",
  "invalid_oracle_gold", "unsupported_oracle", "missing_or_extra_intent", "semantic_mismatch",
  "ambiguous_intent_match", "missing_compiled_gold", "invalid_graph", "graph_mismatch",
  "ambiguous_graph_match", "graph_mapping_limit", "behavior_mismatch", "missing_behavior_observation",
  "question_missing", "human_review_pending", "human_review_rejected", "human_review_unresolved", "context_preflight"
]);
const object = value => !!value && typeof value === "object" && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (_key, child) => {
  if (!object(child)) return child;
  return Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]]));
});
const same = (a, b) => canonical(a) === canonical(b);
const digest = value => createHash("sha256").update(value, "utf8").digest("hex");

function questionPacket(task, question) {
  const gold = task?.gold?.humanQuestion;
  if (!object(gold) || !Array.isArray(gold.neededFields) || !Array.isArray(gold.affectedScope) ||
      gold.neededFields.length < 1 || gold.neededFields.length > 8 || gold.affectedScope.length > 16 ||
      !gold.neededFields.every(value => typeof value === "string" && value.length > 0 && value.length <= 80) ||
      !gold.affectedScope.every(value => typeof value === "string" && value.length > 0 && value.length <= 200) ||
      typeof task?.input?.latestRequest !== "string" || typeof question !== "string" || !question || question.length > 500) return null;
  return { latestRequest: task.input.latestRequest, neededFields: [...gold.neededFields], affectedScope: [...gold.affectedScope], question };
}
function reviewRatings(review) {
  if (!closedObject(review, ["ratings"]) || !Array.isArray(review.ratings) || review.ratings.length !== 5) return null;
  const out = [];
  for (const item of review.ratings) {
    if (!closedObject(item, ["rating", "rationale"]) || !["yes", "no", "unclear"].includes(item.rating) ||
        (item.rating === "yes" ? !(item.rationale === null || typeof item.rationale === "string" && item.rationale.length <= 250) : typeof item.rationale !== "string" || item.rationale.length > 250)) return null;
    out.push(item.rating);
  }
  return out;
}
function humanReviewDecision(packet, review) {
  if (review === null || review === undefined) return "pending";
  if (!closedObject(review, ["packetDigest", "primaryReviews", "adjudicator"]) ||
      review.packetDigest !== digest(canonical(packet)) || !Array.isArray(review.primaryReviews) || review.primaryReviews.length !== 2 ||
      !(review.adjudicator === null || object(review.adjudicator))) return "pending";
  const first = reviewRatings(review.primaryReviews[0]), second = reviewRatings(review.primaryReviews[1]);
  if (!first || !second) return "pending";
  if (first.every(value => value === "yes") && second.every(value => value === "yes")) return "accepted";
  if (first.some((value, index) => value === "no" && second[index] === "no")) return "rejected";
  if (review.adjudicator === null) return "pending";
  const final = reviewRatings(review.adjudicator);
  if (!final) return "pending";
  if (final.every(value => value === "yes")) return "accepted";
  if (final.some(value => value === "no")) return "rejected";
  return "unresolved";
}

/** Run the real projection and interpreter with a deterministic, zero-cost mock provider. */
export async function observeFirstPassForEvaluation({ responseText, latestRequest, rawContext }, runtime) {
  const responseDigest = typeof responseText === "string" ? digest(responseText) : digest("");
  const requestDigest = typeof latestRequest === "string" ? digest(latestRequest) : digest("");
  let projected = null;
  try {
    if (!runtime || typeof runtime.projectPlanningContext !== "function" || typeof runtime.interpretRequest !== "function") throw new Error("runtime_unavailable");
    projected = runtime.projectPlanningContext(rawContext);
  } catch { /* reported as a rejected observation below */ }
  const contextDigest = projected === null ? digest("null") : digest(canonical(projected));
  let result = null;
  let mockCalls = 0;
  if (projected !== null && typeof runtime?.interpretRequest === "function") {
    try {
      result = await runtime.interpretRequest({
        latestRequest, rawContext,
        provider: { async respond() { mockCalls++; return { text: responseText, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, finishReason: "stop" }; } },
        deadlineMs: 30_000
      });
    } catch { result = null; }
  }
  const acceptedOutcomes = new Set(["proposal", "clarification", "limitation", "no_change"]);
  const accepted = !!result && result.attempts === 1 && result.repairs === 0 && result.terminalReason === null && acceptedOutcomes.has(result.outcome);
  return Object.freeze({
    version: "cp-first-pass.v1", responseDigest, requestDigest, contextDigest,
    validation: accepted ? "first_pass_accepted" : "rejected",
    outcome: result && acceptedOutcomes.has(result.outcome) ? result.outcome : null,
    attempts: result?.attempts ?? 0, repairs: result?.repairs ?? 0,
    mockCalls: Math.min(2, mockCalls)
  });
}

function closedObject(value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
const FIRST_PASS_KEYS = ["version", "responseDigest", "requestDigest", "contextDigest", "validation", "outcome", "attempts", "repairs", "mockCalls"];
const INTENT_KEYS = ["command", "target_handle", "changed_fields", "kind", "source_ref", "destination", "title_mode", "title_text", "template_ref", "enabled", "delivery_intent", "social_action", "time_kind", "local_date", "weekday", "weekday_qualifier", "timezone", "day_offset", "target_destination", "local_time", "time_text", "request_quote"];
const DOMAIN_FIELDS = new Set(["source_ref", "template_ref", "enabled", "timezone"]);
function hasRawGeneratedId(request) {
  return [request?.target_handle, request?.source_ref?.id, request?.template_ref?.value].some(value => typeof value === "string" && value.includes("$generated:"));
}

function validateRawVariants(task, schema, matchesSchema) {
  const oracle = task?.gold?.oracle;
  if (!closedObject(oracle, ["version", "rawVariants", "compiled", "behavior"]) || oracle.version !== "cp-oracle.v1" || !(oracle.compiled === null || object(oracle.compiled)) || !Array.isArray(oracle.behavior) || oracle.behavior.length > 2) return null;
  const variants = oracle.rawVariants;
  if (!Array.isArray(variants) || variants.length < 1 || variants.length > 8) return null;
  const ids = new Set();
  const structures = new Set();
  for (const variant of variants) {
    if (!closedObject(variant, ["id", "expected", "requestOrder", "domains"]) || typeof variant.id !== "string" || !variant.id || ids.has(variant.id) || variant.id.includes("$generated:") || !["exact", "independent"].includes(variant.requestOrder) || !Array.isArray(variant.domains) || !object(variant.expected)) return null;
    ids.add(variant.id);
    const structure = canonical({ expected: variant.expected, requestOrder: variant.requestOrder, domains: variant.domains });
    if (structures.has(structure)) return null;
    structures.add(structure);
    const expected = variant.expected;
    if (!closedObject(expected, ["base_revision", "outcome", "question", "requests"]) || !["proposal", "clarification", "limitation", "no_change"].includes(expected.outcome) || !Array.isArray(expected.requests) || expected.requests.length > 6 || expected.requests.some(hasRawGeneratedId) || typeof matchesSchema !== "function" || !matchesSchema(expected, schema)) return null;
    if ((expected.outcome === "proposal") !== (expected.requests.length > 0)) return null;
    if (expected.outcome === "proposal") {
      const currentRevision = task.input?.currentPlan?.revision ?? null;
      const projectedRevision = task.input?.modelContext?.plan_revision ?? null;
      if (currentRevision !== projectedRevision || expected.base_revision !== currentRevision) return null;
    }
    if (expected.outcome !== "clarification" && expected.outcome !== "limitation" && expected.question !== null) return null;
    if (expected.requests.some(request => !task.input.latestRequest.includes(request.request_quote) ||
        (request.title_text !== null && !request.request_quote.includes(request.title_text)) ||
        (request.time_text !== null && !request.request_quote.includes(request.time_text)))) return null;
    const domainIndices = new Set();
    for (const domain of variant.domains) {
      if (!object(domain) || !Number.isInteger(domain.intentIndex) || domain.intentIndex < 0 || domain.intentIndex >= expected.requests.length || domainIndices.has(domain.intentIndex) || Object.keys(domain).some(key => key !== "intentIndex" && !DOMAIN_FIELDS.has(key))) return null;
      domainIndices.add(domain.intentIndex);
      for (const key of DOMAIN_FIELDS) if (Object.hasOwn(domain, key)) {
        const values = domain[key];
        if (!Array.isArray(values) || values.length < 1 || values.length > 3 || values.some(value => containsGeneratedId(value)) || new Set(values.map(canonical)).size !== values.length) return null;
        const allowedType = key === "source_ref" ? values.every(value => closedObject(value, ["mode", "id"]) && ["selection", "post_id", "media_id"].includes(value.mode) && (value.mode === "selection" ? value.id === null : typeof value.id === "string"))
          : key === "template_ref" ? values.every(value => closedObject(value, ["mode", "value"]) && ["none", "id", "named"].includes(value.mode) && (value.mode === "none" ? value.value === null : typeof value.value === "string"))
          : key === "enabled" ? values.every(value => value === null || typeof value === "boolean")
          : values.every(value => value === null || typeof value === "string");
        if (!allowedType || !values.every(value => sameAuthoritativeDomainValue(task, expected.requests[domain.intentIndex], key, value))) return null;
      }
    }
    if (variant.domains.length > 6) return null;
    for (const request of expected.requests) if (!closedObject(request, INTENT_KEYS) || !Array.isArray(request.changed_fields) || new Set(request.changed_fields).size !== request.changed_fields.length || typeof request.request_quote !== "string" || !request.request_quote) return null;
  }
  return variants;
}

function sameChangedFields(actual, expected) {
  return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length && new Set(actual).size === actual.length && expected.every(field => actual.includes(field));
}
function sameAuthoritativeDomainValue(task, expectedRequest, field, value) {
  const context = task?.input?.modelContext;
  if (!object(context)) return false;
  if (field === "source_ref") {
    const identity = ref => {
      if (ref.mode === "post_id") return context.posts.some(row => row.id === ref.id) ? `post:${ref.id}` : null;
      if (ref.mode === "media_id") {
        const media = context.media.find(row => row.id === ref.id);
        return media ? `media:${media.id}` : null;
      }
      const postIds = [...context.selected.post_ids].sort();
      const mediaIds = [...context.selected.media_ids].sort();
      if (postIds.some(id => !context.posts.some(row => row.id === id)) || mediaIds.some(id => !context.media.some(row => row.id === id))) return null;
      if (postIds.length === 1 && mediaIds.length === 0) return `post:${postIds[0]}`;
      if (mediaIds.length === 1 && postIds.length === 0) return `media:${mediaIds[0]}`;
      if (postIds.length === 0 && mediaIds.length === 0) return null;
      const resolved = new Set([
        ...postIds.map(id => `post:${id}`), ...mediaIds.map(id => `media:${id}`)
      ]);
      return `selection:${[...resolved].sort().join("|")}`;
    };
    return identity(expectedRequest[field]) !== null && identity(expectedRequest[field]) === identity(value);
  }
  if (field === "template_ref") {
    const resolve = ref => {
      if (ref.mode === "none") return "none";
      const found = ref.mode === "id" ? context.templates.filter(row => row.id === ref.value) : context.templates.filter(row => row.name === ref.value);
      return found.length === 1 ? `template:${found[0].id}` : null;
    };
    return resolve(expectedRequest[field]) !== null && resolve(expectedRequest[field]) === resolve(value);
  }
  if (field === "enabled") {
    if (expectedRequest.command !== "revise" || !expectedRequest.target_handle) return false;
    const target = context.editable_nodes.find(row => row.handle === expectedRequest.target_handle);
    return !!target && (expectedRequest.enabled === null ? target.enabled : expectedRequest.enabled) === (value === null ? target.enabled : value);
  }
  if (field === "timezone") {
    if (expectedRequest.time_kind === "absolute_local") return same(expectedRequest.timezone, value);
    if (!new Set(["weekday", "publication_calendar_day", "unresolved_local"]).has(expectedRequest.time_kind)) return same(expectedRequest.timezone, value);
    const frozenZone = context.creator_timezone ?? context.request_clock?.timezone;
    return typeof frozenZone === "string" && (expectedRequest.timezone === null || expectedRequest.timezone === frozenZone) && (value === null || value === frozenZone);
  }
  return false;
}
function rawRequestMatches(actual, expected, latestRequest, domain, task) {
  if (!closedObject(actual, INTENT_KEYS)) return false;
  for (const key of INTENT_KEYS) {
    if (key === "changed_fields") { if (!sameChangedFields(actual[key], expected[key])) return false; continue; }
    if (key === "request_quote") {
      const quote = actual[key];
      if (typeof quote !== "string" || !quote.trim() || !latestRequest.includes(quote)) return false;
      if (actual.title_text !== null && (!quote.includes(actual.title_text) || !latestRequest.includes(actual.title_text))) return false;
      if (actual.time_text !== null && (!quote.includes(actual.time_text) || !latestRequest.includes(actual.time_text))) return false;
      continue;
    }
    const allowed = domain && Object.hasOwn(domain, key) ? domain[key] : [expected[key]];
    if (!allowed.some(value => same(actual[key], value) && (same(value, expected[key]) || sameAuthoritativeDomainValue(task, expected, key, value)))) return false;
  }
  return true;
}
function requestPermutations(length, independent) {
  if (!independent) return [Array.from({ length }, (_, index) => index)];
  const result = [];
  const visit = (prefix, remaining) => {
    if (!remaining.length) { result.push(prefix); return; }
    for (let i = 0; i < remaining.length; i++) visit([...prefix, remaining[i]], [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
  };
  visit([], Array.from({ length }, (_, index) => index));
  return result;
}

const PLAN_KEYS = ["schema_version", "plan_id", "creator_id", "revision", "review", "source", "steps", "distribution_groups", "unresolved_requests", "clarifications", "requested_text_quote", "created_at", "updated_at"];
const STEP_BASE_KEYS = ["step_id", "depends_on", "enabled", "title", "note", "time"];
const CAPABILITY_KEYS = {
  prepare_post_draft: ["intended_destination", "source_media_ids", "target_post_id"],
  prepare_preview: ["source_step_id", "template_id", "template_config_snapshot"],
  prepare_distribution: ["source_step_id", "preview_step_id", "distribution_group_id", "destination", "copy_title"],
  publish_handoff: ["distribution_step_id", "destination"],
  reply_block: ["publication_step_id", "destination", "target_post_id"],
  engagement_check: ["publication_step_id", "destination", "target_post_id"]
};
const DESTINATIONS = new Set(["patreon", "x", "deviantart", "bluesky"]);
const CLARIFICATION_REASONS = new Set(["ambiguous_source", "missing_post", "unknown_part", "literal_or_template", "missing_template", "unlinked_destination", "unknown_time", "unknown_engagement_action", "unknown_engagement_target", "unsupported_action", "visual_request"]);
const QUESTION_FIELDS = new Set(["time", "timezone", "source_post", "template", "title", "social_action", "target_destination", "destination"]);
const REVISION_QUESTION_CODES = new Set([...CLARIFICATION_REASONS, "missing_handle", "ambiguous_target", "missing_evidence", "unsupported_edit", "dependent_repair_required"]);
const CONFLICT_CODES = new Set(["stale_revision", "invalid_handle", "duplicate_delivery", "conflicting_change", "invalid_intent", "creator_or_plan_scope_mismatch", "missing_step", "expected_value_changed"]);
const LIMITATION_CODES = new Set(["contract_gap", "invalid_interpretation", "unsupported_request", "source_scope", "entitlement_required", "validation_failed", "unsupported_revision"]);
const isId = value => typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value;
const isNullableId = value => value === null || isId(value);
const isString = (value, max = Infinity, allowEmpty = true) => typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0);
const isUniqueIdList = (value, max) => Array.isArray(value) && value.length <= max && value.every(isId) && new Set(value).size === value.length;
const exactKeys = (value, keys) => closedObject(value, keys);

function validSourceRef(source) {
  return exactKeys(source, ["kind", "post_id", "selected_media_ids", "creative_work_id", "creative_series_member_id", "source_revision"]) &&
    ["existing_post", "staged_media"].includes(source.kind) && isNullableId(source.post_id) && isUniqueIdList(source.selected_media_ids, 3) &&
    isNullableId(source.creative_work_id) && isNullableId(source.creative_series_member_id) && isId(source.source_revision);
}
function validCopy(value) {
  if (!object(value)) return false;
  if (value.mode === "literal") return exactKeys(value, ["mode", "value", "origin"]) && isString(value.value, 500, false) && ["creator", "compiler"].includes(value.origin);
  if (value.mode === "part_substitution") return exactKeys(value, ["mode", "prefix", "part", "suffix", "part_source"]) && isString(value.prefix, 500) && isString(value.part, 500, false) && isString(value.suffix, 500) && ["creator", "creative_series_member"].includes(value.part_source);
  return false;
}
function validTime(value) {
  if (value === null) return true;
  if (value?.kind === "absolute") return exactKeys(value, ["kind", "at_utc", "timezone", "local"]) && isString(value.at_utc, 50, false) && isString(value.timezone, 100, false) && isString(value.local, 50, false);
  if (value?.kind === "after_publication_calendar_days") return exactKeys(value, ["kind", "anchor_step_id", "day_offset", "timezone", "local_time"]) && isId(value.anchor_step_id) && [1, 2].includes(value.day_offset) && isString(value.timezone, 100, false) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.local_time);
  return false;
}
function validStep(step, actual = false) {
  if (!object(step) || !Object.hasOwn(CAPABILITY_KEYS, step.capability)) return false;
  const keys = [...STEP_BASE_KEYS, "capability", ...CAPABILITY_KEYS[step.capability]];
  if (!exactKeys(step, keys) || !isId(step.step_id) || !isUniqueIdList(step.depends_on, 32) || typeof step.enabled !== "boolean" || !validCopy(step.title) || !(step.note === null || isString(step.note, 2_000)) || !validTime(step.time)) return false;
  if (actual && GENERATED_ID.test(step.step_id)) return false;
  if (step.capability === "prepare_post_draft") return step.intended_destination === "patreon" && isUniqueIdList(step.source_media_ids, 3) && isNullableId(step.target_post_id);
  if (step.capability === "prepare_preview") return isId(step.source_step_id) && isId(step.template_id) && object(step.template_config_snapshot);
  if (step.capability === "prepare_distribution") return isId(step.source_step_id) && isNullableId(step.preview_step_id) && isId(step.distribution_group_id) && DESTINATIONS.has(step.destination) && validCopy(step.copy_title);
  if (step.capability === "publish_handoff") return isId(step.distribution_step_id) && DESTINATIONS.has(step.destination);
  return isId(step.publication_step_id) && DESTINATIONS.has(step.destination) && isNullableId(step.target_post_id);
}
function validSlot(slot, actual = false) {
  return exactKeys(slot, ["slot_id", "field", "question", "affected_node_ids", "blocking", "reason"]) && isId(slot.slot_id) &&
    isString(slot.field, 100, false) && isString(slot.question, 500, false) && isUniqueIdList(slot.affected_node_ids, 64) && slot.blocking === true && CLARIFICATION_REASONS.has(slot.reason) &&
    (!actual || !GENERATED_ID.test(slot.slot_id));
}
function validUnresolved(row, actual = false) {
  return exactKeys(row, ["request_id", "requested_text_quote", "intended_capability", "intended_destination", "blocking_slot_ids"]) && isId(row.request_id) &&
    isString(row.requested_text_quote, 2_000, false) && (row.intended_capability === null || Object.hasOwn(CAPABILITY_KEYS, row.intended_capability)) &&
    (row.intended_destination === null || DESTINATIONS.has(row.intended_destination)) && isUniqueIdList(row.blocking_slot_ids, 16) &&
    (!actual || !GENERATED_ID.test(row.request_id));
}
function validGroup(group, actual = false) {
  return exactKeys(group, ["group_id", "source_step_id", "preview_step_id", "destination_step_ids"]) && isId(group.group_id) && isId(group.source_step_id) &&
    isNullableId(group.preview_step_id) && isUniqueIdList(group.destination_step_ids, 32) && (!actual || !GENERATED_ID.test(group.group_id));
}
function validSnapshot(snapshot, actual = false) {
  if (!exactKeys(snapshot, PLAN_KEYS) || snapshot.schema_version !== 1 || !isId(snapshot.plan_id) || !isId(snapshot.creator_id) || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
      !["proposed", "approved_for_preparation", "cancelled"].includes(snapshot.review) || !validSourceRef(snapshot.source) || !Array.isArray(snapshot.steps) || snapshot.steps.length > 32 ||
      !Array.isArray(snapshot.distribution_groups) || snapshot.distribution_groups.length > 32 || !Array.isArray(snapshot.unresolved_requests) || snapshot.unresolved_requests.length > 16 ||
      !Array.isArray(snapshot.clarifications) || snapshot.clarifications.length > 16 || !isString(snapshot.requested_text_quote, 2_000, false) || !isString(snapshot.created_at, 50, false) || !isString(snapshot.updated_at, 50, false)) return false;
  if (actual && GENERATED_ID.test(snapshot.plan_id)) return false;
  if (!snapshot.steps.every(step => validStep(step, actual)) || !snapshot.distribution_groups.every(group => validGroup(group, actual)) ||
      !snapshot.unresolved_requests.every(row => validUnresolved(row, actual)) || !snapshot.clarifications.every(slot => validSlot(slot, actual))) return false;
  return new Set(snapshot.steps.map(x => x.step_id)).size === snapshot.steps.length && new Set(snapshot.distribution_groups.map(x => x.group_id)).size === snapshot.distribution_groups.length &&
    new Set(snapshot.unresolved_requests.map(x => x.request_id)).size === snapshot.unresolved_requests.length && new Set(snapshot.clarifications.map(x => x.slot_id)).size === snapshot.clarifications.length &&
    new TextEncoder().encode(JSON.stringify(snapshot)).length <= 64 * 1024;
}

function compilerResultKindSupported(result) {
  if (!object(result) || typeof result.kind !== "string") return false;
  if (result.kind === "plan") return exactKeys(result, ["kind", "snapshot"]);
  if (result.kind === "clarification_preview") return exactKeys(result, ["kind", "slots", "unresolved", "source"]);
  if (result.kind === "limitation") return exactKeys(result, ["kind", "code"]) && LIMITATION_CODES.has(result.code);
  if (result.kind === "conflict") return exactKeys(result, ["kind", "code"]) && CONFLICT_CODES.has(result.code);
  if (result.kind === "clarification") return exactKeys(result, ["kind", "code", "question"]) && REVISION_QUESTION_CODES.has(result.code) && isString(result.question, 500);
  if (result.kind === "unchanged") return exactKeys(result, ["kind", "planId", "revision"]) && isId(result.planId) && Number.isSafeInteger(result.revision) && result.revision >= 0;
  return false;
}
function validCompilerResult(result, actual = false) {
  if (!compilerResultKindSupported(result)) return false;
  if (result.kind === "plan") return validSnapshot(result.snapshot, actual) && validPlanGraph(result.snapshot);
  if (result.kind === "clarification_preview") {
    if (!Array.isArray(result.slots) || result.slots.length > 16 || !result.slots.every(slot => validSlot(slot, actual)) || !Array.isArray(result.unresolved) || result.unresolved.length > 16 || !result.unresolved.every(row => validUnresolved(row, actual)) || !(result.source === null || validSourceRef(result.source))) return false;
    return new TextEncoder().encode(JSON.stringify(result)).length <= 64 * 1024 && new Set(result.slots.map(slot => slot.slot_id)).size === result.slots.length && new Set(result.unresolved.map(row => row.request_id)).size === result.unresolved.length && validFlatGraph(result.slots, result.unresolved);
  }
  if (result.kind === "clarification") return false; // Scope is not represented by this complete result arm; leave it for the behavior slice.
  return true;
}
function validFlatGraph(slots, unresolved) {
  const slotIds = new Set(slots.map(slot => slot.slot_id));
  const requestIds = new Set(unresolved.map(row => row.request_id));
  return unresolved.every(row => row.blocking_slot_ids.every(id => slotIds.has(id))) && slots.every(slot => slot.affected_node_ids.every(id => requestIds.has(id)));
}
function validPlanGraph(snapshot) {
  const stepIds = new Set(snapshot.steps.map(step => step.step_id));
  const groupIds = new Set(snapshot.distribution_groups.map(group => group.group_id));
  const requestIds = new Set(snapshot.unresolved_requests.map(row => row.request_id));
  const slotIds = new Set(snapshot.clarifications.map(slot => slot.slot_id));
  const allAffectedIds = new Set([...stepIds, ...requestIds]);
  const edges = new Map(snapshot.steps.map(step => [step.step_id, new Set()]));
  const edge = (from, to) => { if (!stepIds.has(to) || from === to) return false; edges.get(from).add(to); return true; };
  for (const step of snapshot.steps) {
    for (const dependency of step.depends_on) if (!edge(step.step_id, dependency)) return false;
    if (step.capability === "prepare_preview" && !edge(step.step_id, step.source_step_id)) return false;
    if (step.capability === "prepare_distribution") {
      if (!edge(step.step_id, step.source_step_id) || (step.preview_step_id !== null && !edge(step.step_id, step.preview_step_id)) || !groupIds.has(step.distribution_group_id)) return false;
    }
    if (step.capability === "publish_handoff" && !edge(step.step_id, step.distribution_step_id)) return false;
    if (["reply_block", "engagement_check"].includes(step.capability) && !edge(step.step_id, step.publication_step_id)) return false;
    if (step.time?.kind === "after_publication_calendar_days" && !edge(step.step_id, step.time.anchor_step_id)) return false;
  }
  for (const group of snapshot.distribution_groups) {
    if (!stepIds.has(group.source_step_id) || (group.preview_step_id !== null && !stepIds.has(group.preview_step_id)) || group.destination_step_ids.some(id => !stepIds.has(id))) return false;
  }
  if (snapshot.unresolved_requests.some(row => row.blocking_slot_ids.some(id => !slotIds.has(id)))) return false;
  if (snapshot.clarifications.some(slot => slot.affected_node_ids.some(id => !allAffectedIds.has(id)))) return false;
  const visiting = new Set(), visited = new Set();
  const visit = id => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const next of edges.get(id)) if (!visit(next)) return false;
    visiting.delete(id); visited.add(id); return true;
  };
  return [...stepIds].every(visit);
}

function graphParts(result) {
  if (result.kind === "plan") return { snapshot: result.snapshot, steps: result.snapshot.steps, groups: result.snapshot.distribution_groups, requests: result.snapshot.unresolved_requests, slots: result.snapshot.clarifications };
  if (result.kind === "clarification_preview") return { snapshot: null, steps: [], groups: [], requests: result.unresolved, slots: result.slots };
  return { snapshot: null, steps: [], groups: [], requests: [], slots: [] };
}
function identityDefinitions(result) {
  const parts = graphParts(result);
  const definitions = [];
  if (parts.snapshot) definitions.push({ namespace: "plan", expected: parts.snapshot.plan_id, actual: parts.snapshot.plan_id, category: "plan" });
  else if (result.kind === "unchanged") definitions.push({ namespace: "plan", expected: result.planId, actual: result.planId, category: "plan" });
  for (const step of parts.steps) definitions.push({ namespace: "step", expected: step.step_id, actual: step.step_id, category: "step", item: step });
  for (const group of parts.groups) definitions.push({ namespace: "group", expected: group.group_id, actual: group.group_id, category: "group", item: group });
  for (const request of parts.requests) definitions.push({ namespace: "request", expected: request.request_id, actual: request.request_id, category: "request", item: request });
  for (const slot of parts.slots) definitions.push({ namespace: "slot", expected: slot.slot_id, actual: slot.slot_id, category: "slot", item: slot });
  return definitions;
}
function getCurrentIdentityIds(currentPlan) {
  if (!currentPlan) return new Map();
  return new Map([
    ["plan", new Set([currentPlan.plan_id])],
    ["step", new Set(currentPlan.steps.map(x => x.step_id))],
    ["group", new Set(currentPlan.distribution_groups.map(x => x.group_id))],
    ["request", new Set(currentPlan.unresolved_requests.map(x => x.request_id))],
    ["slot", new Set(currentPlan.clarifications.map(x => x.slot_id))]
  ]);
}
function staticNodeSignature(value, kind) {
  const signature = structuredClone(value);
  const replaceId = (key, namespace) => { if (typeof signature[key] === "string") signature[key] = `<${namespace}>`; };
  const replaceRefs = key => { if (Array.isArray(signature[key])) signature[key] = signature[key].map(() => "<ref>").sort(); };
  if (kind === "step") {
    replaceId("step_id", "step"); replaceRefs("depends_on");
    if (signature.capability === "prepare_preview") replaceId("source_step_id", "step");
    if (signature.capability === "prepare_distribution") { replaceId("source_step_id", "step"); replaceId("preview_step_id", "step"); replaceId("distribution_group_id", "group"); }
    if (signature.capability === "publish_handoff") replaceId("distribution_step_id", "step");
    if (["reply_block", "engagement_check"].includes(signature.capability)) replaceId("publication_step_id", "step");
    if (signature.time?.kind === "after_publication_calendar_days") signature.time.anchor_step_id = "<step>";
  } else if (kind === "group") {
    replaceId("group_id", "group"); replaceId("source_step_id", "step"); replaceId("preview_step_id", "step"); replaceRefs("destination_step_ids");
  } else if (kind === "request") {
    replaceId("request_id", "request"); replaceRefs("blocking_slot_ids"); signature.requested_text_quote = "<evidence>";
  } else if (kind === "slot") {
    replaceId("slot_id", "slot"); replaceRefs("affected_node_ids"); signature.question = { kind: "<finite-question>" };
  }
  return canonical(signature);
}

function compilerQuestionUnsupported(result) {
  return projectFiniteCompilerQuestions(result) === null;
}
function hasMissingCompilerQuestion(result) {
  if (result?.kind === "clarification") return !isString(result.question, 500, false);
  const slots = result?.kind === "clarification_preview" ? result.slots : result?.kind === "plan" ? result.snapshot?.clarifications : [];
  return Array.isArray(slots) && slots.some(slot => !isString(slot?.question, 500, false));
}
function projectFiniteCompilerQuestions(result) {
  if (!object(result) || result.kind === "clarification") return null;
  const projected = structuredClone(result);
  const slots = projected.kind === "clarification_preview" ? projected.slots : projected.kind === "plan" ? projected.snapshot?.clarifications : [];
  if (!Array.isArray(slots)) return null;
  for (const slot of slots) {
    if (!CLARIFICATION_REASONS.has(slot?.reason) || !QUESTION_FIELDS.has(slot?.field) || !isString(slot?.question, 500, false) || !Array.isArray(slot.affected_node_ids)) return null;
    slot.question = { kind: "coded", origin: "compiler", code: slot.reason, fields: [slot.field], affectedIds: [...slot.affected_node_ids] };
  }
  return projected;
}
function typedIdentityOccurrences(result) {
  const rows = [];
  const add = (namespace, value) => { if (typeof value === "string") rows.push([namespace, value]); };
  const addStep = step => {
    add("step", step.step_id);
    for (const ref of step.depends_on ?? []) add("step", ref);
    if (step.capability === "prepare_preview") add("step", step.source_step_id);
    if (step.capability === "prepare_distribution") { add("step", step.source_step_id); add("step", step.preview_step_id); add("group", step.distribution_group_id); }
    if (step.capability === "publish_handoff") add("step", step.distribution_step_id);
    if (["reply_block", "engagement_check"].includes(step.capability)) add("step", step.publication_step_id);
    if (step.time?.kind === "after_publication_calendar_days") add("step", step.time.anchor_step_id);
  };
  const addSlot = slot => {
    add("slot", slot.slot_id);
    for (const ref of slot.affected_node_ids ?? []) if (GENERATED_ID.test(ref)) rows.push([null, ref]);
  };
  const addRequest = request => { add("request", request.request_id); for (const ref of request.blocking_slot_ids ?? []) add("slot", ref); };
  if (result?.kind === "plan" && object(result.snapshot)) {
    const snapshot = result.snapshot; add("plan", snapshot.plan_id);
    for (const step of snapshot.steps ?? []) addStep(step);
    for (const group of snapshot.distribution_groups ?? []) { add("group", group.group_id); add("step", group.source_step_id); add("step", group.preview_step_id); for (const ref of group.destination_step_ids ?? []) add("step", ref); }
    for (const request of snapshot.unresolved_requests ?? []) addRequest(request);
    for (const slot of snapshot.clarifications ?? []) addSlot(slot);
  } else if (result?.kind === "clarification_preview") {
    for (const request of result.unresolved ?? []) addRequest(request);
    for (const slot of result.slots ?? []) addSlot(slot);
  } else if (result?.kind === "unchanged") add("plan", result.planId);
  return rows;
}
function uniqueDeclaredIdentities(result) {
  const seen = new Set();
  for (const definition of identityDefinitions(result)) {
    const key = definition.expected;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
function collectGraphPairs(expected, actual) {
  const pairs = [];
  if (expected.kind === "plan") pairs.push({ namespace: "plan", expectedValue: expected.snapshot.plan_id, candidates: [actual.snapshot.plan_id], category: "plan" });
  if (expected.kind === "unchanged") pairs.push({ namespace: "plan", expectedValue: expected.planId, candidates: [actual.planId], category: "plan" });
  const left = graphParts(expected), right = graphParts(actual);
  for (const [namespace, category, a, b, idKey] of [
    ["step", "step", left.steps, right.steps, "step_id"],
    ["group", "group", left.groups, right.groups, "group_id"],
    ["request", "request", left.requests, right.requests, "request_id"],
    ["slot", "slot", left.slots, right.slots, "slot_id"]
  ]) {
    if (a.length !== b.length) return null;
    const expectedBuckets = new Map(), actualBuckets = new Map();
    for (const item of a) { const key = staticNodeSignature(item, category); expectedBuckets.set(key, (expectedBuckets.get(key) ?? 0) + 1); }
    for (const item of b) { const key = staticNodeSignature(item, category); actualBuckets.set(key, (actualBuckets.get(key) ?? 0) + 1); }
    if (expectedBuckets.size !== actualBuckets.size || [...expectedBuckets].some(([key, count]) => actualBuckets.get(key) !== count)) return null;
    for (const item of a) {
      const candidates = b.filter(candidate => staticNodeSignature(item, category) === staticNodeSignature(candidate, category));
      if (!candidates.length) return null;
      // Keep all statically indistinguishable choices; the bounded graph search proves uniqueness.
      pairs.push({ namespace, category, expectedValue: item[idKey], candidates: candidates.map(row => row[idKey]), expectedItem: item });
    }
  }
  return pairs;
}
function declaredSymbols(expected) {
  const namespaceBySymbol = new Map();
  const seen = new Set();
  for (const pair of identityDefinitions(expected)) {
    if (!GENERATED_ID.test(pair.expected)) continue;
    const key = `${pair.namespace}:${pair.expected}`;
    if (seen.has(key) || (namespaceBySymbol.has(pair.expected) && namespaceBySymbol.get(pair.expected) !== pair.namespace)) return null;
    seen.add(key); namespaceBySymbol.set(pair.expected, pair.namespace);
  }
  return namespaceBySymbol;
}
function makeGeneratedAssignments(pairs, currentIds, reservedIds, onComplete, attemptState) {
  const generated = pairs.filter(pair => pair.candidates && GENERATED_ID.test(pair.expectedValue));
  const unavailable = actualId => reservedIds.has(actualId) || [...currentIds.values()].some(ids => ids.has(actualId));
  const eligibleByPair = new Map(generated.map(pair => [pair, pair.candidates.filter(actualId => !unavailable(actualId))]));
  const bucketCounts = new Map();
  for (const pair of generated) {
    const key = `${pair.namespace}:${pair.category}:${pair.candidates.slice().sort().join("\u0000")}`;
    const bucket = bucketCounts.get(key) ?? { count: 0, eligibleCount: eligibleByPair.get(pair).length };
    bucket.count++;
    bucketCounts.set(key, bucket);
  }
  if ([...bucketCounts.values()].some(bucket => bucket.count > bucket.eligibleCount)) {
    attemptState.impossible = true;
    return;
  }
  const bound = new Map();
  const used = new Map();
  const usedAcrossNamespaces = new Set();
  const walk = index => {
    if (attemptState.exceeded) return;
    attemptState.partialTried++;
    if (attemptState.partialTried > MAX_GRAPH_PARTIAL_STATES) { attemptState.exceeded = true; return; }
    if (index === generated.length) {
      if (attemptState.tried >= MAX_GRAPH_COMPLETE_MAPPINGS) { attemptState.exceeded = true; return; }
      attemptState.tried++;
      onComplete(bound);
      return;
    }
    const pair = generated[index];
    const symbolKey = `${pair.namespace}:${pair.expectedValue}`;
    const usedInNamespace = used.get(pair.namespace) ?? new Set();
    for (const actualId of eligibleByPair.get(pair)) {
      if (usedInNamespace.has(actualId) || usedAcrossNamespaces.has(actualId)) continue;
      usedInNamespace.add(actualId); used.set(pair.namespace, usedInNamespace); bound.set(symbolKey, actualId);
      usedAcrossNamespaces.add(actualId);
      walk(index + 1);
      bound.delete(symbolKey); usedInNamespace.delete(actualId); usedAcrossNamespaces.delete(actualId);
      if (attemptState.exceeded) return;
    }
  };
  walk(0);
}
function normalizeGraphResult(input, side, mapping, symbolNamespaces, options) {
  const result = structuredClone(input);
  const id = (value, namespace) => side === "expected" && typeof value === "string" && GENERATED_ID.test(value) ? mapping.get(`${namespace}:${value}`) ?? value : value;
  const refs = (values, namespace) => values.map(value => {
    if (side !== "expected" || typeof value !== "string" || !GENERATED_ID.test(value)) return value;
    const resolvedNamespace = namespace === "affected" ? symbolNamespaces.get(value) : namespace;
    return resolvedNamespace ? mapping.get(`${resolvedNamespace}:${value}`) ?? value : value;
  });
  const sortRefs = values => options.nodeOrder === "dag" ? values.sort((a, b) => String(a).localeCompare(String(b))) : values;
  const sortNodes = (values, idKey) => options.nodeOrder === "dag" ? values.sort((a, b) => String(a[idKey]).localeCompare(String(b[idKey]))) : values;
  const normalizeQuestion = slot => {
    if (object(slot.question) && Array.isArray(slot.question.affectedIds)) slot.question.affectedIds = sortRefs(refs(slot.question.affectedIds, "affected"));
  };
  const normalizeStep = step => {
    step.step_id = id(step.step_id, "step"); step.depends_on = sortRefs(refs(step.depends_on, "step"));
    if (step.capability === "prepare_preview") step.source_step_id = id(step.source_step_id, "step");
    if (step.capability === "prepare_distribution") { step.source_step_id = id(step.source_step_id, "step"); step.preview_step_id = id(step.preview_step_id, "step"); step.distribution_group_id = id(step.distribution_group_id, "group"); }
    if (step.capability === "publish_handoff") step.distribution_step_id = id(step.distribution_step_id, "step");
    if (["reply_block", "engagement_check"].includes(step.capability)) step.publication_step_id = id(step.publication_step_id, "step");
    if (step.time?.kind === "after_publication_calendar_days") step.time.anchor_step_id = id(step.time.anchor_step_id, "step");
  };
  const normalizeGroup = group => {
    group.group_id = id(group.group_id, "group"); group.source_step_id = id(group.source_step_id, "step"); group.preview_step_id = id(group.preview_step_id, "step");
    group.destination_step_ids = sortRefs(refs(group.destination_step_ids, "step"));
  };
  const normalizeRequest = request => {
    const expectedRequestId = request.request_id;
    request.request_id = id(request.request_id, "request"); request.blocking_slot_ids = sortRefs(refs(request.blocking_slot_ids, "slot"));
    if (side === "expected" && options.evidenceByRequest.has(expectedRequestId)) request.requested_text_quote = options.evidenceByRequest.get(expectedRequestId);
  };
  const normalizeSlot = slot => {
    slot.slot_id = id(slot.slot_id, "slot"); slot.affected_node_ids = sortRefs(refs(slot.affected_node_ids, "affected")); normalizeQuestion(slot);
  };
  if (result.kind === "plan") {
    const snapshot = result.snapshot; snapshot.plan_id = id(snapshot.plan_id, "plan");
    for (const step of snapshot.steps) normalizeStep(step);
    for (const group of snapshot.distribution_groups) normalizeGroup(group);
    for (const request of snapshot.unresolved_requests) normalizeRequest(request);
    for (const slot of snapshot.clarifications) normalizeSlot(slot);
    snapshot.steps = sortNodes(snapshot.steps, "step_id"); snapshot.distribution_groups = sortNodes(snapshot.distribution_groups, "group_id");
    snapshot.unresolved_requests = sortNodes(snapshot.unresolved_requests, "request_id"); snapshot.clarifications = sortNodes(snapshot.clarifications, "slot_id");
  } else if (result.kind === "clarification_preview") {
    for (const request of result.unresolved) normalizeRequest(request);
    for (const slot of result.slots) normalizeSlot(slot);
    result.unresolved = sortNodes(result.unresolved, "request_id"); result.slots = sortNodes(result.slots, "slot_id");
  } else if (result.kind === "unchanged") result.planId = id(result.planId, "plan");
  return result;
}
function unresolvedQuoteEvidence(task, raw, expected, compiledGold) {
  const bindings = compiledGold.unresolvedQuotes;
  if (!Array.isArray(bindings) || bindings.length > 16) return null;
  const requests = graphParts(expected).requests;
  const byId = new Map(requests.map(request => [request.request_id, request]));
  const seen = new Set(), evidenceByRequest = new Map();
  for (const binding of bindings) {
    if (!exactKeys(binding, ["requestId", "from", "intentIndex"]) || !isId(binding.requestId) || seen.has(binding.requestId) || !byId.has(binding.requestId)) return null;
    seen.add(binding.requestId);
    if (binding.from === "latest_request") {
      if (binding.intentIndex !== null) return null;
      evidenceByRequest.set(binding.requestId, task.input.latestRequest.slice(0, 2_000));
    } else if (binding.from === "matched_intent_quote") {
      if (!Number.isInteger(binding.intentIndex) || binding.intentIndex < 0 || !Array.isArray(raw.intentMap) || binding.intentIndex >= raw.intentMap.length || !raw.validatedResponse || !Array.isArray(raw.validatedResponse.requests)) return null;
      const actualIntentIndex = raw.intentMap[binding.intentIndex];
      const requestQuote = raw.validatedResponse.requests[actualIntentIndex]?.request_quote;
      if (typeof requestQuote !== "string") return null;
      evidenceByRequest.set(binding.requestId, requestQuote.slice(0, 2_000));
    } else return null;
  }
  return evidenceByRequest;
}
function revisionRetainedOrderValid(currentPlan, actual) {
  if (!currentPlan || actual.kind !== "plan") return true;
  const collections = [
    [currentPlan.steps, actual.snapshot.steps, "step_id"],
    [currentPlan.distribution_groups, actual.snapshot.distribution_groups, "group_id"],
    [currentPlan.unresolved_requests, actual.snapshot.unresolved_requests, "request_id"],
    [currentPlan.clarifications, actual.snapshot.clarifications, "slot_id"]
  ];
  return collections.every(([before, after, key]) => {
    const retained = new Set(before.map(row => row[key]));
    const actualOrder = after.map(row => row[key]).filter(id => retained.has(id));
    const previousOrder = before.map(row => row[key]).filter(id => actualOrder.includes(id));
    return same(actualOrder, previousOrder);
  });
}
function dagOrderCompatible(expected, actual, mapping, symbols) {
  if (expected.kind !== "plan" || actual.kind !== "plan") return true;
  const left = expected.snapshot.steps, right = actual.snapshot.steps;
  const expectedToActualId = id => GENERATED_ID.test(id) ? mapping.get(`step:${id}`) : id;
  const rightPosition = new Map(right.map((step, index) => [step.step_id, index]));
  const dependencies = new Map(left.map(step => {
    const refs = [...step.depends_on];
    if (step.capability === "prepare_preview") refs.push(step.source_step_id);
    if (step.capability === "prepare_distribution") refs.push(step.source_step_id, ...(step.preview_step_id ? [step.preview_step_id] : []));
    if (step.capability === "publish_handoff") refs.push(step.distribution_step_id);
    if (["reply_block", "engagement_check"].includes(step.capability)) refs.push(step.publication_step_id);
    if (step.time?.kind === "after_publication_calendar_days") refs.push(step.time.anchor_step_id);
    return [expectedToActualId(step.step_id), new Set(refs.map(expectedToActualId))];
  }));
  const reachable = (from, to, visited = new Set()) => {
    if (from === to) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    for (const next of dependencies.get(from) ?? []) if (reachable(next, to, visited)) return true;
    return false;
  };
  const normalizedOrder = left.map(step => expectedToActualId(step.step_id));
  for (let i = 0; i < normalizedOrder.length; i++) for (let j = i + 1; j < normalizedOrder.length; j++) {
    const first = normalizedOrder[i], second = normalizedOrder[j];
    if (reachable(first, second) || reachable(second, first)) {
      if (rightPosition.get(first) >= rightPosition.get(second)) return false;
    }
  }
  return true;
}

/** Compare one complete compiler result under a typed, bounded generated-ID bijection. */
export function scoreCompiledSemantic({ task, compiled, raw, currentPlan }) {
  const score = (correct, status, reason, mappingsTried = 0) => ({ correct, status, reason, mappingsTried });
  if (!raw || raw.correct !== true || typeof raw.variantId !== "string" || !Array.isArray(raw.intentMap) || !raw.validatedResponse) return score(null, "unscored", "unsupported_oracle");
  const compiledGold = task?.gold?.oracle?.compiled;
  if (compiledGold === null || compiledGold === undefined) return score(null, "unscored", "missing_compiled_gold");
  if (!exactKeys(compiledGold, ["expected", "nodeOrder", "unresolvedQuotes"]) || !["exact", "dag"].includes(compiledGold.nodeOrder) || !Array.isArray(compiledGold.unresolvedQuotes)) return score(null, "unscored", "invalid_oracle_gold");
  if (!object(compiled) || !compilerResultKindSupported(compiled)) return score(null, "unscored", "unsupported_oracle");
  if (hasMissingCompilerQuestion(compiled)) return score(false, "scored", "question_missing");
  if (compilerQuestionUnsupported(compiled)) return score(null, "unscored", "unsupported_oracle");
  if (compiled.kind === "clarification") return score(null, "unscored", "unsupported_oracle");
  if (!object(compiledGold.expected) || !compilerResultKindSupported(compiledGold.expected) || compilerQuestionUnsupported(compiledGold.expected) || compiledGold.expected.kind === "clarification") return score(null, "unscored", "unsupported_oracle");
  if (hasMissingCompilerQuestion(compiledGold.expected)) return score(null, "unscored", "invalid_oracle_gold");
  if (task.path === "revision" && compiled.kind === "plan") {
    if (!currentPlan || !validSnapshot(currentPlan, true) || !validPlanGraph(currentPlan)) return score(false, "scored", "invalid_graph");
    const expectedSnapshot = compiledGold.expected.kind === "plan" ? compiledGold.expected.snapshot : null;
    if (!expectedSnapshot || expectedSnapshot.plan_id !== currentPlan.plan_id || expectedSnapshot.creator_id !== currentPlan.creator_id ||
        !same(expectedSnapshot.source, currentPlan.source) || expectedSnapshot.created_at !== currentPlan.created_at) return score(null, "unscored", "invalid_oracle_gold");
  }
  if (compiled.kind !== compiledGold.expected.kind) return score(false, "scored", "graph_mismatch");
  if (!validCompilerResult(compiledGold.expected, false)) return score(null, "unscored", "invalid_oracle_gold");
  if (!validCompilerResult(compiled, true)) return score(false, "scored", "invalid_graph");
  if (!uniqueDeclaredIdentities(compiledGold.expected)) return score(null, "unscored", "invalid_oracle_gold");
  if (!uniqueDeclaredIdentities(compiled)) return score(false, "scored", "invalid_graph");
  if (new TextEncoder().encode(JSON.stringify(compiled)).length > 64 * 1024) return score(null, "unscored", "unsupported_oracle");
  if (!revisionRetainedOrderValid(currentPlan, compiled)) return score(false, "scored", "graph_mismatch");

  const evidenceByRequest = unresolvedQuoteEvidence(task, raw, compiledGold.expected, compiledGold);
  if (!evidenceByRequest) return score(null, "unscored", "invalid_oracle_gold");
  const projectedExpected = projectFiniteCompilerQuestions(compiledGold.expected);
  const projectedActual = projectFiniteCompilerQuestions(compiled);
  if (!projectedExpected || !projectedActual) return score(null, "unscored", "unsupported_oracle");
  const symbols = declaredSymbols(compiledGold.expected);
  if (!symbols) return score(null, "unscored", "invalid_oracle_gold");
  const definitions = identityDefinitions(compiledGold.expected);
  const symbolUseValid = uniqueDeclaredIdentities(compiledGold.expected) &&
    definitions.every(definition => !GENERATED_ID.test(definition.expected) || symbols.get(definition.expected) === definition.namespace) &&
    typedIdentityOccurrences(compiledGold.expected).every(([namespace, value]) => !GENERATED_ID.test(value) || (namespace === null ? symbols.has(value) : symbols.get(value) === namespace));
  if (!symbolUseValid) return score(null, "unscored", "invalid_oracle_gold");
  const pairs = collectGraphPairs(compiledGold.expected, compiled);
  if (!pairs) return score(false, "scored", "graph_mismatch");
  const currentIds = task.path === "revision" ? getCurrentIdentityIds(currentPlan) : new Map();
  const reservedIds = new Set(identityDefinitions(compiledGold.expected).filter(definition => !GENERATED_ID.test(definition.expected)).map(definition => definition.expected));
  const attemptState = { tried: 0, partialTried: 0, exceeded: false, impossible: false };
  let matchingMappings = 0;
  const mappingOptions = { nodeOrder: compiledGold.nodeOrder, evidenceByRequest };
  makeGeneratedAssignments(pairs, currentIds, reservedIds, mapping => {
    const expectedNormalized = normalizeGraphResult(projectedExpected, "expected", mapping, symbols, mappingOptions);
    const actualNormalized = normalizeGraphResult(projectedActual, "actual", mapping, symbols, mappingOptions);
    if (!same(expectedNormalized, actualNormalized) || !dagOrderCompatible(compiledGold.expected, compiled, mapping, symbols)) return;
    // Generated plan identities cannot collide with retained revision identity or any other typed ID.
    if (compiled.kind === "plan" && mapping.get(`plan:${compiledGold.expected.snapshot.plan_id}`) !== undefined) {
      const planId = mapping.get(`plan:${compiledGold.expected.snapshot.plan_id}`);
      if (currentIds.get("plan")?.has(planId)) return;
    }
    matchingMappings++;
  }, attemptState);
  if (attemptState.impossible) return score(false, "scored", "graph_mismatch");
  if (attemptState.exceeded) return score(null, "unscored", "graph_mapping_limit", attemptState.tried);
  if (matchingMappings > 1) return score(null, "unscored", "ambiguous_graph_match", attemptState.tried);
  if (matchingMappings === 1) return score(true, "scored", null, attemptState.tried);
  return score(false, "scored", "graph_mismatch", attemptState.tried);
}

/** Project one observation of the application path into the accepted finite behavior view. */
export function buildBehaviorView(observation) {
  const unscored = code => ({ kind: "unscored", code });
  if (!object(observation) || typeof observation.stage !== "string") return unscored("missing_behavior_observation");
  if (observation.stage === "context_preflight") {
    if (!closedObject(observation, ["stage", "contextResult"]) || !object(observation.contextResult)) return unscored("unsupported_oracle");
    const result = observation.contextResult;
    if (!closedObject(result, ["kind", "code", "question"]) || result.kind !== "clarification" || !["ambiguous_source", "narrow_selection", "narrow_edit_scope"].includes(result.code) || !isString(result.question, 500, false)) return unscored("unsupported_oracle");
    return { kind: "ok", view: { stage: "context_preflight", compiler: "not_invoked", outcome: "clarification", code: result.code, executableIntentCount: 0, question: { kind: "coded", origin: "context", code: result.code, fields: [], affectedIds: [] } } };
  }
  if (observation.stage === "interpreter_terminal") {
    if (!closedObject(observation, ["stage", "interpretation", "currentPlan"]) || !closedObject(observation.interpretation,
      ["outcome", "base_revision", "question", "code", "requests", "attempts", "repairs", "escalations", "usage", "elapsedMs", "terminalReason"]) ||
        !(observation.currentPlan === null || object(observation.currentPlan))) return unscored("unsupported_oracle");
    const result = observation.interpretation;
    if (!Number.isSafeInteger(result.base_revision) && result.base_revision !== null ||
        !Array.isArray(result.requests) || result.requests.length !== 0 || !Number.isInteger(result.attempts) || result.attempts < 1 || result.attempts > 2 ||
        !Number.isInteger(result.repairs) || result.repairs < 0 || result.repairs > 1 || result.repairs > result.attempts || result.escalations !== 0 ||
        !object(result.usage) || !closedObject(result.usage, ["inputTokens", "outputTokens", "costUsd", "calls", "known"]) ||
        ![result.usage.inputTokens, result.usage.outputTokens].every(value => value === null || Number.isSafeInteger(value) && value >= 0) ||
        !(result.usage.costUsd === null || Number.isFinite(result.usage.costUsd) && result.usage.costUsd >= 0) ||
        !Number.isSafeInteger(result.usage.calls) || result.usage.calls < 0 || typeof result.usage.known !== "boolean" ||
        !Number.isFinite(result.elapsedMs) || result.elapsedMs < 0 || result.terminalReason !== null || !(result.code === null || isString(result.code, 100)) ||
        !(result.question === null || isString(result.question, 500))) return unscored("unsupported_oracle");
    if (result.outcome === "clarification") {
      if (!isString(result.question, 500, false)) return unscored("unsupported_oracle");
      return { kind: "ok", view: { stage: "interpreter_terminal", compiler: "not_invoked", outcome: "clarification", code: null, executableIntentCount: 0, question: { kind: "human", packet: null } }, question: result.question };
    }
    if (result.outcome === "limitation") return { kind: "ok", view: { stage: "interpreter_terminal", compiler: "not_invoked", outcome: "limitation", code: "unsupported_request", executableIntentCount: 0, question: { kind: "none" } } };
    if (result.outcome === "no_change") {
      const plan = observation.currentPlan;
      if (plan !== null && (!closedObject(plan, ["planId", "revision"]) || typeof plan.planId !== "string" || !Number.isSafeInteger(plan.revision) || plan.revision < 0)) return unscored("unsupported_oracle");
      return { kind: "ok", view: { stage: "interpreter_terminal", compiler: "not_invoked", outcome: "no_change", code: null, planId: plan?.planId ?? null, revision: plan?.revision ?? null, executableIntentCount: 0, question: { kind: "none" } } };
    }
    return unscored("unsupported_oracle");
  }
  if (observation.stage === "compiler_result") {
    if (!closedObject(observation, ["stage", "compiled", "raw"]) || !object(observation.raw) || observation.raw.correct !== true || typeof observation.raw.variantId !== "string") return unscored("unsupported_oracle");
    if (!object(observation.compiled) || !compilerResultKindSupported(observation.compiled) || observation.compiled.kind === "clarification") return unscored("unsupported_oracle");
    if (hasMissingCompilerQuestion(observation.compiled)) return { kind: "unscored", code: "question_missing" };
    const result = projectFiniteCompilerQuestions(observation.compiled);
    if (!result) return unscored("unsupported_oracle");
    return { kind: "ok", view: { stage: "compiler_result", compiler: "invoked", result }, rawVariantId: observation.raw.variantId };
  }
  return unscored("unsupported_oracle");
}

function expectedBehavior(task, view, rawVariantId) {
  const rows = task?.gold?.oracle?.behavior;
  if (!Array.isArray(rows) || rows.length > 2 || rows.some(row => !closedObject(row, ["rawVariantIds", "expected"]) ||
      !Array.isArray(row.rawVariantIds) || row.rawVariantIds.length > 8 || new Set(row.rawVariantIds).size !== row.rawVariantIds.length ||
      !row.rawVariantIds.every(value => typeof value === "string" && value.length > 0) || !object(row.expected))) return null;
  const candidates = rows.filter(row => object(row) && Array.isArray(row.rawVariantIds) &&
    (view.stage === "context_preflight" ? row.rawVariantIds.length === 0 : row.rawVariantIds.includes(rawVariantId)));
  if (candidates.length !== 1 || !closedObject(candidates[0], ["rawVariantIds", "expected"]) || !object(candidates[0].expected)) return null;
  return candidates[0].expected;
}
function replaceHumanRequirement(expected, task) {
  if (expected?.stage !== "interpreter_terminal" || expected?.outcome !== "clarification" || expected?.question?.kind !== "human_requirement") return expected;
  const review = task?.gold?.humanQuestion;
  if (!object(review) || !closedObject(review, ["neededFields", "affectedScope"]) ||
      !closedObject(expected.question, ["kind", "neededFields", "affectedScope"]) ||
      !Array.isArray(review.neededFields) || !Array.isArray(review.affectedScope) ||
      !same(expected.question.neededFields, review.neededFields) || !same(expected.question.affectedScope, review.affectedScope)) return null;
  return { ...expected, question: { kind: "human_requirement", neededFields: review.neededFields, affectedScope: review.affectedScope } };
}

/** Score observed behavior only against the branch bound to the matching raw variant. */
export function scoreBehavior({ task, observation, raw, humanReview }) {
  const result = buildBehaviorView(observation);
  let scoreView = null;
  const score = (correct, status, reason) => ({ correct, status, reason, ...(scoreView ? { view: scoreView } : {}) });
  if (result.kind !== "ok") return score(null, "unscored", result.code);
  const view = result.view;
  scoreView = view;
  let rawVariantId = result.rawVariantId ?? null;
  if (view.stage === "interpreter_terminal") {
    if (!raw || raw.correct === false || !raw.validatedResponse || raw.validatedResponse.outcome !== view.outcome ||
        raw.validatedResponse.base_revision !== observation.interpretation.base_revision) return score(false, "scored", "behavior_mismatch");
    rawVariantId = raw.variantId;
  }
  if (view.stage === "context_preflight" && (task?.path !== "context_preflight" || raw?.status !== "not_called" || raw?.correct !== null || raw?.reason !== "context_preflight")) return score(false, "scored", "behavior_mismatch");
  if (view.stage !== "context_preflight") {
    const pendingQuestion = view.stage === "interpreter_terminal" && view.outcome === "clarification" && raw?.correct === null && raw?.reason === "human_review_pending";
    if (!raw || (raw.correct !== true && !pendingQuestion) || typeof rawVariantId !== "string" || raw.variantId !== rawVariantId) return score(null, "unscored", "unsupported_oracle");
  }
  const gold = expectedBehavior(task, view, rawVariantId);
  if (!gold) return score(null, "unscored", "invalid_oracle_gold");
  let expected = replaceHumanRequirement(gold, task);
  if (!expected) return score(null, "unscored", "invalid_oracle_gold");
  if (expected.stage === "compiler_result") {
    if (!object(expected.result)) return score(null, "unscored", "invalid_oracle_gold");
    const projected = projectFiniteCompilerQuestions(expected.result);
    if (!projected) return score(null, "unscored", "invalid_oracle_gold");
    expected = { ...expected, result: projected };
  }
  let actual = view;
  if (view.stage === "interpreter_terminal" && view.outcome === "clarification") {
    const packet = questionPacket(task, result.question);
    if (!packet) return score(null, "unscored", "invalid_oracle_gold");
    scoreView = { ...view, question: { kind: "human", packet } };
    const verdict = humanReviewDecision(packet, humanReview);
    if (verdict === "pending") return score(null, "human_review_pending", "human_review_pending");
    if (verdict === "rejected") return score(false, "scored", "human_review_rejected");
    if (verdict === "unresolved") return score(false, "scored", "human_review_unresolved");
    actual = { ...view, question: { kind: "human_requirement", neededFields: packet.neededFields, affectedScope: packet.affectedScope } };
  }
  if (view.stage === "compiler_result") {
    if (!closedObject(expected, ["stage", "compiler", "result"]) || expected.stage !== "compiler_result" || expected.compiler !== "invoked") return score(null, "unscored", "invalid_oracle_gold");
    const compiledScore = scoreCompiledSemantic({ task, compiled: observation.compiled, raw, currentPlan: task?.input?.currentPlan ?? null });
    if (compiledScore.correct !== true) return score(compiledScore.correct, compiledScore.status, compiledScore.reason);
    const compiledGold = task?.gold?.oracle?.compiled;
    const expectedCompiled = object(compiledGold?.expected) ? projectFiniteCompilerQuestions(compiledGold.expected) : null;
    if (!expectedCompiled || !same(expected.result, expectedCompiled)) return score(null, "unscored", "invalid_oracle_gold");
    if (!same(observation.raw, raw)) return score(null, "unscored", "observation_mismatch");
    return score(true, "scored", null);
  }
  return same(actual, expected) ? score(true, "scored", null) : score(false, "scored", "behavior_mismatch");
}

function containsGeneratedId(value) {
  if (typeof value === "string") return GENERATED_ID.test(value);
  if (Array.isArray(value)) return value.some(containsGeneratedId);
  return object(value) && Object.values(value).some(containsGeneratedId);
}

/** Structural corpus checks use the accepted interpreter schema to require complete request gold. */
export function validateDevelopmentFixture(fixture, interpretedRequestSchema) {
  const errors = [];
  const intentFields = interpretedRequestSchema?.properties?.requests?.items?.properties;
  if (!object(intentFields) || !Object.keys(intentFields).length) errors.push("intent_schema_required");
  if (!object(fixture) || fixture.version !== "cp-metadata-eval.v1") return { ok: false, errors: ["fixture_version"] };
  if (!Array.isArray(fixture.tasks) || fixture.tasks.length !== 48) errors.push("semantic_task_count");
  const tasks = Array.isArray(fixture.tasks) ? fixture.tasks : [];
  const seen = new Set();
  const counts = Object.fromEntries(COHORTS.map(cohort => [cohort, 0]));
  for (const task of tasks) {
    if (!object(task) || typeof task.caseId !== "string" || !task.caseId || seen.has(task.caseId)) { errors.push("task_identity"); continue; }
    seen.add(task.caseId);
    if (!COHORTS.includes(task.primaryCohort)) errors.push(`${task.caseId}:primary_cohort`);
    else counts[task.primaryCohort]++;
    if (!Array.isArray(task.coverageTags) || task.coverageTags.length === 0 || task.coverageTags.some(tag => typeof tag !== "string")) errors.push(`${task.caseId}:coverage_tags`);
    if (!object(task.input) || typeof task.input.latestRequest !== "string" || typeof task.input.authenticatedCreatorId !== "string" || !Array.isArray(task.input.selectedMediaIds) || !Array.isArray(task.input.selectedPostIds) || typeof task.input.receivedAtUtc !== "string" || !object(task.input.modelContext) || !object(task.input.fixtureCatalog)) errors.push(`${task.caseId}:input`);
    if (!object(task.gold) || !object(task.gold.raw) || typeof task.gold.raw.expectedOutcome !== "string" || !Number.isInteger(task.gold.raw.expectedIntentCount) || !Array.isArray(task.gold.raw.intentAssertions) || !object(task.gold.compiled) || !Array.isArray(task.gold.compiled.assertions)) errors.push(`${task.caseId}:gold`);
    else {
      const rawGold = task.gold.raw;
      if (rawGold.intentAssertions.length !== rawGold.expectedIntentCount) errors.push(`${task.caseId}:raw_intent_coverage`);
      const indices = new Set();
      for (const assertion of rawGold.intentAssertions) {
        if (!object(assertion) || assertion.exact !== true || !object(assertion.equals) || typeof assertion.equals.request_quote !== "string") { errors.push(`${task.caseId}:raw_intent_must_be_exact`); continue; }
        if (!Number.isInteger(assertion.index) || assertion.index < 0 || assertion.index >= rawGold.expectedIntentCount || indices.has(assertion.index)) errors.push(`${task.caseId}:raw_intent_index_coverage`);
        else indices.add(assertion.index);
        const keys = Object.keys(assertion.equals);
        if (!object(intentFields) || keys.length !== Object.keys(intentFields).length || keys.some(key => !Object.hasOwn(intentFields, key)) || containsGeneratedId(assertion.equals)) errors.push(`${task.caseId}:raw_intent_fields_or_ids`);
      }
      if (indices.size !== rawGold.expectedIntentCount) errors.push(`${task.caseId}:raw_intent_index_coverage`);
      if (task.gold.raw.expectedOutcome === "proposal" && task.input.currentPlan && Number.isSafeInteger(task.input.currentPlan.revision) && Number.isSafeInteger(task.input.modelContext.plan_revision) && task.input.modelContext.plan_revision !== task.input.currentPlan.revision) errors.push(`${task.caseId}:raw_revision_context_mismatch`);
    }
    if (task.path !== "context_preflight" && task.path !== "new_plan" && task.path !== "revision") errors.push(`${task.caseId}:path`);
  }
  for (const cohort of COHORTS) if (counts[cohort] !== 12) errors.push(`cohort_${cohort}_count`);
  const guards = fixture.guardProbes;
  if (!Array.isArray(guards) || guards.length !== 24) errors.push("guard_count");
  const guardIds = Array.isArray(guards) ? guards.map(row => row?.probeId) : [];
  if (!same(guardIds, EXPECTED_GUARDS)) errors.push("guard_ids_or_order");
  if (Array.isArray(guards)) for (const [index, probe] of guards.entries()) {
    const expectedGroup = GUARD_GROUPS[Math.floor(index / 4)];
    if (!object(probe) || probe.group !== expectedGroup || !Array.isArray(probe.assertions) || probe.assertions.length === 0 || probe.assertions.some(row => typeof row !== "string")) errors.push(`${EXPECTED_GUARDS[index]}:definition`);
  }
  return { ok: errors.length === 0, errors, counts };
}

function compareExpected(actual, expected, state, path = "") {
  if (typeof expected === "string" && /^\$generated:[a-z0-9_-]+$/.test(expected)) {
    if (typeof actual !== "string" || !actual) return false;
    const key = expected.slice("$generated:".length);
    const prior = state.forward.get(key), reverse = state.reverse.get(actual);
    if ((prior !== undefined && prior !== actual) || (reverse !== undefined && reverse !== key)) return false;
    state.forward.set(key, actual); state.reverse.set(actual, key);
    return true;
  }
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => compareExpected(actual[index], item, state, `${path}.${index}`));
  if (object(expected)) return object(actual) && Object.keys(actual).length === Object.keys(expected).length && Object.keys(expected).every(key => Object.hasOwn(actual, key) && compareExpected(actual[key], expected[key], state, path ? `${path}.${key}` : key));
  return Object.is(actual, expected);
}

/** Score the first raw response only. Invalid output is terminal for this track; no repair text is substituted. */
export function scoreRawInterpretation({ task, responseText, schema, matchesSchema }) {
  if (task?.path === "context_preflight") return { correct: null, status: "not_called", reason: "context_preflight", questionReviewPacket: null };
  const fail = reason => ({ correct: false, status: "scored", reason, questionReviewPacket: null });
  if (typeof responseText !== "string") return fail("invalid_output");
  let parsed;
  try { parsed = JSON.parse(responseText); } catch { return fail("invalid_output"); }
  if (typeof matchesSchema !== "function" || !matchesSchema(parsed, schema)) return fail("invalid_output");
  const gold = task.gold.raw;
  const expectedRevision = Number.isSafeInteger(task.input?.currentPlan?.revision) ? task.input.currentPlan.revision
    : Number.isSafeInteger(task.input?.modelContext?.plan_revision) ? task.input.modelContext.plan_revision : null;
  if (parsed.outcome === "proposal" && parsed.base_revision !== expectedRevision) return fail("wrong_base_revision");
  if (parsed.outcome !== gold.expectedOutcome || parsed.requests.length !== gold.expectedIntentCount) return fail(parsed.requests.length !== gold.expectedIntentCount ? "missing_or_extra_intent" : "wrong_clarification_or_outcome");
  if (!Array.isArray(gold.intentAssertions) || gold.intentAssertions.length !== gold.expectedIntentCount) return fail("invalid_gold_assertion");
  const state = { forward: new Map(), reverse: new Map() };
  const indices = new Set();
  for (const assertion of gold.intentAssertions) {
    if (!Number.isInteger(assertion.index) || assertion.index < 0 || assertion.index >= parsed.requests.length || indices.has(assertion.index) || !object(assertion.equals) || containsGeneratedId(assertion.equals)) return fail("invalid_gold_assertion");
    indices.add(assertion.index);
    const request = parsed.requests[assertion.index];
    if (assertion.exact !== true || Object.keys(request).length !== Object.keys(assertion.equals).length || !Object.keys(assertion.equals).every(key => Object.hasOwn(request, key) && compareExpected(request[key], assertion.equals[key], state, `requests.${assertion.index}.${key}`))) return fail(assertion.reason ?? "unsafe_semantics");
  }
  if (indices.size !== parsed.requests.length) return fail("invalid_gold_assertion");
  const review = task.gold.humanQuestion;
  if (parsed.outcome === "clarification") {
    if (!parsed.question) return fail("wrong_clarification_or_outcome");
    if (!review || !Array.isArray(review.neededFields) || review.neededFields.length === 0) return fail("wrong_clarification_or_outcome");
    return { correct: null, status: "human_review_pending", reason: null,
      questionReviewPacket: { latestRequest: task.input.latestRequest, neededFields: [...review.neededFields], affectedScope: review.affectedScope, question: parsed.question } };
  }
  if (parsed.question !== null) return fail("wrong_clarification_or_outcome");
  return { correct: true, status: "scored", reason: null, questionReviewPacket: null };
}

/** Score a complete raw semantic variant after binding it to a real first-pass observation. */
export function scoreRawSemantic({ task, responseText, observation, schema, matchesSchema, humanReview }) {
  const result = (correct, status, reason, extra = {}) => ({ correct, status, reason, variantId: null, intentMap: null, validatedResponse: null, ...extra });
  if (task?.path === "context_preflight") return result(null, "not_called", "context_preflight");
  if (typeof responseText !== "string") return result(false, "scored", "invalid_output");
  if (!closedObject(observation, FIRST_PASS_KEYS) || observation.version !== "cp-first-pass.v1") return result(null, "unscored", "missing_application_observation");
  const projected = task?.input?.modelContext;
  if (typeof task?.input?.latestRequest !== "string" || !object(projected) ||
      observation.responseDigest !== digest(responseText) || observation.requestDigest !== digest(task.input.latestRequest) || observation.contextDigest !== digest(canonical(projected))) {
    return result(null, "unscored", "observation_mismatch");
  }
  if (!/^[a-f0-9]{64}$/.test(observation.responseDigest) || !/^[a-f0-9]{64}$/.test(observation.requestDigest) || !/^[a-f0-9]{64}$/.test(observation.contextDigest) ||
      !["first_pass_accepted", "rejected"].includes(observation.validation) ||
      !(observation.outcome === null || ["proposal", "clarification", "limitation", "no_change"].includes(observation.outcome)) ||
      !Number.isInteger(observation.attempts) || observation.attempts < 0 || observation.attempts > 2 ||
      !Number.isInteger(observation.repairs) || observation.repairs < 0 || observation.repairs > 1 ||
      !Number.isInteger(observation.mockCalls) || observation.mockCalls < 0 || observation.mockCalls > 2 || observation.repairs > observation.attempts || observation.mockCalls !== observation.attempts) {
    return result(null, "unscored", "observation_mismatch");
  }
  let parsed;
  try { parsed = JSON.parse(responseText); } catch { return result(false, "scored", "invalid_output"); }
  if (typeof matchesSchema !== "function" || !matchesSchema(parsed, schema)) return result(false, "scored", "invalid_output");
  if (observation.validation !== "first_pass_accepted") return result(false, "scored", "application_rejected");
  if (observation.attempts !== 1 || observation.repairs !== 0 || observation.outcome === null) return result(null, "unscored", "observation_mismatch");
  if (parsed.outcome !== observation.outcome) return result(null, "unscored", "observation_mismatch");
  const variants = validateRawVariants(task, schema, matchesSchema);
  if (!variants) return result(null, "unscored", "invalid_oracle_gold");
  const eligible = variants.filter(variant => variant.expected.outcome === parsed.outcome);
  if (!eligible.length) return result(false, "scored", "semantic_mismatch", { validatedResponse: parsed });
  if (eligible.some(variant => variant.expected.requests.length !== parsed.requests.length)) {
    if (!eligible.some(variant => variant.expected.requests.length === parsed.requests.length)) return result(false, "scored", "missing_or_extra_intent", { validatedResponse: parsed });
  }
  const matches = [];
  for (const variant of eligible) {
    const expected = variant.expected;
    if (expected.requests.length !== parsed.requests.length) continue;
    if (expected.base_revision !== parsed.base_revision) continue;
    const domainByIndex = new Map(variant.domains.map(domain => [domain.intentIndex, domain]));
    const mappings = requestPermutations(expected.requests.length, variant.requestOrder === "independent");
    for (const mapping of mappings) {
      let matched = true;
      for (let expectedIndex = 0; expectedIndex < expected.requests.length; expectedIndex++) {
        const actualIndex = mapping[expectedIndex];
        if (!rawRequestMatches(parsed.requests[actualIndex], expected.requests[expectedIndex], task.input.latestRequest, domainByIndex.get(expectedIndex), task)) { matched = false; break; }
      }
      if (!matched) continue;
      const rootExpected = { ...expected, requests: [] };
      const rootActual = { ...parsed, requests: [] };
      if (expected.outcome === "limitation" || expected.outcome === "clarification") {
        rootExpected.question = null;
        rootActual.question = null;
      }
      if (!same(rootActual, rootExpected)) continue;
      matches.push({ variantId: variant.id, mapping });
      if (matches.length > 1) return result(null, "unscored", "ambiguous_intent_match", { validatedResponse: parsed });
    }
  }
  if (!matches.length) return result(false, "scored", "semantic_mismatch", { validatedResponse: parsed });
  const match = matches[0];
  if (parsed.outcome === "clarification") {
    if (!parsed.question) return result(false, "scored", "question_missing", { variantId: match.variantId, intentMap: match.mapping, validatedResponse: parsed });
    const packet = questionPacket(task, parsed.question);
    if (!packet) return result(null, "unscored", "invalid_oracle_gold", { variantId: match.variantId, intentMap: match.mapping, validatedResponse: parsed });
    const decision = humanReviewDecision(packet, humanReview);
    if (decision === "accepted") return result(true, "scored", null, { variantId: match.variantId, intentMap: match.mapping, validatedResponse: parsed, questionReviewPacket: packet });
    if (decision === "rejected") return result(false, "scored", "human_review_rejected", { variantId: match.variantId, intentMap: match.mapping, validatedResponse: parsed, questionReviewPacket: packet });
    if (decision === "unresolved") return result(false, "scored", "human_review_unresolved", { variantId: match.variantId, intentMap: match.mapping, validatedResponse: parsed, questionReviewPacket: packet });
    return result(null, "human_review_pending", "human_review_pending", { variantId: match.variantId, intentMap: match.mapping, validatedResponse: parsed, questionReviewPacket: packet });
  }
  return result(true, "scored", null, { variantId: match.variantId, intentMap: match.mapping, validatedResponse: parsed });
}

/** Compare declared typed behavior assertions; no meaning is inferred from arbitrary prose. */
export function scoreCompiledOutput({ task, compiled }) {
  const gold = task.gold.compiled;
  if (!object(compiled) || compiled.kind !== gold.expectedKind) return { correct: false, reason: "wrong_clarification_or_outcome", failedAssertions: ["kind"] };
  if (compiled.kind === "clarification" || compiled.kind === "clarification_preview") return { correct: null, status: "incomplete_gold", reason: "compiled_question_oracle_requires_human_review", failedAssertions: [] };
  // Path fragments cannot prove there were no extra actions/edges or missing sibling edits.
  // Until CP-14b supplies a complete expected result, preserve the fixed denominator as unknown.
  const fullResult = gold.assertions.find(assertion => assertion?.path === "" && Object.hasOwn(assertion, "equals"));
  if (!fullResult) return { correct: null, status: "incomplete_gold", reason: "compiled_gold_not_complete", failedAssertions: [] };
  const state = { forward: new Map(), reverse: new Map() };
  const failedAssertions = compareExpected(compiled, fullResult.equals, state) ? [] : ["compiled_result"];
  return { correct: failedAssertions.length === 0, reason: failedAssertions.length ? (gold.failureReason ?? "unsafe_semantics") : null, failedAssertions };
}

function wilson(successes, n) {
  if (n === 0) return null;
  const z = 1.959963984540054, p = successes / n, z2 = z * z, d = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / d;
  const margin = z * Math.sqrt((p * (1 - p) / n) + z2 / (4 * n * n)) / d;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}
function validOracleScore(value) {
  if (!object(value) || ![true, false, null].includes(value.correct) || typeof value.status !== "string" ||
      !(value.reason === null || typeof value.reason === "string")) return false;
  if (value.correct === true || value.correct === false) return value.status === "scored";
  return ["unscored", "not_called", "human_review_pending"].includes(value.status);
}

/** Fixed fixture denominators are retained; pending human review counts as not correct until adjudicated. */
export function summarizeDevelopment(fixture, scoredByCaseId, interpretedRequestSchema) {
  const valid = validateDevelopmentFixture(fixture, interpretedRequestSchema);
  if (!valid.ok) return { kind: "invalid_fixture", errors: valid.errors };
  const rows = fixture.tasks.map(task => ({ task, result: scoredByCaseId.get(task.caseId) }));
  const metric = selected => {
    const cohortRows = rows.filter(row => selected(row.task));
    const correct = cohortRows.filter(row => row.result?.correct === true).length;
    const unresolved = cohortRows.filter(row => row.result?.correct === null || row.result === undefined).length;
    return { correct, denominator: cohortRows.length, unresolved, rate: correct / cohortRows.length, wilson95: wilson(correct, cohortRows.length) };
  };
  return { kind: "ok", fixedDenominators: { all: 48, U: 12, C: 12, A: 12, S: 12, unambiguous: 24 },
    overall: metric(() => true), unambiguous: metric(task => task.primaryCohort === "U" || task.primaryCohort === "C"),
    compound: metric(task => task.primaryCohort === "C"), clarifications: metric(task => task.primaryCohort === "A"), safety: metric(task => task.primaryCohort === "S") };
}

/** Fixed-denominator first-pass and final component report for the CP-14 oracle contract. */
export function summarizeOracleDevelopment(fixture, scores, interpretedRequestSchema) {
  const valid = validateDevelopmentFixture(fixture, interpretedRequestSchema);
  if (!valid.ok) return { kind: "invalid_fixture", errors: valid.errors };
  if (!(scores instanceof Map)) return { kind: "invalid_scores", errors: ["scores_map_required"] };
  const knownIds = new Set(fixture.tasks.map(task => task.caseId));
  for (const [caseId, row] of scores) {
    if (!knownIds.has(caseId) || !closedObject(row, ["rawFirst", "compiledFirst", "behaviorFirst", "rawFinal", "compiledFinal", "behaviorFinal"])) return { kind: "invalid_scores", errors: ["score_identity_or_shape"] };
    for (const key of ["rawFirst", "behaviorFirst", "rawFinal", "behaviorFinal"]) {
      if (!validOracleScore(row[key])) return { kind: "invalid_scores", errors: [`${key}_shape`] };
    }
    for (const key of ["compiledFirst", "compiledFinal"]) {
      if (!(row[key] === null || validOracleScore(row[key]))) return { kind: "invalid_scores", errors: [`${key}_shape`] };
    }
  }
  const cohorts = {
    all: () => true,
    unambiguous: task => task.primaryCohort === "U" || task.primaryCohort === "C",
    compound: task => task.primaryCohort === "C",
    clarifications: task => task.primaryCohort === "A",
    safety: task => task.primaryCohort === "S"
  };
  const fixedDenominators = { all: 48, unambiguous: 24, compound: 12, clarifications: 12, safety: 12 };
  const component = selector => {
    const reports = {};
    for (const [name, predicate] of Object.entries(cohorts)) {
      const selected = fixture.tasks.filter(predicate);
      const correct = selected.filter(task => {
        const row = selector(scores.get(task.caseId), task);
        return row === true || row?.correct === true;
      }).length;
      const pending = selected.filter(task => {
        const row = selector(scores.get(task.caseId), task);
        return row?.status === "human_review_pending";
      }).length;
      const notCalled = selected.filter(task => selector(scores.get(task.caseId), task)?.status === "not_called").length;
      const unscored = selected.filter(task => {
        const row = selector(scores.get(task.caseId), task);
        return row === null || row === undefined || row?.status === "unscored";
      }).length;
      const reasons = {};
      for (const task of selected) {
        const row = selector(scores.get(task.caseId), task);
        const reason = row?.reason ?? row?.status ?? "missing_evidence";
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
      reports[name] = { correct, denominator: fixedDenominators[name], pending, notCalled, unscored,
        rate: correct / fixedDenominators[name], wilson95: wilson(correct, fixedDenominators[name]), reasons };
    }
    return reports;
  };
  const firstRaw = (_, task) => scores.get(task.caseId)?.rawFirst;
  const firstCompiled = (_, task) => {
    const row = scores.get(task.caseId);
    if (!row) return null;
    if (task.primaryCohort === "C" && (row.rawFirst.correct !== true || row.behaviorFirst.correct !== true)) return { correct: false, status: "scored", reason: "first_pass_prerequisite_failed" };
    return row.compiledFirst;
  };
  const firstBehavior = (_, task) => scores.get(task.caseId)?.behaviorFirst;
  const finalTask = (_, task) => {
    const row = scores.get(task.caseId);
    if (!row) return { correct: null, status: "unscored", reason: "missing_evidence" };
    const preflight = row.behaviorFinal?.view?.stage === "context_preflight";
    const noCompiler = row.behaviorFinal?.view?.compiler === "not_invoked";
    if (preflight !== (task.path === "context_preflight")) return { correct: false, status: "scored", reason: "unexpected_context_preflight" };
    if (preflight && (row.rawFinal?.status !== "not_called" || row.rawFinal?.correct !== null || row.rawFinal?.reason !== "context_preflight")) return { correct: false, status: "scored", reason: "invalid_preflight_raw_state" };
    if (!preflight && row.rawFinal?.status === "not_called") return { correct: false, status: "scored", reason: "unexpected_context_preflight" };
    if (noCompiler && row.compiledFinal !== null) return { correct: false, status: "scored", reason: "unexpected_compiler_result" };
    const required = [row.behaviorFinal];
    if (!preflight) required.push(row.rawFinal);
    if (row.compiledFinal === null) {
      if (!noCompiler) return { correct: null, status: "unscored", reason: "missing_compiled_evidence" };
    } else required.push(row.compiledFinal);
    const failed = required.find(score => score?.correct === false);
    if (failed) return { correct: false, status: "scored", reason: failed.reason ?? "component_mismatch" };
    const unresolved = required.find(score => score?.correct === null);
    if (unresolved) return { correct: null, status: unresolved.status, reason: unresolved.reason ?? "component_unresolved" };
    if (required.some(score => score?.correct !== true)) return { correct: null, status: "unscored", reason: "missing_evidence" };
    return { correct: true, status: "scored", reason: null };
  };
  return { kind: "ok", fixedDenominators,
    rawFirst: component(firstRaw), compiledFirst: component(firstCompiled), behaviorFirst: component(firstBehavior),
    finalTask: component(finalTask) };
}

export const EXPECTED_DEVELOPMENT_TASKS = 48;
export const EXPECTED_GUARD_PROBES = 24;

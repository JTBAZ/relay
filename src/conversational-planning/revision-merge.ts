import { validatePlanShape, type PlanSnapshot, type PlanStep } from "./contract.js";
import { matchesSchema } from "../gallery-editor/action-validation.js";
import { INTERPRETED_REQUEST_SCHEMA, type InterpretedRequest, type RequestIntent } from "./intent.js";

/** The server-issued alias is scoped to one exact creator, plan, revision and step. */
export type RevisionHandleBinding = {
  creatorId: string;
  planId: string;
  revision: number;
  stepId: string;
};
export type RevisionHandleMap = ReadonlyMap<string, RevisionHandleBinding> | Readonly<Record<string, RevisionHandleBinding>>;

export type RevisionField = "title" | "time" | "destination" | "template" | "enabled" | "social_action" | "target";
export type RevisionFieldChange = { field: RevisionField; intent: RequestIntent; expected: unknown };
export type RevisionOperation =
  | { kind: "add"; intent: RequestIntent }
  | { kind: "revise"; stepId: string; changes: RevisionFieldChange[] }
  | { kind: "remove"; stepId: string };
export type RevisionMergeResult =
  | { kind: "patch"; planId: string; baseRevision: number; operations: RevisionOperation[] }
  | { kind: "unchanged"; planId: string; revision: number }
  | { kind: "conflict"; code: "stale_revision" | "invalid_handle" | "duplicate_delivery" | "conflicting_change" | "invalid_intent" }
  | { kind: "clarification"; code: "missing_handle" | "ambiguous_target" | "missing_evidence" | "unsupported_edit" | "dependent_repair_required"; question: string };

const INTENT_KEYS = ["command", "target_handle", "changed_fields", "kind", "source_ref", "destination", "title_mode", "title_text", "template_ref", "enabled", "delivery_intent", "social_action", "time_kind", "local_date", "weekday", "weekday_qualifier", "timezone", "day_offset", "target_destination", "local_time", "time_text", "request_quote"];
const FIELD_SET = new Set<RevisionField>(["title", "time", "destination", "template", "enabled", "social_action", "target"]);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const handleValue = (map: RevisionHandleMap, handle: string): RevisionHandleBinding | undefined =>
  typeof (map as ReadonlyMap<string, RevisionHandleBinding>).get === "function"
    ? (map as ReadonlyMap<string, RevisionHandleBinding>).get(handle)
    : (map as Readonly<Record<string, RevisionHandleBinding>>)[handle];

function matchingStep(snapshot: PlanSnapshot, intent: RequestIntent): PlanStep[] {
  return snapshot.steps.filter(step => {
    if (intent.kind === "primary_draft") return step.capability === "prepare_post_draft";
    if (intent.kind === "teaser") return step.capability === "prepare_distribution";
    return step.capability === "reply_block" || step.capability === "engagement_check";
  });
}
function destinationOf(step: PlanStep): string | null {
  return step.capability === "prepare_distribution" || step.capability === "publish_handoff" || step.capability === "reply_block" || step.capability === "engagement_check" ? step.destination : "patreon";
}
function compatible(step: PlanStep, intent: RequestIntent): boolean {
  return intent.kind === "primary_draft" ? step.capability === "prepare_post_draft"
    : intent.kind === "teaser" ? step.capability === "prepare_distribution" || (step.capability === "prepare_preview" && intent.command === "revise" && intent.changed_fields.length === 1 && intent.changed_fields[0] === "template")
    : (step.capability === "reply_block" || step.capability === "engagement_check");
}
function dependents(snapshot: PlanSnapshot, stepId: string): PlanStep[] {
  const found = new Map<string, PlanStep>();
  let frontier = new Set([stepId]);
  while (frontier.size) {
    const next = new Set<string>();
    for (const step of snapshot.steps) if (!found.has(step.step_id) && step.depends_on.some(id => frontier.has(id))) {
      found.set(step.step_id, step); next.add(step.step_id);
    }
    frontier = next;
  }
  return [...found.values()];
}
function quoteValid(intent: RequestIntent, latest: string): boolean {
  return typeof intent.request_quote === "string" && intent.request_quote.length > 0 && latest.includes(intent.request_quote);
}
function exactIntent(raw: unknown): raw is RequestIntent {
  return object(raw) && Object.keys(raw).every(k => INTENT_KEYS.includes(k)) && INTENT_KEYS.every(k => own(raw, k));
}
function fieldEvidence(intent: RequestIntent, latest: string, field: RevisionField): "ok" | "missing" | "unsupported" {
  switch (field) {
    case "title": return intent.title_mode !== "none" && !!intent.title_text && intent.request_quote.includes(intent.title_text) && latest.includes(intent.title_text) ? "ok" : "missing";
    case "time": return intent.time_kind !== "none" && !!intent.time_text && intent.request_quote.includes(intent.time_text) && latest.includes(intent.time_text) ? "ok" : "missing";
    case "destination": return intent.destination ? "ok" : "missing";
    case "template": return intent.template_ref.mode !== "none" && !!intent.template_ref.value && intent.request_quote.includes(intent.template_ref.value) && latest.includes(intent.template_ref.value) ? "ok" : "missing";
    case "enabled": return typeof intent.enabled === "boolean" ? "ok" : "missing";
    case "social_action": return intent.social_action ? "ok" : "missing";
    case "target": return intent.target_destination || intent.source_ref.mode === "post_id" ? "unsupported" : "missing";
  }
}
function requestedValue(field: RevisionField, intent: RequestIntent): unknown {
  switch (field) {
    case "title": return { title_mode: intent.title_mode, title_text: intent.title_text };
    case "time": return { time_kind: intent.time_kind, local_date: intent.local_date, weekday: intent.weekday, weekday_qualifier: intent.weekday_qualifier, timezone: intent.timezone, day_offset: intent.day_offset, target_destination: intent.target_destination, local_time: intent.local_time, time_text: intent.time_text };
    case "destination": return intent.destination;
    case "template": return intent.template_ref;
    case "enabled": return intent.enabled;
    case "social_action": return intent.social_action;
    case "target": return intent.target_destination ?? intent.source_ref;
  }
}
function currentValue(field: RevisionField, step: PlanStep): unknown {
  switch (field) {
    case "title": return step.capability === "prepare_distribution" ? step.copy_title : step.title;
    case "time": return step.time;
    case "destination": return destinationOf(step);
    case "template": return step.capability === "prepare_preview" ? step.template_id : null;
    case "enabled": return step.enabled;
    case "social_action": return step.capability === "reply_block" || step.capability === "engagement_check" ? step.capability : null;
    case "target": return step.capability === "reply_block" || step.capability === "engagement_check" ? step.target_post_id : step.capability === "prepare_post_draft" ? step.target_post_id : null;
  }
}
function sourceMatches(current: PlanSnapshot, intent: RequestIntent): boolean {
  if (intent.source_ref.mode === "post_id") return current.source.kind === "existing_post" && current.source.post_id === intent.source_ref.id;
  if (intent.source_ref.mode === "media_id") return current.source.selected_media_ids.length === 1 && current.source.selected_media_ids[0] === intent.source_ref.id;
  return false;
}

/**
 * Resolve server handles and produce a sparse field patch. It deliberately does not
 * construct or persist a new snapshot; the caller recompiles and validates operations.
 */
export function mergePlanRevision(
  current: PlanSnapshot,
  handleMap: RevisionHandleMap,
  interpreted: InterpretedRequest,
  latestUserText: string,
  expectedRevision: number
): RevisionMergeResult {
  const rawRoot = interpreted as unknown;
  if (!matchesSchema(rawRoot, INTERPRETED_REQUEST_SCHEMA) || typeof latestUserText !== "string" ||
      !Number.isInteger(expectedRevision) || expectedRevision < 0) return { kind: "conflict", code: "invalid_intent" };
  const root = rawRoot as InterpretedRequest;
  if (!validatePlanShape(current).ok) return { kind: "conflict", code: "invalid_intent" };
  if (expectedRevision !== current.revision || root.base_revision !== expectedRevision) return { kind: "conflict", code: "stale_revision" };
  if (root.outcome !== "proposal") return { kind: "unchanged", planId: current.plan_id, revision: current.revision };
  if (root.requests.length === 0) return { kind: "unchanged", planId: current.plan_id, revision: current.revision };

  const operations: RevisionOperation[] = [];
  const touched = new Set<string>();
  const newDeliveries = new Set<string>();
  for (const raw of root.requests) {
    if (!exactIntent(raw) || !quoteValid(raw, latestUserText) || new Set(raw.changed_fields).size !== raw.changed_fields.length || raw.changed_fields.some(field => !FIELD_SET.has(field))) return { kind: "conflict", code: "invalid_intent" };
    const intent = raw as RequestIntent;
    if (intent.command === "add") {
      if (intent.target_handle !== null || intent.changed_fields.length !== 0) return { kind: "conflict", code: "invalid_intent" };
      if (intent.title_mode !== "none" && (!intent.title_text || !intent.request_quote.includes(intent.title_text) || !latestUserText.includes(intent.title_text))) return { kind: "clarification", code: "missing_evidence", question: "Please quote the exact title you want to use." };
      if (intent.time_kind !== "none" && (!intent.time_text || !intent.request_quote.includes(intent.time_text) || !latestUserText.includes(intent.time_text))) return { kind: "clarification", code: "missing_evidence", question: "Please specify the time expression to apply." };
      if (intent.template_ref.mode === "named" && (!intent.template_ref.value || !intent.request_quote.includes(intent.template_ref.value) || !latestUserText.includes(intent.template_ref.value))) return { kind: "clarification", code: "missing_evidence", question: "Please name the saved template you want to use." };
      const key = `${intent.kind}:${intent.kind === "followup" ? intent.target_destination ?? intent.destination : intent.destination ?? "none"}:${intent.social_action ?? ""}:${intent.kind === "followup" ? intent.day_offset ?? "unspecified" : ""}`;
      if (newDeliveries.has(key)) return { kind: "conflict", code: "duplicate_delivery" };
      newDeliveries.add(key);
      const matches = matchingStep(current, intent).filter(step => {
        if (intent.kind === "primary_draft") return true;
        if (destinationOf(step) !== (intent.kind === "followup" ? intent.target_destination ?? intent.destination : intent.destination)) return false;
        if (intent.kind === "followup") return step.capability === intent.social_action && intent.day_offset !== null && step.time?.kind === "after_publication_calendar_days" && step.time.day_offset === intent.day_offset;
        return true;
      });
      if (matches.length) {
        if (matches.length > 1) return { kind: "clarification", code: "ambiguous_target", question: "Which existing step should this request refer to?" };
        const step = matches[0]!;
        const requestedTitle = intent.title_text && intent.title_mode === "literal" ? { mode: "literal", value: intent.title_text, origin: "creator" } : null;
        const existingTitle = step.capability === "prepare_distribution" ? step.copy_title : step.title;
        const enabledMatches = intent.enabled === null || intent.enabled === step.enabled;
        const repeatedAddMatches = intent.kind === "followup"
          ? sourceMatches(current, intent) && intent.title_mode === "none" && intent.title_text === null && intent.template_ref.mode === "none" && intent.delivery_intent === "none" &&
            intent.social_action === step.capability && intent.time_kind === "publication_calendar_day" && intent.day_offset !== null &&
            step.time?.kind === "after_publication_calendar_days" && step.time.day_offset === intent.day_offset &&
            step.time.timezone === intent.timezone && step.time.local_time === intent.local_time && enabledMatches
          : sourceMatches(current, intent) && !!requestedTitle && same(requestedTitle, existingTitle) && intent.time_kind === "none" && enabledMatches &&
            (intent.kind === "primary_draft"
              ? intent.template_ref.mode === "none" && (intent.delivery_intent === "prepare_for_creator_handoff") === current.steps.some(candidate => candidate.capability === "prepare_distribution" && candidate.destination === "patreon")
              : intent.delivery_intent === "prepare_for_creator_handoff" && intent.template_ref.mode === "id" && current.steps.some(candidate => candidate.capability === "prepare_preview" && candidate.step_id === (step.capability === "prepare_distribution" ? step.preview_step_id : null) && candidate.template_id === intent.template_ref.value) && current.steps.some(candidate => candidate.capability === "publish_handoff" && candidate.distribution_step_id === step.step_id && candidate.destination === intent.destination));
        if (repeatedAddMatches) continue;
        return { kind: "conflict", code: "duplicate_delivery" };
      }
      operations.push({ kind: "add", intent });
      continue;
    }
    if (intent.command === "remove" && intent.changed_fields.length !== 0) return { kind: "conflict", code: "invalid_intent" };
    if (intent.command === "revise" && intent.changed_fields.length === 0) return { kind: "conflict", code: "invalid_intent" };
    if (!intent.target_handle) {
      const candidates = matchingStep(current, intent).filter(step => intent.kind === "primary_draft" || !intent.destination || destinationOf(step) === (intent.kind === "followup" ? intent.target_destination ?? intent.destination : intent.destination));
      if (candidates.length > 1) return { kind: "clarification", code: "ambiguous_target", question: "Which matching plan step should this change apply to?" };
      return { kind: "clarification", code: "missing_handle", question: "Which existing plan step should this change apply to?" };
    }
    const binding = handleValue(handleMap, intent.target_handle);
    if (!binding || Object.keys(binding).sort().join(",") !== "creatorId,planId,revision,stepId" || binding.creatorId !== current.creator_id || binding.planId !== current.plan_id || binding.revision !== current.revision || binding.stepId === intent.target_handle) return { kind: "conflict", code: "invalid_handle" };
    if (touched.has(binding.stepId)) return { kind: "conflict", code: "conflicting_change" };
    const step = current.steps.find(candidate => candidate.step_id === binding.stepId);
    if (!step || !compatible(step, intent)) return { kind: "conflict", code: "invalid_handle" };
    touched.add(binding.stepId);
    if (intent.command === "remove") {
      if (dependents(current, step.step_id).length || current.distribution_groups.some(group => group.source_step_id === step.step_id || group.preview_step_id === step.step_id || group.destination_step_ids.includes(step.step_id))) return { kind: "clarification", code: "dependent_repair_required", question: "Removing this step also affects dependent plan references. Specify which related actions to remove or reroute." };
      operations.push({ kind: "remove", stepId: step.step_id });
      continue;
    }
    const changes: RevisionFieldChange[] = [];
    for (const field of intent.changed_fields) {
      const evidence = fieldEvidence(intent, latestUserText, field);
      if (evidence === "missing") return { kind: "clarification", code: "missing_evidence", question: `Please provide the requested ${field.replaceAll("_", " ")} value explicitly.` };
      if (evidence === "unsupported" || field === "destination" || field === "target" || field === "social_action") return { kind: "clarification", code: "dependent_repair_required", question: "This change can replace a step or affect its dependents. Specify the destination or target and how dependent actions should be repaired." };
      const expected = currentValue(field, step);
      const value = requestedValue(field, intent);
      if (field === "enabled" && value === expected) continue;
      if (field === "title" && intent.title_mode === "literal" && same(expected, { mode: "literal", value: intent.title_text, origin: "creator" })) continue;
      changes.push({ field, intent, expected });
    }
    if (changes.length) operations.push({ kind: "revise", stepId: step.step_id, changes });
  }
  if (!operations.length) return { kind: "unchanged", planId: current.plan_id, revision: current.revision };
  // Refuse duplicate destination variants before handing the patch to a compiler.
  const plannedDestinations = new Set(current.steps.filter(step => step.capability === "prepare_distribution").map(step => `${step.capability}:${step.destination}`));
  for (const operation of operations) if (operation.kind === "add" && operation.intent.kind === "teaser" && operation.intent.destination) {
    const key = `prepare_distribution:${operation.intent.destination}`;
    if (plannedDestinations.has(key)) return { kind: "conflict", code: "duplicate_delivery" };
    plannedDestinations.add(key);
  }
  return { kind: "patch", planId: current.plan_id, baseRevision: current.revision, operations };
}

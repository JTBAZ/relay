import {
  parsePreviewTemplateConfig,
  type PreviewTemplateConfigV1
} from "../distribution/preview-template-config.js";

export const PLAN_SCHEMA_VERSION = 1 as const;
export const MAX_PLAN_STEPS = 32;
export const MAX_CLARIFICATION_SLOTS = 16;
export const MAX_PLAN_BYTES = 64 * 1024;
export const MAX_ID_LENGTH = 160;
export const MAX_TITLE_LENGTH = 500;
export const MAX_NOTE_LENGTH = 2_000;
export const MAX_QUOTE_LENGTH = 2_000;
export const MAX_QUESTION_LENGTH = 500;
export const MAX_TEMPLATE_CONFIG_BYTES = 16 * 1024;

export const DESTINATIONS = ["patreon", "x", "deviantart", "bluesky"] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const SOCIAL_ACTIONS = ["reply_block", "engagement_check"] as const;
export type SocialAction = (typeof SOCIAL_ACTIONS)[number];
export const CAPABILITIES = [
  "prepare_post_draft", "prepare_preview", "prepare_distribution", "publish_handoff",
  ...SOCIAL_ACTIONS
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export const PLAN_REVIEWS = ["proposed", "approved_for_preparation", "cancelled"] as const;
export type PlanReview = (typeof PLAN_REVIEWS)[number];
export const CLARIFICATION_REASONS = [
  "ambiguous_source", "missing_post", "unknown_part", "literal_or_template",
  "missing_template", "unlinked_destination", "unknown_time", "unknown_engagement_action",
  "unknown_engagement_target", "unsupported_action", "visual_request"
] as const;
export type ClarificationReason = (typeof CLARIFICATION_REASONS)[number];
export const AUTHORITY_KINDS = [
  "autopost_draft", "schedule_event", "relay_post", "preview_media", "distribution_plan",
  "distribution_variant", "distribution_attempt"
] as const;
export type AuthorityKind = (typeof AUTHORITY_KINDS)[number];
export const POINTER_SLOTS = [
  "draft", "attention_event", "relay_post", "preview_media", "distribution_plan", "variant",
  "current_attempt", "engagement_event"
] as const;
export type PointerSlot = (typeof POINTER_SLOTS)[number];

export type SourceRef = {
  kind: "existing_post" | "staged_media";
  post_id: string | null;
  selected_media_ids: string[];
  creative_work_id: string | null;
  creative_series_member_id: string | null;
  source_revision: string;
};
export type CopyValue =
  | { mode: "literal"; value: string; origin: "creator" | "compiler" }
  | { mode: "part_substitution"; prefix: string; part: string; suffix: string; part_source: "creator" | "creative_series_member" };
export type TimeSpec =
  | { kind: "absolute"; at_utc: string; timezone: string; local: string }
  | { kind: "after_publication_calendar_days"; anchor_step_id: string; day_offset: 1 | 2; timezone: string; local_time: string };
export type StepBase = {
  step_id: string;
  depends_on: string[];
  enabled: boolean;
  title: CopyValue;
  note: string | null;
  time: TimeSpec | null;
};
export type PlanStep =
  | (StepBase & { capability: "prepare_post_draft"; intended_destination: "patreon"; source_media_ids: string[]; target_post_id: string | null })
  | (StepBase & { capability: "prepare_preview"; source_step_id: string; template_id: string; template_config_snapshot: PreviewTemplateConfigV1 })
  | (StepBase & { capability: "prepare_distribution"; source_step_id: string; preview_step_id: string | null; distribution_group_id: string; destination: Destination; copy_title: CopyValue })
  | (StepBase & { capability: "publish_handoff"; distribution_step_id: string; destination: Destination })
  | (StepBase & { capability: SocialAction; publication_step_id: string; destination: Destination; target_post_id: string | null });
export type UnresolvedRequest = {
  request_id: string;
  requested_text_quote: string;
  intended_capability: Capability | null;
  intended_destination: Destination | null;
  blocking_slot_ids: string[];
};
export type DistributionGroup = { group_id: string; source_step_id: string; preview_step_id: string | null; destination_step_ids: string[] };
export type Clarification = {
  slot_id: string;
  field: string;
  question: string;
  affected_node_ids: string[];
  blocking: true;
  reason: ClarificationReason;
};
export type PlanSnapshot = {
  schema_version: 1;
  plan_id: string;
  creator_id: string;
  revision: number;
  review: PlanReview;
  source: SourceRef;
  steps: PlanStep[];
  distribution_groups: DistributionGroup[];
  unresolved_requests: UnresolvedRequest[];
  clarifications: Clarification[];
  requested_text_quote: string;
  created_at: string;
  updated_at: string;
};
export type StepPointer = { node_id: string; kind: AuthorityKind; authority_id: string; slot: PointerSlot };

export type ValidationIssue = { path: string; code: string };
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
const exact = (v: Record<string, unknown>, keys: readonly string[], path: string, errors: ValidationIssue[]) => {
  for (const k of keys) if (!own(v, k)) errors.push({ path: `${path}.${k}`, code: "required" });
  for (const k of Object.keys(v)) if (!keys.includes(k)) errors.push({ path: `${path}.${k}`, code: "unknown_field" });
};
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH && v.trim() === v;
const bounded = (v: unknown, max: number, allowEmpty = false): v is string => typeof v === "string" && v.length <= max && (allowEmpty || v.trim().length > 0);
const enumValue = <T extends readonly string[]>(v: unknown, values: T): v is T[number] => typeof v === "string" && (values as readonly string[]).includes(v);
const arrayOfIds = (v: unknown, path: string, errors: ValidationIssue[], maximum = MAX_PLAN_STEPS, nonempty = false): v is string[] => {
  if (!Array.isArray(v) || v.length > maximum || (nonempty && v.length === 0)) { errors.push({ path, code: "invalid_array" }); return false; }
  const seen = new Set<string>();
  v.forEach((item, i) => {
    if (!id(item)) errors.push({ path: `${path}[${i}]`, code: "invalid_id" });
    else if (seen.has(item)) errors.push({ path: `${path}[${i}]`, code: "duplicate_id" });
    else seen.add(item);
  });
  return true;
};
const utf8Size = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!object(value)) return JSON.stringify(value) ?? "undefined";
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
};
const timestamp = (value: unknown): boolean => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
};
const timeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
};
const localDateTime = (v: unknown): boolean => {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)) return false;
  const parsed = new Date(`${v}:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 16) === v;
};
const localTime = (v: unknown): boolean => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const deepHasForbiddenExecutionField = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.some(deepHasForbiddenExecutionField);
  if (!object(v)) return false;
  return Object.entries(v).some(([key, child]) => ["status", "run_status", "step_status", "published_at", "reminder_sent_at", "publication_evidence", "evidence_kind", "evidence_at", "attempt_result", "success"].includes(key.toLowerCase()) || deepHasForbiddenExecutionField(child));
};

function validateCopy(raw: unknown, path: string, errors: ValidationIssue[]): raw is CopyValue {
  if (!object(raw)) { errors.push({ path, code: "invalid_object" }); return false; }
  if (raw.mode === "literal") {
    exact(raw, ["mode", "value", "origin"], path, errors);
    if (!bounded(raw.value, MAX_TITLE_LENGTH)) errors.push({ path: `${path}.value`, code: "invalid_text" });
    if (!enumValue(raw.origin, ["creator", "compiler"] as const)) errors.push({ path: `${path}.origin`, code: "invalid_enum" });
    return true;
  }
  if (raw.mode === "part_substitution") {
    exact(raw, ["mode", "prefix", "part", "suffix", "part_source"], path, errors);
    if (!bounded(raw.prefix, MAX_TITLE_LENGTH, true)) errors.push({ path: `${path}.prefix`, code: "invalid_text" });
    if (!bounded(raw.part, MAX_TITLE_LENGTH)) errors.push({ path: `${path}.part`, code: "invalid_text" });
    if (!bounded(raw.suffix, MAX_TITLE_LENGTH, true)) errors.push({ path: `${path}.suffix`, code: "invalid_text" });
    if ([raw.prefix, raw.part, raw.suffix].every((x) => typeof x === "string") && (String(raw.prefix).length + String(raw.part).length + String(raw.suffix).length > MAX_TITLE_LENGTH)) errors.push({ path, code: "title_too_long" });
    if (!enumValue(raw.part_source, ["creator", "creative_series_member"] as const)) errors.push({ path: `${path}.part_source`, code: "invalid_enum" });
    return true;
  }
  errors.push({ path: `${path}.mode`, code: "invalid_enum" }); return false;
}

function validateTime(raw: unknown, path: string, errors: ValidationIssue[]): raw is TimeSpec | null {
  if (raw === null) return true;
  if (!object(raw)) { errors.push({ path, code: "invalid_object" }); return false; }
  if (raw.kind === "absolute") {
    exact(raw, ["kind", "at_utc", "timezone", "local"], path, errors);
    const validUtc = timestamp(raw.at_utc);
    const validZone = timeZone(raw.timezone);
    const validLocal = localDateTime(raw.local);
    if (!validUtc) errors.push({ path: `${path}.at_utc`, code: "invalid_utc_timestamp" });
    if (!validZone) errors.push({ path: `${path}.timezone`, code: "invalid_timezone" });
    if (!validLocal) errors.push({ path: `${path}.local`, code: "invalid_local_datetime" });
    if (validUtc && validZone && validLocal) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: raw.timezone as string, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(new Date(raw.at_utc as string));
      const part = (type: string) => parts.find((x) => x.type === type)?.value;
      const formatted = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
      if (formatted !== raw.local) errors.push({ path: `${path}.local`, code: "utc_local_timezone_mismatch" });
    }
    return true;
  }
  if (raw.kind === "after_publication_calendar_days") {
    exact(raw, ["kind", "anchor_step_id", "day_offset", "timezone", "local_time"], path, errors);
    if (!id(raw.anchor_step_id)) errors.push({ path: `${path}.anchor_step_id`, code: "invalid_id" });
    if (raw.day_offset !== 1 && raw.day_offset !== 2) errors.push({ path: `${path}.day_offset`, code: "invalid_offset" });
    if (!timeZone(raw.timezone)) errors.push({ path: `${path}.timezone`, code: "invalid_timezone" });
    if (!localTime(raw.local_time)) errors.push({ path: `${path}.local_time`, code: "invalid_local_time" });
    return true;
  }
  errors.push({ path: `${path}.kind`, code: "invalid_enum" }); return false;
}

function validateTemplateConfig(raw: unknown, path: string, errors: ValidationIssue[]): raw is PreviewTemplateConfigV1 {
  if (!object(raw)) { errors.push({ path, code: "invalid_template_config" }); return false; }
  exact(raw, ["schemaVersion", "preset", "aspectKey", "compositionId", "compositionProps", "compositionVariantIndex", "overlayDoc", "templateOptions", "destination"], path, errors);
  if (object(raw.destination)) exact(raw.destination, ["selectedDestinationId", "customDestinationUrl"], `${path}.destination`, errors);
  else errors.push({ path: `${path}.destination`, code: "invalid_object" });
  if (utf8Size(raw) > MAX_TEMPLATE_CONFIG_BYTES) errors.push({ path, code: "template_config_too_large" });
  try { parsePreviewTemplateConfig(raw); }
  catch { errors.push({ path, code: "invalid_template_config" }); }
  return true;
}

const stepKeys: Record<Capability, readonly string[]> = {
  prepare_post_draft: ["step_id", "depends_on", "enabled", "title", "note", "time", "capability", "intended_destination", "source_media_ids", "target_post_id"],
  prepare_preview: ["step_id", "depends_on", "enabled", "title", "note", "time", "capability", "source_step_id", "template_id", "template_config_snapshot"],
  prepare_distribution: ["step_id", "depends_on", "enabled", "title", "note", "time", "capability", "source_step_id", "preview_step_id", "distribution_group_id", "destination", "copy_title"],
  publish_handoff: ["step_id", "depends_on", "enabled", "title", "note", "time", "capability", "distribution_step_id", "destination"],
  reply_block: ["step_id", "depends_on", "enabled", "title", "note", "time", "capability", "publication_step_id", "destination", "target_post_id"],
  engagement_check: ["step_id", "depends_on", "enabled", "title", "note", "time", "capability", "publication_step_id", "destination", "target_post_id"]
};

function validateStep(raw: unknown, path: string, errors: ValidationIssue[]): raw is PlanStep {
  if (!object(raw)) { errors.push({ path, code: "invalid_object" }); return false; }
  if (!enumValue(raw.capability, CAPABILITIES)) { errors.push({ path: `${path}.capability`, code: "unknown_capability" }); return false; }
  exact(raw, stepKeys[raw.capability], path, errors);
  if (!id(raw.step_id)) errors.push({ path: `${path}.step_id`, code: "invalid_id" });
  arrayOfIds(raw.depends_on, `${path}.depends_on`, errors);
  if (typeof raw.enabled !== "boolean") errors.push({ path: `${path}.enabled`, code: "invalid_boolean" });
  validateCopy(raw.title, `${path}.title`, errors);
  if (raw.note !== null && !bounded(raw.note, MAX_NOTE_LENGTH, true)) errors.push({ path: `${path}.note`, code: "invalid_text" });
  validateTime(raw.time, `${path}.time`, errors);
  switch (raw.capability) {
    case "prepare_post_draft":
      if (raw.intended_destination !== "patreon") errors.push({ path: `${path}.intended_destination`, code: "invalid_destination" });
      arrayOfIds(raw.source_media_ids, `${path}.source_media_ids`, errors, 32, false);
      if (raw.target_post_id !== null && !id(raw.target_post_id)) errors.push({ path: `${path}.target_post_id`, code: "invalid_id" });
      break;
    case "prepare_preview":
      if (!id(raw.source_step_id)) errors.push({ path: `${path}.source_step_id`, code: "invalid_id" });
      if (!id(raw.template_id)) errors.push({ path: `${path}.template_id`, code: "invalid_id" });
      validateTemplateConfig(raw.template_config_snapshot, `${path}.template_config_snapshot`, errors);
      break;
    case "prepare_distribution":
      if (!id(raw.source_step_id)) errors.push({ path: `${path}.source_step_id`, code: "invalid_id" });
      if (raw.preview_step_id !== null && !id(raw.preview_step_id)) errors.push({ path: `${path}.preview_step_id`, code: "invalid_id" });
      if (!id(raw.distribution_group_id)) errors.push({ path: `${path}.distribution_group_id`, code: "invalid_id" });
      if (!enumValue(raw.destination, DESTINATIONS)) errors.push({ path: `${path}.destination`, code: "unknown_destination" });
      validateCopy(raw.copy_title, `${path}.copy_title`, errors);
      break;
    case "publish_handoff":
      if (!id(raw.distribution_step_id)) errors.push({ path: `${path}.distribution_step_id`, code: "invalid_id" });
      if (!enumValue(raw.destination, DESTINATIONS)) errors.push({ path: `${path}.destination`, code: "unknown_destination" });
      break;
    case "reply_block": case "engagement_check":
      if (!id(raw.publication_step_id)) errors.push({ path: `${path}.publication_step_id`, code: "invalid_id" });
      if (!enumValue(raw.destination, DESTINATIONS)) errors.push({ path: `${path}.destination`, code: "unknown_destination" });
      if (raw.target_post_id !== null && !id(raw.target_post_id)) errors.push({ path: `${path}.target_post_id`, code: "invalid_id" });
      break;
  }
  return true;
}

function validateSnapshot(raw: unknown, errors: ValidationIssue[]): raw is PlanSnapshot {
  if (!object(raw)) { errors.push({ path: "$", code: "invalid_object" }); return false; }
  exact(raw, ["schema_version", "plan_id", "creator_id", "revision", "review", "source", "steps", "distribution_groups", "unresolved_requests", "clarifications", "requested_text_quote", "created_at", "updated_at"], "$", errors);
  if (raw.schema_version !== PLAN_SCHEMA_VERSION) errors.push({ path: "$.schema_version", code: "unsupported_version" });
  if (!id(raw.plan_id)) errors.push({ path: "$.plan_id", code: "invalid_id" });
  if (!id(raw.creator_id)) errors.push({ path: "$.creator_id", code: "invalid_id" });
  if (!Number.isInteger(raw.revision) || (raw.revision as number) < 0) errors.push({ path: "$.revision", code: "invalid_revision" });
  if (!enumValue(raw.review, PLAN_REVIEWS)) errors.push({ path: "$.review", code: "invalid_enum" });
  if (!object(raw.source)) errors.push({ path: "$.source", code: "invalid_object" });
  else {
    exact(raw.source, ["kind", "post_id", "selected_media_ids", "creative_work_id", "creative_series_member_id", "source_revision"], "$.source", errors);
    if (raw.source.kind !== "existing_post" && raw.source.kind !== "staged_media") errors.push({ path: "$.source.kind", code: "invalid_enum" });
    if (raw.source.kind === "existing_post" && !id(raw.source.post_id)) errors.push({ path: "$.source.post_id", code: "required_for_existing_post" });
    if (raw.source.kind === "staged_media" && raw.source.post_id !== null) errors.push({ path: "$.source.post_id", code: "must_be_null_for_staged_media" });
    arrayOfIds(raw.source.selected_media_ids, "$.source.selected_media_ids", errors, 32, true);
    for (const field of ["creative_work_id", "creative_series_member_id"] as const) if (raw.source[field] !== null && !id(raw.source[field])) errors.push({ path: `$.source.${field}`, code: "invalid_id" });
    if (!bounded(raw.source.source_revision, MAX_ID_LENGTH)) errors.push({ path: "$.source.source_revision", code: "invalid_fingerprint" });
  }
  if (!Array.isArray(raw.steps) || raw.steps.length > MAX_PLAN_STEPS) errors.push({ path: "$.steps", code: "invalid_step_count" });
  else raw.steps.forEach((step, i) => validateStep(step, `$.steps[${i}]`, errors));
  if (!Array.isArray(raw.distribution_groups) || raw.distribution_groups.length > MAX_PLAN_STEPS) errors.push({ path: "$.distribution_groups", code: "invalid_group_count" });
  else raw.distribution_groups.forEach((g, i) => {
    const p = `$.distribution_groups[${i}]`;
    if (!object(g)) { errors.push({ path: p, code: "invalid_object" }); return; }
    exact(g, ["group_id", "source_step_id", "preview_step_id", "destination_step_ids"], p, errors);
    if (!id(g.group_id) || !id(g.source_step_id)) errors.push({ path: p, code: "invalid_id" });
    if (g.preview_step_id !== null && !id(g.preview_step_id)) errors.push({ path: `${p}.preview_step_id`, code: "invalid_id" });
    arrayOfIds(g.destination_step_ids, `${p}.destination_step_ids`, errors, 4, true);
  });
  if (!Array.isArray(raw.unresolved_requests) || raw.unresolved_requests.length > MAX_PLAN_STEPS) errors.push({ path: "$.unresolved_requests", code: "invalid_request_count" });
  else raw.unresolved_requests.forEach((r, i) => {
    const p = `$.unresolved_requests[${i}]`;
    if (!object(r)) { errors.push({ path: p, code: "invalid_object" }); return; }
    exact(r, ["request_id", "requested_text_quote", "intended_capability", "intended_destination", "blocking_slot_ids"], p, errors);
    if (!id(r.request_id)) errors.push({ path: `${p}.request_id`, code: "invalid_id" });
    if (!bounded(r.requested_text_quote, MAX_QUOTE_LENGTH)) errors.push({ path: `${p}.requested_text_quote`, code: "invalid_text" });
    if (r.intended_capability !== null && !enumValue(r.intended_capability, CAPABILITIES)) errors.push({ path: `${p}.intended_capability`, code: "unknown_capability" });
    if (r.intended_destination !== null && !enumValue(r.intended_destination, DESTINATIONS)) errors.push({ path: `${p}.intended_destination`, code: "unknown_destination" });
    arrayOfIds(r.blocking_slot_ids, `${p}.blocking_slot_ids`, errors, MAX_CLARIFICATION_SLOTS, true);
  });
  if (!Array.isArray(raw.clarifications) || raw.clarifications.length > MAX_CLARIFICATION_SLOTS) errors.push({ path: "$.clarifications", code: "invalid_clarification_count" });
  else raw.clarifications.forEach((c, i) => {
    const p = `$.clarifications[${i}]`;
    if (!object(c)) { errors.push({ path: p, code: "invalid_object" }); return; }
    exact(c, ["slot_id", "field", "question", "affected_node_ids", "blocking", "reason"], p, errors);
    if (!id(c.slot_id)) errors.push({ path: `${p}.slot_id`, code: "invalid_id" });
    if (!bounded(c.field, 100)) errors.push({ path: `${p}.field`, code: "invalid_text" });
    if (!bounded(c.question, MAX_QUESTION_LENGTH)) errors.push({ path: `${p}.question`, code: "invalid_text" });
    arrayOfIds(c.affected_node_ids, `${p}.affected_node_ids`, errors, MAX_PLAN_STEPS + MAX_CLARIFICATION_SLOTS, true);
    if (c.blocking !== true) errors.push({ path: `${p}.blocking`, code: "must_block" });
    if (!enumValue(c.reason, CLARIFICATION_REASONS)) errors.push({ path: `${p}.reason`, code: "invalid_enum" });
  });
  if (!bounded(raw.requested_text_quote, MAX_QUOTE_LENGTH)) errors.push({ path: "$.requested_text_quote", code: "invalid_text" });
  if (!timestamp(raw.created_at)) errors.push({ path: "$.created_at", code: "invalid_timestamp" });
  if (!timestamp(raw.updated_at)) errors.push({ path: "$.updated_at", code: "invalid_timestamp" });
  if (utf8Size(raw) > MAX_PLAN_BYTES) errors.push({ path: "$", code: "plan_too_large" });
  if (deepHasForbiddenExecutionField(raw)) errors.push({ path: "$", code: "execution_state_forbidden" });
  return true;
}

function validateGraph(plan: PlanSnapshot, errors: ValidationIssue[]): void {
  const steps = new Map<string, PlanStep>();
  for (const step of plan.steps) {
    if (steps.has(step.step_id)) errors.push({ path: `$.steps.${step.step_id}`, code: "duplicate_step_id" });
    else steps.set(step.step_id, step);
  }
  const requestIds = new Set<string>();
  for (const request of plan.unresolved_requests) {
    if (requestIds.has(request.request_id) || steps.has(request.request_id)) errors.push({ path: `$.unresolved_requests.${request.request_id}`, code: "duplicate_node_id" });
    requestIds.add(request.request_id);
  }
  const clarificationMap = new Map<string, Clarification>();
  for (const c of plan.clarifications) {
    if (clarificationMap.has(c.slot_id)) errors.push({ path: `$.clarifications.${c.slot_id}`, code: "duplicate_slot_id" });
    clarificationMap.set(c.slot_id, c);
    for (const node of c.affected_node_ids) if (!steps.has(node) && !requestIds.has(node)) errors.push({ path: `$.clarifications.${c.slot_id}`, code: "unknown_affected_node" });
  }
  for (const request of plan.unresolved_requests) for (const slot of request.blocking_slot_ids) {
    const clarification = clarificationMap.get(slot);
    if (!clarification || !clarification.affected_node_ids.includes(request.request_id)) errors.push({ path: `$.unresolved_requests.${request.request_id}.blocking_slot_ids`, code: "missing_matching_blocking_slot" });
  }
  const groups = new Map<string, DistributionGroup>();
  const membership = new Map<string, string>();
  for (const group of plan.distribution_groups) {
    if (groups.has(group.group_id)) errors.push({ path: `$.distribution_groups.${group.group_id}`, code: "duplicate_group_id" });
    if (steps.has(group.group_id) || requestIds.has(group.group_id)) errors.push({ path: `$.distribution_groups.${group.group_id}`, code: "group_id_collision" });
    groups.set(group.group_id, group);
    const source = steps.get(group.source_step_id);
    if (!source || source.capability !== "prepare_post_draft") errors.push({ path: `$.distribution_groups.${group.group_id}.source_step_id`, code: "invalid_group_source" });
    if (group.preview_step_id !== null) {
      const preview = steps.get(group.preview_step_id);
      if (!preview || preview.capability !== "prepare_preview" || preview.source_step_id !== group.source_step_id) errors.push({ path: `$.distribution_groups.${group.group_id}.preview_step_id`, code: "invalid_group_preview" });
    }
    const destinations = new Set<string>();
    for (const stepId of group.destination_step_ids) {
      if (membership.has(stepId)) errors.push({ path: `$.distribution_groups.${group.group_id}`, code: "step_in_multiple_groups" });
      membership.set(stepId, group.group_id);
      const step = steps.get(stepId);
      if (!step || step.capability !== "prepare_distribution") { errors.push({ path: `$.distribution_groups.${group.group_id}`, code: "group_member_not_distribution" }); continue; }
      if (step.distribution_group_id !== group.group_id || step.source_step_id !== group.source_step_id || (step.preview_step_id !== null && step.preview_step_id !== group.preview_step_id)) errors.push({ path: `$.steps.${stepId}`, code: "group_identity_mismatch" });
      if (destinations.has(step.destination)) errors.push({ path: `$.distribution_groups.${group.group_id}`, code: "duplicate_destination_variant" });
      destinations.add(step.destination);
    }
  }
  for (const step of plan.steps) {
    if (step.capability === "prepare_post_draft" && step.source_media_ids.some((mediaId) => !plan.source.selected_media_ids.includes(mediaId))) errors.push({ path: `$.steps.${step.step_id}.source_media_ids`, code: "media_not_in_selected_source" });
    for (const depId of step.depends_on) {
      const dep = steps.get(depId);
      if (!dep || depId === step.step_id) errors.push({ path: `$.steps.${step.step_id}.depends_on`, code: "invalid_dependency" });
      else if (!dep.enabled && step.enabled) errors.push({ path: `$.steps.${step.step_id}.depends_on`, code: "depends_on_disabled_step" });
    }
    const requireDependency = (depId: string, label: string) => {
      if (!step.depends_on.includes(depId)) errors.push({ path: `$.steps.${step.step_id}.depends_on`, code: `missing_${label}_dependency` });
    };
    if (step.capability === "prepare_preview") requireDependency(step.source_step_id, "source");
    if (step.capability === "prepare_distribution") {
      const group = groups.get(step.distribution_group_id);
      if (!group || !group.destination_step_ids.includes(step.step_id) || membership.get(step.step_id) !== group.group_id) errors.push({ path: `$.steps.${step.step_id}`, code: "distribution_missing_group" });
      requireDependency(step.source_step_id, "source");
      if (step.destination === "x" || step.destination === "deviantart") {
        if (!step.preview_step_id) errors.push({ path: `$.steps.${step.step_id}.preview_step_id`, code: "teaser_requires_preview" });
      } else if (step.preview_step_id !== null) errors.push({ path: `$.steps.${step.step_id}.preview_step_id`, code: "unexpected_preview_step" });
      if (step.preview_step_id) requireDependency(step.preview_step_id, "preview");
    }
    if (step.capability === "prepare_preview" || step.capability === "prepare_distribution") {
      const source = steps.get(step.source_step_id);
      if (!source || source.capability !== "prepare_post_draft") errors.push({ path: `$.steps.${step.step_id}.source_step_id`, code: "invalid_source_step" });
    }
    if (step.capability === "prepare_distribution" && step.preview_step_id) {
      const preview = steps.get(step.preview_step_id);
      if (!preview || preview.capability !== "prepare_preview" || preview.source_step_id !== step.source_step_id) errors.push({ path: `$.steps.${step.step_id}.preview_step_id`, code: "invalid_preview_step" });
    }
    if (step.capability === "publish_handoff") {
      const dist = steps.get(step.distribution_step_id);
      if (!dist || dist.capability !== "prepare_distribution" || dist.destination !== step.destination) errors.push({ path: `$.steps.${step.step_id}.distribution_step_id`, code: "handoff_destination_mismatch" });
      else requireDependency(dist.step_id, "distribution");
    }
    if (step.capability === "reply_block" || step.capability === "engagement_check") {
      const anchor = steps.get(step.publication_step_id);
      if (!anchor || anchor.capability !== "publish_handoff" || anchor.destination !== step.destination) errors.push({ path: `$.steps.${step.step_id}.publication_step_id`, code: "publication_anchor_mismatch" });
      else requireDependency(anchor.step_id, "publication_anchor");
      if (!step.time || step.time.kind !== "after_publication_calendar_days" || step.time.anchor_step_id !== step.publication_step_id) errors.push({ path: `$.steps.${step.step_id}.time`, code: "publication_relative_time_required" });
      if (step.enabled && step.depends_on.some((x) => !steps.get(x)?.enabled)) errors.push({ path: `$.steps.${step.step_id}`, code: "enabled_with_disabled_dependency" });
    }
    if (step.time?.kind === "after_publication_calendar_days" && step.time.anchor_step_id !== (step.capability === "reply_block" || step.capability === "engagement_check" ? step.publication_step_id : "")) errors.push({ path: `$.steps.${step.step_id}.time.anchor_step_id`, code: "invalid_publication_anchor" });
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (stepId: string) => {
    if (visiting.has(stepId)) { errors.push({ path: `$.steps.${stepId}.depends_on`, code: "dependency_cycle" }); return; }
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    for (const dep of steps.get(stepId)?.depends_on ?? []) if (steps.has(dep)) visit(dep);
    visiting.delete(stepId); visited.add(stepId);
  };
  for (const step of plan.steps) visit(step.step_id);
}

export function validatePlanShape(raw: unknown): ValidationResult<PlanSnapshot> {
  const issues: ValidationIssue[] = [];
  if (!validateSnapshot(raw, issues)) return { ok: false, issues };
  if (issues.length) return { ok: false, issues };
  validateGraph(raw, issues);
  return issues.length ? { ok: false, issues } : { ok: true, value: raw };
}

/** Trusted state is loaded by server code after authentication; request JSON cannot supply it. */
export type TrustedPlanContext = {
  authenticatedCreatorId: string;
  ownedMediaIds: ReadonlySet<string>;
  sourceMediaRelations: ReadonlyMap<string, { post_ids: ReadonlySet<string>; creative_work_ids: ReadonlySet<string>; creative_series_member_ids: ReadonlySet<string> }>;
  ownedPostIds: ReadonlySet<string>;
  ownedTemplateIds: ReadonlySet<string>;
  ownedCreativeWorkIds: ReadonlySet<string>;
  ownedCreativeSeriesMemberIds: ReadonlySet<string>;
  verifiedSeriesMemberPartLabels: ReadonlyMap<string, string>;
  currentTemplateConfigs: ReadonlyMap<string, PreviewTemplateConfigV1>;
  connectedDestinations: ReadonlySet<Destination>;
  hasAutopostEntitlement: boolean;
  currentSourceRevision: string;
  ownedTargetPostIds: ReadonlySet<string>;
};
export function validatePlanWithContext(raw: unknown, context: TrustedPlanContext): ValidationResult<PlanSnapshot> {
  const shape = validatePlanShape(raw);
  if (!shape.ok) return shape;
  const p = shape.value, issues: ValidationIssue[] = [];
  if (p.creator_id !== context.authenticatedCreatorId) issues.push({ path: "$.creator_id", code: "creator_scope_mismatch" });
  if (p.source.selected_media_ids.some((mediaId) => !context.ownedMediaIds.has(mediaId))) issues.push({ path: "$.source.selected_media_ids", code: "media_scope_mismatch" });
  if (p.source.post_id && !context.ownedPostIds.has(p.source.post_id)) issues.push({ path: "$.source.post_id", code: "post_scope_mismatch" });
  if (p.source.creative_work_id && !context.ownedCreativeWorkIds.has(p.source.creative_work_id)) issues.push({ path: "$.source.creative_work_id", code: "creative_work_scope_mismatch" });
  if (p.source.creative_series_member_id && !context.ownedCreativeSeriesMemberIds.has(p.source.creative_series_member_id)) issues.push({ path: "$.source.creative_series_member_id", code: "series_member_scope_mismatch" });
  if (p.source.source_revision !== context.currentSourceRevision) issues.push({ path: "$.source.source_revision", code: "stale_source_fingerprint" });
  if (!context.hasAutopostEntitlement) issues.push({ path: "$.steps", code: "autopost_entitlement_required" });
  for (const step of p.steps) {
    if (step.capability === "prepare_post_draft" && step.source_media_ids.some((id) => !context.ownedMediaIds.has(id))) issues.push({ path: `$.steps.${step.step_id}.source_media_ids`, code: "media_scope_mismatch" });
    if (step.capability === "prepare_preview") {
      if (!context.ownedTemplateIds.has(step.template_id)) issues.push({ path: `$.steps.${step.step_id}.template_id`, code: "template_scope_mismatch" });
      const current = context.currentTemplateConfigs.get(step.template_id);
      if (!current || canonicalJson(current) !== canonicalJson(step.template_config_snapshot)) issues.push({ path: `$.steps.${step.step_id}.template_config_snapshot`, code: "stale_template_config" });
    }
    if (step.capability === "publish_handoff" && !context.connectedDestinations.has(step.destination)) {
      const covered = !step.enabled && p.clarifications.some((c) => c.reason === "unlinked_destination" && c.affected_node_ids.includes(step.step_id));
      if (!covered) issues.push({ path: `$.steps.${step.step_id}.destination`, code: "destination_not_connected" });
    }
    if ((step.capability === "prepare_post_draft" || step.capability === "reply_block" || step.capability === "engagement_check") && step.target_post_id && !context.ownedTargetPostIds.has(step.target_post_id)) issues.push({ path: `$.steps.${step.step_id}.target_post_id`, code: "target_post_scope_mismatch" });
  }
  for (const step of p.steps) {
    for (const copy of [step.title, ...(step.capability === "prepare_distribution" ? [step.copy_title] : [])]) {
      if (copy.mode === "part_substitution" && copy.part_source === "creative_series_member") {
        const memberId = p.source.creative_series_member_id;
        if (!memberId || context.verifiedSeriesMemberPartLabels.get(memberId) !== copy.part) issues.push({ path: `$.steps.${step.step_id}.title.part`, code: "unverified_part_value" });
      }
    }
  }
  for (const mediaId of p.source.selected_media_ids) {
    const relation = context.sourceMediaRelations.get(mediaId);
    if (!relation) { issues.push({ path: "$.source.selected_media_ids", code: "source_media_relation_missing" }); continue; }
    if (p.source.kind === "existing_post" && (!p.source.post_id || !relation.post_ids.has(p.source.post_id))) issues.push({ path: "$.source.post_id", code: "source_media_post_mismatch" });
    if (p.source.creative_work_id && !relation.creative_work_ids.has(p.source.creative_work_id)) issues.push({ path: "$.source.creative_work_id", code: "source_media_work_mismatch" });
    if (p.source.creative_series_member_id && !relation.creative_series_member_ids.has(p.source.creative_series_member_id)) issues.push({ path: "$.source.creative_series_member_id", code: "source_media_series_member_mismatch" });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: p };
}

export function validateStepPointer(raw: unknown, creatorId: string, ownedAuthorities: ReadonlyMap<string, { creator_id: string; kind: AuthorityKind }>): ValidationResult<StepPointer> {
  const issues: ValidationIssue[] = [];
  if (!object(raw)) return { ok: false, issues: [{ path: "$", code: "invalid_object" }] };
  exact(raw, ["node_id", "kind", "authority_id", "slot"], "$", issues);
  if (!id(raw.node_id) || !id(raw.authority_id)) issues.push({ path: "$", code: "invalid_id" });
  if (!enumValue(raw.kind, AUTHORITY_KINDS)) issues.push({ path: "$.kind", code: "invalid_authority_kind" });
  if (!enumValue(raw.slot, POINTER_SLOTS)) issues.push({ path: "$.slot", code: "invalid_pointer_slot" });
  const slotKinds: Record<PointerSlot, readonly AuthorityKind[]> = {
    draft: ["autopost_draft"], attention_event: ["schedule_event"], relay_post: ["relay_post"],
    preview_media: ["preview_media"], distribution_plan: ["distribution_plan"],
    variant: ["distribution_variant"], current_attempt: ["distribution_attempt"],
    engagement_event: ["schedule_event"]
  };
  if (enumValue(raw.slot, POINTER_SLOTS) && enumValue(raw.kind, AUTHORITY_KINDS) && !slotKinds[raw.slot].includes(raw.kind)) issues.push({ path: "$.kind", code: "pointer_slot_kind_mismatch" });
  const authority = typeof raw.authority_id === "string" ? ownedAuthorities.get(raw.authority_id) : undefined;
  if (!authority || authority.creator_id !== creatorId || authority.kind !== raw.kind) issues.push({ path: "$.authority_id", code: "authority_scope_or_kind_mismatch" });
  return issues.length ? { ok: false, issues } : { ok: true, value: raw as StepPointer };
}

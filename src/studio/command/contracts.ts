/**
 * Relay Command Layer shared wire contract (P1 freeze).
 * Public API shapes for later slices — not database row shapes.
 *
 * @see docs/studio/relay-command-mcp-build-plans/PRODUCT-CONTRACT.md
 * @see src/goal-cycle/contracts.ts (positive template)
 */

import { DISTRIBUTION_DESTINATIONS } from "../../distribution/platform-destinations.js";
import { getRelayCommandFeatureFlags } from "./flags.js";

export { getRelayCommandFeatureFlags, publicCommandFlags } from "./flags.js";
export type { RelayCommandFeatureFlags } from "./flags.js";

export const RELAY_COMMAND_CONTRACT_VERSION = "relay-command-wire-v1" as const;

/** Frozen capability names for HTTP/MCP later. `publish_external` is never in this list. */
export const COMMAND_CAPABILITY_NAMES = [
  "search_library",
  "resolve_numbered_sequence",
  "preview_collection",
  "create_or_update_collection",
  "set_collection_order",
  "add_post_tags",
  "remove_post_tags",
  "create_saved_filter",
  "preview_post_revision",
  "revise_post",
  "preview_release_plan",
  "create_release_plan",
  "materialize_schedule",
  "prepare_destination_drafts",
  "preview_change_set",
  "apply_change_set",
  "undo_change_set"
] as const;
export type CommandCapabilityName = (typeof COMMAND_CAPABILITY_NAMES)[number];

/** Explicitly rejected by the capability allowlist (P1–P4). */
export const COMMAND_FORBIDDEN_CAPABILITY_NAMES = ["publish_external"] as const;
export type CommandForbiddenCapabilityName =
  (typeof COMMAND_FORBIDDEN_CAPABILITY_NAMES)[number];

export const COMMAND_ERROR_CODES = [
  "COMMAND_VALIDATION",
  "COMMAND_NOT_FOUND",
  "COMMAND_VERSION_CONFLICT",
  "COMMAND_AMBIGUOUS",
  "COMMAND_SEQUENCE_GAP",
  "COMMAND_SEQUENCE_DUPLICATE",
  "COMMAND_WRONG_WRITE_LAYER",
  "COMMAND_GATED_MEDIA",
  "COMMAND_IDEMPOTENT_REPLAY",
  "COMMAND_FORBIDDEN",
  "COMMAND_APPLY_DISABLED",
  "COMMAND_STALE_SELECTION"
] as const;
export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number];

export const COMMAND_GRANT_SCOPES = [
  "library:read",
  "drafts:write",
  "collections:write",
  "schedule:write",
  "command:apply"
] as const;
export type CommandGrantScope = (typeof COMMAND_GRANT_SCOPES)[number];

/** Out of this program. Named so validators can fail closed instead of silently ignoring. */
export const COMMAND_FORBIDDEN_GRANT_SCOPES = ["publish:execute"] as const;

export const COMMAND_RISK_CLASSES = [
  "execute_undo",
  "review",
  "publish_confirm"
] as const;
export type CommandRiskClass = (typeof COMMAND_RISK_CLASSES)[number];

export const COMMAND_CHANGE_SET_STATUSES = [
  "draft",
  "validated",
  "preview_ready",
  "apply_requested",
  "applied",
  "failed",
  "undone"
] as const;
export type CommandChangeSetStatus = (typeof COMMAND_CHANGE_SET_STATUSES)[number];

/** Wire strings matching Prisma `PostSource` without importing the Prisma enum. */
export const COMMAND_POST_SOURCES = ["PATREON", "SUBSCRIBESTAR", "RELAY"] as const;
export type CommandPostSource = (typeof COMMAND_POST_SOURCES)[number];

export const COMMAND_VISIBILITIES = ["visible", "hidden", "review"] as const;
export type CommandVisibility = (typeof COMMAND_VISIBILITIES)[number];

export const COMMAND_WRITE_LAYERS = [
  "presentation",
  "native_version",
  "collection",
  "distribution_plan",
  "schedule_rail"
] as const;
export type CommandWriteLayer = (typeof COMMAND_WRITE_LAYERS)[number];

export const COMMAND_SEQUENCE_TOKEN_KINDS = ["page", "part", "pg", "p"] as const;
export type CommandSequenceTokenKind = (typeof COMMAND_SEQUENCE_TOKEN_KINDS)[number];

export const COMMAND_ANALYTICS_COVERAGE = [
  "weak",
  "ordinary",
  "clustered",
  "unavailable"
] as const;
export type CommandAnalyticsCoverage = (typeof COMMAND_ANALYTICS_COVERAGE)[number];

export const COMMAND_ANALYTICS_CONFIDENCE = [
  "high",
  "medium",
  "low",
  "unknown"
] as const;
export type CommandAnalyticsConfidence = (typeof COMMAND_ANALYTICS_CONFIDENCE)[number];

export const COMMAND_DESTINATION_KEYS = DISTRIBUTION_DESTINATIONS;
export type CommandDestinationKey = (typeof COMMAND_DESTINATION_KEYS)[number];

/**
 * MCP / command session kind is specified here; Prisma `SessionKind` stays `web | extension`
 * until P3 (playground apply uses existing creator session + flags).
 */
export const COMMAND_SESSION_KIND_PROPOSED = "mcp" as const;
export type CommandProposedSessionKind = "web" | "extension" | "mcp";

export const COMMAND_PUBLISH_STATES = ["published", "draft"] as const;
export type CommandPublishState = (typeof COMMAND_PUBLISH_STATES)[number];

export const COMMAND_TEXT_ONLY_POSTS_MODES = ["exclude", "include", "only"] as const;
export type CommandTextOnlyPostsMode = (typeof COMMAND_TEXT_ONLY_POSTS_MODES)[number];

export const COMMAND_SELECTION_MAX_DEPTH = 2;
export const COMMAND_SELECTION_MAX_LEAVES = 8;

export const COMMAND_SELECTION_GROUP_KEYS = ["all", "any", "not"] as const;
export const COMMAND_SELECTION_LEAF_KEYS = [
  "q",
  "tag_ids",
  "title_contains",
  "title_pattern",
  "description_contains",
  "source",
  "visibility",
  "date_from",
  "date_to",
  "collection_id",
  "destination_present",
  "destination_absent",
  "exclude_post_ids",
  "tier_ids",
  "media_type",
  "publish_state",
  "creative_work_id",
  "text_only_posts",
  "numbered_sequence"
] as const;

export const COMMAND_MATCH_EVIDENCE_FIELDS = [
  "q",
  "tag",
  "title",
  "description",
  "source",
  "visibility",
  "collection",
  "tier",
  "media_type",
  "destination",
  "publish_state",
  "creative_work"
] as const;
export type CommandMatchEvidenceField = (typeof COMMAND_MATCH_EVIDENCE_FIELDS)[number];

export type CommandMatchEvidence = {
  post_id: string;
  fields: CommandMatchEvidenceField[];
};

export type CommandSelectionQuery = {
  q?: string;
  tag_ids?: string[];
  title_contains?: string;
  title_pattern?: string;
  description_contains?: string;
  source?: CommandPostSource;
  visibility?: CommandVisibility;
  date_from?: string;
  date_to?: string;
  collection_id?: string;
  destination_present?: CommandDestinationKey[];
  destination_absent?: CommandDestinationKey[];
  exclude_post_ids?: string[];
  tier_ids?: string[];
  media_type?: string;
  publish_state?: CommandPublishState;
  creative_work_id?: string;
  text_only_posts?: CommandTextOnlyPostsMode;
  numbered_sequence?: boolean;
  all?: CommandSelectionQuery[];
  any?: CommandSelectionQuery[];
  not?: CommandSelectionQuery[];
};

export type ResolvedSelection = {
  post_ids: string[];
  /** Human-readable rule, not model prose. */
  explanation: string;
  warnings: string[];
  match_evidence: CommandMatchEvidence[];
  revision: string;
  complete: true;
  creator_id: string;
  created_at: string;
};

/** Compact search hit returned to a model or command harness — never media bytes or PII. */
export type CommandCompactPostRecord = {
  post_id: string;
  title: string;
  tag_ids: string[];
  published_at: string;
  visibility: CommandVisibility;
  source: CommandPostSource | null;
  collection_ids: string[];
  page_number: number | null;
  destination_flags: Partial<Record<CommandDestinationKey, boolean>>;
  member_label: string | null;
};

export type CommandSequenceMember = {
  post_id: string;
  title: string;
  member_label: string | null;
  token_kind: CommandSequenceTokenKind | null;
  number: number | null;
  /** Numeric order key. Cover sorts before page 1; unparsed titles sort after numbered. */
  sort_key: number;
  is_cover: boolean;
};

export type CommandAnalyticsWindowSuggestion = {
  weekday: string | null;
  local_start: string | null;
  local_end: string | null;
  time_zone: string | null;
  /** True when coverage is weak/unavailable and a disclosed fallback window was used. */
  fallback: boolean;
};

/**
 * Prepared analytics fact pack. P2 binds Lab 2 synthetic rows; the model never receives
 * raw metric dumps (`raw_metrics`, `rows`, and similar keys are rejected).
 */
export type CommandAnalyticsFactPack = {
  pack_id: string;
  generated_at: string;
  coverage: CommandAnalyticsCoverage;
  confidence: CommandAnalyticsConfidence;
  window_suggestion: CommandAnalyticsWindowSuggestion;
  summary: string;
  evidence_refs: string[];
};

export type CommandChangeSetOp = {
  op_id: string;
  capability: CommandCapabilityName;
  risk_class: CommandRiskClass;
  target_ids: string[];
  payload: Record<string, unknown>;
};

export type CommandChangeSetEnvelope = {
  change_set_id: string;
  idempotency_key: string;
  instruction: string;
  resolved_post_ids: string[];
  ops: CommandChangeSetOp[];
  expected_revisions: Record<string, string | number>;
  before_snapshot_ref: string | null;
  after_summary: string | null;
  access_implications: string[];
  status: CommandChangeSetStatus;
  created_at: string;
  updated_at: string;
};

export class CommandContractError extends Error {
  public override readonly name = "CommandContractError";
  public constructor(
    public readonly code: CommandErrorCode,
    message: string,
    public readonly details: Array<{ field: string; issue: string }> = []
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const ms = Date.parse(value);
  return !Number.isNaN(ms);
}

function throwValidation(
  message: string,
  details: Array<{ field: string; issue: string }>
): never {
  throw new CommandContractError("COMMAND_VALIDATION", message, details);
}

export function isCommandCapabilityName(value: unknown): value is CommandCapabilityName {
  return (
    typeof value === "string" &&
    (COMMAND_CAPABILITY_NAMES as readonly string[]).includes(value)
  );
}

export function isCommandForbiddenCapabilityName(
  value: unknown
): value is CommandForbiddenCapabilityName {
  return (
    typeof value === "string" &&
    (COMMAND_FORBIDDEN_CAPABILITY_NAMES as readonly string[]).includes(value)
  );
}

export function isCommandErrorCode(value: unknown): value is CommandErrorCode {
  return typeof value === "string" && (COMMAND_ERROR_CODES as readonly string[]).includes(value);
}

export function isCommandGrantScope(value: unknown): value is CommandGrantScope {
  return typeof value === "string" && (COMMAND_GRANT_SCOPES as readonly string[]).includes(value);
}

export function isCommandPostSource(value: unknown): value is CommandPostSource {
  return typeof value === "string" && (COMMAND_POST_SOURCES as readonly string[]).includes(value);
}

export function isCommandVisibility(value: unknown): value is CommandVisibility {
  return typeof value === "string" && (COMMAND_VISIBILITIES as readonly string[]).includes(value);
}

export function isCommandDestinationKey(value: unknown): value is CommandDestinationKey {
  return (
    typeof value === "string" &&
    (COMMAND_DESTINATION_KEYS as readonly string[]).includes(value)
  );
}

export function isCommandPublishState(value: unknown): value is CommandPublishState {
  return typeof value === "string" && (COMMAND_PUBLISH_STATES as readonly string[]).includes(value);
}

export function isCommandTextOnlyPostsMode(value: unknown): value is CommandTextOnlyPostsMode {
  return (
    typeof value === "string" &&
    (COMMAND_TEXT_ONLY_POSTS_MODES as readonly string[]).includes(value)
  );
}

export function isCommandAnalyticsCoverage(value: unknown): value is CommandAnalyticsCoverage {
  return (
    typeof value === "string" &&
    (COMMAND_ANALYTICS_COVERAGE as readonly string[]).includes(value)
  );
}

export function isCommandAnalyticsConfidence(
  value: unknown
): value is CommandAnalyticsConfidence {
  return (
    typeof value === "string" &&
    (COMMAND_ANALYTICS_CONFIDENCE as readonly string[]).includes(value)
  );
}

export function isCommandChangeSetStatus(value: unknown): value is CommandChangeSetStatus {
  return (
    typeof value === "string" &&
    (COMMAND_CHANGE_SET_STATUSES as readonly string[]).includes(value)
  );
}

export function isCommandRiskClass(value: unknown): value is CommandRiskClass {
  return typeof value === "string" && (COMMAND_RISK_CLASSES as readonly string[]).includes(value);
}

/**
 * Allowlist gate used by facade/MCP later. `publish_external` is COMMAND_FORBIDDEN,
 * unknown names are COMMAND_VALIDATION.
 */
export function assertCommandCapabilityAllowed(value: unknown): CommandCapabilityName {
  if (isCommandForbiddenCapabilityName(value)) {
    throw new CommandContractError(
      "COMMAND_FORBIDDEN",
      "Capability is not allowed in this program.",
      [{ field: "capability", issue: String(value) }]
    );
  }
  if (!isCommandCapabilityName(value)) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Unknown command capability.",
      [{ field: "capability", issue: typeof value === "string" ? value : "not_string" }]
    );
  }
  return value;
}

function parseStringArray(
  value: unknown,
  field: string
): { ok: true; value: string[] } | { ok: false; issue: string } {
  if (!Array.isArray(value)) return { ok: false, issue: "array_required" };
  const out: string[] = [];
  for (const [i, item] of value.entries()) {
    if (!isNonEmptyString(item)) {
      return { ok: false, issue: `${field}[${i}]_non_empty_string` };
    }
    out.push(item.trim());
  }
  return { ok: true, value: out };
}

export function validateCommandSelectionQuery(input: unknown): CommandSelectionQuery {
  const parsed = parseSelectionQueryNode(input, 0, "selection");
  const depth = selectionGroupDepth(parsed);
  if (depth > COMMAND_SELECTION_MAX_DEPTH) {
    throwValidation("Invalid selection query.", [
      { field: "selection", issue: `max_depth_${COMMAND_SELECTION_MAX_DEPTH}` }
    ]);
  }
  const leaves = countSelectionLeaves(parsed);
  if (leaves > COMMAND_SELECTION_MAX_LEAVES) {
    throwValidation("Invalid selection query.", [
      { field: "selection", issue: `max_leaves_${COMMAND_SELECTION_MAX_LEAVES}` }
    ]);
  }
  return parsed;
}

/** True when any node asks for drafts — loader may then include unpublished posts. */
export function selectionQueryRequestsDrafts(input: unknown): boolean {
  if (!isRecord(input)) return false;
  if (input.publish_state === "draft") return true;
  for (const key of COMMAND_SELECTION_GROUP_KEYS) {
    const arr = input[key];
    if (Array.isArray(arr) && arr.some((child) => selectionQueryRequestsDrafts(child))) {
      return true;
    }
  }
  return false;
}

const ALLOWED_SELECTION_KEYS = new Set<string>([
  ...COMMAND_SELECTION_LEAF_KEYS,
  ...COMMAND_SELECTION_GROUP_KEYS
]);

function fieldPath(prefix: string, key: string): string {
  return prefix === "selection" ? key : `${prefix}.${key}`;
}

function parseSelectionGroup(
  value: unknown,
  depth: number,
  path: string,
  details: Array<{ field: string; issue: string }>
): CommandSelectionQuery[] | undefined {
  if (!Array.isArray(value)) {
    details.push({ field: path, issue: "array_required" });
    return undefined;
  }
  if (value.length === 0) {
    details.push({ field: path, issue: "empty" });
    return undefined;
  }
  const nextDepth = depth + 1;
  if (nextDepth > COMMAND_SELECTION_MAX_DEPTH) {
    details.push({ field: path, issue: `max_depth_${COMMAND_SELECTION_MAX_DEPTH}` });
  }
  const out: CommandSelectionQuery[] = [];
  for (const [i, child] of value.entries()) {
    try {
      out.push(parseSelectionQueryNode(child, nextDepth, `${path}[${i}]`));
    } catch (err) {
      if (err instanceof CommandContractError && err.code === "COMMAND_VALIDATION") {
        details.push(...err.details);
      } else {
        throw err;
      }
    }
  }
  return out;
}

function parseSelectionQueryNode(
  input: unknown,
  depth: number,
  path: string
): CommandSelectionQuery {
  if (!isRecord(input)) {
    throwValidation("Selection query must be an object.", [
      { field: path, issue: "object_required" }
    ]);
  }
  const details: Array<{ field: string; issue: string }> = [];
  for (const key of Object.keys(input)) {
    if (!ALLOWED_SELECTION_KEYS.has(key)) {
      details.push({ field: fieldPath(path, key), issue: "unknown_key" });
    }
  }
  const out: CommandSelectionQuery = {};

  if (input.q !== undefined) {
    if (typeof input.q !== "string") details.push({ field: fieldPath(path, "q"), issue: "string" });
    else if (input.q.trim()) out.q = input.q.trim();
  }
  if (input.tag_ids !== undefined) {
    const tags = parseStringArray(input.tag_ids, "tag_ids");
    if (!tags.ok) details.push({ field: fieldPath(path, "tag_ids"), issue: tags.issue });
    else out.tag_ids = tags.value;
  }
  if (input.title_contains !== undefined) {
    if (!isNonEmptyString(input.title_contains)) {
      details.push({ field: fieldPath(path, "title_contains"), issue: "non_empty_string" });
    } else {
      out.title_contains = input.title_contains.trim();
    }
  }
  if (input.title_pattern !== undefined) {
    if (!isNonEmptyString(input.title_pattern)) {
      details.push({ field: fieldPath(path, "title_pattern"), issue: "non_empty_string" });
    } else {
      out.title_pattern = input.title_pattern.trim();
    }
  }
  if (input.description_contains !== undefined) {
    if (!isNonEmptyString(input.description_contains)) {
      details.push({ field: fieldPath(path, "description_contains"), issue: "non_empty_string" });
    } else {
      out.description_contains = input.description_contains.trim();
    }
  }
  if (input.source !== undefined) {
    if (!isCommandPostSource(input.source)) {
      details.push({ field: fieldPath(path, "source"), issue: "enum" });
    } else {
      out.source = input.source;
    }
  }
  if (input.visibility !== undefined) {
    if (!isCommandVisibility(input.visibility)) {
      details.push({ field: fieldPath(path, "visibility"), issue: "enum" });
    } else {
      out.visibility = input.visibility;
    }
  }
  if (input.date_from !== undefined) {
    if (typeof input.date_from !== "string" || !isIsoUtcTimestamp(input.date_from)) {
      details.push({ field: fieldPath(path, "date_from"), issue: "iso_utc" });
    } else {
      out.date_from = input.date_from;
    }
  }
  if (input.date_to !== undefined) {
    if (typeof input.date_to !== "string" || !isIsoUtcTimestamp(input.date_to)) {
      details.push({ field: fieldPath(path, "date_to"), issue: "iso_utc" });
    } else {
      out.date_to = input.date_to;
    }
  }
  if (out.date_from && out.date_to && Date.parse(out.date_from) > Date.parse(out.date_to)) {
    details.push({ field: fieldPath(path, "date_from"), issue: "after_date_to" });
  }
  if (input.collection_id !== undefined) {
    if (!isNonEmptyString(input.collection_id)) {
      details.push({ field: fieldPath(path, "collection_id"), issue: "opaque_id" });
    } else {
      out.collection_id = input.collection_id.trim();
    }
  }
  if (input.destination_present !== undefined) {
    const dests = parseStringArray(input.destination_present, "destination_present");
    if (!dests.ok) details.push({ field: fieldPath(path, "destination_present"), issue: dests.issue });
    else {
      const bad = dests.value.filter((d) => !isCommandDestinationKey(d));
      if (bad.length > 0) details.push({ field: fieldPath(path, "destination_present"), issue: "enum" });
      else out.destination_present = dests.value as CommandDestinationKey[];
    }
  }
  if (input.destination_absent !== undefined) {
    const dests = parseStringArray(input.destination_absent, "destination_absent");
    if (!dests.ok) details.push({ field: fieldPath(path, "destination_absent"), issue: dests.issue });
    else {
      const bad = dests.value.filter((d) => !isCommandDestinationKey(d));
      if (bad.length > 0) details.push({ field: fieldPath(path, "destination_absent"), issue: "enum" });
      else out.destination_absent = dests.value as CommandDestinationKey[];
    }
  }
  if (input.exclude_post_ids !== undefined) {
    const ids = parseStringArray(input.exclude_post_ids, "exclude_post_ids");
    if (!ids.ok) details.push({ field: fieldPath(path, "exclude_post_ids"), issue: ids.issue });
    else out.exclude_post_ids = ids.value;
  }
  if (input.tier_ids !== undefined) {
    const tiers = parseStringArray(input.tier_ids, "tier_ids");
    if (!tiers.ok) details.push({ field: fieldPath(path, "tier_ids"), issue: tiers.issue });
    else out.tier_ids = tiers.value;
  }
  if (input.media_type !== undefined) {
    if (!isNonEmptyString(input.media_type)) {
      details.push({ field: fieldPath(path, "media_type"), issue: "non_empty_string" });
    } else {
      out.media_type = input.media_type.trim().toLowerCase();
    }
  }
  if (input.publish_state !== undefined) {
    if (!isCommandPublishState(input.publish_state)) {
      details.push({ field: fieldPath(path, "publish_state"), issue: "enum" });
    } else {
      out.publish_state = input.publish_state;
    }
  }
  if (input.creative_work_id !== undefined) {
    if (!isNonEmptyString(input.creative_work_id)) {
      details.push({ field: fieldPath(path, "creative_work_id"), issue: "opaque_id" });
    } else {
      out.creative_work_id = input.creative_work_id.trim();
    }
  }
  if (input.text_only_posts !== undefined) {
    if (!isCommandTextOnlyPostsMode(input.text_only_posts)) {
      details.push({ field: fieldPath(path, "text_only_posts"), issue: "enum" });
    } else {
      out.text_only_posts = input.text_only_posts;
    }
  }
  if (input.numbered_sequence !== undefined) {
    if (typeof input.numbered_sequence !== "boolean") {
      details.push({ field: fieldPath(path, "numbered_sequence"), issue: "boolean" });
    } else if (input.numbered_sequence) {
      out.numbered_sequence = true;
    }
  }
  if (input.all !== undefined) {
    const group = parseSelectionGroup(input.all, depth, fieldPath(path, "all"), details);
    if (group) out.all = group;
  }
  if (input.any !== undefined) {
    const group = parseSelectionGroup(input.any, depth, fieldPath(path, "any"), details);
    if (group) out.any = group;
  }
  if (input.not !== undefined) {
    const group = parseSelectionGroup(input.not, depth, fieldPath(path, "not"), details);
    if (group) out.not = group;
  }

  if (details.length > 0) {
    throwValidation("Invalid selection query.", details);
  }
  return out;
}

function selectionGroupDepth(query: CommandSelectionQuery): number {
  const kids = [...(query.all ?? []), ...(query.any ?? []), ...(query.not ?? [])];
  if (kids.length === 0) return 0;
  return 1 + Math.max(...kids.map(selectionGroupDepth));
}

function countSelectionLeaves(query: CommandSelectionQuery): number {
  let n = 0;
  for (const key of COMMAND_SELECTION_LEAF_KEYS) {
    if (query[key] !== undefined) n += 1;
  }
  for (const child of [...(query.all ?? []), ...(query.any ?? []), ...(query.not ?? [])]) {
    n += countSelectionLeaves(child);
  }
  return n;
}

const RAW_METRIC_DUMP_KEYS = ["raw_metrics", "rows", "metric_dump", "samples", "timeseries"] as const;

export function validateCommandAnalyticsFactPack(input: unknown): CommandAnalyticsFactPack {
  if (!isRecord(input)) {
    throwValidation("Analytics fact pack must be an object.", [
      { field: "fact_pack", issue: "object_required" }
    ]);
  }
  const details: Array<{ field: string; issue: string }> = [];
  for (const key of RAW_METRIC_DUMP_KEYS) {
    if (key in input) {
      details.push({ field: key, issue: "raw_metric_dump_forbidden" });
    }
  }
  if (!isNonEmptyString(input.pack_id)) {
    details.push({ field: "pack_id", issue: "opaque_id" });
  }
  if (typeof input.generated_at !== "string" || !isIsoUtcTimestamp(input.generated_at)) {
    details.push({ field: "generated_at", issue: "iso_utc" });
  }
  if (!isCommandAnalyticsCoverage(input.coverage)) {
    details.push({ field: "coverage", issue: "enum" });
  }
  if (!isCommandAnalyticsConfidence(input.confidence)) {
    details.push({ field: "confidence", issue: "enum" });
  }
  if (typeof input.summary !== "string") {
    details.push({ field: "summary", issue: "string" });
  }
  if (!Array.isArray(input.evidence_refs)) {
    details.push({ field: "evidence_refs", issue: "array_required" });
  } else {
    for (const [i, ref] of input.evidence_refs.entries()) {
      if (!isNonEmptyString(ref)) {
        details.push({ field: `evidence_refs[${i}]`, issue: "opaque_id" });
      }
    }
  }
  if (!isRecord(input.window_suggestion)) {
    details.push({ field: "window_suggestion", issue: "object_required" });
  } else {
    const w = input.window_suggestion;
    for (const field of ["weekday", "local_start", "local_end", "time_zone"] as const) {
      if (w[field] !== null && w[field] !== undefined && typeof w[field] !== "string") {
        details.push({ field: `window_suggestion.${field}`, issue: "string_or_null" });
      }
    }
    if (typeof w.fallback !== "boolean") {
      details.push({ field: "window_suggestion.fallback", issue: "boolean" });
    }
  }
  if (details.length > 0) {
    throwValidation("Invalid analytics fact pack.", details);
  }
  const w = input.window_suggestion as Record<string, unknown>;
  return {
    pack_id: String(input.pack_id).trim(),
    generated_at: String(input.generated_at),
    coverage: input.coverage as CommandAnalyticsCoverage,
    confidence: input.confidence as CommandAnalyticsConfidence,
    window_suggestion: {
      weekday: w.weekday == null ? null : String(w.weekday),
      local_start: w.local_start == null ? null : String(w.local_start),
      local_end: w.local_end == null ? null : String(w.local_end),
      time_zone: w.time_zone == null ? null : String(w.time_zone),
      fallback: Boolean(w.fallback)
    },
    summary: String(input.summary),
    evidence_refs: (input.evidence_refs as string[]).map((r) => r.trim())
  };
}

export function validateCommandGrantScopes(input: unknown): CommandGrantScope[] {
  if (!Array.isArray(input)) {
    throwValidation("Grant scopes must be an array.", [{ field: "scopes", issue: "array_required" }]);
  }
  const out: CommandGrantScope[] = [];
  for (const [i, scope] of input.entries()) {
    if (
      typeof scope === "string" &&
      (COMMAND_FORBIDDEN_GRANT_SCOPES as readonly string[]).includes(scope)
    ) {
      throw new CommandContractError(
        "COMMAND_FORBIDDEN",
        "Grant scope is not allowed in this program.",
        [{ field: `scopes[${i}]`, issue: scope }]
      );
    }
    if (!isCommandGrantScope(scope)) {
      throwValidation("Unknown grant scope.", [
        { field: `scopes[${i}]`, issue: typeof scope === "string" ? scope : "not_string" }
      ]);
    }
    out.push(scope);
  }
  return out;
}

export function validateCommandChangeSetEnvelope(input: unknown): CommandChangeSetEnvelope {
  if (!isRecord(input)) {
    throwValidation("ChangeSet must be an object.", [{ field: "change_set", issue: "object_required" }]);
  }
  const details: Array<{ field: string; issue: string }> = [];
  if (!isNonEmptyString(input.change_set_id)) details.push({ field: "change_set_id", issue: "opaque_id" });
  if (!isNonEmptyString(input.idempotency_key)) {
    details.push({ field: "idempotency_key", issue: "opaque_id" });
  }
  if (typeof input.instruction !== "string") details.push({ field: "instruction", issue: "string" });
  if (!Array.isArray(input.resolved_post_ids)) {
    details.push({ field: "resolved_post_ids", issue: "array_required" });
  } else {
    for (const [i, id] of input.resolved_post_ids.entries()) {
      if (!isNonEmptyString(id)) details.push({ field: `resolved_post_ids[${i}]`, issue: "opaque_id" });
    }
  }
  if (!isCommandChangeSetStatus(input.status)) details.push({ field: "status", issue: "enum" });
  if (typeof input.created_at !== "string" || !isIsoUtcTimestamp(input.created_at)) {
    details.push({ field: "created_at", issue: "iso_utc" });
  }
  if (typeof input.updated_at !== "string" || !isIsoUtcTimestamp(input.updated_at)) {
    details.push({ field: "updated_at", issue: "iso_utc" });
  }
  if (input.before_snapshot_ref !== null && !isNonEmptyString(input.before_snapshot_ref)) {
    details.push({ field: "before_snapshot_ref", issue: "opaque_id_or_null" });
  }
  if (input.after_summary !== null && typeof input.after_summary !== "string") {
    details.push({ field: "after_summary", issue: "string_or_null" });
  }
  if (!Array.isArray(input.access_implications)) {
    details.push({ field: "access_implications", issue: "array_required" });
  }
  if (!isRecord(input.expected_revisions)) {
    details.push({ field: "expected_revisions", issue: "object_required" });
  }
  if (!Array.isArray(input.ops)) {
    details.push({ field: "ops", issue: "array_required" });
  }

  if (details.length > 0) {
    throwValidation("Invalid ChangeSet envelope.", details);
  }

  const ops: CommandChangeSetOp[] = [];
  for (const [i, rawOp] of (input.ops as unknown[]).entries()) {
    if (!isRecord(rawOp)) {
      throwValidation("Invalid ChangeSet op.", [{ field: `ops[${i}]`, issue: "object_required" }]);
    }
    const capability = assertCommandCapabilityAllowed(rawOp.capability);
    if (!isNonEmptyString(rawOp.op_id)) {
      throwValidation("Invalid ChangeSet op.", [{ field: `ops[${i}].op_id`, issue: "opaque_id" }]);
    }
    if (!isCommandRiskClass(rawOp.risk_class)) {
      throwValidation("Invalid ChangeSet op.", [{ field: `ops[${i}].risk_class`, issue: "enum" }]);
    }
    if (!Array.isArray(rawOp.target_ids) || !rawOp.target_ids.every(isNonEmptyString)) {
      throwValidation("Invalid ChangeSet op.", [
        { field: `ops[${i}].target_ids`, issue: "opaque_id_array" }
      ]);
    }
    if (!isRecord(rawOp.payload)) {
      throwValidation("Invalid ChangeSet op.", [{ field: `ops[${i}].payload`, issue: "object_required" }]);
    }
    ops.push({
      op_id: String(rawOp.op_id).trim(),
      capability,
      risk_class: rawOp.risk_class,
      target_ids: (rawOp.target_ids as string[]).map((id) => id.trim()),
      payload: rawOp.payload
    });
  }

  return {
    change_set_id: String(input.change_set_id).trim(),
    idempotency_key: String(input.idempotency_key).trim(),
    instruction: String(input.instruction),
    resolved_post_ids: (input.resolved_post_ids as string[]).map((id) => id.trim()),
    ops,
    expected_revisions: input.expected_revisions as Record<string, string | number>,
    before_snapshot_ref:
      input.before_snapshot_ref === null ? null : String(input.before_snapshot_ref).trim(),
    after_summary: input.after_summary === null ? null : String(input.after_summary),
    access_implications: (input.access_implications as unknown[]).map((v) => String(v)),
    status: input.status as CommandChangeSetStatus,
    created_at: String(input.created_at),
    updated_at: String(input.updated_at)
  };
}

/** Convenience: apply is off unless the apply flag is explicitly on (preview may still exist). */
export function isCommandApplyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getRelayCommandFeatureFlags(env).apply_enabled;
}

/**
 * Schedule Rail Automations — frozen wire contract (VS0 / B02).
 * Public API shapes for later slices — not database row shapes.
 *
 * @see docs/studio/automation-build-plans/PRODUCT-CONTRACT.md
 * @see docs/studio/automation-build-plans/01-VS0-BASELINE-CONTRACTS.md
 */

export const AUTOMATION_CONTRACT_VERSION = "automations-wire-v1" as const;

export const AUTOMATIONS_FEATURE_ENV = "RELAY_FEATURE_AUTOMATIONS";

export const AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS = 72 as const;

export const AUTOMATION_PRESET_KINDS = [
  "preview_crosspost",
  "delayed_public_release"
] as const;
export type AutomationPresetKind = (typeof AUTOMATION_PRESET_KINDS)[number];

export const AUTOMATION_CONNECTOR_STATUSES = ["active", "paused", "archived"] as const;
export type AutomationConnectorStatus = (typeof AUTOMATION_CONNECTOR_STATUSES)[number];

export const AUTOMATION_SOURCE_KINDS = [
  "latest_patreon_post",
  "triggering_patreon_post"
] as const;
export type AutomationSourceKind = (typeof AUTOMATION_SOURCE_KINDS)[number];

export const AUTOMATION_TRIGGER_KINDS = [
  "scheduled_occurrence",
  "patreon_published"
] as const;
export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGER_KINDS)[number];

/** Extends CreatorScheduleSeries materialization (VS4 adds automation_trigger rows). */
export const AUTOMATION_SERIES_MATERIALIZATION_KINDS = [
  "post_draft",
  "automation_trigger"
] as const;
export type AutomationSeriesMaterializationKind =
  (typeof AUTOMATION_SERIES_MATERIALIZATION_KINDS)[number];

/**
 * Action-run ledger statuses for automation-owned CreatorDistributionRuleRun rows.
 * Base set matches today's Prisma enum; expired|cancelled are VS1 additions for approval TTL.
 */
export const AUTOMATION_RUN_STATUSES = [
  "pending",
  "materialized",
  "completed",
  "failed",
  "skipped",
  "expired",
  "cancelled"
] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const AUTOMATION_SCHEDULE_CADENCES = ["weekly", "monthly"] as const;
export type AutomationScheduleCadence = (typeof AUTOMATION_SCHEDULE_CADENCES)[number];

export const AUTOMATION_DESTINATIONS = [
  "patreon",
  "x",
  "deviantart",
  "bluesky"
] as const;
export type AutomationDestination = (typeof AUTOMATION_DESTINATIONS)[number];

export const AUTOMATION_ERROR_CODES = [
  "AUTOMATION_DISABLED",
  "AUTOMATION_PLAN_REQUIRED",
  "AUTOMATION_NOT_FOUND",
  "AUTOMATION_INVALID_PRESET",
  "AUTOMATION_INVALID_TRIGGER",
  "AUTOMATION_TEMPLATE_NOT_FOUND",
  "AUTOMATION_DESTINATION_UNLINKED",
  "AUTOMATION_NO_ELIGIBLE_POST",
  "AUTOMATION_SOURCE_MEDIA_REQUIRED",
  "AUTOMATION_APPROVAL_EXPIRED",
  "AUTOMATION_VERSION_CONFLICT"
] as const;
export type AutomationErrorCode = (typeof AUTOMATION_ERROR_CODES)[number];

export class AutomationContractError extends Error {
  public override readonly name = "AutomationContractError";
  public constructor(
    message: string,
    public readonly code: AutomationErrorCode,
    public readonly details: Array<{ field: string; issue: string }> = []
  ) {
    super(message);
  }
}

export type AutomationFeatureFlags = {
  enabled: boolean;
};

/**
 * RELAY_FEATURE_AUTOMATIONS defaults OFF (false).
 * Enabled only when env is explicitly 1/true/yes/on.
 */
export function isAutomationsFeatureEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const raw = (env[AUTOMATIONS_FEATURE_ENV] ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getAutomationFeatureFlags(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AutomationFeatureFlags {
  return { enabled: isAutomationsFeatureEnabled(env) };
}

export type AutomationScheduleConfig = {
  cadence: AutomationScheduleCadence;
  /** Interval multiplier (every N weeks/months). Default 1. */
  interval: number;
  /** Local wall-clock HH:mm (24h). */
  local_time: string;
  /** IANA time zone. */
  timezone: string;
  /** Weekly: 0=Sun … 6=Sat. Empty when monthly. */
  weekdays: number[];
  /** Monthly: day-of-month 1–31. Empty when weekly. */
  month_days: number[];
};

export type AutomationConnectorWire = {
  automation_id: string;
  creator_id: string;
  preset_kind: AutomationPresetKind;
  status: AutomationConnectorStatus;
  title: string;
  source_kind: AutomationSourceKind;
  trigger_kind: AutomationTriggerKind;
  schedule: AutomationScheduleConfig | null;
  /** Days after Patreon publish for delayed_public_release. */
  offset_days: number | null;
  target_destinations: AutomationDestination[];
  preview_template_id: string | null;
  schedule_series_id: string | null;
  distribution_rule_id: string;
  series_materialization_kind: AutomationSeriesMaterializationKind | null;
  approval_ttl_hours: number;
  remind_me: boolean;
  /** Conflict-safe patch version (monotonic). */
  version: number;
  next_occurrence_at: string | null;
  latest_run_id: string | null;
  latest_run_status: AutomationRunStatus | null;
  created_at: string;
  updated_at: string;
};

export type AutomationRunHistoryWire = {
  run_id: string;
  automation_id: string;
  creator_id: string;
  status: AutomationRunStatus;
  source_post_id: string | null;
  schedule_occurrence_id: string | null;
  draft_id: string | null;
  materialized_event_id: string | null;
  plan_id: string | null;
  due_at: string;
  expires_at: string | null;
  idempotency_key: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AutomationApprovalContextWire = {
  automation_id: string;
  run_id: string;
  draft_id: string;
  source_post_id: string;
  source_media_id: string | null;
  /** Safe export path/id inputs — never a private signed URL in logs. */
  source_image_export_path: string | null;
  target_destinations: AutomationDestination[];
  /** Opaque validated PreviewTemplateConfigV1 snapshot (JSON object). */
  preview_template_snapshot: Record<string, unknown> | null;
  preview_template_id: string | null;
  status: AutomationRunStatus;
  expires_at: string | null;
  version: number;
  existing_plan_id: string | null;
  existing_attempt_id: string | null;
};

export type AutomationMutationReceiptWire = {
  automation_id: string;
  version: number;
  status: AutomationConnectorStatus;
  client_mutation_key: string | null;
  schedule_series_id: string | null;
  distribution_rule_id: string;
  created: boolean;
};

export type CreateAutomationBody = {
  preset_kind: AutomationPresetKind;
  title?: string | null;
  /** Required for preview_crosspost. */
  schedule?: Partial<AutomationScheduleConfig> | null;
  /** Required for delayed_public_release (default 30 if omitted at service layer after validation). */
  offset_days?: number | null;
  target_destinations: AutomationDestination[];
  preview_template_id?: string | null;
  remind_me?: boolean;
  approval_ttl_hours?: number;
  /** Idempotent create key. */
  client_mutation_key?: string | null;
};

export type PatchAutomationBody = {
  /** Required for conflict detection. */
  version: number;
  status?: "active" | "paused" | "archived";
  title?: string | null;
  schedule?: Partial<AutomationScheduleConfig> | null;
  offset_days?: number | null;
  target_destinations?: AutomationDestination[];
  preview_template_id?: string | null;
  remind_me?: boolean;
  approval_ttl_hours?: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAutomationPresetKind(v: unknown): v is AutomationPresetKind {
  return typeof v === "string" && (AUTOMATION_PRESET_KINDS as readonly string[]).includes(v);
}

export function isAutomationDestination(v: unknown): v is AutomationDestination {
  return typeof v === "string" && (AUTOMATION_DESTINATIONS as readonly string[]).includes(v);
}

export function isAutomationRunStatus(v: unknown): v is AutomationRunStatus {
  return typeof v === "string" && (AUTOMATION_RUN_STATUSES as readonly string[]).includes(v);
}

const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeDestinations(raw: unknown): AutomationDestination[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AutomationContractError("target_destinations is required.", "AUTOMATION_INVALID_PRESET", [
      { field: "target_destinations", issue: "required" }
    ]);
  }
  const out: AutomationDestination[] = [];
  for (const item of raw) {
    if (!isAutomationDestination(item)) {
      throw new AutomationContractError(
        "Invalid destination.",
        "AUTOMATION_DESTINATION_UNLINKED",
        [{ field: "target_destinations", issue: "invalid" }]
      );
    }
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function parseScheduleConfig(
  raw: unknown,
  required: boolean
): AutomationScheduleConfig | null {
  if (raw === null || raw === undefined) {
    if (required) {
      throw new AutomationContractError(
        "schedule is required for preview_crosspost.",
        "AUTOMATION_INVALID_TRIGGER",
        [{ field: "schedule", issue: "required" }]
      );
    }
    return null;
  }
  if (!isPlainObject(raw)) {
    throw new AutomationContractError("Invalid schedule.", "AUTOMATION_INVALID_TRIGGER", [
      { field: "schedule", issue: "invalid" }
    ]);
  }

  const cadence = raw.cadence;
  if (
    typeof cadence !== "string" ||
    !(AUTOMATION_SCHEDULE_CADENCES as readonly string[]).includes(cadence)
  ) {
    throw new AutomationContractError("Invalid schedule cadence.", "AUTOMATION_INVALID_TRIGGER", [
      { field: "schedule.cadence", issue: "invalid" }
    ]);
  }

  const localTime = typeof raw.local_time === "string" ? raw.local_time.trim() : "";
  if (!LOCAL_TIME_RE.test(localTime)) {
    throw new AutomationContractError(
      "schedule.local_time must be HH:mm.",
      "AUTOMATION_INVALID_TRIGGER",
      [{ field: "schedule.local_time", issue: "invalid" }]
    );
  }

  const timezone =
    typeof raw.timezone === "string" && raw.timezone.trim()
      ? raw.timezone.trim()
      : "UTC";

  const intervalRaw = raw.interval;
  const interval =
    intervalRaw === undefined || intervalRaw === null
      ? 1
      : typeof intervalRaw === "number" && Number.isInteger(intervalRaw) && intervalRaw >= 1
        ? intervalRaw
        : NaN;
  if (!Number.isFinite(interval)) {
    throw new AutomationContractError("Invalid schedule interval.", "AUTOMATION_INVALID_TRIGGER", [
      { field: "schedule.interval", issue: "invalid" }
    ]);
  }

  const weekdays = Array.isArray(raw.weekdays)
    ? raw.weekdays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
    : [];
  const monthDays = Array.isArray(raw.month_days)
    ? raw.month_days.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 31)
    : [];

  if (cadence === "weekly" && weekdays.length === 0) {
    throw new AutomationContractError(
      "schedule.weekdays required for weekly cadence.",
      "AUTOMATION_INVALID_TRIGGER",
      [{ field: "schedule.weekdays", issue: "required" }]
    );
  }
  if (cadence === "monthly" && monthDays.length === 0) {
    throw new AutomationContractError(
      "schedule.month_days required for monthly cadence.",
      "AUTOMATION_INVALID_TRIGGER",
      [{ field: "schedule.month_days", issue: "required" }]
    );
  }

  return {
    cadence: cadence as AutomationScheduleCadence,
    interval,
    local_time: localTime,
    timezone,
    weekdays: cadence === "weekly" ? [...new Set(weekdays)].sort((a, b) => a - b) : [],
    month_days: cadence === "monthly" ? [...new Set(monthDays)].sort((a, b) => a - b) : []
  };
}

function parseApprovalTtl(raw: unknown): number {
  if (raw === undefined || raw === null) return AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 24 * 14) {
    throw new AutomationContractError(
      "approval_ttl_hours must be an integer between 1 and 336.",
      "AUTOMATION_INVALID_PRESET",
      [{ field: "approval_ttl_hours", issue: "invalid" }]
    );
  }
  return raw;
}

function defaultTitle(preset: AutomationPresetKind): string {
  return preset === "preview_crosspost"
    ? "Preview & crosspost"
    : "Delayed public release";
}

/**
 * Validate and normalize a create-body into a frozen shape for VS2 service implementation.
 */
export function validateCreateAutomationBody(raw: unknown): {
  preset_kind: AutomationPresetKind;
  title: string;
  source_kind: AutomationSourceKind;
  trigger_kind: AutomationTriggerKind;
  schedule: AutomationScheduleConfig | null;
  offset_days: number | null;
  target_destinations: AutomationDestination[];
  preview_template_id: string | null;
  remind_me: boolean;
  approval_ttl_hours: number;
  client_mutation_key: string | null;
  series_materialization_kind: AutomationSeriesMaterializationKind | null;
} {
  if (!isPlainObject(raw)) {
    throw new AutomationContractError("Invalid create body.", "AUTOMATION_INVALID_PRESET", [
      { field: "body", issue: "required" }
    ]);
  }
  if (!isAutomationPresetKind(raw.preset_kind)) {
    throw new AutomationContractError("Unknown preset_kind.", "AUTOMATION_INVALID_PRESET", [
      { field: "preset_kind", issue: "invalid" }
    ]);
  }

  const destinations = normalizeDestinations(raw.target_destinations);
  const approvalTtl = parseApprovalTtl(raw.approval_ttl_hours);
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 200)
      : defaultTitle(raw.preset_kind);
  const remindMe = raw.remind_me !== false;
  const templateId =
    typeof raw.preview_template_id === "string" && raw.preview_template_id.trim()
      ? raw.preview_template_id.trim()
      : null;
  const mutationKey =
    typeof raw.client_mutation_key === "string" && raw.client_mutation_key.trim()
      ? raw.client_mutation_key.trim().slice(0, 128)
      : null;

  if (raw.preset_kind === "preview_crosspost") {
    if (raw.offset_days !== undefined && raw.offset_days !== null) {
      throw new AutomationContractError(
        "offset_days is not allowed for preview_crosspost.",
        "AUTOMATION_INVALID_TRIGGER",
        [{ field: "offset_days", issue: "forbidden" }]
      );
    }
    if (!templateId) {
      throw new AutomationContractError(
        "preview_template_id is required for preview_crosspost.",
        "AUTOMATION_TEMPLATE_NOT_FOUND",
        [{ field: "preview_template_id", issue: "required" }]
      );
    }
    const schedule = parseScheduleConfig(raw.schedule, true);
    return {
      preset_kind: "preview_crosspost",
      title,
      source_kind: "latest_patreon_post",
      trigger_kind: "scheduled_occurrence",
      schedule,
      offset_days: null,
      target_destinations: destinations,
      preview_template_id: templateId,
      remind_me: remindMe,
      approval_ttl_hours: approvalTtl,
      client_mutation_key: mutationKey,
      series_materialization_kind: "automation_trigger"
    };
  }

  // delayed_public_release
  if (raw.schedule !== undefined && raw.schedule !== null) {
    throw new AutomationContractError(
      "schedule is not allowed for delayed_public_release.",
      "AUTOMATION_INVALID_TRIGGER",
      [{ field: "schedule", issue: "forbidden" }]
    );
  }
  let offsetDays = 30;
  if (raw.offset_days !== undefined && raw.offset_days !== null) {
    if (typeof raw.offset_days !== "number" || !Number.isInteger(raw.offset_days) || raw.offset_days < 0) {
      throw new AutomationContractError(
        "offset_days must be a non-negative integer.",
        "AUTOMATION_INVALID_TRIGGER",
        [{ field: "offset_days", issue: "invalid" }]
      );
    }
    offsetDays = raw.offset_days;
  }

  return {
    preset_kind: "delayed_public_release",
    title,
    source_kind: "triggering_patreon_post",
    trigger_kind: "patreon_published",
    schedule: null,
    offset_days: offsetDays,
    target_destinations: destinations,
    preview_template_id: templateId,
    remind_me: remindMe,
    approval_ttl_hours: approvalTtl,
    client_mutation_key: mutationKey,
    series_materialization_kind: null
  };
}

/**
 * Validate patch body. Does not merge — service applies against current connector.
 */
export function validatePatchAutomationBody(raw: unknown): PatchAutomationBody {
  if (!isPlainObject(raw)) {
    throw new AutomationContractError("Invalid patch body.", "AUTOMATION_INVALID_PRESET", [
      { field: "body", issue: "required" }
    ]);
  }
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) {
    throw new AutomationContractError(
      "version is required for conflict-safe patch.",
      "AUTOMATION_VERSION_CONFLICT",
      [{ field: "version", issue: "required" }]
    );
  }

  const out: PatchAutomationBody = { version: raw.version };

  if (raw.status !== undefined) {
    if (raw.status !== "active" && raw.status !== "paused" && raw.status !== "archived") {
      throw new AutomationContractError("Invalid status.", "AUTOMATION_INVALID_PRESET", [
        { field: "status", issue: "invalid" }
      ]);
    }
    out.status = raw.status;
  }
  if (raw.title !== undefined) {
    out.title =
      raw.title === null
        ? null
        : typeof raw.title === "string"
          ? raw.title.trim().slice(0, 200) || null
          : (() => {
              throw new AutomationContractError("Invalid title.", "AUTOMATION_INVALID_PRESET", [
                { field: "title", issue: "invalid" }
              ]);
            })();
  }
  if (raw.target_destinations !== undefined) {
    out.target_destinations = normalizeDestinations(raw.target_destinations);
  }
  if (raw.preview_template_id !== undefined) {
    out.preview_template_id =
      raw.preview_template_id === null
        ? null
        : typeof raw.preview_template_id === "string" && raw.preview_template_id.trim()
          ? raw.preview_template_id.trim()
          : (() => {
              throw new AutomationContractError(
                "Invalid preview_template_id.",
                "AUTOMATION_TEMPLATE_NOT_FOUND",
                [{ field: "preview_template_id", issue: "invalid" }]
              );
            })();
  }
  if (raw.remind_me !== undefined) {
    if (typeof raw.remind_me !== "boolean") {
      throw new AutomationContractError("Invalid remind_me.", "AUTOMATION_INVALID_PRESET", [
        { field: "remind_me", issue: "invalid" }
      ]);
    }
    out.remind_me = raw.remind_me;
  }
  if (raw.approval_ttl_hours !== undefined) {
    out.approval_ttl_hours = parseApprovalTtl(raw.approval_ttl_hours);
  }
  if (raw.offset_days !== undefined) {
    if (raw.offset_days === null) {
      out.offset_days = null;
    } else if (
      typeof raw.offset_days === "number" &&
      Number.isInteger(raw.offset_days) &&
      raw.offset_days >= 0
    ) {
      out.offset_days = raw.offset_days;
    } else {
      throw new AutomationContractError(
        "offset_days must be a non-negative integer.",
        "AUTOMATION_INVALID_TRIGGER",
        [{ field: "offset_days", issue: "invalid" }]
      );
    }
  }
  if (raw.schedule !== undefined) {
    out.schedule =
      raw.schedule === null ? null : parseScheduleConfig(raw.schedule, true) ?? undefined;
  }

  return out;
}

/** Idempotency key helpers for VS1/VS4 (occurrence vs rule+post). */
export function automationRunIdempotencyKeyForOccurrence(occurrenceId: string): string {
  return `occurrence:${occurrenceId.trim()}`;
}

export function automationRunIdempotencyKeyForRulePost(
  ruleId: string,
  sourcePostId: string
): string {
  return `rule:${ruleId.trim()}:post:${sourcePostId.trim()}`;
}

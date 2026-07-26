/**
 * PMD-060 — Platform revenue telemetry contract (Phase 6).
 * @see docs/platform-revenue-telemetry-contract.md
 */

export const REVENUE_TELEMETRY_VERSION = "1.0" as const;

export const REVENUE_SOURCE_LABELS = [
  "relay_native",
  "patreon_upstream",
  "external_estimate"
] as const;

export type RevenueSourceLabel = (typeof REVENUE_SOURCE_LABELS)[number];

export const REVENUE_EVENT_KINDS = [
  "checkout_started",
  "checkout_completed",
  "checkout_failed",
  "subscription_created",
  "subscription_upgraded",
  "subscription_downgraded",
  "subscription_canceled",
  "refund_issued",
  "payout_settled"
] as const;

export type RevenueEventKind = (typeof REVENUE_EVENT_KINDS)[number];

export const REVENUE_FORBIDDEN_FIELDS = [
  "email",
  "email_norm",
  "password",
  "card_number",
  "pan",
  "cvv",
  "access_token",
  "refresh_token",
  "display_name",
  "full_name"
] as const;

export type RevenueMetricDefinition = {
  key: string;
  label: string;
  definition: string;
  formula: string;
  allowedSourceLabels: readonly RevenueSourceLabel[];
  dashboardStatus: "deferred" | "estimated" | "live";
  eventKinds: readonly RevenueEventKind[];
};

export const REVENUE_METRIC_DEFINITIONS: RevenueMetricDefinition[] = [
  {
    key: "revenue.gross",
    label: "Gross revenue",
    definition: "Relay-native cash collected before provider fees and refunds",
    formula: "SUM(amount_cents) on completed checkout/subscription events minus gross refunds",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["checkout_completed", "subscription_created", "refund_issued"]
  },
  {
    key: "revenue.net",
    label: "Net revenue",
    definition: "Relay-native revenue after provider fees and refunds",
    formula: "gross - fees - refunds (prefer net_amount_cents on events)",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["checkout_completed", "subscription_created", "refund_issued", "payout_settled"]
  },
  {
    key: "revenue.mrr",
    label: "MRR",
    definition: "Monthly recurring revenue from active Relay-native subscriptions",
    formula: "Sum of monthly-normalized active subscription amounts at snapshot",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["subscription_created", "subscription_upgraded", "subscription_downgraded", "subscription_canceled"]
  },
  {
    key: "revenue.arr",
    label: "ARR",
    definition: "Annualized run rate from Relay-native MRR",
    formula: "mrr * 12",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: []
  },
  {
    key: "revenue.arpu",
    label: "ARPU",
    definition: "Net revenue per paying Relay user in period",
    formula: "net_revenue / paying_users",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["checkout_completed", "subscription_created"]
  },
  {
    key: "revenue.churn_rate",
    label: "Churn rate",
    definition: "Canceled Relay-native subscriptions over active subs at period start",
    formula: "subscription_canceled / active_start",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["subscription_canceled"]
  },
  {
    key: "revenue.upgrades",
    label: "Upgrades",
    definition: "Relay-native subscription plan upgrades in period",
    formula: "COUNT(subscription_upgraded)",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["subscription_upgraded"]
  },
  {
    key: "revenue.downgrades",
    label: "Downgrades",
    definition: "Relay-native subscription plan downgrades in period",
    formula: "COUNT(subscription_downgraded)",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["subscription_downgraded"]
  },
  {
    key: "revenue.refunds",
    label: "Refunds",
    definition: "Refund value issued in period",
    formula: "SUM(amount_cents) WHERE event_kind=refund_issued",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["refund_issued"]
  },
  {
    key: "revenue.checkout_started",
    label: "Checkout starts",
    definition: "Checkout sessions initiated",
    formula: "COUNT(checkout_started)",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["checkout_started"]
  },
  {
    key: "revenue.checkout_completed",
    label: "Checkout completions",
    definition: "Successful Relay-native checkouts",
    formula: "COUNT(checkout_completed)",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["checkout_completed"]
  },
  {
    key: "revenue.checkout_failed",
    label: "Checkout failures",
    definition: "Failed Relay-native checkout attempts",
    formula: "COUNT(checkout_failed)",
    allowedSourceLabels: ["relay_native"],
    dashboardStatus: "deferred",
    eventKinds: ["checkout_failed"]
  }
];

export type RevenueEventDefinition = {
  kind: RevenueEventKind;
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  forbiddenFields: readonly string[];
  dashboardMetricKeys: readonly string[];
  allowedSourceLabels: readonly RevenueSourceLabel[];
};

export const REVENUE_EVENT_DEFINITIONS: RevenueEventDefinition[] = [
  {
    kind: "checkout_started",
    requiredFields: ["occurred_at", "source_label", "creator_id"],
    optionalFields: ["checkout_id", "provider", "currency", "status", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: ["revenue.checkout_started"],
    allowedSourceLabels: ["relay_native"]
  },
  {
    kind: "checkout_completed",
    requiredFields: [
      "occurred_at",
      "source_label",
      "creator_id",
      "checkout_id",
      "amount_cents",
      "currency",
      "status"
    ],
    optionalFields: ["provider", "net_amount_cents", "subscription_id", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: ["revenue.gross", "revenue.net", "revenue.checkout_completed", "revenue.arpu"],
    allowedSourceLabels: ["relay_native"]
  },
  {
    kind: "checkout_failed",
    requiredFields: ["occurred_at", "source_label", "creator_id", "checkout_id", "status"],
    optionalFields: ["provider", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: [],
    allowedSourceLabels: ["relay_native"]
  },
  {
    kind: "subscription_created",
    requiredFields: [
      "occurred_at",
      "source_label",
      "creator_id",
      "subscription_id",
      "amount_cents",
      "currency"
    ],
    optionalFields: ["provider", "net_amount_cents", "status", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: ["revenue.gross", "revenue.net", "revenue.mrr", "revenue.arpu"],
    allowedSourceLabels: ["relay_native"]
  },
  {
    kind: "subscription_upgraded",
    requiredFields: ["occurred_at", "source_label", "creator_id", "subscription_id", "amount_cents"],
    optionalFields: ["provider", "currency", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: ["revenue.upgrades", "revenue.mrr"],
    allowedSourceLabels: ["relay_native"]
  },
  {
    kind: "subscription_downgraded",
    requiredFields: ["occurred_at", "source_label", "creator_id", "subscription_id", "amount_cents"],
    optionalFields: ["provider", "currency", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: ["revenue.downgrades", "revenue.mrr"],
    allowedSourceLabels: ["relay_native"]
  },
  {
    kind: "subscription_canceled",
    requiredFields: ["occurred_at", "source_label", "creator_id", "subscription_id"],
    optionalFields: ["provider", "status", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: ["revenue.churn_rate", "revenue.mrr"],
    allowedSourceLabels: ["relay_native"]
  },
  {
    kind: "refund_issued",
    requiredFields: ["occurred_at", "source_label", "amount_cents", "currency"],
    optionalFields: ["creator_id", "checkout_id", "subscription_id", "provider", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: ["revenue.refunds", "revenue.net", "revenue.gross"],
    allowedSourceLabels: ["relay_native"]
  },
  {
    kind: "payout_settled",
    requiredFields: ["occurred_at", "source_label", "creator_id", "net_amount_cents", "currency"],
    optionalFields: ["provider", "payload"],
    forbiddenFields: REVENUE_FORBIDDEN_FIELDS,
    dashboardMetricKeys: ["revenue.net"],
    allowedSourceLabels: ["relay_native"]
  }
];

export function getRevenueEventDefinition(kind: string): RevenueEventDefinition | undefined {
  return REVENUE_EVENT_DEFINITIONS.find((def) => def.kind === kind);
}

export function getRevenueMetricDefinition(key: string): RevenueMetricDefinition | undefined {
  return REVENUE_METRIC_DEFINITIONS.find((def) => def.key === key);
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseOccurredAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function validateRevenueTelemetryEvent(body: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["request body must be a JSON object"] };
  }

  const record = body as Record<string, unknown>;
  const eventKind = readTrimmedString(record.event_kind);
  const sourceLabel = readTrimmedString(record.source_label) as RevenueSourceLabel | undefined;
  const occurredAt = parseOccurredAt(record.occurred_at);

  if (!eventKind) errors.push("missing required field: event_kind");
  if (!sourceLabel) errors.push("missing required field: source_label");
  if (!occurredAt) errors.push("missing or invalid field: occurred_at (ISO-8601 required)");

  if (sourceLabel && !REVENUE_SOURCE_LABELS.includes(sourceLabel)) {
    errors.push(`unsupported source_label: ${sourceLabel}`);
  }

  for (const key of Object.keys(record)) {
    if ((REVENUE_FORBIDDEN_FIELDS as readonly string[]).includes(key)) {
      errors.push(`forbidden field present: ${key}`);
    }
  }

  const payloadRaw = record.payload;
  if (
    payloadRaw !== undefined &&
    payloadRaw !== null &&
    (typeof payloadRaw !== "object" || Array.isArray(payloadRaw))
  ) {
    errors.push("payload must be an object when provided");
  }

  if (errors.length > 0 || !eventKind || !sourceLabel || !occurredAt) {
    return { valid: false, errors };
  }

  const def = getRevenueEventDefinition(eventKind);
  if (!def) {
    return { valid: false, errors: [`unknown event_kind: ${eventKind}`] };
  }

  if (!def.allowedSourceLabels.includes(sourceLabel)) {
    errors.push(`source_label ${sourceLabel} is not allowed for event_kind ${eventKind}`);
  }

  const merged: Record<string, unknown> = {
    ...(payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, unknown>)
      : {}),
    occurred_at: occurredAt.toISOString(),
    source_label: sourceLabel,
    creator_id: readTrimmedString(record.creator_id),
    checkout_id: readTrimmedString(record.checkout_id),
    subscription_id: readTrimmedString(record.subscription_id),
    amount_cents: record.amount_cents,
    net_amount_cents: record.net_amount_cents,
    currency: readTrimmedString(record.currency),
    status: readTrimmedString(record.status),
    provider: readTrimmedString(record.provider)
  };

  for (const field of def.requiredFields) {
    if (merged[field] === undefined || merged[field] === null || merged[field] === "") {
      errors.push(`missing required field: ${field}`);
    }
  }

  for (const forbidden of def.forbiddenFields) {
    if (forbidden in merged) {
      errors.push(`forbidden field present: ${forbidden}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function revenueMetricKeysForRegistrySeed(): string[] {
  return REVENUE_METRIC_DEFINITIONS.map((def) => def.key);
}

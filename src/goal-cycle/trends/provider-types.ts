/**
 * Trend evidence provider contracts (VS3-T01).
 * Fixture-first — no live vendor calls in this module.
 */

export const TREND_PROVIDER_CONTRACT_VERSION = "trend-provider-wire-v1" as const;

export const TREND_EVIDENCE_STRENGTHS = ["strong", "weak", "history_only"] as const;
export type TrendEvidenceStrength = (typeof TREND_EVIDENCE_STRENGTHS)[number];

export const TREND_CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"] as const;
export type TrendConfidence = (typeof TREND_CONFIDENCE_LEVELS)[number];

export const TREND_PROGRESS_CODES = [
  "history_loaded",
  "interest_started",
  "interest_complete",
  "web_started",
  "web_complete",
  "evidence_weak",
  "history_fallback",
  "research_complete",
  "research_failed"
] as const;
export type TrendProgressCode = (typeof TREND_PROGRESS_CODES)[number];

export const TREND_TOPIC_MAX_CHARS = 120;
export const TREND_SUMMARY_MAX_CHARS = 400;
export const TREND_WEB_RESULT_MAX = 5;
export const TREND_INTEREST_POINTS_MAX = 52;

export type TrendResearchRequest = {
  creator_id: string;
  topic: string;
  locale: string | null;
  geography: string | null;
  /** ISO date or labeled window such as "7d" | "30d". */
  window: string;
  creator_context: Record<string, unknown>;
  request_id: string;
  cycle_id?: string | null;
};

export type InterestSeriesPoint = {
  at: string;
  value: number;
};

export type InterestSeriesResult = {
  provider_id: string;
  provider_version: string;
  method: string;
  collected_at: string;
  window: string;
  normalization: string;
  points: InterestSeriesPoint[];
  freshness_seconds: number | null;
  confidence: TrendConfidence;
  evidence_strength: "strong" | "weak" | "unavailable";
  disclaimers: string[];
  /** Never passed to system instructions. */
  raw_provider_excerpt: string | null;
};

export type WebDiscoveryItem = {
  title: string;
  summary: string;
  source_host: string;
  url: string | null;
  published_at: string | null;
  relevance: number;
  freshness_seconds: number | null;
  confidence: TrendConfidence;
  disclaimers: string[];
};

export type WebDiscoveryResult = {
  provider_id: string;
  provider_version: string;
  method: string;
  collected_at: string;
  items: WebDiscoveryItem[];
  freshness_seconds: number | null;
  confidence: TrendConfidence;
  disclaimers: string[];
  raw_provider_excerpt: string | null;
};

export type CreatorHistoryEvidence = {
  window_months: number;
  post_count: number;
  top_signals: string[];
  prompt_safe_summary: string;
  freshness_seconds: number | null;
  confidence: TrendConfidence;
};

export type EvidenceProvenance = {
  source_tier: "interest_series" | "web_discovery" | "creator_history" | "fixture";
  source_id: string;
  method: string;
  collected_at: string;
  approval_state: "fixture" | "approved" | "unapproved" | "disabled";
  freshness_seconds: number | null;
};

export type TrendEvidence = {
  run_id: string;
  creator_id: string;
  human_context: {
    topic: string;
    locale: string | null;
    trend_note: string | null;
  };
  interest_series: InterestSeriesResult | null;
  web_discovery: WebDiscoveryResult | null;
  creator_history: CreatorHistoryEvidence;
  composite_strength: TrendEvidenceStrength;
  confidence: TrendConfidence;
  prompt_safe_summary: string;
  provenance: EvidenceProvenance[];
};

export interface InterestSeriesProvider {
  readonly provider_id: string;
  readonly provider_version: string;
  search(request: TrendResearchRequest): Promise<InterestSeriesResult>;
}

export interface WebDiscoveryProvider {
  readonly provider_id: string;
  readonly provider_version: string;
  search(request: TrendResearchRequest): Promise<WebDiscoveryResult>;
}

export interface TrendEvidenceGateway {
  research(request: TrendResearchRequest): Promise<TrendEvidence>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isTrendConfidence(value: unknown): value is TrendConfidence {
  return typeof value === "string" && (TREND_CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

export function isTrendProgressCode(value: unknown): value is TrendProgressCode {
  return typeof value === "string" && (TREND_PROGRESS_CODES as readonly string[]).includes(value);
}

export type TrendRequestValidation =
  | { ok: true; value: TrendResearchRequest }
  | { ok: false; details: Array<{ field: string; issue: string }> };

/** Runtime validation of research requests (pre-sanitization shape check). */
export function validateTrendResearchRequest(raw: unknown): TrendRequestValidation {
  const details: Array<{ field: string; issue: string }> = [];
  if (!isRecord(raw)) {
    return { ok: false, details: [{ field: "request", issue: "object_required" }] };
  }
  if (typeof raw.creator_id !== "string" || !raw.creator_id.trim()) {
    details.push({ field: "creator_id", issue: "required" });
  }
  if (typeof raw.topic !== "string" || !raw.topic.trim()) {
    details.push({ field: "topic", issue: "required" });
  } else if (raw.topic.length > TREND_TOPIC_MAX_CHARS * 4) {
    details.push({ field: "topic", issue: "too_long" });
  }
  if (typeof raw.window !== "string" || !raw.window.trim()) {
    details.push({ field: "window", issue: "required" });
  }
  if (typeof raw.request_id !== "string" || !raw.request_id.trim()) {
    details.push({ field: "request_id", issue: "required" });
  }
  if (raw.locale != null && typeof raw.locale !== "string") {
    details.push({ field: "locale", issue: "string_or_null" });
  }
  if (raw.geography != null && typeof raw.geography !== "string") {
    details.push({ field: "geography", issue: "string_or_null" });
  }
  if (raw.creator_context != null && !isRecord(raw.creator_context)) {
    details.push({ field: "creator_context", issue: "object_required" });
  }
  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      creator_id: String(raw.creator_id).trim(),
      topic: String(raw.topic),
      locale: raw.locale == null ? null : String(raw.locale).trim() || null,
      geography: raw.geography == null ? null : String(raw.geography).trim() || null,
      window: String(raw.window).trim(),
      creator_context: isRecord(raw.creator_context) ? raw.creator_context : {},
      request_id: String(raw.request_id).trim(),
      cycle_id:
        raw.cycle_id == null || raw.cycle_id === ""
          ? null
          : String(raw.cycle_id).trim()
    }
  };
}

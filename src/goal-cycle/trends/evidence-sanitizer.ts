/**
 * Trend evidence sanitization (VS3-T02).
 * Provider text stays out of system instructions and usage metadata.
 */

import {
  TREND_SUMMARY_MAX_CHARS,
  TREND_TOPIC_MAX_CHARS,
  type TrendResearchRequest
} from "./provider-types.js";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SCRIPT_LIKE = /<\s*\/?\s*(script|iframe|object|embed|style)\b[^>]*>/gi;
const INSTRUCTION_SHAPED =
  /\b(ignore\s+(all\s+)?(previous|prior|above)\s+instructions?|system\s*:|<\/?\s*system\b|you\s+are\s+now|jailbreak|grant\s+unlimited|do\s+not\s+follow\s+relay)\b/gi;

export type SanitizeTopicResult = {
  topic: string;
  quarantined: boolean;
  issues: string[];
};

export function stripControlAndMarkup(text: string): string {
  return text.replace(CONTROL_CHARS, " ").replace(SCRIPT_LIKE, " ").replace(/\s+/g, " ").trim();
}

export function containsInstructionShapedContent(text: string): boolean {
  return instructionShaped(text);
}

/** Reset lastIndex side effects from global regex. */
function instructionShaped(text: string): boolean {
  INSTRUCTION_SHAPED.lastIndex = 0;
  return INSTRUCTION_SHAPED.test(text);
}

export function sanitizeTrendTopic(raw: string): SanitizeTopicResult {
  const issues: string[] = [];
  let topic = stripControlAndMarkup(raw);
  let quarantined = false;
  if (instructionShaped(topic)) {
    quarantined = true;
    issues.push("instruction_shaped");
    topic = topic.replace(INSTRUCTION_SHAPED, "[redacted]");
    INSTRUCTION_SHAPED.lastIndex = 0;
  }
  if (topic.length > TREND_TOPIC_MAX_CHARS) {
    topic = topic.slice(0, TREND_TOPIC_MAX_CHARS);
    issues.push("truncated");
  }
  if (!topic.trim()) {
    topic = "general";
    issues.push("empty_fallback");
  }
  return { topic: topic.trim(), quarantined, issues };
}

export function sanitizePromptSafeSummary(
  raw: string,
  opts?: { quarantined?: boolean }
): string {
  let text = stripControlAndMarkup(raw);
  if (opts?.quarantined || instructionShaped(text)) {
    return "Provider text contained instruction-shaped fragments and was quarantined.";
  }
  if (text.length > TREND_SUMMARY_MAX_CHARS) {
    text = `${text.slice(0, TREND_SUMMARY_MAX_CHARS - 1)}…`;
  }
  return text || "External evidence summary unavailable.";
}

export function sanitizeTrendResearchRequest(request: TrendResearchRequest): {
  request: TrendResearchRequest;
  sanitize: SanitizeTopicResult;
} {
  const topicResult = sanitizeTrendTopic(request.topic);
  const locale =
    request.locale == null
      ? null
      : stripControlAndMarkup(request.locale).slice(0, 32) || null;
  const geography =
    request.geography == null
      ? null
      : stripControlAndMarkup(request.geography).slice(0, 64) || null;
  return {
    request: {
      ...request,
      topic: topicResult.topic,
      locale,
      geography
    },
    sanitize: topicResult
  };
}

/** Safe fields allowed in usage/meta — never raw excerpts. */
export function trendUsageSafeMeta(input: {
  provider_id: string;
  latency_ms?: number;
  cache_hit?: boolean;
  strength: string;
  quarantined?: boolean;
}): Record<string, string | number | boolean> {
  return {
    provider_id: input.provider_id.slice(0, 64),
    ...(typeof input.latency_ms === "number" ? { latency_ms: Math.max(0, Math.floor(input.latency_ms)) } : {}),
    ...(input.cache_hit != null ? { cache_hit: Boolean(input.cache_hit) } : {}),
    strength: input.strength.slice(0, 32),
    ...(input.quarantined ? { quarantined: true } : {})
  };
}

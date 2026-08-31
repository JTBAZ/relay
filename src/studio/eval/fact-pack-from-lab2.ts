/**
 * Prepared Lab 2 analytics fact packs for eval (RC-DF-08).
 * Weak / ordinary coverage is disclosed; never invent a precise window.
 */
import {
  validateCommandAnalyticsFactPack,
  type CommandAnalyticsCoverage,
  type CommandAnalyticsFactPack
} from "../command/contracts.js";
import type { StudioLab2Corpus, StudioLab2MetricPattern } from "../lab2/corpus-spec.js";

function coverageForPatterns(patterns: readonly StudioLab2MetricPattern[]): CommandAnalyticsCoverage {
  if (patterns.includes("forbidden_primary")) return "unavailable";
  if (patterns.includes("weak_promo")) return "weak";
  if (patterns.every((p) => p === "ordinary")) return "ordinary";
  if (patterns.includes("timing_cluster")) return "clustered";
  return "ordinary";
}

export function factPackFromLab2Posts(
  corpus: StudioLab2Corpus,
  postIds: readonly string[],
  packId: string,
  generatedAt = "2026-08-28T00:00:00.000Z"
): CommandAnalyticsFactPack {
  const rows = corpus.metrics.filter((m) => postIds.includes(m.post_id));
  const patterns = rows.map((r) => r.pattern);
  const coverage = coverageForPatterns(patterns);
  const clustered = rows.filter((r) => r.pattern === "timing_cluster");
  const useClusterWindow = coverage === "clustered" && clustered.length > 0;
  const fallback = coverage === "weak" || coverage === "ordinary" || coverage === "unavailable";
  const window = clustered[0];
  const local = useClusterWindow && window?.local_window ? window.local_window.split("-") : [];

  const summary =
    coverage === "weak"
      ? "Synthetic Lab 2 promo evidence is weak; use a disclosed fallback window, not invented precision."
      : coverage === "clustered"
        ? "Lab 2 fact pack shows a Tuesday-evening timing cluster for cited posts."
        : coverage === "unavailable"
          ? "Primary-metric rows are forbidden as timing evidence; fall back without claiming precision."
          : "Ordinary Lab 2 coverage; do not invent a minute-level window.";

  return validateCommandAnalyticsFactPack({
    pack_id: packId,
    generated_at: generatedAt,
    coverage,
    confidence: coverage === "clustered" ? "medium" : coverage === "weak" ? "low" : "unknown",
    window_suggestion: {
      weekday: useClusterWindow ? window?.weekday ?? null : null,
      local_start: useClusterWindow ? local[0] ?? null : null,
      local_end: useClusterWindow ? local[1] ?? null : null,
      time_zone: useClusterWindow ? "America/New_York" : null,
      fallback
    },
    summary,
    evidence_refs: [...postIds]
  });
}

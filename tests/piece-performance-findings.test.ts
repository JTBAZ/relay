import { describe, expect, it } from "vitest";
import { buildPiecePerformanceFacts } from "../src/analytics/piece-performance-facts.js";
import { buildPiecePerformanceFindings, finalizePiecePerformanceAnswer, PiecePerformanceAnswerTooLargeError, validatePiecePerformanceAnswer, validatePiecePerformanceFactsResult, validatePiecePerformanceSelection } from "../src/analytics/piece-performance-findings.js";
import type { PiecePerformanceFacts } from "../src/analytics/piece-performance-facts.js";

const facts: PiecePerformanceFacts = {
  as_of: "2026-10-22T12:00:00.000Z", range: "30d", time_range: { start: "2026-09-22T00:00:00.000Z", end: "2026-10-22T12:00:00.000Z" },
  subject: { kind: "post", id: "post-a", title: "A title", post_ids: ["post-a"] }, subject_fingerprint: "fingerprint", status: "partial",
  metrics: [
    { id: "x-impressions", post_id: "post-a", destination: "x", metric: "impressions", basis: "captured_total", value: 1200, availability: "available", unavailable_reason: null, source: "platform_api", confidence: "high", captured_at: "2026-10-22T10:00:00.000Z", computed_at: null, stale: false, evidence: [{ kind: "snapshot", id: "snapshot-1", observed_at: "2026-10-22T10:00:00.000Z" }] },
    { id: "patreon-comments", post_id: "post-a", destination: "patreon", metric: "comments", basis: "captured_total", value: 0, availability: "available", unavailable_reason: null, source: "third_party", confidence: "medium", captured_at: "2026-10-18T10:00:00.000Z", computed_at: null, stale: true, evidence: [{ kind: "csv_metric", id: "csv-row-1", observed_at: "2026-10-18T10:00:00.000Z" }] },
    { id: "patreon-views", post_id: "post-a", destination: "patreon", metric: "views", basis: "captured_total", value: null, availability: "unavailable", unavailable_reason: "not_collected", source: null, confidence: "unknown", captured_at: null, computed_at: null, stale: true, evidence: [] },
    { id: "x-change", post_id: "post-a", destination: "x", metric: "impressions", basis: "window_change", value: null, availability: "unavailable", unavailable_reason: "incomplete_baseline", source: null, confidence: "unknown", captured_at: null, computed_at: null, stale: true, evidence: [] },
  ],
  coverage: [{ id: "coverage-x", post_id: "post-a", destination: "x", state: "partial", missing_metrics: ["views"] }, { id: "coverage-patreon", post_id: "post-a", destination: "patreon", state: "partial", missing_metrics: ["views"] }], source_failures: []
};

describe("piece performance findings", () => {
  it("renders values only from cited facts, preserves real zero, and keeps stale and missing notices mandatory", () => {
    const prepared = buildPiecePerformanceFindings(facts);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const answer = finalizePiecePerformanceAnswer(facts, prepared.findings, { kind: "performance_answer", summary_finding_ids: [prepared.findings.find(finding => finding.code === "recorded_activity")!.id, prepared.findings.find(finding => finding.code === "response_observed")!.id], insight_finding_ids: [] }, { status: "ai_selected", reason: null });
    expect(answer.summary).toContain("1,200");
    expect(answer.findings.some(finding => finding.text.includes("0 comments"))).toBe(true);
    expect(answer.findings.some(finding => finding.code === "coverage_gap")).toBe(true);
    expect(answer.findings.some(finding => finding.code === "stale_observations")).toBe(true);
    expect(answer.metrics.find(metric => metric.id === "patreon-views")?.value).toBeNull();
    expect(answer.findings.every(finding => finding.metric_fact_ids.every(id => facts.metrics.some(metric => metric.id === id)) && finding.coverage_refs.every(id => facts.coverage.some(row => row.id === id)))).toBe(true);
    const failureOnly: PiecePerformanceFacts = { ...facts, metrics: [facts.metrics[0]!], coverage: [{ ...facts.coverage[0]!, state: "observed", missing_metrics: [] }], source_failures: ["csv"] };
    const failureFinding = buildPiecePerformanceFindings(failureOnly);
    expect(failureFinding.ok && failureFinding.findings.find(item => item.code === "coverage_gap")?.text).toContain("Some evidence sources could not be read");
    expect(failureFinding.ok && failureFinding.findings.find(item => item.code === "coverage_gap")?.text).not.toContain("unavailable");
  });

  it("reports reach without responses only when all three facts share one capture", () => {
    const aligned = {
      ...facts,
      metrics: [
        { ...facts.metrics[0]!, metric: "impressions" as const, value: 1200 },
        { ...facts.metrics[0]!, id: "likes-zero", metric: "likes" as const, value: 0 },
        { ...facts.metrics[0]!, id: "comments-zero", metric: "comments" as const, value: 0 },
      ],
      coverage: [{ ...facts.coverage[0]!, state: "observed" as const, missing_metrics: [] }],
      status: "complete" as const,
    };
    const prepared = buildPiecePerformanceFindings(aligned);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.findings.find(item => item.code === "reach_without_recorded_response")?.text).toContain("same capture");
    const splitTime = { ...aligned, metrics: aligned.metrics.map((fact, index) => index === 2 ? { ...fact, captured_at: "2026-10-22T11:00:00.000Z" } : fact) };
    const split = buildPiecePerformanceFindings(splitTime);
    expect(split.ok && split.findings.some(item => item.code === "reach_without_recorded_response")).toBe(false);
  });

  it("validates exact keys, bounds, membership, and duplicate IDs", () => {
    const ids = ["a", "b", "c", "d"];
    expect(validatePiecePerformanceSelection({ kind: "performance_answer", summary_finding_ids: ["a"], insight_finding_ids: ["b"] }, ids, false)).toEqual({ kind: "performance_answer", summary_finding_ids: ["a"], insight_finding_ids: ["b"] });
    for (const invalid of [
      { kind: "performance_answer", summary_finding_ids: ["x"], insight_finding_ids: [] },
      { kind: "performance_answer", summary_finding_ids: ["a", "a"], insight_finding_ids: [] },
      { kind: "performance_answer", summary_finding_ids: ["a"], insight_finding_ids: ["a"] },
      { kind: "performance_answer", summary_finding_ids: ["a"], insight_finding_ids: ["b"], summary: "invented" },
      { kind: "performance_answer", summary_finding_ids: ["a", "b", "c", "d"], insight_finding_ids: [] },
      { kind: "performance_answer", summary_finding_ids: [], insight_finding_ids: [] },
    ]) expect(() => validatePiecePerformanceSelection(invalid, ids, false)).toThrow();
    expect(validatePiecePerformanceSelection({ kind: "performance_answer", summary_finding_ids: [], insight_finding_ids: [] }, ids, true).summary_finding_ids).toEqual([]);
  });

  it("rejects malformed metric values, evidence, and oversized facts at the adapter boundary", () => {
    expect(validatePiecePerformanceFactsResult({ ok: true, facts })).toEqual({ ok: true, facts });
    expect(validatePiecePerformanceFactsResult({ ok: true, facts: { ...facts, metrics: [{ ...facts.metrics[0], value: -1 }] } })).toEqual({ ok: false, code: "INVALID_EVIDENCE" });
    expect(validatePiecePerformanceFactsResult({ ok: true, facts: { ...facts, metrics: [{ ...facts.metrics[0], evidence: [] }] } })).toEqual({ ok: false, code: "INVALID_EVIDENCE" });
    expect(validatePiecePerformanceFactsResult({ ok: true, facts: { ...facts, as_of: "tomorrow" } })).toEqual({ ok: false, code: "INVALID_EVIDENCE" });
    expect(validatePiecePerformanceFactsResult({ ok: true, facts: { ...facts, time_range: { start: facts.time_range.end, end: facts.time_range.start } } })).toEqual({ ok: false, code: "INVALID_EVIDENCE" });
    expect(validatePiecePerformanceFactsResult({ ok: true, facts: { ...facts, metrics: [{ ...facts.metrics[0]!, captured_at: "2026-10-23T10:00:00.000Z" }] } })).toEqual({ ok: false, code: "INVALID_EVIDENCE" });
    expect(validatePiecePerformanceFactsResult({ ok: true, facts: { ...facts, status: "complete", source_failures: ["csv"] } })).toEqual({ ok: false, code: "INVALID_EVIDENCE" });
  });

  it("accepts actual SPP-01 Relay period facts carrying more than eight daily evidence references", async () => {
    const postId = "p".repeat(200);
    const events = Array.from({ length: 9 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 9, index + 1));
      return { postId, metric: "views", day, eventName: "comment_created", count: 2n, observedAt: new Date(day.getTime() + 12 * 60 * 60 * 1000) };
    });
    const prisma = {
      tenant: { findUnique: async () => ({ id: "tenant-a" }) },
      post: { findFirst: async (args: { where: { id: string } }) => ({ id: args.where.id, versions: [{ title: "A title" }] }) },
      platformInstance: { findMany: async () => [] },
      $queryRaw: async (query: { sql?: string }) => query.sql?.includes("platform_telemetry_events") ? events.map(row => ({ ...row, metric: "comments" })) : []
    } as never;
    const result = await buildPiecePerformanceFacts(prisma, "creator-a", { selectedPostIds: [postId], range: "30d", destination: "relay", asOf: new Date("2026-10-22T12:00:00.000Z") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const checked = validatePiecePerformanceFactsResult({ ok: true, facts: result.facts });
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      const commentChange = checked.facts.metrics.find(metric => metric.destination === "relay" && metric.metric === "comments" && metric.basis === "window_change");
      expect(commentChange?.evidence).toHaveLength(9);
      expect(commentChange?.evidence[0]?.id.length).toBeGreaterThan(240);
      expect(buildPiecePerformanceFindings(checked.facts).ok).toBe(true);
    }
  });

  it("returns deterministic no-data text without inventing any count", () => {
    const empty: PiecePerformanceFacts = { ...facts, status: "no_data", metrics: facts.metrics.map(metric => ({ ...metric, availability: "unavailable", value: null, unavailable_reason: "not_collected", evidence: [] })), source_failures: [] };
    const prepared = buildPiecePerformanceFindings(empty);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const answer = finalizePiecePerformanceAnswer(empty, prepared.findings, null, { status: "deterministic", reason: "no_data" });
    expect(answer.summary).toContain("No recorded performance observations");
    expect(answer.summary).toContain("metric");
    expect(answer.summary).not.toContain("1,200");
    expect(answer.synthesis).toEqual({ status: "deterministic", reason: "no_data" });
  });

  it("accepts JSONB-reordered finding keys and rejects oversized persisted attachments", () => {
    const empty: PiecePerformanceFacts = { ...facts, status: "no_data", metrics: [], coverage: [], source_failures: [] };
    const prepared = buildPiecePerformanceFindings(empty);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const answer = finalizePiecePerformanceAnswer(empty, prepared.findings, null, { status: "deterministic", reason: "no_data" });
    const reordered = structuredClone(answer);
    if (reordered.findings[0]) {
      const finding = reordered.findings[0];
      reordered.findings[0] = { coverage_refs: finding.coverage_refs, text: finding.text, code: finding.code, metric_fact_ids: finding.metric_fact_ids, id: finding.id };
    }
    expect(validatePiecePerformanceAnswer(reordered)).toBe(true);
    expect(validatePiecePerformanceAnswer({ ...answer, summary: "x".repeat(65 * 1024) })).toBe(false);
  });

  it("enforces the final answer byte bound after facts validate", () => {
    let tooLarge: PiecePerformanceFacts | undefined;
    for (let count = 1; count <= 80; count++) {
      const candidate = { ...facts, metrics: [{ ...facts.metrics[0]!, evidence: Array.from({ length: count }, (_, index) => ({ kind: "snapshot" as const, id: `${String(index).padStart(3, "0")}${"r".repeat(1021)}`, observed_at: facts.as_of })) }] };
      if (!validatePiecePerformanceFactsResult({ ok: true, facts: candidate }).ok) break;
      const prepared = buildPiecePerformanceFindings(candidate);
      if (!prepared.ok) continue;
      try { finalizePiecePerformanceAnswer(candidate, prepared.findings, null, { status: "deterministic", reason: "provider_unavailable" }); }
      catch (error) { expect(error).toBeInstanceOf(PiecePerformanceAnswerTooLargeError); tooLarge = candidate; break; }
    }
    expect(tooLarge).toBeDefined();
  });
});

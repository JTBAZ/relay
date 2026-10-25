import { createHash } from "node:crypto";
import type { PiecePerformanceFacts, PiecePerformanceMetricFact } from "./piece-performance-facts.js";
import { DISTRIBUTION_DESTINATIONS } from "../distribution/platform-destinations.js";

export type PerformanceFinding = {
  id: string;
  code: "recorded_activity" | "recorded_change" | "response_observed" | "reach_without_recorded_response" | "coverage_gap" | "stale_observations";
  text: string;
  metric_fact_ids: string[];
  coverage_refs: string[];
};
export type PiecePerformanceAnswer = {
  v: 1;
  kind: "piece_performance";
  report_id: string;
  status: PiecePerformanceFacts["status"];
  subject: PiecePerformanceFacts["subject"];
  as_of: string;
  range: PiecePerformanceFacts["range"];
  time_range: PiecePerformanceFacts["time_range"];
  destination: string | null;
  metrics: PiecePerformanceFacts["metrics"];
  coverage: PiecePerformanceFacts["coverage"];
  source_failures: PiecePerformanceFacts["source_failures"];
  findings: PerformanceFinding[];
  summary: string;
  synthesis: { status: "ai_selected" | "deterministic"; reason: "no_data" | "provider_unavailable" | "invalid_output" | "budget" | "timeout" | null };
  links: Array<{ kind: "view_analytics"; href: string }>;
};
export type PerformanceSelection = { kind: "performance_answer"; summary_finding_ids: string[]; insight_finding_ids: string[] };
export type FindingsResult = { ok: true; findings: PerformanceFinding[]; mandatory_finding_ids: string[] } | { ok: false; code: "TOO_BROAD" | "INVALID_EVIDENCE" };
export type ValidatedFactsResult = { ok: true; facts: PiecePerformanceFacts } | { ok: false; code: string };
export class PiecePerformanceAnswerTooLargeError extends Error {
  constructor() { super("Performance answer exceeds its response bound."); this.name = "PiecePerformanceAnswerTooLargeError"; }
}

const DESTINATIONS = new Set<string>([...DISTRIBUTION_DESTINATIONS, "relay"]);
const METRICS = new Set(["impressions", "seen", "views", "likes", "comments"]);
const SOURCES = new Set(["platform_api", "extension_dom", "third_party", "public_scrape", "manual"]);
const BASES = new Set(["captured_total", "window_change"]);
const UNAVAILABLE_REASONS = new Set(["not_collected", "unknown_period", "ambiguous_link", "incomplete_baseline", "source_unavailable"]);
const COVERAGE_STATES = new Set(["observed", "partial", "no_observations", "unlinked", "unavailable"]);
const EVIDENCE_KINDS = new Set(["snapshot", "csv_metric", "daily_rollup", "relay_aggregate"]);
const FACT_KEYS = ["id", "post_id", "destination", "metric", "basis", "value", "availability", "unavailable_reason", "source", "confidence", "captured_at", "computed_at", "stale", "evidence"];

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
function id(value: unknown): value is string { return typeof value === "string" && value.length >= 1 && value.length <= 240 && value.trim() === value; }
function evidenceId(value: unknown): value is string { return typeof value === "string" && value.length >= 1 && value.length <= 1024 && value.trim() === value; }
function iso(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function isCount(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 24); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function validMetricFact(value: unknown, postIds: Set<string>): value is PiecePerformanceMetricFact {
  if (!exactKeys(value, FACT_KEYS)) return false;
  const fact = value as unknown as PiecePerformanceMetricFact;
  if (!id(fact.id) || !postIds.has(fact.post_id) || !DESTINATIONS.has(fact.destination) || !METRICS.has(fact.metric) || !BASES.has(fact.basis) ||
    !["available", "unavailable"].includes(fact.availability) || !["high", "medium", "low", "unknown"].includes(fact.confidence) || typeof fact.stale !== "boolean" ||
    (fact.source !== null && !SOURCES.has(fact.source)) || (fact.captured_at !== null && !iso(fact.captured_at)) || (fact.computed_at !== null && !iso(fact.computed_at)) || !Array.isArray(fact.evidence)) return false;
  if (fact.availability === "available" ? !isCount(fact.value) || fact.unavailable_reason !== null || fact.evidence.length === 0 : fact.value !== null || !UNAVAILABLE_REASONS.has(String(fact.unavailable_reason))) return false;
  return fact.evidence.every((ref) => exactKeys(ref, ["kind", "id", "observed_at"]) && EVIDENCE_KINDS.has(String(ref.kind)) && evidenceId(ref.id) && (ref.observed_at === null || iso(ref.observed_at)));
}

/** Validates the injected authenticated adapter result before facts reach a renderer or model. */
export function validatePiecePerformanceFactsResult(value: unknown): ValidatedFactsResult {
  if (!exactKeys(value, ["ok", "facts"]) || value.ok !== true) {
    if (exactKeys(value, ["ok", "code"]) && value.ok === false && ["INVALID_SELECTION", "INVALID_ARGUMENT", "NOT_FOUND", "TOO_BROAD", "SOURCE_UNAVAILABLE"].includes(String(value.code))) return { ok: false, code: String(value.code) };
    return { ok: false, code: "INVALID_EVIDENCE" };
  }
  const facts = value.facts;
  if (!exactKeys(facts, ["as_of", "range", "time_range", "subject", "subject_fingerprint", "status", "metrics", "coverage", "source_failures"])) return { ok: false, code: "INVALID_EVIDENCE" };
  const candidate = facts as unknown as PiecePerformanceFacts;
  if (!iso(candidate.as_of) || !["7d", "30d", "90d"].includes(candidate.range) || !exactKeys(candidate.time_range, ["start", "end"]) || !iso(candidate.time_range.start) || !iso(candidate.time_range.end) || Date.parse(candidate.time_range.start) > Date.parse(candidate.time_range.end) || Date.parse(candidate.time_range.end) > Date.parse(candidate.as_of) ||
    !exactKeys(candidate.subject, ["kind", "id", "title", "post_ids"]) || !["post", "work"].includes(candidate.subject.kind) || !id(candidate.subject.id) || typeof candidate.subject.title !== "string" || candidate.subject.title.length > 2000 ||
    !Array.isArray(candidate.subject.post_ids) || candidate.subject.post_ids.length < 1 || candidate.subject.post_ids.length > 16 || candidate.subject.post_ids.some((postId) => !id(postId)) ||
    !id(candidate.subject_fingerprint) || !["complete", "partial", "no_data"].includes(candidate.status) || !Array.isArray(candidate.metrics) || candidate.metrics.length > 1024 || !Array.isArray(candidate.coverage) || candidate.coverage.length > 512 || !Array.isArray(candidate.source_failures)) return { ok: false, code: "INVALID_EVIDENCE" };
  const postIds = new Set(candidate.subject.post_ids);
  if (postIds.size !== candidate.subject.post_ids.length) return { ok: false, code: "INVALID_EVIDENCE" };
  const metricIds = new Set<string>();
  for (const metric of candidate.metrics) {
    if (!validMetricFact(metric, postIds) || metricIds.has(metric.id) || (metric.captured_at !== null && Date.parse(metric.captured_at) > Date.parse(candidate.as_of)) || (metric.computed_at !== null && Date.parse(metric.computed_at) > Date.parse(candidate.as_of)) || metric.evidence.some(ref => ref.observed_at !== null && Date.parse(ref.observed_at) > Date.parse(candidate.as_of))) return { ok: false, code: "INVALID_EVIDENCE" };
    metricIds.add(metric.id);
  }
  const coverageIds = new Set<string>();
  for (const row of candidate.coverage) {
    if (!exactKeys(row, ["id", "post_id", "destination", "state", "missing_metrics"]) || !id(row.id) || !postIds.has(String(row.post_id)) || !DESTINATIONS.has(String(row.destination)) || !COVERAGE_STATES.has(String(row.state)) || !Array.isArray(row.missing_metrics) || row.missing_metrics.length > 5 || row.missing_metrics.some((metric) => !METRICS.has(String(metric))) || coverageIds.has(row.id as string)) return { ok: false, code: "INVALID_EVIDENCE" };
    coverageIds.add(row.id as string);
  }
  if (candidate.source_failures.some((source) => !["snapshots", "csv", "relay_events"].includes(String(source))) || new Set(candidate.source_failures).size !== candidate.source_failures.length) return { ok: false, code: "INVALID_EVIDENCE" };
  if (candidate.metrics.some((metric) => metric.availability === "available") && candidate.status === "no_data") return { ok: false, code: "INVALID_EVIDENCE" };
  if (candidate.status === "complete" && (candidate.metrics.some(metric => metric.availability === "unavailable") || candidate.source_failures.length > 0)) return { ok: false, code: "INVALID_EVIDENCE" };
  try { if (Buffer.byteLength(JSON.stringify(value), "utf8") > 64 * 1024) return { ok: false, code: "TOO_BROAD" }; } catch { return { ok: false, code: "INVALID_EVIDENCE" }; }
  return { ok: true, facts: candidate };
}

function fmt(value: number): string { return value.toLocaleString("en-US"); }
function finding(code: PerformanceFinding["code"], text: string, metricIds: string[], coverageRefs: string[] = []): PerformanceFinding {
  const refs = [...new Set(metricIds)].sort();
  const coverage = [...new Set(coverageRefs)].sort();
  return { id: `pfnd_${digest(`${code}\0${refs.join("\0")}\0${coverage.join("\0")}`)}`, code, text, metric_fact_ids: refs, coverage_refs: coverage };
}

/** Converts every available fact into a bounded set of deterministic, cited candidate findings. */
export function buildPiecePerformanceFindings(facts: PiecePerformanceFacts): FindingsResult {
  const valid = validatePiecePerformanceFactsResult({ ok: true, facts });
  if (!valid.ok) return { ok: false, code: valid.code === "TOO_BROAD" ? "TOO_BROAD" : "INVALID_EVIDENCE" };
  const findings: PerformanceFinding[] = [];
  const available = facts.metrics.filter((fact) => fact.availability === "available");
  const makeText = (rows: PiecePerformanceMetricFact[], basis: PiecePerformanceMetricFact["basis"]) => rows.map((fact) => {
    const postIndex = facts.subject.post_ids.indexOf(fact.post_id) + 1;
    const value = fmt(fact.value as number);
    const verb = basis === "captured_total" ? "recorded" : `recorded a ${facts.range} change of`;
    const label = basis === "captured_total" ? `${value} ${fact.metric}` : `${value} ${fact.metric}`;
    const capture = fact.captured_at ? ` on ${fact.captured_at}` : "; capture time unavailable";
    const destination = platformName(fact.destination);
    return `${destination} ${verb} ${label} for piece ${postIndex}${capture}.`;
  }).join(" ");
  for (const metric of ["impressions", "seen", "views"] as const) {
    const total = available.filter((fact) => fact.metric === metric && fact.basis === "captured_total");
    const change = available.filter((fact) => fact.metric === metric && fact.basis === "window_change");
    if (total.length) findings.push(finding("recorded_activity", makeText(total, "captured_total"), total.map((fact) => fact.id)));
    if (change.length) findings.push(finding("recorded_change", makeText(change, "window_change"), change.map((fact) => fact.id)));
  }
  for (const metric of ["likes", "comments"] as const) {
    const total = available.filter((fact) => fact.metric === metric && fact.basis === "captured_total");
    const change = available.filter((fact) => fact.metric === metric && fact.basis === "window_change");
    if (total.length) findings.push(finding("response_observed", makeText(total, "captured_total"), total.map((fact) => fact.id)));
    if (change.length) findings.push(finding("recorded_change", makeText(change, "window_change"), change.map((fact) => fact.id)));
  }
  const reachTuples = new Map<string, PiecePerformanceMetricFact[]>();
  for (const reach of available.filter((fact) => ["impressions", "seen", "views"].includes(fact.metric) && fact.basis === "captured_total" && (fact.value ?? 0) > 0 && fact.source && fact.captured_at)) {
    const responses = ["likes", "comments"].map((metric) => available.find((fact) => fact.post_id === reach.post_id && fact.destination === reach.destination && fact.metric === metric && fact.basis === "captured_total" && fact.value === 0 && fact.source === reach.source && fact.captured_at === reach.captured_at));
    if (!responses[0] || !responses[1]) continue;
    const key = `${reach.post_id}\0${reach.destination}\0${reach.source}\0${reach.captured_at}`;
    const rows = reachTuples.get(key) ?? [reach, responses[0], responses[1]];
    reachTuples.set(key, rows);
  }
  for (const rows of reachTuples.values()) {
    const [reach, likes, comments] = rows;
    if (!reach || !likes || !comments) continue;
    const destination = platformName(reach.destination);
    const postIndex = facts.subject.post_ids.indexOf(reach.post_id) + 1;
    findings.push(finding("reach_without_recorded_response", `${destination} recorded ${fmt(reach.value as number)} ${reach.metric}, 0 likes, and 0 comments for piece ${postIndex} in the same capture on ${reach.captured_at}.`, rows.map((fact) => fact.id)));
  }
  const unavailable = facts.metrics.filter((fact) => fact.availability === "unavailable");
  const coverageGaps = facts.coverage.filter((row) => row.state !== "observed" || row.missing_metrics.length > 0);
  if (unavailable.length || coverageGaps.length || facts.source_failures.length) findings.push(finding("coverage_gap", facts.source_failures.length ? "Some evidence sources could not be read, so this answer may be incomplete." : "Some metrics or periods have no recorded value. See the metric rows for details.", unavailable.map((fact) => fact.id), coverageGaps.map((row) => row.id)));
  const stale = facts.metrics.filter((fact) => fact.stale && fact.availability === "available");
  if (stale.length) findings.push(finding("stale_observations", "Some recorded values are older than 48 hours or have no capture time. Check each metric's observation time.", stale.map((fact) => fact.id)));
  if (findings.length > 16) return { ok: false, code: "TOO_BROAD" };
  const mandatory = findings.filter((item) => item.code === "coverage_gap" || item.code === "stale_observations").map((item) => item.id);
  if (Buffer.byteLength(JSON.stringify(findings), "utf8") > 16 * 1024) return { ok: false, code: "TOO_BROAD" };
  return { ok: true, findings, mandatory_finding_ids: mandatory };
}

function platformName(destination: string): string {
  return destination === "x" ? "X" : destination === "deviantart" ? "DeviantArt" : destination === "bluesky" ? "Bluesky" : destination === "patreon" ? "Patreon" : "Relay";
}

/** Exact model selection validation; model text, metrics and citations are not accepted. */
export function validatePiecePerformanceSelection(value: unknown, candidateIds: string[], noData: boolean): PerformanceSelection {
  if (!exactKeys(value, ["kind", "summary_finding_ids", "insight_finding_ids"]) || value.kind !== "performance_answer" || !Array.isArray(value.summary_finding_ids) || !Array.isArray(value.insight_finding_ids) ||
    value.summary_finding_ids.length > 3 || value.insight_finding_ids.length > 3 || (!noData && value.summary_finding_ids.length < 1) || (noData && value.summary_finding_ids.length !== 0)) throw new Error("Invalid performance selection.");
  const validIds = new Set(candidateIds);
  for (const ids of [value.summary_finding_ids, value.insight_finding_ids]) {
    if (ids.some((item) => typeof item !== "string" || !validIds.has(item)) || new Set(ids).size !== ids.length) throw new Error("Invalid performance selection.");
  }
  if (new Set([...value.summary_finding_ids, ...value.insight_finding_ids]).size !== value.summary_finding_ids.length + value.insight_finding_ids.length) throw new Error("Invalid performance selection.");
  return { kind: "performance_answer", summary_finding_ids: [...value.summary_finding_ids] as string[], insight_finding_ids: [...value.insight_finding_ids] as string[] };
}

export function finalizePiecePerformanceAnswer(
  facts: PiecePerformanceFacts,
  candidates: PerformanceFinding[],
  selection: PerformanceSelection | null,
  synthesis: PiecePerformanceAnswer["synthesis"],
  destination: string | null = null,
  mandatoryIds?: string[]
): PiecePerformanceAnswer {
  const chosen = selection ?? {
    kind: "performance_answer" as const,
    summary_finding_ids: facts.status === "no_data" ? [] : candidates.filter((item) => item.code !== "coverage_gap" && item.code !== "stale_observations").slice(0, 3).map((item) => item.id),
    insight_finding_ids: []
  };
  const mandatory = mandatoryIds ?? candidates.filter((item) => item.code === "coverage_gap" || item.code === "stale_observations").map((item) => item.id);
  const selectedIds = [...new Set([...chosen.summary_finding_ids, ...chosen.insight_finding_ids, ...mandatory])];
  const byId = new Map(candidates.map((item) => [item.id, item]));
  const selected = selectedIds.map((id) => byId.get(id)).filter((item): item is PerformanceFinding => !!item);
  const summaries = chosen.summary_finding_ids.map((id) => byId.get(id)?.text).filter((text): text is string => !!text);
  const mandatoryText = mandatory.map((id) => byId.get(id)?.text).filter((text): text is string => !!text);
  const summary = facts.status === "no_data" ? ["No recorded performance observations are available for this scope and range.", ...mandatoryText].join(" ") : [...summaries, ...mandatoryText].join(" ");
  const answer: PiecePerformanceAnswer = {
    v: 1, kind: "piece_performance", report_id: `pfr_${digest(`${facts.subject_fingerprint}\0${facts.as_of}\0${facts.range}`)}`,
    status: facts.status, subject: facts.subject, as_of: facts.as_of, range: facts.range, time_range: facts.time_range, destination,
    metrics: facts.metrics, coverage: facts.coverage, source_failures: facts.source_failures, findings: selected, summary,
    synthesis, links: [{ kind: "view_analytics", href: facts.subject.kind === "work" ? `/studio/analytics/works/${encodeURIComponent(facts.subject.id)}?range=${facts.range}` : "/studio/analytics" }]
  };
  if (Buffer.byteLength(JSON.stringify(answer), "utf8") > 64 * 1024) throw new PiecePerformanceAnswerTooLargeError();
  return answer;
}

/** Server-owned readable fallback persisted alongside the structured attachment. */
export function renderPiecePerformanceAnswerText(answer: PiecePerformanceAnswer): string {
  const other = answer.findings.map((item) => item.text).filter((text) => text && !answer.summary.includes(text));
  return [answer.summary, ...other].filter(Boolean).join(" ");
}

/** Strict persistence/read-back validator for the structured assistant attachment. */
export function validatePiecePerformanceAnswer(value: unknown): value is PiecePerformanceAnswer {
  try { if (Buffer.byteLength(JSON.stringify(value), "utf8") > 64 * 1024) return false; } catch { return false; }
  const answerKeys = ["v", "kind", "report_id", "status", "subject", "as_of", "range", "time_range", "destination", "metrics", "coverage", "source_failures", "findings", "summary", "synthesis", "links"];
  if (!exactKeys(value, answerKeys) || value.v !== 1 || value.kind !== "piece_performance" || typeof value.report_id !== "string" || !/^pfr_[0-9a-f]{24}$/.test(value.report_id) ||
    !["complete", "partial", "no_data"].includes(String(value.status)) || !iso(value.as_of) || !["7d", "30d", "90d"].includes(String(value.range)) ||
    (value.destination !== null && (typeof value.destination !== "string" || !DESTINATIONS.has(value.destination))) || typeof value.summary !== "string" || value.summary.length > 20000 ||
    !exactKeys(value.synthesis, ["status", "reason"]) || !["ai_selected", "deterministic"].includes(String(value.synthesis.status)) ||
    !(value.synthesis.reason === null || ["no_data", "provider_unavailable", "invalid_output", "budget", "timeout"].includes(String(value.synthesis.reason))) ||
    (value.synthesis.status === "ai_selected" && value.synthesis.reason !== null) || (value.synthesis.status === "deterministic" && value.synthesis.reason === null) ||
    !Array.isArray(value.links) || value.links.length !== 1 || !exactKeys(value.links[0], ["kind", "href"]) || value.links[0].kind !== "view_analytics") return false;
  const facts: PiecePerformanceFacts = {
    as_of: value.as_of as string, range: value.range as PiecePerformanceFacts["range"], time_range: value.time_range as PiecePerformanceFacts["time_range"],
    subject: value.subject as PiecePerformanceFacts["subject"], subject_fingerprint: "persisted", status: value.status as PiecePerformanceFacts["status"],
    metrics: value.metrics as PiecePerformanceFacts["metrics"], coverage: value.coverage as PiecePerformanceFacts["coverage"], source_failures: value.source_failures as PiecePerformanceFacts["source_failures"]
  };
  if (!validatePiecePerformanceFactsResult({ ok: true, facts }).ok) return false;
  const expectedHref = facts.subject.kind === "work" ? `/studio/analytics/works/${encodeURIComponent(facts.subject.id)}?range=${facts.range}` : "/studio/analytics";
  if (value.links[0].href !== expectedHref) return false;
  if (!Array.isArray(value.findings) || value.findings.length > 16) return false;
  const generated = buildPiecePerformanceFindings(facts);
  if (!generated.ok) return false;
  const candidates = new Map(generated.findings.map((finding) => [finding.id, finding]));
  const chosen: PerformanceFinding[] = [];
  const chosenIds = new Set<string>();
  for (const raw of value.findings) {
    if (!exactKeys(raw, ["id", "code", "text", "metric_fact_ids", "coverage_refs"]) || typeof raw.id !== "string" || chosenIds.has(raw.id)) return false;
    const expected = candidates.get(raw.id);
    if (!expected || JSON.stringify(canonical(raw)) !== JSON.stringify(canonical(expected))) return false;
    chosenIds.add(raw.id);
    chosen.push(expected);
  }
  if (generated.mandatory_finding_ids.some((id) => !chosenIds.has(id))) return false;
  if (facts.status === "no_data") {
    const mandatoryText = generated.mandatory_finding_ids.map((id) => candidates.get(id)?.text).filter((text): text is string => Boolean(text));
    if (value.summary !== ["No recorded performance observations are available for this scope and range.", ...mandatoryText].join(" ") || value.synthesis.status !== "deterministic" || value.synthesis.reason !== "no_data") return false;
    return true;
  }
  const mandatoryText = generated.mandatory_finding_ids.map((id) => candidates.get(id)?.text).filter((text): text is string => Boolean(text));
  for (let count = 0; count <= Math.min(3, chosen.length); count++) {
    if ([...chosen.slice(0, count).map((finding) => finding.text), ...mandatoryText].join(" ") === value.summary) return true;
  }
  return false;
}

export const PERFORMANCE_SELECTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["kind", "summary_finding_ids", "insight_finding_ids"],
  properties: {
    kind: { type: "string", enum: ["performance_answer"] },
    summary_finding_ids: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 40 } },
    insight_finding_ids: { type: "array", maxItems: 3, items: { type: "string", minLength: 1, maxLength: 40 } }
  }
} as const;

/** The synthesis call receives only server-authored candidate text and exact IDs. */
export function piecePerformanceSynthesisInput(findings: PerformanceFinding[]) {
  return [
    { role: "developer", content: "Select emphasis only from these server-authored findings. Return exactly kind=performance_answer, summary_finding_ids (1-3), and insight_finding_ids (0-3). Use only supplied IDs. Do not write prose, numbers, citations, or extra keys." },
    { role: "user", content: JSON.stringify({ findings: findings.map(({ id, code, text }) => ({ id, code, text })) }) }
  ];
}

export function parsePiecePerformanceSelectionOutput(output: unknown, candidates: PerformanceFinding[], noData: boolean): PerformanceSelection {
  if (!Array.isArray(output) || output.length > 40 || output.some((item) => !item || typeof item !== "object" || !["reasoning", "message"].includes(String((item as Record<string, unknown>).type)))) throw new Error("Invalid performance selection response.");
  const parts: string[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content as Array<Record<string, unknown>>) {
      if (part.type === "refusal") throw new Error("Performance selection refused.");
      if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  if (!parts.length) throw new Error("Performance selection was empty.");
  return validatePiecePerformanceSelection(JSON.parse(parts.join("")), candidates.map((candidate) => candidate.id), noData);
}

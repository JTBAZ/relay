/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PiecePerformanceAnswerView from "../../web/app/components/studio/PiecePerformanceAnswerView";
import type { PiecePerformanceAnswer } from "../../src/analytics/piece-performance-findings";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

const answer: PiecePerformanceAnswer = {
  v: 1, kind: "piece_performance", report_id: "report-1", status: "partial",
  subject: { kind: "work", id: "work-1", title: "Night Garden", post_ids: ["post-alpha"] },
  as_of: "2026-10-22T12:00:00.000Z", range: "30d", time_range: { start: "2026-09-22T12:00:00.000Z", end: "2026-10-22T12:00:00.000Z" }, destination: null,
  metrics: [
    { id: "metric-zero", post_id: "post-alpha", destination: "patreon", metric: "likes", basis: "captured_total", value: 0, availability: "available", unavailable_reason: null, source: "third_party", confidence: "medium", captured_at: "2026-10-22T10:00:00.000Z", computed_at: null, stale: false, evidence: [{ kind: "csv_metric", id: "csv-1-import_time_fallback", observed_at: "2026-10-22T10:00:00.000Z" }] },
    { id: "metric-unavailable", post_id: "post-alpha", destination: "patreon", metric: "seen", basis: "window_change", value: null, availability: "unavailable", unavailable_reason: "not_collected", source: null, confidence: "unknown", captured_at: null, computed_at: null, stale: false, evidence: [] }
  ],
  coverage: [{ id: "coverage-1", post_id: "post-alpha", destination: "x", state: "no_observations", missing_metrics: ["views"] }], source_failures: ["snapshots"],
  findings: [{ id: "finding-1", code: "recorded_activity", text: "Patreon recorded 0 likes for piece 1.", metric_fact_ids: ["metric-zero"], coverage_refs: ["coverage-1"] }],
  summary: "Patreon recorded 0 likes for piece 1.", synthesis: { status: "deterministic", reason: "provider_unavailable" }, links: [{ kind: "view_analytics", href: "/studio/analytics/works/work-1?range=30d" }]
};

afterEach(cleanup);

describe("PiecePerformanceAnswerView", () => {
  it("keeps measured zero, unknown values, provenance, member ids, notices and finding links distinct", () => {
    render(<PiecePerformanceAnswerView answer={answer} />);
    expect(screen.getByText("post-alpha · Patreon · likes")).toBeTruthy();
    expect(screen.getByText("0", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("Imported: Oct 22, 2026, 10:00 AM UTC")).toBeTruthy();
    expect(screen.getByText("No recorded value is available.")).toBeTruthy();
    expect(screen.getByText("AI summary is unavailable; recorded facts are shown below.")).toBeTruthy();
    expect(screen.getByText(/A source read failed: snapshots/)).toBeTruthy();
    fireEventOpen("Findings and evidence links");
    expect(screen.getByRole("link", { name: "Patreon likes · captured total" }).getAttribute("href")).toBe("#metric-report-1-metric-zero");
    expect(screen.getByRole("link", { name: "post-alpha · X · no observations" }).getAttribute("href")).toBe("#coverage-report-1-coverage-1");
    expect(screen.getByRole("link", { name: "Open analytics" }).getAttribute("href")).toBe("/studio/analytics/works/work-1?range=30d");
    expect(screen.getByText(/post-alpha · X · no observations · No recorded value for views/)).toBeTruthy();
  });

  it("shows source details only inside a keyboard-operable disclosure", () => {
    render(<PiecePerformanceAnswerView answer={answer} />);
    const source = screen.getByText("Source and confidence").closest("details")!;
    expect(within(source).queryByText(/csv_metric/)).toBeNull();
    source.querySelector("summary")?.click();
    expect(within(source).getByText(/csv metric · csv-1-import_time_fallback · imported/)).toBeTruthy();
  });

  it("explains deterministic fallback only when synthesis failed", () => {
    render(<PiecePerformanceAnswerView answer={{ ...answer, synthesis: { status: "deterministic", reason: "provider_unavailable" } }} />);
    expect(screen.getByText("AI summary is unavailable; recorded facts are shown below.")).toBeTruthy();
  });

  it("keeps evidence links scoped when two saved reports reuse fact ids", () => {
    render(<><PiecePerformanceAnswerView answer={answer} /><PiecePerformanceAnswerView answer={{ ...answer, report_id: "report-2" }} /></>);
    const metricLinks = screen.getAllByRole("link", { name: "Patreon likes · captured total" });
    expect(metricLinks.map((link) => link.getAttribute("href"))).toEqual(["#metric-report-1-metric-zero", "#metric-report-2-metric-zero"]);
    expect(document.getElementById("metric-report-1-metric-zero")).toBeTruthy();
    expect(document.getElementById("metric-report-2-metric-zero")).toBeTruthy();
  });
});

function fireEventOpen(name: string) {
  screen.getByText(name).closest("details")?.querySelector("summary")?.click();
}

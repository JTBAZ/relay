import Link from "next/link";
import type { PiecePerformanceAnswer } from "../../../../src/analytics/piece-performance-findings";

const number = new Intl.NumberFormat(undefined);
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function platformName(destination: string): string {
  if (destination === "x") return "X";
  if (destination === "deviantart") return "DeviantArt";
  return destination.charAt(0).toUpperCase() + destination.slice(1);
}

function date(value: string | null): string {
  if (!value) return "Time unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Time unavailable" : `${dateTime.format(parsed)} UTC`;
}

function importTime(fact: PiecePerformanceAnswer["metrics"][number]): boolean {
  return fact.evidence.some((ref) => ref.kind === "csv_metric" && ref.id.includes("import_time_fallback"));
}

function reasonLabel(reason: string | null): string {
  switch (reason) {
    case "not_collected": return "No recorded value is available.";
    case "unknown_period": return "A value for this period is unavailable.";
    case "ambiguous_link": return "The current platform link is ambiguous.";
    case "incomplete_baseline": return "A start value is missing, so change for this period cannot be calculated.";
    case "source_unavailable": return "This source could not be read.";
    default: return "No recorded value is available.";
  }
}

export default function PiecePerformanceAnswerView({ answer }: { answer: PiecePerformanceAnswer }) {
  const subject = answer.subject.kind === "work" ? "Work" : "Post";
  const stale = answer.metrics.some((fact) => fact.availability === "available" && fact.stale);
  const coverageGaps = answer.coverage.filter((row) => row.state !== "observed");
  const deterministic = answer.synthesis.status === "deterministic";
  const reportPrefix = answer.report_id;
  const metricById = new Map(answer.metrics.map((fact) => [fact.id, fact]));
  const coverageById = new Map(answer.coverage.map((row) => [row.id, row]));
  return (
    <article className="mt-3 min-w-0 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3" aria-label={`Performance answer for ${answer.subject.title}`} aria-live="polite">
      <header className="min-w-0">
        <h3 className="break-words text-xs font-semibold">{answer.subject.title || `Selected ${subject.toLowerCase()}`}</h3>
        <p className="mt-1 break-words text-[11px] text-[var(--lib-fg-muted)]">
          {subject}{answer.subject.kind === "work" ? ` · Members ${answer.subject.post_ids.join(", ")}` : ""} · {answer.destination ? platformName(answer.destination) : "All linked platforms"} · {answer.range} · {date(answer.time_range.start)}–{date(answer.time_range.end)}
        </p>
        <p className="mt-1 text-[10px] text-[var(--lib-fg-muted)]">{answer.status === "no_data" ? "No recorded data" : answer.status === "partial" ? "Partial data" : "Complete data"} · Evidence read {date(answer.as_of)}</p>
      </header>

      <p className="mt-3 whitespace-pre-wrap break-words text-xs text-[var(--lib-fg)]">{answer.summary}</p>
      {deterministic && answer.synthesis.reason !== "no_data" ? <p className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">AI summary is unavailable; recorded facts are shown below.</p> : null}

      {answer.metrics.length ? <ul aria-label="Recorded metrics" className="mt-3 divide-y divide-[var(--lib-border)]">
        {answer.metrics.map((fact) => {
          const basis = fact.basis === "captured_total" ? "Captured total" : `${answer.range} change`;
          const imported = importTime(fact);
          return <li id={`metric-${reportPrefix}-${fact.id}`} key={fact.id} className="min-w-0 py-2 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 break-words text-[11px] font-medium">{answer.subject.kind === "work" ? `${fact.post_id} · ` : ""}{platformName(fact.destination)} · {fact.metric}</p>
              <p className="tabular-nums text-sm font-semibold">{fact.availability === "available" && fact.value !== null ? number.format(fact.value) : "Unavailable"}</p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--lib-fg-muted)]">
              <span>{basis}</span>
              {fact.availability === "unavailable" ? <span className="break-words">{reasonLabel(fact.unavailable_reason)}</span> : null}
              <span>{imported ? "Imported" : "Observed"}: {date(fact.captured_at)}</span>
              {fact.computed_at ? <span>Computed: {date(fact.computed_at)}</span> : null}
              {fact.stale && fact.availability === "available" ? <span className="text-[var(--lib-warning)]">Older than 48 hours or capture time unavailable</span> : null}
            </div>
            {fact.evidence.length ? <details className="mt-1 text-[10px] text-[var(--lib-fg-muted)]">
              <summary className="inline-flex min-h-7 cursor-pointer items-center underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]">Source and confidence</summary>
              <p className="break-words">{fact.source ? `${fact.source === "third_party" && imported ? "Patreon CSV import" : fact.source.replaceAll("_", " ")} · ${fact.confidence} confidence` : `Confidence: ${fact.confidence}`}</p>
              <ul className="mt-1 space-y-1 break-all">
                {fact.evidence.map((ref) => <li key={`${ref.kind}:${ref.id}`}>{ref.kind.replaceAll("_", " ")} · {ref.id} · {ref.kind === "csv_metric" && ref.id.includes("import_time_fallback") ? "imported" : "observed"} {date(ref.observed_at)}</li>)}
              </ul>
            </details> : null}
          </li>;
        })}
      </ul> : <p className="mt-3 text-[11px] text-[var(--lib-fg-muted)]">No recorded metric values are available for this scope.</p>}

      {stale || coverageGaps.length || answer.source_failures.length ? <section className="mt-3 border-t border-[var(--lib-border)] pt-2" aria-label="Coverage and freshness">
        <h4 className="text-[11px] font-medium">Coverage</h4>
        {stale ? <p className="mt-1 break-words text-[10px] text-[var(--lib-warning)]">Some recorded values are older than 48 hours or have no capture time.</p> : null}
        {coverageGaps.length ? <ul className="mt-1 divide-y divide-[var(--lib-border)] text-[10px] text-[var(--lib-fg-muted)]">
          {coverageGaps.map((row) => <li id={`coverage-${reportPrefix}-${row.id}`} key={row.id} className="break-words py-1">{answer.subject.kind === "work" ? `${row.post_id} · ` : ""}{platformName(row.destination)} · {row.state.replaceAll("_", " ")}{row.missing_metrics.length ? ` · No recorded value for ${row.missing_metrics.join(", ")}` : ""}</li>)}
        </ul> : null}
        {answer.source_failures.length ? <p className="mt-1 break-words text-[10px] text-[var(--lib-warning)]">A source read failed: {answer.source_failures.join(", ").replaceAll("_", " ")}.</p> : null}
      </section> : null}

      {answer.findings.length ? <details className="mt-2 text-[11px]">
        <summary className="inline-flex min-h-7 cursor-pointer text-[var(--lib-fg-muted)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]">Findings and evidence links</summary>
        <ul className="mt-1 space-y-2 break-words">{answer.findings.map((finding) => <li key={finding.id}>
          <p>{finding.text}</p>
          {finding.metric_fact_ids.length || finding.coverage_refs.length ? <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
            {finding.metric_fact_ids.map((id) => { const fact = metricById.get(id); return fact ? <li key={id}><a className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]" href={`#metric-${reportPrefix}-${id}`}>{platformName(fact.destination)} {fact.metric} · {fact.basis === "captured_total" ? "captured total" : `${answer.range} change`}</a></li> : null; })}
            {finding.coverage_refs.map((id) => { const row = coverageById.get(id); return row ? <li key={id}><a className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]" href={`#coverage-${reportPrefix}-${id}`}>{answer.subject.kind === "work" ? `${row.post_id} · ` : ""}{platformName(row.destination)} · {row.state.replaceAll("_", " ")}</a></li> : null; })}
          </ul> : null}
        </li>)}</ul>
      </details> : null}
      <Link href={answer.links[0]?.href ?? "/studio/analytics"} className="mt-2 inline-block min-h-7 rounded-sm text-[11px] text-[var(--lib-primary)] underline underline-offset-2 hover:text-[var(--lib-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]">Open analytics</Link>
    </article>
  );
}

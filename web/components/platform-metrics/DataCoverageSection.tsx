export type DataCoverageSummary = {
  total: number;
  live: number;
  collecting: number;
  not_wired: number;
  estimated: number;
  manual_import: number;
  deferred: number;
};

function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 1000) / 10}%`;
}

export default function DataCoverageSection({
  coverage,
  generatedAt
}: {
  coverage: DataCoverageSummary;
  generatedAt?: string | null;
}) {
  const { total, live, collecting, not_wired, estimated, manual_import, deferred } = coverage;

  const items = [
    { label: "Total metrics", value: total, pct: null },
    { label: "Live", value: live, pct: pct(live, total) },
    { label: "Collecting", value: collecting, pct: pct(collecting, total) },
    { label: "Not wired", value: not_wired, pct: pct(not_wired, total) },
    { label: "Estimated", value: estimated, pct: pct(estimated, total) },
    { label: "Manual import", value: manual_import, pct: pct(manual_import, total) },
    { label: "Deferred", value: deferred, pct: pct(deferred, total) }
  ];

  return (
    <section
      aria-labelledby="data-coverage-heading"
      className="rounded-3xl border border-[#264c38] bg-[#07180f] p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#7bd6a2]">
            Data Coverage
          </p>
          <h2
            id="data-coverage-heading"
            className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#F2F2F2]"
          >
            Telemetry program scoreboard
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#A8A8A8]">
            Tracks how many dashboard cards are live, collecting, missing instrumentation, or
            intentionally deferred.
          </p>
        </div>
        {generatedAt ? (
          <p className="text-xs text-[#7a9a86]">Registry generated {new Date(generatedAt).toLocaleString()}</p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-[#1F3D2C] bg-[#0A140F] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#7a9a86]">{item.label}</p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[#F2F2F2]">
              {item.value}
            </p>
            {item.pct ? (
              <p className="mt-1 text-xs text-[#9fd4b3]">{item.pct} of total</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

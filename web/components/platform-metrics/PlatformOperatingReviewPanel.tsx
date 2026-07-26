import type { PlatformOperatingReviewSummary } from "@/lib/platform-operating-review";

const actionLabel = {
  wire: "Wire",
  defer: "Defer",
  remove: "Remove",
  monitor: "Monitor"
} as const;

const actionStyles = {
  wire: "border-[#264c38] bg-[#07180f] text-[#b7e4ca]",
  defer: "border-[#3a3a1a] bg-[#141408] text-[#d8d0a0]",
  remove: "border-[#5c2a2a] bg-[#1a1010] text-[#f0a8a8]",
  monitor: "border-[#2a2a2a] bg-[#121212] text-[#bdbdbd]"
} as const;

export default function PlatformOperatingReviewPanel({
  review
}: {
  review: PlatformOperatingReviewSummary | null | undefined;
}) {
  if (!review) {
    return null;
  }

  const { totals, checklist, bySection } = review;

  return (
    <section
      aria-labelledby="operating-review-heading"
      className="rounded-3xl border border-[#1F1F1F] bg-[#0D0D0D] p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#7bd6a2]">
            Weekly metrics review
          </p>
          <h2
            id="operating-review-heading"
            className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#F2F2F2]"
          >
            {totals.needsReview} items to triage
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-[#A8A8A8]">
            Decide wire, defer, or remove for each gap. Log outcomes on the Platform Metrics
            Dashboard Airtable table.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-[#1F1F1F] px-3 py-2">
            <p className="text-[#777]">Not wired</p>
            <p className="text-lg font-semibold text-[#F2F2F2]">{totals.notWired}</p>
          </div>
          <div className="rounded-xl border border-[#1F1F1F] px-3 py-2">
            <p className="text-[#777]">Pending</p>
            <p className="text-lg font-semibold text-[#F2F2F2]">
              {totals.pendingInstrumentation}
            </p>
          </div>
          <div className="rounded-xl border border-[#1F1F1F] px-3 py-2">
            <p className="text-[#777]">Deferred</p>
            <p className="text-lg font-semibold text-[#F2F2F2]">{totals.deferred}</p>
          </div>
          <div className="rounded-xl border border-[#1F1F1F] px-3 py-2">
            <p className="text-[#777]">Stale</p>
            <p className="text-lg font-semibold text-[#F2F2F2]">{totals.stale}</p>
          </div>
          <div className="rounded-xl border border-[#1F1F1F] px-3 py-2">
            <p className="text-[#777]">Alerts</p>
            <p className="text-lg font-semibold text-[#F2F2F2]">{totals.activeAlerts}</p>
          </div>
        </div>
      </div>

      <ol className="mt-6 space-y-2 border-b border-[#1F1F1F] pb-6 text-sm text-[#A8A8A8]">
        {checklist.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="font-mono text-[#7bd6a2]">{index + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {bySection.length === 0 ? (
        <p className="mt-6 text-sm text-[#888]">No metrics need triage this week.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {bySection.map((group) => (
            <div key={group.section}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#888]">
                {group.section.replace(/_/g, " ")}
              </h3>
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => (
                  <li key={item.metricKey}>
                    <a
                      href={`#metric-${item.metricKey}`}
                      className="block rounded-2xl border border-[#1F1F1F] bg-[#080808] px-4 py-3 transition hover:border-[#264c38]"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-[#F2F2F2]">{item.label}</p>
                          <p className="mt-1 font-mono text-[11px] text-[#777]">{item.metricKey}</p>
                        </div>
                        <span
                          className={`inline-flex w-fit rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${actionStyles[item.recommendedAction]}`}
                        >
                          {actionLabel[item.recommendedAction]}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-[#9A9A9A]">
                        {item.status} · {item.priority} · phase {item.phase} · {item.reason}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

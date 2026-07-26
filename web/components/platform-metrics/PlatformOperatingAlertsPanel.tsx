import type { PlatformOperatingAlert } from "@/lib/platform-operating-alerts";

const severityStyles = {
  warning: "border-[#5c4a1a] bg-[#1a1608] text-[#f0d48a]",
  critical: "border-[#5c2a2a] bg-[#1a1010] text-[#f0a8a8]"
} as const;

export default function PlatformOperatingAlertsPanel({
  alerts
}: {
  alerts: PlatformOperatingAlert[];
}) {
  if (alerts.length === 0) {
    return (
      <section
        aria-labelledby="operating-alerts-heading"
        className="rounded-3xl border border-[#264c38] bg-[#07180f] p-6 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#7bd6a2]">
          Operating alerts
        </p>
        <h2
          id="operating-alerts-heading"
          className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#F2F2F2]"
        >
          All clear
        </h2>
        <p className="mt-2 text-sm text-[#A8A8A8]">
          No DAU/traffic drops, entitlement staleness, sync failures, queue pressure, or error spikes
          detected against current thresholds.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="operating-alerts-heading"
      className="rounded-3xl border border-[#5c2a2a] bg-[#120808] p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f0a8a8]">
            Operating alerts
          </p>
          <h2
            id="operating-alerts-heading"
            className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#F2F2F2]"
          >
            {alerts.length} active {alerts.length === 1 ? "risk" : "risks"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#A8A8A8]">
            Each alert links to the source metric card for context and freshness.
          </p>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {alerts.map((alert) => (
          <li key={alert.key}>
            <a
              href={`#metric-${alert.relatedMetricKey}`}
              className={`block rounded-2xl border px-4 py-3 transition hover:opacity-90 ${severityStyles[alert.severity]}`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold">{alert.title}</p>
                <p className="text-xs uppercase tracking-[0.18em] opacity-80">{alert.key}</p>
              </div>
              <p className="mt-2 text-sm">{alert.message}</p>
              <p className="mt-2 text-xs opacity-80">
                Source card: {alert.relatedMetricKey} · {alert.sourceContext}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

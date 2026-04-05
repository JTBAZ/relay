"use client";

const steps = [
  { label: "Display", className: "text-xl font-bold leading-tight tracking-tight", sample: "Relay Library" },
  { label: "Title", className: "text-base font-semibold leading-snug", sample: "Creator workspace" },
  { label: "Body", className: "text-xs font-normal leading-relaxed", sample: "Search titles, tags, and descriptions." },
  { label: "Caption", className: "text-[10px] font-semibold uppercase tracking-widest", sample: "Patron tier" }
];

/** Type ramp sample using Library foreground tokens. */
export function TypeRampDemo() {
  return (
    <section aria-label="Type ramp reference" className="space-y-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
        Type ramp
      </h4>
      <div className="divide-y divide-[var(--lib-border)] overflow-hidden rounded-md border border-[var(--lib-border)]">
        {steps.map(({ label, className, sample }) => (
          <div key={label} className="bg-[var(--lib-card)] px-2.5 py-2">
            <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
              {label}
            </span>
            <p className={`${className} text-[var(--lib-fg)]`}>{sample}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

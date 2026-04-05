"use client";

/** Inline token demo for Library sidebar — matches Tailwind spacing scale referenced in design ledger. */
const spacingSteps = [
  { token: "1", px: 4 },
  { token: "2", px: 8 },
  { token: "3", px: 12 },
  { token: "4", px: 16 },
  { token: "6", px: 24 },
  { token: "8", px: 32 },
  { token: "10", px: 40 },
  { token: "12", px: 48 }
];

export function SpacingScaleDemo() {
  return (
    <section aria-label="Spacing scale reference" className="space-y-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
        Spacing (4-pt)
      </h4>
      <div className="space-y-1.5">
        {spacingSteps.map(({ token, px }) => (
          <div key={token} className="flex items-center gap-2">
            <code className="w-5 shrink-0 text-right font-mono text-[10px] text-[var(--lib-fg-muted)]">
              {token}
            </code>
            <div
              className="h-1 shrink-0 rounded-full bg-[var(--lib-primary)]"
              style={{ width: px }}
              title={`${px}px`}
            />
            <span className="font-mono text-[10px] text-[var(--lib-fg-muted)]">{px}px</span>
          </div>
        ))}
      </div>
    </section>
  );
}

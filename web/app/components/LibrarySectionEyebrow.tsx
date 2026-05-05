"use client";

/** Section label: emerald type + flanking dots (no background wash / glow). */
export default function LibrarySectionEyebrow({
  label,
  dense
}: {
  label: string;
  /** Tighter vertical rhythm when nested inside the Import Bay hero. */
  dense?: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center">
      <div
        className={`flex items-center justify-center gap-[0.55rem] sm:gap-4 ${dense ? "py-2.5" : "py-5"}`}
      >
        <span
          aria-hidden
          className="h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--lib-primary)]"
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--lib-primary)] sm:text-[11px] sm:tracking-[0.3em]">
          {label}
        </p>
        <span
          aria-hidden
          className="h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--lib-primary)]"
        />
      </div>
    </div>
  );
}

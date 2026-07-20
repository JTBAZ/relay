"use client";

import {
  type VisibilityToggleTriState
} from "@/lib/visibility-toggle-state";

export type { VisibilityToggleTriState };
export { visibilityItemsTriState } from "@/lib/visibility-toggle-state";

const DEFAULT_ACCENT = "#00aa6f";

export type VisibilitySwitchRowProps = {
  label: string;
  helper: string;
  state: VisibilityToggleTriState;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  /** Track fill when on/mixed (Bulk library green by default). */
  accentColor?: string;
  onToggle: (nextOn: boolean) => void;
};

/**
 * Reusable Hidden / Adult switch with Bulk-compatible tri-state:
 * mixed → click forces off, then on again if needed.
 */
export function VisibilitySwitchRow({
  label,
  helper,
  state,
  disabled = false,
  busy = false,
  title,
  accentColor = DEFAULT_ACCENT,
  onToggle
}: VisibilitySwitchRowProps) {
  const on = state === "on";
  const mixed = state === "mixed";
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5" title={title}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[var(--lib-fg,#e8eee9)]">{label}</p>
        <p className="text-[9px] leading-snug text-[var(--lib-fg-muted,#6a726e)]">{helper}</p>
        {mixed ? (
          <p className="mt-0.5 text-[9px] text-amber-400/90">
            Mixed — click to set all off, then on again if needed
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={mixed ? "mixed" : on}
        aria-label={label}
        disabled={disabled || busy}
        onClick={() => onToggle(mixed ? false : !on)}
        className={[
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--lib-selection,#9bf0c4)_55%,transparent)]",
          "disabled:cursor-not-allowed disabled:opacity-45",
          on || mixed ? "" : "bg-[var(--lib-muted,#2a2a2a)]"
        ].join(" ")}
        style={on || mixed ? { backgroundColor: accentColor } : undefined}
      >
        <span
          className={[
            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            on ? "translate-x-[1.125rem]" : mixed ? "translate-x-[0.5625rem]" : "translate-x-0.5"
          ].join(" ")}
          aria-hidden
        />
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/app/lib/cn";

export type ImportSignalRowState = "pending" | "syncing" | "complete" | "failed";

const STATUS_LABEL: Record<ImportSignalRowState, string> = {
  pending: "Pending",
  syncing: "Syncing",
  complete: "Complete",
  failed: "Failed",
};

function barFillClass(state: ImportSignalRowState): string {
  switch (state) {
    case "complete":
      return "w-full bg-[var(--relay-green-600)]";
    case "syncing":
      return "w-2/3 bg-[var(--relay-green-600)] motion-safe:animate-pulse";
    case "failed":
      return "w-full bg-red-500/80";
    default:
      return "w-1/4 bg-amber-400/70";
  }
}

export function ImportSignalRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: ImportSignalRowState;
  detail: string;
}) {
  const [animatedState, setAnimatedState] = useState<ImportSignalRowState>(
    state === "complete" ? "pending" : state
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnimatedState(state));
    return () => window.cancelAnimationFrame(frame);
  }, [state]);

  return (
    <details className="group rounded-xl border border-[var(--relay-border)] bg-[var(--relay-bg)]/45 px-3 py-2.5">
      <summary className="flex cursor-pointer list-none flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-sm font-semibold text-[var(--relay-fg)]">{label}</span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/30">
            <span
              className={cn(
                "block h-full rounded-full transition-all duration-500 ease-out",
                barFillClass(animatedState)
              )}
              aria-hidden
            />
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--relay-fg-muted)]">
          {state === "syncing" ? (
            <Loader2 className="h-3 w-3 animate-spin text-amber-200" aria-hidden />
          ) : null}
          {STATUS_LABEL[state]}
        </span>
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-[var(--relay-fg-muted)]">{detail}</p>
    </details>
  );
}

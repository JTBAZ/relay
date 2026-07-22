"use client";

import type { ReactNode } from "react";
import { GitBranch, Workflow } from "lucide-react";

const PILL =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-[#1d211e] bg-[#0c0e0c] px-2.5 text-[11px] font-medium text-[#aab4ae] transition-colors hover:border-[#2a302c] hover:text-[#c8cec9]";

/**
 * Lab floorspace header — Tools hotbar (+ branded Studio arrival on lab2).
 */
export function LabFloorspaceHeader({
  goalsSlot,
  patreonSlot,
  onOpenAutomations,
  onOpenCrossposter,
  crossposterDisabled,
  variant = "tools"
}: {
  goalsSlot: ReactNode;
  patreonSlot: ReactNode;
  onOpenAutomations: () => void;
  onOpenCrossposter: () => void;
  crossposterDisabled?: boolean;
  /** studio = lab2 branded arrival; tools = compact lab header. */
  variant?: "tools" | "studio";
}) {
  const isStudio = variant === "studio";

  return (
    <div
      className={`flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[#1a1a1a] bg-[#050706] px-5 ${
        isStudio ? "py-3" : "py-1.5"
      }`}
      data-lab-floorspace-header
      data-variant={variant}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {isStudio ? (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5a6a62]">
              Relay
            </p>
            <h1 className="mt-0.5 text-[18px] font-semibold leading-none tracking-tight text-[#edf2ef]">
              Studio
            </h1>
            <p className="mt-1.5 text-[11px] leading-snug text-[#6b7280]">
              Stage media · browse posts · schedule what comes next
            </p>
          </div>
        ) : (
          <h1 className="shrink-0 text-[13px] font-semibold tracking-tight text-[#e8e8e8]">
            Tools
          </h1>
        )}
        <div
          className={`flex flex-wrap items-center gap-1.5 ${isStudio ? "sm:ml-2" : ""}`}
          role="toolbar"
          aria-label="Tools"
        >
          {goalsSlot}
          <button
            type="button"
            onClick={onOpenAutomations}
            className={PILL}
            data-testid="lab-tool-automations"
          >
            <Workflow className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Automations
          </button>
          <button
            type="button"
            onClick={onOpenCrossposter}
            disabled={crossposterDisabled}
            title={
              crossposterDisabled
                ? "Select a post in Active Posts to open Crossposter"
                : "Open Crossposter for the selected post"
            }
            className={`${PILL} disabled:cursor-not-allowed disabled:opacity-40`}
            data-testid="lab-tool-crossposter"
          >
            <GitBranch className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Crossposter
          </button>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{patreonSlot}</div>
    </div>
  );
}

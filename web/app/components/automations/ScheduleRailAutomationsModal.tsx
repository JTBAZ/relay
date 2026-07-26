"use client";

/**
 * Schedule Rail Automations modal (VS7 / B17–B18).
 * Gated shell + real overview/forms/history. Approval via host callback.
 */

import { createPortal } from "react-dom";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { StudioPlanGate } from "@/app/components/studio/StudioPlanGate";
import { PostingRoutinesSection } from "@/app/components/autopost/PostingRoutinesSection";
import { DistributionRulesSection } from "@/app/components/autopost/DistributionRulesSection";
import {
  AutomationsPanel,
  type AutomationApprovalOpenArgs
} from "@/app/components/automations/AutomationsPanel";
import type { CreatorCapabilityWire } from "@/lib/relay-api";

export type ScheduleRailAutomationsModalProps = {
  open: boolean;
  onClose: () => void;
  /** Autopost capability from host plan-access fetch. */
  autopostCapability: CreatorCapabilityWire | null;
  /** When false/unknown, show feature-disabled empty (flag off / disabled API). */
  automationsFeatureEnabled?: boolean;
  /** Open the shared AutomationApprovalOverlay (host-owned). */
  onOpenApproval: (args: AutomationApprovalOpenArgs) => void;
};

export function ScheduleRailAutomationsModal({
  open,
  onClose,
  autopostCapability,
  automationsFeatureEnabled = true,
  onOpenApproval
}: ScheduleRailAutomationsModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const gated = autopostCapability != null && !autopostCapability.allowed;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[rgba(0,0,0,0.82)] p-4 backdrop-blur-sm motion-reduce:backdrop-blur-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="schedule-rail-automations-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,170,111,0.22)] bg-[#0a0a0a] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9bf0c4]">
              Schedule Rail
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold tracking-tight text-[#f9fafb]">
              Automations
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-[#9ca3af]">
              Create and manage Preview &amp; crosspost and Delayed public release. Legacy
              routines stay available below.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6b7280] transition-colors hover:text-[#f9fafb]"
            aria-label="Close Automations"
            data-testid="automations-modal-close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {!automationsFeatureEnabled ? (
            <p
              className="rounded-lg border border-[var(--lib-border)] px-3 py-3 text-sm text-[var(--lib-fg-muted)]"
              data-testid="automations-feature-disabled"
            >
              Automations are turned off for this environment. Legacy routines and rules still
              work below.
            </p>
          ) : null}

          {automationsFeatureEnabled ? (
            gated && autopostCapability ? (
              <StudioPlanGate
                capability={autopostCapability}
                feature="autopost"
                featureName="Automations"
                featureBenefit="Schedule Preview & crosspost and Delayed public release from the Schedule Rail."
                testId="automations-modal-plan-gate"
                showChildrenWhenLocked
              >
                <AutomationsPanel locked onOpenApproval={onOpenApproval} />
              </StudioPlanGate>
            ) : (
              <AutomationsPanel locked={false} onOpenApproval={onOpenApproval} />
            )
          ) : null}

          <div className="space-y-4 border-t border-white/[0.06] pt-4">
            <div>
              <h3 className="text-sm font-semibold text-[#edf2ef]">Legacy routines &amp; rules</h3>
              <p className="mt-1 text-xs text-[#9ca3af]">
                Same panels as{" "}
                <a href="/studio/autopost/routines" className="text-emerald-300 underline">
                  /studio/autopost/routines
                </a>
                . Not auto-migrated into Automations connectors.
              </p>
            </div>
            <PostingRoutinesSection />
            <DistributionRulesSection />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

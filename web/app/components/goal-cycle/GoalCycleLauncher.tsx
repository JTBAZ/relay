"use client";

/**
 * Library Goal Cycle entry — VS6-T05 + VS7-T06 Dream handoff.
 * Approves via materialization API; notifies parent for rail focus after receipt.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type {
  GoalCycleDetail,
  GoalCycleMaterializationReceipt,
  GoalCyclePlan
} from "@/lib/goal-cycle-types";
import { approveCreatorGoalCycle, RelayApiError } from "@/lib/relay-api";
import { GoalCycleFlow, type GoalCycleFlowApi } from "./GoalCycleFlow";
import {
  createGoalCycleFlowApi,
  fetchActiveCreatorGoalCycle
} from "./goal-cycle-flow-api";
import {
  deriveGoalCycleEntryCta,
  type GoalCycleEntryCta
} from "./goal-cycle-machine";
import { collectRailEventIds } from "./goal-cycle-rail-handoff";
import "./goal-cycle.css";

const CTA_LABEL: Record<GoalCycleEntryCta, string> = {
  plan_this_month: "Plan this month",
  resume_plan: "Resume Plan",
  review_completion: "Review completion"
};

const CTA_HINT: Record<GoalCycleEntryCta, string> = {
  plan_this_month: "Research, Plan, and schedule while the Schedule Rail stays available.",
  resume_plan: "Continue your in-progress Plan.",
  review_completion: "Review cycle outcomes or start the next Plan."
};

export type GoalCycleLauncherProps = {
  api?: GoalCycleFlowApi;
  hydrate?: () => Promise<{ cycle: GoalCycleDetail | null }>;
  linkedDestinationIds?: string[];
  /**
   * Called only after a persisted materialization receipt.
   * Parent should refresh/focus the Schedule Rail from receipt event ids.
   */
  onMaterialized?: (receipt: GoalCycleMaterializationReceipt) => void | Promise<void>;
};

export function GoalCycleLauncher({
  api = createGoalCycleFlowApi(),
  hydrate = fetchActiveCreatorGoalCycle,
  linkedDestinationIds,
  onMaterialized
}: GoalCycleLauncherProps) {
  const labelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const approvalKeyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [cycle, setCycle] = useState<GoalCycleDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hydrate();
      setCycle(res.cycle);
      setAvailable(true);
    } catch (err) {
      // Feature disabled / route missing — hide quietly; posting rhythm card stays.
      if (
        err instanceof RelayApiError &&
        (err.status === 404 || err.status === 403 || err.status === 501)
      ) {
        setAvailable(false);
      }
      setCycle(null);
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!open) {
      approvalKeyRef.current = null;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setAnnounce("Plan closed — progress saved for resume.");
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleApprove = useCallback(
    async (c: GoalCycleDetail, _plan: GoalCyclePlan) => {
      if (!approvalKeyRef.current) {
        approvalKeyRef.current =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `approve_${c.cycle_id}_${crypto.randomUUID()}`
            : `approve_${c.cycle_id}_${Date.now()}`;
      }
      const result = await approveCreatorGoalCycle(
        c.cycle_id,
        {
          expected_version: c.version,
          approval_key: approvalKeyRef.current
        },
        { idempotencyKey: approvalKeyRef.current }
      );
      setCycle(result.cycle);
      const eventIds = collectRailEventIds(result.receipt);
      setAnnounce(
        eventIds.length > 0
          ? `Plan approved — ${eventIds.length} rail event${eventIds.length === 1 ? "" : "s"} created.`
          : "Plan approved — silence receipt saved."
      );
      await onMaterialized?.(result.receipt);
      return { receipt: result.receipt, cycle: result.cycle };
    },
    [onMaterialized]
  );

  if (!available) return null;

  const cta = deriveGoalCycleEntryCta(cycle);
  const label = CTA_LABEL[cta];

  return (
    <section
      className="goal-cycle-launcher"
      aria-labelledby={labelId}
      data-testid="goal-cycle-launcher"
      data-cta={cta}
    >
      <button
        ref={triggerRef}
        type="button"
        className="goal-cycle-entry-btn"
        disabled={loading}
        data-testid="goal-cycle-entry-cta"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={`${labelId}-hint`}
        title={CTA_HINT[cta]}
        onClick={() => {
          setOpen(true);
          setAnnounce(`${label} opened.`);
        }}
      >
        <span className="goal-cycle-entry-btn__icon" aria-hidden>
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <span className="goal-cycle-entry-btn__copy">
          <span id={labelId} className="goal-cycle-entry-btn__eyebrow">
            Coach Plan
          </span>
          <span className="goal-cycle-entry-btn__label">
            {loading ? "Loading…" : label}
          </span>
        </span>
      </button>
      <p id={`${labelId}-hint`} className="sr-only">
        {CTA_HINT[cta]}
      </p>

      <div className="sr-only" aria-live="polite" data-testid="goal-cycle-announce">
        {announce}
      </div>

      {open ? (
        <div className="goal-cycle-drawer-root" data-testid="goal-cycle-drawer">
          <button
            type="button"
            className="goal-cycle-drawer-backdrop"
            aria-label="Close Plan drawer"
            data-testid="goal-cycle-drawer-backdrop"
            onClick={() => {
              setOpen(false);
              setAnnounce("Plan closed — progress saved for resume.");
              triggerRef.current?.focus();
            }}
          />
          <div className="goal-cycle-drawer-panel">
            <GoalCycleFlow
              open={open}
              initialCycle={cycle}
              api={api}
              linkedDestinationIds={linkedDestinationIds}
              onApprove={handleApprove}
              onClose={() => {
                setOpen(false);
                setAnnounce("Plan closed — progress saved for resume.");
                void reload();
                triggerRef.current?.focus();
              }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

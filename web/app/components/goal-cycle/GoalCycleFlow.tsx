"use client";

/**
 * Goal Cycle Dream-flow shell (VS6-T03/T04 + VS7-T06 handoff).
 * Approval awaits materialization; failure keeps the review/approval step.
 */

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import type {
  GoalCycleBreakMode,
  GoalCycleDetail,
  GoalCycleGoalKind,
  GoalCycleMaterializationReceipt,
  GoalCyclePlan,
  GoalCyclePlanSlot,
  GoalCycleQuestion
} from "@/lib/goal-cycle-types";
import { syncSlotScheduledUtc } from "@/lib/goal-cycle-schedule-local";
import { cancelCreatorGoalCycle, RelayApiError } from "@/lib/relay-api";
import { ActiveCyclePanel } from "./ActiveCyclePanel";
import { ApprovalStep } from "./ApprovalStep";
import { ContextStep, type GoalCycleContextFields } from "./ContextStep";
import { GoalCycleErrorState } from "./GoalCycleErrorState";
import { GoalStep } from "./GoalStep";
import { LogisticsStep } from "./LogisticsStep";
import { PlanStep } from "./PlanStep";
import { QuestionsStep } from "./QuestionsStep";
import { ReceiptSummary } from "./ReceiptSummary";
import { ResearchStep } from "./ResearchStep";
import {
  canNavigateToPhase,
  createInitialGoalCycleMachineState,
  reduceGoalCycleMachine,
  type GoalCycleMachineEvent
} from "./goal-cycle-machine";
import "./goal-cycle.css";

export type GoalCycleResearchStatusWire = {
  cycle_id: string;
  request_id: string | null;
  status: "not_started" | "pending" | "complete" | "failed";
  mode: string;
  progress: GoalCycleDetail["progress"];
  error_code: string | null;
  strength: string | null;
  confidence: string | null;
};

export type GoalCycleFlowApi = {
  startCycle: (input: {
    goal_kind: GoalCycleGoalKind;
    break_mode?: GoalCycleBreakMode | null;
    context?: Record<string, unknown> | null;
  }) => Promise<{ cycle: GoalCycleDetail }>;
  patchCheckpoint: (
    cycleId: string,
    body: {
      expected_version: number;
      phase?: GoalCycleDetail["phase"];
      state?: GoalCycleDetail["state"];
      context?: Record<string, unknown> | null;
    }
  ) => Promise<{ cycle: GoalCycleDetail }>;
  startResearch: (
    cycleId: string,
    body: { topic: string; request_id?: string; creator_context?: Record<string, unknown> }
  ) => Promise<{ research: GoalCycleResearchStatusWire }>;
  getResearch: (
    cycleId: string,
    requestId?: string | null
  ) => Promise<{ research: GoalCycleResearchStatusWire }>;
  fetchCycle: (cycleId: string) => Promise<{ cycle: GoalCycleDetail }>;
  proposeQuestions: (
    cycleId: string,
    body?: { expected_version?: number; deterministic_only?: boolean }
  ) => Promise<{ questions: GoalCycleQuestion[]; cycle: GoalCycleDetail }>;
  answerQuestions: (
    cycleId: string,
    body: {
      expected_version: number;
      answers: Array<{ id: string; answer: string }>;
    }
  ) => Promise<{ cycle: GoalCycleDetail }>;
  generatePlan: (
    cycleId: string,
    body?: { expected_version?: number; skip_questions?: boolean; force_fallback?: boolean }
  ) => Promise<{ plan: GoalCyclePlan; cycle: GoalCycleDetail }>;
  revisePlan: (
    cycleId: string,
    body: { revision_note: string; expected_version?: number; force_fallback?: boolean }
  ) => Promise<{ plan: GoalCyclePlan; cycle: GoalCycleDetail; ai_revision_count: number }>;
  manualEditPlan: (
    cycleId: string,
    body: { plan: GoalCyclePlan; expected_version?: number }
  ) => Promise<{ plan: GoalCyclePlan; cycle: GoalCycleDetail }>;
};

export type GoalCycleFlowProps = {
  open: boolean;
  onClose: () => void;
  initialCycle?: GoalCycleDetail | null;
  api: GoalCycleFlowApi;
  /** Linked posting destinations — unlinked never become tasks. */
  linkedDestinationIds?: string[];
  /**
   * VS7 materialization. Must resolve only after a persisted receipt.
   * On reject, the flow stays on approval (no rail choreography).
   */
  onApprove?: (
    cycle: GoalCycleDetail,
    plan: GoalCyclePlan
  ) => Promise<{
    receipt: GoalCycleMaterializationReceipt;
    cycle: GoalCycleDetail;
  } | void> | void;
  onAdvancePastQuestions?: (cycle: GoalCycleDetail) => void;
};

function contextFromCycle(cycle: GoalCycleDetail | null): GoalCycleContextFields {
  const ctx = cycle?.context ?? {};
  return {
    topic: typeof ctx.topic === "string" ? ctx.topic : "",
    niche: typeof ctx.niche === "string" ? ctx.niche : "",
    notes: typeof ctx.notes === "string" ? ctx.notes : ""
  };
}

function questionsFromCycle(cycle: GoalCycleDetail | null): GoalCycleQuestion[] {
  const fromPlan = cycle?.plan?.questions_asked;
  if (Array.isArray(fromPlan) && fromPlan.length) return fromPlan.slice(0, 2);
  const raw = cycle?.context?.planner_questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is GoalCycleQuestion => Boolean(q && typeof q === "object"))
    .slice(0, 2);
}

function mapApiError(err: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  conflict: boolean;
  noCredit: boolean;
} {
  if (err instanceof RelayApiError) {
    const conflict = err.code === "GOAL_CYCLE_VERSION_CONFLICT" || err.status === 409;
    const noCredit = err.code === "GOAL_CYCLE_NO_CREDIT";
    return {
      code: err.code ?? `HTTP_${err.status}`,
      message: err.message,
      retryable: err.status >= 500 || err.status === 429 || conflict,
      conflict,
      noCredit
    };
  }
  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : "Unexpected error",
    retryable: true,
    conflict: false,
    noCredit: false
  };
}

export function GoalCycleFlow({
  open,
  onClose,
  initialCycle = null,
  api,
  linkedDestinationIds = ["patreon", "x", "bluesky"],
  onApprove,
  onAdvancePastQuestions
}: GoalCycleFlowProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const destinationContext = useMemo(
    () => ({
      linked_destinations: linkedDestinationIds,
      unlinked_destinations: ["deviantart", "patreon", "x", "bluesky"].filter(
        (id) => !linkedDestinationIds.includes(id)
      )
    }),
    [linkedDestinationIds]
  );
  const [machine, dispatch] = useReducer(
    reduceGoalCycleMachine,
    undefined,
    createInitialGoalCycleMachineState
  );
  const [goalKind, setGoalKind] = useState<GoalCycleGoalKind | null>(
    initialCycle?.goal_kind ?? null
  );
  const [breakMode, setBreakMode] = useState<GoalCycleBreakMode | null>(
    initialCycle?.break_mode ?? null
  );
  const [contextFields, setContextFields] = useState<GoalCycleContextFields>(() =>
    contextFromCycle(initialCycle)
  );
  const [questions, setQuestions] = useState<GoalCycleQuestion[]>(() =>
    questionsFromCycle(initialCycle)
  );
  const [plan, setPlan] = useState<GoalCyclePlan | null>(initialCycle?.plan ?? null);
  const [revisionNote, setRevisionNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [researching, setResearching] = useState(false);
  const [noCredit, setNoCredit] = useState(false);
  const [researchRequestId, setResearchRequestId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<GoalCycleMaterializationReceipt | null>(null);
  const [approving, setApproving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);

  const send = useCallback((event: GoalCycleMachineEvent) => {
    dispatch(event);
  }, []);

  useEffect(() => {
    if (!open) return;
    send({ type: "OPEN" });
    if (initialCycle) {
      send({ type: "SYNC_FROM_SERVER", cycle: initialCycle });
      setGoalKind(initialCycle.goal_kind);
      setBreakMode(initialCycle.break_mode);
      setContextFields(contextFromCycle(initialCycle));
      setQuestions(questionsFromCycle(initialCycle));
      setPlan(initialCycle.plan);
    } else {
      send({ type: "LOAD_SUCCESS", cycle: null });
      send({ type: "REQUEST_PHASE", phase: "goal" });
    }
  }, [open, initialCycle, send]);

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled])"
    );
    node?.focus();
  }, [open, machine.uiPhase, machine.status]);

  const runMutation = useCallback(
    async (label: string, work: () => Promise<GoalCycleDetail>) => {
      send({ type: "MUTATION_PENDING", mutation: label });
      try {
        const cycle = await work();
        send({ type: "MUTATION_SUCCESS", cycle });
        if (cycle.plan) setPlan(cycle.plan);
        setNoCredit(false);
        return cycle;
      } catch (err) {
        const mapped = mapApiError(err);
        if (mapped.noCredit) {
          setNoCredit(true);
          send({ type: "CLEAR_ERROR" });
          return null;
        }
        if (mapped.conflict) {
          send({ type: "VERSION_CONFLICT", message: mapped.message });
        } else {
          send({
            type: "MUTATION_ERROR",
            code: mapped.code,
            message: mapped.message,
            retryable: mapped.retryable
          });
        }
        return null;
      }
    },
    [send]
  );

  const silence = goalKind === "break" && breakMode === "complete_silence";
  const phase = machine.uiPhase ?? "goal";
  const cycle = machine.cycle;
  const postPlanning =
    cycle != null &&
    (cycle.state === "active" ||
      cycle.state === "materializing" ||
      cycle.state === "approved" ||
      cycle.state === "completion_suggested" ||
      phase === "active" ||
      phase === "completion" ||
      phase === "learning");
  const busy =
    machine.status === "mutating" ||
    machine.status === "loading" ||
    researching ||
    generating ||
    approving ||
    cancelling;

  const onCancelActiveCycle = async () => {
    if (!cycle || cancelling) return;
    setCancelling(true);
    send({ type: "CLEAR_ERROR" });
    try {
      await cancelCreatorGoalCycle(cycle.cycle_id, "creator_cancelled_for_new_plan");
      handleClose();
    } catch (err) {
      const mapped = mapApiError(err);
      send({
        type: "MUTATION_ERROR",
        code: mapped.code,
        message: mapped.message,
        retryable: mapped.retryable
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleClose = () => {
    send({ type: "CLOSE" });
    onClose();
  };

  const onGoalContinue = async (
    kindOverride?: GoalCycleGoalKind,
    breakOverride?: GoalCycleBreakMode | null
  ) => {
    const kind = kindOverride ?? goalKind;
    if (!kind) return;
    const mode =
      kind === "break"
        ? breakOverride !== undefined
          ? breakOverride
          : breakMode
        : null;
    if (kind === "break" && !mode) return;

    if (kindOverride) setGoalKind(kindOverride);
    if (kind === "break" && breakOverride !== undefined) {
      setBreakMode(breakOverride);
    } else if (kind !== "break") {
      setBreakMode(null);
    }

    const work = async () => {
      if (cycle) {
        const res = await api.patchCheckpoint(cycle.cycle_id, {
          expected_version: cycle.version,
          phase: "context",
          context: {
            ...cycle.context,
            ...destinationContext,
            goal_kind: kind,
            break_mode: mode
          }
        });
        return res.cycle;
      }
      const res = await api.startCycle({
        goal_kind: kind,
        break_mode: mode,
        context: { ...destinationContext }
      });
      return res.cycle;
    };

    retryActionRef.current = async () => {
      await onGoalContinue(kind, mode);
    };
    const next = await runMutation("start_or_checkpoint", work);
    if (next) send({ type: "REQUEST_PHASE", phase: "context" });
  };

  const onContextContinue = async () => {
    if (!cycle) return;
    const context = {
      ...cycle.context,
      ...destinationContext,
      topic: contextFields.topic.trim(),
      niche: contextFields.niche.trim(),
      notes: contextFields.notes.trim()
    };
    send({ type: "SET_DRAFT_CONTEXT", patch: context });
    retryActionRef.current = async () => {
      await onContextContinue();
    };
    const next = await runMutation("context_checkpoint", async () => {
      const res = await api.patchCheckpoint(cycle.cycle_id, {
        expected_version: cycle.version,
        phase: "research",
        context
      });
      return res.cycle;
    });
    if (next) send({ type: "REQUEST_PHASE", phase: "research" });
  };

  const pollResearch = async (cycleId: string, requestId: string) => {
    for (let i = 0; i < 40; i += 1) {
      const { research } = await api.getResearch(cycleId, requestId);
      if (research.status === "complete" || research.status === "failed") {
        return research;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new RelayApiError("Research timed out.", 504, "RESEARCH_TIMEOUT");
  };

  const onStartResearch = async () => {
    if (!cycle || silence) return;
    const topic = contextFields.topic.trim() || "creator history";
    const requestId = researchRequestId ?? `research_${cycle.cycle_id}_${Date.now()}`;
    setResearchRequestId(requestId);
    setResearching(true);
    send({ type: "MUTATION_PENDING", mutation: "research" });
    retryActionRef.current = async () => {
      await onStartResearch();
    };
    try {
      const started = await api.startResearch(cycle.cycle_id, {
        topic,
        request_id: requestId,
        creator_context: {
          niche: contextFields.niche,
          notes: contextFields.notes
        }
      });
      let research = started.research;
      if (research.status === "pending" || research.status === "not_started") {
        research = await pollResearch(cycle.cycle_id, requestId);
      }
      if (research.status === "failed") {
        throw new RelayApiError(
          research.error_code ?? "Research failed.",
          502,
          research.error_code ?? "RESEARCH_FAILED"
        );
      }
      const refreshed = await api.fetchCycle(cycle.cycle_id);
      send({ type: "MUTATION_SUCCESS", cycle: refreshed.cycle });
      if (refreshed.cycle.plan) setPlan(refreshed.cycle.plan);
    } catch (err) {
      const mapped = mapApiError(err);
      if (mapped.noCredit) {
        setNoCredit(true);
        send({ type: "CLEAR_ERROR" });
      } else if (mapped.conflict) {
        send({ type: "VERSION_CONFLICT", message: mapped.message });
      } else {
        send({
          type: "MUTATION_ERROR",
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable
        });
      }
    } finally {
      setResearching(false);
    }
  };

  const onResearchContinue = async () => {
    if (!cycle) return;
    if (silence) {
      send({ type: "REQUEST_PHASE", phase: "questions" });
      setQuestions([]);
      return;
    }
    retryActionRef.current = async () => {
      await onResearchContinue();
    };
    send({ type: "MUTATION_PENDING", mutation: "questions" });
    try {
      const res = await api.proposeQuestions(cycle.cycle_id, {
        expected_version: cycle.version,
        deterministic_only: true
      });
      setQuestions(res.questions.slice(0, 2));
      send({ type: "MUTATION_SUCCESS", cycle: res.cycle });
      if (res.cycle.plan) setPlan(res.cycle.plan);
      send({ type: "REQUEST_PHASE", phase: "questions" });
    } catch (err) {
      const mapped = mapApiError(err);
      if (mapped.noCredit) {
        setNoCredit(true);
        send({ type: "CLEAR_ERROR" });
      } else if (mapped.conflict) {
        send({ type: "VERSION_CONFLICT", message: mapped.message });
      } else {
        send({
          type: "MUTATION_ERROR",
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable
        });
      }
    }
  };

  const enterPlanPhase = async (fromCycle: GoalCycleDetail) => {
    onAdvancePastQuestions?.(fromCycle);
    send({ type: "REQUEST_PHASE", phase: "revisions" });
    if (!fromCycle.plan && !plan) {
      await onGeneratePlan(fromCycle);
    } else if (fromCycle.plan) {
      setPlan(fromCycle.plan);
    }
  };

  const onQuestionsContinue = async () => {
    if (!cycle) return;
    const answers = questions
      .slice(0, 2)
      .map((q) => ({
        id: q.id,
        answer: (q.answer ?? q.bounded_text ?? "").trim()
      }))
      .filter((a) => a.answer);

    retryActionRef.current = async () => {
      await onQuestionsContinue();
    };

    if (answers.length === 0) {
      await enterPlanPhase(cycle);
      return;
    }

    const next = await runMutation("answers", async () => {
      const res = await api.answerQuestions(cycle.cycle_id, {
        expected_version: cycle.version,
        answers
      });
      return res.cycle;
    });
    if (next) {
      setQuestions(questionsFromCycle(next));
      await enterPlanPhase(next);
    }
  };

  const onGeneratePlan = async (fromCycle?: GoalCycleDetail) => {
    const active = fromCycle ?? cycle;
    if (!active) return;
    setGenerating(true);
    retryActionRef.current = async () => {
      await onGeneratePlan(active);
    };
    try {
      send({ type: "MUTATION_PENDING", mutation: "generate" });
      const res = await api.generatePlan(active.cycle_id, {
        expected_version: active.version,
        skip_questions: true,
        force_fallback: true
      });
      setPlan(res.plan);
      send({ type: "MUTATION_SUCCESS", cycle: { ...res.cycle, plan: res.plan } });
    } catch (err) {
      const mapped = mapApiError(err);
      if (mapped.noCredit) {
        setNoCredit(true);
        send({ type: "CLEAR_ERROR" });
      } else if (mapped.conflict) {
        send({ type: "VERSION_CONFLICT", message: mapped.message });
      } else {
        send({
          type: "MUTATION_ERROR",
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable
        });
      }
    } finally {
      setGenerating(false);
    }
  };

  const onRevisePlan = async () => {
    if (!cycle || !plan || !revisionNote.trim()) return;
    if (plan.ai_revision_count >= 2) return;
    retryActionRef.current = async () => {
      await onRevisePlan();
    };
    setGenerating(true);
    try {
      send({ type: "MUTATION_PENDING", mutation: "revise" });
      const res = await api.revisePlan(cycle.cycle_id, {
        revision_note: revisionNote.trim(),
        expected_version: cycle.version,
        force_fallback: true
      });
      setPlan(res.plan);
      setRevisionNote("");
      send({ type: "MUTATION_SUCCESS", cycle: { ...res.cycle, plan: res.plan } });
    } catch (err) {
      const mapped = mapApiError(err);
      if (mapped.conflict) {
        send({ type: "VERSION_CONFLICT", message: mapped.message });
      } else {
        send({
          type: "MUTATION_ERROR",
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable
        });
      }
    } finally {
      setGenerating(false);
    }
  };

  const persistManualPlan = async (nextPlan: GoalCyclePlan) => {
    if (!cycle) {
      setPlan(nextPlan);
      return;
    }
    retryActionRef.current = async () => {
      await persistManualPlan(nextPlan);
    };
    const res = await runMutation("manual_edit", async () => {
      const out = await api.manualEditPlan(cycle.cycle_id, {
        plan: nextPlan,
        expected_version: cycle.version
      });
      setPlan(out.plan);
      return { ...out.cycle, plan: out.plan };
    });
    if (res?.plan) setPlan(res.plan);
  };

  const onSlotChange = (slotId: string, patch: Partial<GoalCyclePlanSlot>) => {
    if (!plan) return;
    const next: GoalCyclePlan = {
      ...plan,
      slots: plan.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)).slice(0, 8)
    };
    setPlan(next);
  };

  const onLogisticsNotesChange = (notes: string) => {
    if (!plan) return;
    setPlan({
      ...plan,
      logistics: { ...plan.logistics, notes: notes || null }
    });
  };

  const onPlanContinue = async () => {
    if (!plan || !cycle) return;
    const next: GoalCyclePlan = {
      ...plan,
      slots: plan.slots.slice(0, 8),
      logistics: {
        ...plan.logistics,
        linked_destination_ids: linkedDestinationIds
      }
    };
    await persistManualPlan(next);
    send({ type: "REQUEST_PHASE", phase: "logistics" });
  };

  const onLogisticsContinue = async () => {
    if (!plan) return;
    const synced: GoalCyclePlan = {
      ...plan,
      slots: plan.slots.map((slot) =>
        syncSlotScheduledUtc(slot, plan.logistics.time_zone)
      )
    };
    await persistManualPlan(synced);
    send({ type: "REQUEST_PHASE", phase: "approval" });
  };

  const onApprovalConfirm = async () => {
    if (!cycle || !plan || approving) return;
    setApproving(true);
    send({ type: "CLEAR_ERROR" });
    try {
      const result = await onApprove?.(cycle, plan);
      if (result?.receipt) {
        setReceipt(result.receipt);
        send({ type: "SYNC_FROM_SERVER", cycle: result.cycle });
        setPlan(result.cycle.plan ?? plan);
      }
    } catch (err) {
      const mapped = mapApiError(err);
      if (mapped.conflict) {
        send({ type: "VERSION_CONFLICT", message: mapped.message });
      } else {
        send({
          type: "MUTATION_ERROR",
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable
        });
      }
      // Stay on approval — no rail animation on failure.
    } finally {
      setApproving(false);
    }
  };

  const updateQuestionAnswer = (id: string, answer: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, answer, bounded_text: q.bounded_text } : q))
    );
  };

  const updateQuestionText = (id: string, text: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, bounded_text: text, answer: text } : q
      )
    );
  };

  if (!open) return null;

  const showError =
    machine.status === "error" || machine.status === "version_conflict";

  return (
    <div
      className="goal-cycle-flow"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="goal-cycle-flow"
      data-phase={phase}
    >
      <div className="goal-cycle-flow__chrome">
        <h1 id={titleId} className="goal-cycle-step__title">
          {postPlanning && !receipt ? "Active Plan" : "Plan this month"}
        </h1>
        <button
          type="button"
          className="goal-cycle-btn goal-cycle-btn--ghost"
          onClick={handleClose}
          data-testid="goal-cycle-close"
        >
          Close
        </button>
      </div>

      <div ref={panelRef} className="goal-cycle-flow__body">
        {showError && machine.lastError ? (
          <GoalCycleErrorState
            title={
              machine.status === "version_conflict"
                ? "Plan changed elsewhere"
                : "Couldn’t continue"
            }
            message={machine.lastError.message}
            retryable={machine.lastError.retryable}
            conflict={machine.status === "version_conflict"}
            onRetry={() => {
              send({ type: "RETRY" });
              void retryActionRef.current?.();
            }}
            onDismiss={() => send({ type: "CLEAR_ERROR" })}
          />
        ) : null}

        {!showError && !postPlanning && phase === "goal" ? (
          <GoalStep
            goalKind={goalKind}
            breakMode={breakMode}
            disabled={busy}
            noCredit={noCredit}
            onGoalKindChange={(kind) => {
              setGoalKind(kind);
              setNoCredit(false);
              if (kind !== "break") setBreakMode(null);
            }}
            onBreakModeChange={(mode) => {
              setBreakMode(mode);
              setNoCredit(false);
            }}
            onAdvance={(kind, mode) => void onGoalContinue(kind, mode)}
          />
        ) : null}

        {!showError && !postPlanning && phase === "context" ? (
          <ContextStep
            value={contextFields}
            disabled={busy}
            onChange={(patch) =>
              setContextFields((prev) => ({ ...prev, ...patch }))
            }
            onBack={() => {
              if (canNavigateToPhase(cycle, "goal")) {
                send({ type: "REQUEST_PHASE", phase: "goal" });
              }
            }}
            onContinue={() => void onContextContinue()}
          />
        ) : null}

        {!showError && !postPlanning && phase === "research" ? (
          <ResearchStep
            silence={silence}
            credit={cycle?.credit ?? null}
            progress={cycle?.progress ?? []}
            evidence={cycle?.evidence ?? []}
            researching={researching}
            noCredit={noCredit}
            disabled={busy}
            onStartResearch={() => void onStartResearch()}
            onBack={() => {
              if (canNavigateToPhase(cycle, "context")) {
                send({ type: "REQUEST_PHASE", phase: "context" });
              }
            }}
            onContinue={() => void onResearchContinue()}
          />
        ) : null}

        {!showError && !postPlanning && phase === "questions" ? (
          <QuestionsStep
            questions={questions}
            disabled={busy}
            onAnswer={updateQuestionAnswer}
            onBoundedText={updateQuestionText}
            onBack={() => {
              if (canNavigateToPhase(cycle, "research")) {
                send({ type: "REQUEST_PHASE", phase: "research" });
              }
            }}
            onContinue={() => void onQuestionsContinue()}
          />
        ) : null}

        {!showError && !postPlanning && phase === "revisions" ? (
          <PlanStep
            plan={plan}
            generating={generating}
            disabled={busy}
            revisionNote={revisionNote}
            onRevisionNoteChange={setRevisionNote}
            onGenerate={() => void onGeneratePlan()}
            onRevise={() => void onRevisePlan()}
            onSlotChange={onSlotChange}
            onBack={() => {
              if (canNavigateToPhase(cycle, "questions")) {
                send({ type: "REQUEST_PHASE", phase: "questions" });
              }
            }}
            onContinue={() => void onPlanContinue()}
          />
        ) : null}

        {!showError && !postPlanning && phase === "logistics" && plan ? (
          <LogisticsStep
            plan={plan}
            linkedDestinationIds={linkedDestinationIds}
            disabled={busy}
            onSlotChange={onSlotChange}
            onLogisticsNotesChange={onLogisticsNotesChange}
            onBack={() => send({ type: "REQUEST_PHASE", phase: "revisions" })}
            onContinue={() => void onLogisticsContinue()}
          />
        ) : null}

        {!showError && receipt ? (
          <ReceiptSummary
            receipt={receipt}
            plan={plan}
            onDone={handleClose}
          />
        ) : null}

        {!showError && !receipt && postPlanning && cycle ? (
          <ActiveCyclePanel
            cycle={cycle}
            plan={plan}
            cancelling={cancelling}
            onClose={handleClose}
            onCancelCycle={onCancelActiveCycle}
          />
        ) : null}

        {!showError && !receipt && !postPlanning && phase === "approval" && plan && cycle ? (
          <ApprovalStep
            cycle={cycle}
            plan={plan}
            disabled={busy}
            onApprove={() => void onApprovalConfirm()}
            onBack={() => send({ type: "REQUEST_PHASE", phase: "logistics" })}
          />
        ) : null}
      </div>
    </div>
  );
}

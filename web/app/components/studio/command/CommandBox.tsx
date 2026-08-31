"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import { ArrowRight } from "lucide-react";
import {
  applyCreatorCommand,
  cancelSelectionProposal,
  createSelectionProposal,
  fetchActiveSelectionProposal,
  fetchCommandFlags,
  fetchCommandPlanProposal,
  interpretLab2Command,
  patchCommandPlanProposal,
  patchSelectionProposal,
  refineCommandPlanProposal,
  refineSelectionProposal,
  resetLab2PlaygroundBaseline,
  undoCreatorCommand,
  type CommandFinitePlanSlotClient,
  type CommandRuntimeFlags,
  type CommandSelectionProposalClient,
  type CommandSelectionProposalPatchOp,
  type GalleryItem,
  type Lab2HarnessInterpretResult
} from "@/lib/relay-api";
import { fetchScheduleRail } from "@/lib/schedule-rail-api";
import type { ScheduleEvent } from "@/lib/schedule-rail-data";
import { monthKeyFromIso, shouldOpenPlanWorkbench } from "@/lib/command-plan-workbench";
import { highestCommandRisk, isStaleChangeSetError, type CommandRiskClass } from "@/lib/command-risk";
import {
  clearLab2LastApplied,
  readLab2LastApplied,
  writeLab2LastApplied
} from "@/lib/studio-view-preset";
import ChangeSetSummary from "./ChangeSetSummary";
import ClarificationPrompt from "./ClarificationPrompt";
import PlanWorkbench from "./PlanWorkbench";
import SelectionReviewOverlay from "./SelectionReviewOverlay";
import {
  LAB3_COMMAND_STARTERS,
  Lab3CommandGhost,
  Lab3CommandStarterRail,
  Lab3CommandTeaching
} from "./Lab3CommandStarters";
import {
  collectionMetaFromPreviewOps,
  isActiveSelectionProposalConflict,
  shouldHideLibraryApply,
  shouldOpenSelectionReview,
  isFrozenSelectionStage
} from "@/lib/command-selection-review";

export type CommandBoxState =
  | "idle"
  | "interpreting"
  | "clarification"
  | "preview"
  | "selection_review"
  | "selection_approved"
  | "applying"
  | "applied"
  | "error"
  | "undone";

export type Lab2CommandHarnessState = CommandBoxState;

export type Lab2CommandAppliedHint = {
  lens: "collections" | "schedule" | null;
  changeSetId: string;
  focusMonth?: string;
};

type PreviewPayload = Extract<Lab2HarnessInterpretResult, { kind: "preview" }>;
type ClarificationPayload = Extract<Lab2HarnessInterpretResult, { kind: "clarification" }>;

export type CommandBoxProps = {
  creatorId: string;
  label?: string;
  placeholder?: string;
  showResetBaseline?: boolean;
  surface?: "lab2" | "lab3" | "studio";
  /** Lab 3 Studio Command instrument. Default is the Lab 2 toolbar. */
  presentation?: "toolbar" | "instrument";
  onApplied?: (hint: Lab2CommandAppliedHint) => void;
  onUndone?: () => void;
  onResetBaseline?: () => void;
  interpret?: typeof interpretLab2Command;
  apply?: typeof applyCreatorCommand;
  undo?: typeof undoCreatorCommand;
  resetBaseline?: typeof resetLab2PlaygroundBaseline;
  flags?: CommandRuntimeFlags;
  loadFlags?: typeof fetchCommandFlags;
  libraryItems?: GalleryItem[];
  createProposal?: typeof createSelectionProposal;
  cancelProposal?: typeof cancelSelectionProposal;
  fetchActiveProposal?: typeof fetchActiveSelectionProposal;
  patchProposal?: typeof patchSelectionProposal;
  refineProposal?: typeof refineSelectionProposal;
  fetchPlan?: typeof fetchCommandPlanProposal;
  patchPlan?: typeof patchCommandPlanProposal;
  refinePlan?: typeof refineCommandPlanProposal;
  loadOccupancy?: (month: string) => Promise<ScheduleEvent[]>;
};

async function defaultLoadPlanOccupancy(month: string): Promise<ScheduleEvent[]> {
  try {
    const rail = await fetchScheduleRail({ month });
    return rail.events ?? [];
  } catch {
    return [];
  }
}

export default function CommandBox({
  creatorId,
  label = "Command",
  placeholder = "Type a command (Hero Academy, watercolor, Academy…)",
  showResetBaseline = false,
  surface = "studio",
  presentation = "toolbar",
  onApplied,
  onUndone,
  onResetBaseline,
  interpret = interpretLab2Command,
  apply = applyCreatorCommand,
  undo = undoCreatorCommand,
  resetBaseline = resetLab2PlaygroundBaseline,
  flags: flagsProp,
  loadFlags = fetchCommandFlags,
  libraryItems = [],
  createProposal = createSelectionProposal,
  cancelProposal = cancelSelectionProposal,
  fetchActiveProposal = fetchActiveSelectionProposal,
  patchProposal = patchSelectionProposal,
  refineProposal = refineSelectionProposal,
  fetchPlan = fetchCommandPlanProposal,
  patchPlan = patchCommandPlanProposal,
  refinePlan = refineCommandPlanProposal,
  loadOccupancy = defaultLoadPlanOccupancy
}: CommandBoxProps) {
  const fieldId = useId();
  const clarifyId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const clarifyRef = useRef<HTMLFieldSetElement>(null);
  const ghostExampleRef = useRef(LAB3_COMMAND_STARTERS[0].examples[0]);
  const rememberGhostExample = useCallback((example: string) => {
    ghostExampleRef.current = example;
  }, []);

  const [state, setState] = useState<CommandBoxState>("idle");
  const [instruction, setInstruction] = useState("");
  const [choice, setChoice] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [clarification, setClarification] = useState<ClarificationPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scheduleHint, setScheduleHint] = useState(false);
  const [stale, setStale] = useState(false);
  const [fetchedFlags, setFetchedFlags] = useState<CommandRuntimeFlags | null>(null);
  const [hydratedUndo, setHydratedUndo] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [selectionProposal, setSelectionProposal] = useState<CommandSelectionProposalClient | null>(
    null
  );
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [patchBusy, setPatchBusy] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [refinement, setRefinement] = useState<{
    summary: string;
    op: "exclude" | "restore";
    post_ids: string[];
  } | null>(null);
  const [resolutionBusy, setResolutionBusy] = useState(false);
  const [planDraft, setPlanDraft] = useState<NonNullable<CommandSelectionProposalClient["plan"]> | null>(
    null
  );
  const [planSlots, setPlanSlots] = useState<CommandFinitePlanSlotClient[]>([]);
  const [planDismissed, setPlanDismissed] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planRefineSummary, setPlanRefineSummary] = useState<string | null>(null);
  const [occupancy, setOccupancy] = useState<ScheduleEvent[]>([]);
  const [appliedChangeSetId, setAppliedChangeSetId] = useState<string | null>(null);

  useEffect(() => {
    if (flagsProp) return;
    if (typeof loadFlags !== "function") return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => loadFlags())
      .then((next) => {
        if (!cancelled && next) setFetchedFlags(next);
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedFlags({
            layer_enabled: false,
            apply_enabled: false,
            mcp_enabled: false,
            studio_ux_enabled: false,
            selection_ux_enabled: false,
            schedule_plan_enabled: false
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [flagsProp, loadFlags]);

  useEffect(() => {
    if (surface !== "lab2" || hydratedUndo) return;
    const last = readLab2LastApplied();
    setHydratedUndo(true);
    if (!last) return;
    setInstruction(last.instruction);
    setPreview({
      kind: "preview",
      scenario_id: "restored-after-refresh",
      change_set_id: last.change_set_id,
      instruction: last.instruction,
      resolved_post_ids: [],
      ops: [
        {
          op_id: "op_restored",
          capability: "undo_change_set",
          risk_class: "execute_undo",
          target_ids: [last.change_set_id],
          payload: {}
        }
      ],
      write_layer: last.write_layer as PreviewPayload["write_layer"],
      warnings: last.warnings,
      summary: last.summary,
      lens_hint: last.lens_hint,
      apply_ready: true
    });
    setState("applied");
  }, [surface, hydratedUndo]);

  const runtimeFlags = flagsProp ?? fetchedFlags;

  useEffect(() => {
    if (state === "clarification") {
      clarifyRef.current?.focus();
      const first = clarifyRef.current?.querySelector("input");
      if (first instanceof HTMLInputElement) first.focus();
      return;
    }
    if (state === "applied" || state === "undone") {
      textareaRef.current?.focus();
    }
  }, [state]);

  const flagsReady = runtimeFlags !== null;
  const layerOn = Boolean(runtimeFlags?.layer_enabled);
  const applyOn = Boolean(runtimeFlags?.apply_enabled);
  const selectionUxOn = Boolean(runtimeFlags?.selection_ux_enabled);
  const scheduleJourney = shouldOpenPlanWorkbench({
    schedulePlanEnabled: Boolean(runtimeFlags?.schedule_plan_enabled),
    surface,
    writeLayer: preview?.write_layer,
    lensHint: preview?.lens_hint,
    ops: preview?.ops
  });
  const libraryApplyBlocked = shouldHideLibraryApply({
    selectionUxEnabled: selectionUxOn,
    surface,
    selectionApproved: isFrozenSelectionStage(selectionProposal?.stage),
    writeLayer: preview?.write_layer
  });
  const risk: CommandRiskClass = highestCommandRisk(preview?.ops);
  const applyAllowed =
    Boolean(preview?.apply_ready) &&
    !stale &&
    risk !== "publish_confirm" &&
    layerOn &&
    applyOn &&
    !libraryApplyBlocked;

  const runInterpret = async (clarificationChoice?: string) => {
    if (!layerOn) return;
    const text =
      instruction.trim() ||
      (presentation === "instrument" ? ghostExampleRef.current.trim() : "");
    if (!text) {
      setState("error");
      setErrorMessage("Type a command first.");
      return;
    }
    if (instruction.trim() !== text) setInstruction(text);
    if (
      selectionProposal &&
      (selectionProposal.instruction.trim() !== text || isFrozenSelectionStage(selectionProposal.stage))
    ) {
      const ok = window.confirm(
        "Discard the current selection? A new command replaces the open proposal."
      );
      if (!ok) return;
      const closingId = selectionProposal.proposal_id;
      setSelectionProposal(null);
      setReviewDismissed(false);
      setPlanDraft(null);
      setPlanSlots([]);
      setPlanDismissed(false);
      setPlanError(null);
      setPlanRefineSummary(null);
      try {
        await cancelProposal({ creator_id: creatorId, proposal_id: closingId });
      } catch {
        /* already gone */
      }
    } else if (selectionProposal && reviewDismissed) {
      setReviewDismissed(false);
      setErrorMessage(null);
      setState(isFrozenSelectionStage(selectionProposal.stage) ? "selection_approved" : "selection_review");
      return;
    }
    setState("interpreting");
    setErrorMessage(null);
    setScheduleHint(false);
    setStale(false);
    setPatchError(null);
    setAppliedChangeSetId(null);
    try {
      const { result } = await interpret({
        creator_id: creatorId,
        instruction: text,
        clarification_choice: clarificationChoice,
        surface
      });
      if (result.kind === "clarification") {
        setClarification(result);
        setPreview(null);
        setChoice("");
        setState("clarification");
        return;
      }
      if (result.kind === "error") {
        setPreview(null);
        setClarification(null);
        setErrorMessage(result.message);
        setState("error");
        return;
      }
      setClarification(null);
      setPreview(result);
      if (
        shouldOpenSelectionReview({
          selectionUxEnabled: selectionUxOn,
          surface,
          postCount: result.resolved_post_ids.length
        })
      ) {
        try {
          await openProposalFromPreview(result);
          return;
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setState("error");
          return;
        }
      }
      setSelectionProposal(null);
      setState("preview");
    } catch (err) {
      setPreview(null);
      setClarification(null);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  const openProposalFromPreview = async (result: PreviewPayload) => {
    const { proposal } = await createProposal({
      creator_id: creatorId,
      instruction: result.instruction,
      post_ids: result.resolved_post_ids,
      warnings: result.warnings,
      explanation: result.summary
    });
    if (isFrozenSelectionStage(proposal.stage)) {
      setErrorMessage("An active selection proposal already exists. Discard it first.");
      setState("error");
      return;
    }
    setSelectionProposal(proposal);
    setReviewDismissed(false);
    setPatchError(null);
    setRefinement(null);
    setErrorMessage(null);
    setPlanDraft(null);
    setPlanSlots([]);
    setPlanDismissed(false);
    setPlanError(null);
    setPlanRefineSummary(null);
    setState("selection_review");
  };

  const resolveExistingProposal = async (): Promise<CommandSelectionProposalClient | null> => {
    if (selectionProposal) return selectionProposal;
    const { proposal } = await fetchActiveProposal({ creator_id: creatorId });
    return proposal;
  };

  const runReviewExistingSelection = async () => {
    setResolutionBusy(true);
    try {
      const existing = await resolveExistingProposal();
      if (!existing) {
        setErrorMessage("That selection is no longer open. Preview again.");
        setState("error");
        return;
      }
      setSelectionProposal(existing);
      setReviewDismissed(false);
      setErrorMessage(null);
      setState(isFrozenSelectionStage(existing.stage) ? "selection_approved" : "selection_review");
      if (scheduleJourney && isFrozenSelectionStage(existing.stage)) void hydratePlan(existing);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState("error");
    } finally {
      setResolutionBusy(false);
    }
  };

  const runDiscardExistingAndContinue = async () => {
    setResolutionBusy(true);
    try {
      const existing = await resolveExistingProposal();
      if (existing) {
        try {
          await cancelProposal({ creator_id: creatorId, proposal_id: existing.proposal_id });
        } catch {
          /* already gone */
        }
      }
      setSelectionProposal(null);
      setReviewDismissed(false);
      setPlanDraft(null);
      setPlanSlots([]);
      setPlanDismissed(false);
      setPlanError(null);
      setPlanRefineSummary(null);
      if (
        preview &&
        shouldOpenSelectionReview({
          selectionUxEnabled: selectionUxOn,
          surface,
          postCount: preview.resolved_post_ids.length
        })
      ) {
        await openProposalFromPreview(preview);
        return;
      }
      await runInterpret();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState("error");
    } finally {
      setResolutionBusy(false);
    }
  };

  const runApply = async () => {
    if (!preview || !applyAllowed) return;
    setState("applying");
    setErrorMessage(null);
    const approvedProposal = isFrozenSelectionStage(selectionProposal?.stage) ? selectionProposal : null;
    try {
      const meta = collectionMetaFromPreviewOps(preview.ops);
      await apply(
        approvedProposal
          ? {
              creator_id: creatorId,
              proposal_id: approvedProposal.proposal_id,
              expected_revision: approvedProposal.frozen_revision ?? "",
              operation_kind: "create_or_update_collection",
              collection_title: meta.collection_title,
              collection_id: meta.collection_id,
              change_set_id: preview.change_set_id,
              idempotency_key: preview.change_set_id
            }
          : {
              creator_id: creatorId,
              change_set_id: preview.change_set_id,
              resolved_post_ids: preview.resolved_post_ids,
              ops: preview.ops,
              idempotency_key: preview.change_set_id
            },
        preview.change_set_id
      );
      if (approvedProposal) {
        const closingId = approvedProposal.proposal_id;
        setSelectionProposal(null);
        setReviewDismissed(false);
        setPlanDraft(null);
        setPlanSlots([]);
        setPlanDismissed(false);
        setPlanError(null);
        try {
          await cancelProposal({ creator_id: creatorId, proposal_id: closingId });
        } catch {
          /* already gone */
        }
      }
      setAppliedChangeSetId(preview.change_set_id);
      setState("applied");
      if (preview.lens_hint === "schedule") setScheduleHint(true);
      if (surface === "lab2") {
        writeLab2LastApplied({
          change_set_id: preview.change_set_id,
          instruction: preview.instruction,
          summary: preview.summary,
          lens_hint: preview.lens_hint,
          write_layer: preview.write_layer,
          warnings: preview.warnings
        });
      }
      onApplied?.({
        lens: preview.lens_hint,
        changeSetId: preview.change_set_id
      });
    } catch (err) {
      if (isStaleChangeSetError(err)) {
        setStale(true);
        setErrorMessage("This preview is stale. Preview again before Apply.");
      } else {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
      setState("error");
    }
  };

  const runUndo = async () => {
    const changeSetId = appliedChangeSetId ?? preview?.change_set_id;
    if (!changeSetId) return;
    setErrorMessage(null);
    const leftoverId = selectionProposal?.proposal_id;
    try {
      await undo({ creator_id: creatorId, change_set_id: changeSetId });
      clearLab2LastApplied();
      setAppliedChangeSetId(null);
      setSelectionProposal(null);
      setReviewDismissed(false);
      setPlanDraft(null);
      setPlanSlots([]);
      setPlanDismissed(false);
      setPlanError(null);
      setPlanRefineSummary(null);
      if (leftoverId) {
        try {
          await cancelProposal({ creator_id: creatorId, proposal_id: leftoverId });
        } catch {
          /* already gone after apply */
        }
      }
      setState("undone");
      setScheduleHint(false);
      onUndone?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  const runResetBaseline = async () => {
    const ok = window.confirm(
      "Reset Lab 2 to baseline? This removes command collections (Hero Academy, watercolor) and command rail slices. Posts stay. Photo Studies is restored."
    );
    if (!ok) return;
    setErrorMessage(null);
    setScheduleHint(false);
    setStale(false);
    try {
      await resetBaseline({ creator_id: creatorId });
      clearLab2LastApplied();
      setInstruction("");
      setChoice("");
      setPreview(null);
      setClarification(null);
      setSelectionProposal(null);
      setReviewDismissed(false);
      setPlanDraft(null);
      setPlanSlots([]);
      setPlanDismissed(false);
      setPlanError(null);
      setPlanRefineSummary(null);
      setPatchError(null);
      setRefinement(null);
      setAppliedChangeSetId(null);
      setState("idle");
      onResetBaseline?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  const closeSelectionReview = async () => {
    setReviewDismissed(true);
  };

  const runProposalPatch = async (op: CommandSelectionProposalPatchOp, postIds?: string[]) => {
    if (!selectionProposal) return;
    setPatchBusy(true);
    setPatchError(null);
    try {
      const { proposal } = await patchProposal({
        creator_id: creatorId,
        proposal_id: selectionProposal.proposal_id,
        op,
        post_ids: postIds
      });
      setSelectionProposal(proposal);
      setRefinement(null);
      if (isFrozenSelectionStage(proposal.stage)) {
        setState("selection_approved");
        setReviewDismissed(false);
        if (scheduleJourney) void hydratePlan(proposal);
      }
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(false);
    }
  };

  const runRefine = async (text: string) => {
    if (!selectionProposal) return;
    setPatchBusy(true);
    setPatchError(null);
    try {
      const result = await refineProposal({
        creator_id: creatorId,
        proposal_id: selectionProposal.proposal_id,
        instruction: text
      });
      setSelectionProposal(result.proposal);
      setRefinement({
        summary: result.summary,
        op: result.op,
        post_ids: result.post_ids
      });
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(false);
    }
  };

  const hydratePlan = async (proposal: CommandSelectionProposalClient) => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const previewPlan = await fetchPlan({
        creator_id: creatorId,
        proposal_id: proposal.proposal_id
      });
      if (!previewPlan.persisted) {
        const patched = await patchPlan({
          creator_id: creatorId,
          proposal_id: proposal.proposal_id,
          op: "set_start",
          start_local: previewPlan.plan.start_local,
          time_zone: previewPlan.plan.time_zone,
          weekday: previewPlan.plan.weekday
        });
        setSelectionProposal(patched.proposal);
        setPlanDraft(patched.plan);
        setPlanSlots(patched.slots);
      } else {
        setSelectionProposal((current) =>
          current
            ? { ...current, plan: previewPlan.plan, stage: previewPlan.stage }
            : { ...proposal, plan: previewPlan.plan, stage: previewPlan.stage }
        );
        setPlanDraft(previewPlan.plan);
        setPlanSlots(previewPlan.slots);
      }
      setPlanDismissed(false);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanLoading(false);
    }
  };

  const runPlanMove = async (postId: string, dueAt: string) => {
    if (!selectionProposal || !planDraft) return;
    setPlanError(null);
    try {
      const patched = await patchPlan({
        creator_id: creatorId,
        proposal_id: selectionProposal.proposal_id,
        op: "move_slot",
        expected_version: planDraft.version,
        post_id: postId,
        due_at: dueAt
      });
      setSelectionProposal(patched.proposal);
      setPlanDraft(patched.plan);
      setPlanSlots(patched.slots);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err));
    }
  };

  const runPlanRefine = async (text: string) => {
    if (!selectionProposal) return;
    setPatchBusy(true);
    setPlanError(null);
    try {
      const refined = await refinePlan({
        creator_id: creatorId,
        proposal_id: selectionProposal.proposal_id,
        instruction: text
      });
      setSelectionProposal(refined.proposal);
      setPlanDraft(refined.plan);
      setPlanSlots(refined.slots);
      setPlanRefineSummary(refined.summary);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(false);
    }
  };

  const runApprovePlan = async () => {
    if (!selectionProposal || !layerOn || !applyOn) return;
    setState("applying");
    setErrorMessage(null);
    setPlanError(null);
    const changeSetId = `cs_plan_${selectionProposal.proposal_id}`;
    try {
      await apply(
        {
          creator_id: creatorId,
          proposal_id: selectionProposal.proposal_id,
          expected_revision: selectionProposal.frozen_revision ?? "",
          operation_kind: "materialize_schedule",
          change_set_id: changeSetId,
          idempotency_key: changeSetId
        },
        changeSetId
      );
      const closingId = selectionProposal.proposal_id;
      setSelectionProposal(null);
      setReviewDismissed(false);
      setPlanDraft(null);
      setPlanSlots([]);
      setPlanDismissed(false);
      setPlanError(null);
      setPlanRefineSummary(null);
      try {
        await cancelProposal({ creator_id: creatorId, proposal_id: closingId });
      } catch {
        /* already gone */
      }
      setAppliedChangeSetId(changeSetId);
      setPreview((prev) =>
        prev
          ? { ...prev, change_set_id: changeSetId, lens_hint: "schedule", write_layer: "schedule_rail" }
          : prev
      );
      setState("applied");
      setScheduleHint(true);
      const firstDue = planSlots[0]?.due_at;
      onApplied?.({
        lens: "schedule",
        changeSetId,
        focusMonth: firstDue
          ? monthKeyFromIso(firstDue, planDraft?.time_zone || "UTC")
          : undefined
      });
    } catch (err) {
      if (isStaleChangeSetError(err)) {
        setStale(true);
        setErrorMessage("This preview is stale. Preview again before Apply.");
      } else {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setPlanError(err instanceof Error ? err.message : String(err));
      }
      setState("error");
    }
  };

  useEffect(() => {
    if (!scheduleJourney || planDraft || planLoading || planDismissed || planError) return;
    if (!selectionProposal || !isFrozenSelectionStage(selectionProposal.stage)) return;
    void hydratePlan(selectionProposal);
  }, [
    scheduleJourney,
    selectionProposal,
    planDraft,
    planLoading,
    planDismissed,
    planError
  ]);

  const handlePlanMonth = useCallback(
    (month: string) => {
      void Promise.resolve(loadOccupancy(month))
        .then((events) => setOccupancy(events))
        .catch(() => setOccupancy([]));
    },
    [loadOccupancy]
  );

  const runUndoRefine = async () => {
    if (!selectionProposal || !refinement) return;
    const inverse = refinement.op === "exclude" ? "restore" : "exclude";
    await runProposalPatch(inverse, refinement.post_ids);
    setRefinement(null);
  };

  const runRetry = () => {
    if (planDraft && selectionProposal && state === "error") {
      setStale(false);
      void runApprovePlan();
      return;
    }
    if (preview && applyAllowed && state === "error") {
      void runApply();
      return;
    }
    void runInterpret(state === "clarification" ? choice : undefined);
  };

  const onTextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (state === "clarification") return;
    void runInterpret();
  };

  const commandLocked = !flagsReady || !layerOn;
  const busy = state === "interpreting" || state === "applying" || resolutionBusy;
  const proposalConflict = isActiveSelectionProposalConflict(errorMessage);
  const applyLabel = risk === "review" ? "Review & apply" : "Apply";
  const showApply =
    applyAllowed &&
    (state === "preview" ||
      state === "selection_approved" ||
      (state === "error" && Boolean(preview) && !stale));
  const hideSelectionForSchedulePlan =
    scheduleJourney && isFrozenSelectionStage(selectionProposal?.stage);
  const planWorkbenchOpen =
    hideSelectionForSchedulePlan && Boolean(planDraft) && !planDismissed;
  const selectionOverlayOpen =
    Boolean(selectionProposal) &&
    !reviewDismissed &&
    !hideSelectionForSchedulePlan &&
    (state === "selection_review" ||
      state === "selection_approved" ||
      state === "applying" ||
      (state === "error" && isFrozenSelectionStage(selectionProposal.stage)));
  const showToolbarApply = showApply && !selectionOverlayOpen;
  const isInstrument = presentation === "instrument";
  const fieldLabel = isInstrument && label === "Command" ? "Studio Command" : label;
  const titleId = `${fieldId}-title`;
  const descId = `${fieldId}-desc`;
  const instrumentJourneyActive =
    state === "interpreting" ||
    state === "clarification" ||
    state === "preview" ||
    state === "selection_review" ||
    state === "selection_approved" ||
    state === "applying" ||
    state === "applied" ||
    state === "undone" ||
    state === "error";
  const showInstrumentGhost = isInstrument && instruction.trim().length === 0 && !instrumentJourneyActive;
  const showInstrumentStarters = isInstrument && !instrumentJourneyActive;
  const showInstrumentTeaching = showInstrumentGhost || showInstrumentStarters;
  const hasInstrumentStatus =
    (state === "clarification" && Boolean(clarification)) ||
    Boolean(
      preview &&
        (state === "preview" ||
          state === "applying" ||
          state === "applied" ||
          state === "undone" ||
          state === "error")
    ) ||
    state === "selection_approved" ||
    (state === "selection_review" && reviewDismissed) ||
    state === "applied" ||
    state === "undone" ||
    scheduleHint ||
    (flagsReady && !layerOn) ||
    (flagsReady && layerOn && !applyOn) ||
    !flagsReady ||
    state === "interpreting" ||
    state === "applying" ||
    state === "error";
  const instrumentAccent =
    state === "applied" || showApply
      ? "border-[var(--lab3-mint,#9bf0c4)]/55"
      : "border-[var(--lab3-hairline,#1c211f)] focus-within:border-[var(--lab3-mint,#9bf0c4)]";

  const selectionReviewOverlay = (
    <SelectionReviewOverlay
      open={selectionOverlayOpen}
      proposal={selectionProposal}
      items={libraryItems}
      onClose={() => void closeSelectionReview()}
      onExclude={(postIds) => void runProposalPatch("exclude", postIds)}
      onRestore={(postIds) => void runProposalPatch("restore", postIds)}
      onSelectAll={() => void runProposalPatch("select_all")}
      onSelectNone={() => void runProposalPatch("select_none")}
      onApprove={() => void runProposalPatch("approve")}
      onRefine={(text) => void runRefine(text)}
      refineBusy={patchBusy}
      refinementSummary={refinement?.summary ?? null}
      onUndoRefinement={
        refinement && refinement.post_ids.length > 0 ? () => void runUndoRefine() : undefined
      }
      patchBusy={patchBusy}
      patchError={patchError}
      onApply={
        applyAllowed && isFrozenSelectionStage(selectionProposal?.stage)
          ? () => void runApply()
          : undefined
      }
    />
  );

  const planWorkbenchOverlay = (
    <PlanWorkbench
      open={planWorkbenchOpen}
      proposal={selectionProposal}
      plan={planDraft}
      slots={planSlots}
      occupancy={occupancy}
      timeZone={planDraft?.time_zone}
      railOpen={false}
      applyEnabled={layerOn && applyOn && planSlots.length > 0}
      applyBusy={state === "applying"}
      error={planError}
      onClose={() => setPlanDismissed(true)}
      onMoveSlot={(postId, dueAt) => void runPlanMove(postId, dueAt)}
      onApprovePlan={layerOn && applyOn ? () => void runApprovePlan() : undefined}
      onVisibleMonthChange={handlePlanMonth}
      onRefine={layerOn ? (text) => void runPlanRefine(text) : undefined}
      refineBusy={patchBusy}
      refineSummary={planRefineSummary}
    />
  );

  const statusBlock = (
    <>
      {state === "clarification" && clarification ? (
        <ClarificationPrompt
          prompt={clarification.prompt}
          labels={clarification.candidate_labels}
          name={clarifyId}
          choice={choice}
          disabled={busy}
          onChoice={setChoice}
          onContinue={() => void runInterpret(choice)}
          fieldsetRef={clarifyRef}
        />
      ) : null}

      {preview &&
      (state === "preview" ||
        state === "applying" ||
        state === "applied" ||
        state === "undone" ||
        state === "error") ? (
        <ChangeSetSummary preview={preview} risk={risk} />
      ) : null}

      {state === "applied" ? (
        <p
          className="mt-1 text-[11px] text-[#9bf0c4] motion-reduce:transition-none motion-safe:transition-opacity"
          aria-live="polite"
          data-command-applied
        >
          Applied. Gallery should rearrange. Undo is available.
        </p>
      ) : null}
      {state === "selection_approved" ? (
        <p
          className="mt-1 text-[11px] text-[#9bf0c4]"
          aria-live="polite"
          data-command-selection-approved=""
        >
          {scheduleJourney
            ? planLoading
              ? "Pieces confirmed. Opening the calendar…"
              : planWorkbenchOpen
                ? "Pieces confirmed. Confirm weekly chronological drops, then confirm the schedule."
                : "Pieces confirmed. Open the calendar to confirm the schedule."
            : `Selection approved. ${selectionProposal?.frozen_post_ids.length ?? 0} pieces frozen${
                applyAllowed
                  ? ". Gallery is unchanged until you apply."
                  : ". Apply to library is not available yet."
              }`}
        </p>
      ) : null}
      {selectionProposal && reviewDismissed && !proposalConflict && !scheduleJourney ? (
        <button
          type="button"
          onClick={() => {
            setReviewDismissed(false);
            setState(
              isFrozenSelectionStage(selectionProposal.stage) ? "selection_approved" : "selection_review"
            );
          }}
          className="mt-1 h-7 rounded-md border border-[#9bf0c466] px-2 text-[11px] text-[#9bf0c4] hover:bg-[#122018]"
        >
          Review selection
        </button>
      ) : null}
      {selectionProposal && planDismissed && scheduleJourney && hideSelectionForSchedulePlan && !proposalConflict ? (
        <button
          type="button"
          onClick={() => {
            setPlanDismissed(false);
            if (!planDraft) void hydratePlan(selectionProposal);
          }}
          className="mt-1 h-7 rounded-md border border-[#9bf0c466] px-2 text-[11px] text-[#9bf0c4] hover:bg-[#122018]"
        >
          Review schedule
        </button>
      ) : null}
      {state === "undone" ? (
        <p className="mt-1 text-[11px] text-[#8aa090]" aria-live="polite">
          {isInstrument ? "Undone. Those changes are restored." : "Undone. Lab 2 baseline for those ops is restored."}
        </p>
      ) : null}
      {scheduleHint ? (
        <p className="mt-1 text-[11px] text-[#9bf0c4]" data-lab2-command-schedule-hint>
          {isInstrument
            ? "Schedule slices are on the rail."
            : "Schedule slices are on the rail. Open the Schedule lens to inspect them."}
        </p>
      ) : null}
      {flagsReady && !layerOn ? (
        <p className="mt-1 text-[11px] text-[#8aa090]" role="status" data-command-flag-message="layer">
          Command layer is off. The gallery still works.
        </p>
      ) : null}
      {flagsReady && layerOn && !applyOn ? (
        <p className="mt-1 text-[11px] text-[#8aa090]" role="status" data-command-flag-message="apply">
          Apply is off. Preview still works; nothing is published.
        </p>
      ) : null}
      {!flagsReady ? (
        <p className="mt-1 text-[11px] text-[#5a6a60]">Checking command layer…</p>
      ) : null}
      {state === "interpreting" ? (
        <p className="mt-1 text-[11px] text-[#5a6a60]">Interpreting…</p>
      ) : null}
      {state === "applying" ? (
        <p className="mt-1 text-[11px] text-[#5a6a60]">Applying…</p>
      ) : null}
      {errorMessage && (state === "error" || state === "preview") ? (
        <p className="mt-1 text-[11px] text-red-300" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {planError && !planWorkbenchOpen ? (
        <p className="mt-1 text-[11px] text-red-300" role="alert">
          {planError}
        </p>
      ) : null}
      {state === "error" && proposalConflict ? (
        <div className="mt-1 flex flex-wrap gap-1.5" data-command-proposal-conflict="">
          <button
            type="button"
            disabled={resolutionBusy}
            onClick={() => void runReviewExistingSelection()}
            className="h-7 rounded-md border border-[#9bf0c466] px-2 text-[11px] text-[#9bf0c4] hover:bg-[#122018] disabled:opacity-50"
          >
            Review existing selection
          </button>
          <button
            type="button"
            disabled={resolutionBusy}
            onClick={() => void runDiscardExistingAndContinue()}
            className="h-7 rounded-md border border-[#3a4a3e] px-2 text-[11px] text-[#d0ddd4] hover:border-[#9bf0c466] disabled:opacity-50"
          >
            Discard and start this command
          </button>
        </div>
      ) : state === "error" ? (
        <button
          type="button"
          onClick={() => runRetry()}
          className="mt-1 h-7 rounded-md border border-[#3a4a3e] px-2 text-[11px] text-[#d0ddd4] hover:border-[#9bf0c466]"
        >
          Retry
        </button>
      ) : null}
    </>
  );

  if (isInstrument) {
    const fillInstrumentExample = (text: string) => {
      setInstruction(text);
      textareaRef.current?.focus();
    };
    const instrumentBody = (
      <div
        data-command-instrument-console=""
        className={`mx-auto w-full max-w-[68rem] rounded-2xl border bg-[var(--lab3-instrument,#0f1210)] sm:min-h-[7.5rem] ${instrumentAccent}`}
      >
        <div className="px-4 pb-2 pt-2.5 sm:px-5 sm:pb-2.5 sm:pt-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <p
              id={titleId}
              className="shrink-0 text-[13px] font-medium leading-none tracking-tight text-[var(--lab3-text-strong,#e8e8e8)]"
            >
              {fieldLabel}
            </p>
            <p
              id={descId}
              className="hidden min-w-0 truncate text-[11px] leading-none text-[var(--lab3-text-muted,#6a736e)] sm:block"
            >
              Arrange, schedule, or prepare drafts
            </p>
          </div>
          <div
            data-command-instrument-command-row=""
            className="mt-1.5 flex items-center gap-3"
          >
            <div className="relative h-8 min-w-0 flex-1">
              <textarea
                ref={textareaRef}
                id={fieldId}
                rows={1}
                value={instruction}
                disabled={busy || commandLocked}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={onTextKeyDown}
                onFocus={() => setFieldFocused(true)}
                onBlur={() => setFieldFocused(false)}
                placeholder={showInstrumentGhost ? undefined : placeholder}
                aria-labelledby={titleId}
                aria-describedby={descId}
                className="relative z-0 h-8 max-h-8 w-full resize-none overflow-hidden bg-transparent text-[13px] font-normal leading-8 tracking-normal text-[var(--lab3-text-command,#b8c2bc)] placeholder-[var(--lab3-text-command,#b8c2bc)] focus:outline-none sm:text-[14px]"
              />
              {showInstrumentGhost ? <Lab3CommandGhost /> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={busy || commandLocked}
                onClick={() => void runInterpret(state === "clarification" ? choice : undefined)}
                aria-label="Preview command"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--lab3-mint,#9bf0c4)] bg-[#0d1410] text-[var(--lab3-mint,#9bf0c4)] hover:bg-[#122018] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)] disabled:opacity-50"
              >
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              {showToolbarApply ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runApply()}
                  className="h-8 shrink-0 whitespace-nowrap rounded-full border border-[var(--lab3-mint,#9bf0c4)]/40 bg-[#122018] px-3 text-[12px] font-medium text-[var(--lab3-mint,#9bf0c4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)] disabled:opacity-50"
                >
                  {applyLabel}
                </button>
              ) : null}
              {state === "applied" ? (
                <button
                  type="button"
                  onClick={() => void runUndo()}
                  className="h-8 shrink-0 whitespace-nowrap rounded-full border border-[#3a4a3e] px-3 text-[12px] font-medium text-[var(--lab3-text,#d0ddd4)] hover:border-[var(--lab3-mint,#9bf0c4)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)]"
                >
                  Undo
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {showInstrumentStarters ? <Lab3CommandStarterRail /> : null}
        {hasInstrumentStatus ? (
          <div
            data-command-instrument-status=""
            className="border-t border-[var(--lab3-hairline,#1c211f)] px-4 py-2"
          >
            {statusBlock}
          </div>
        ) : null}
      </div>
    );

    return (
      <>
      <div
        data-command-box
        data-command-presentation="instrument"
        data-command-state={state}
        data-command-risk={preview ? risk : undefined}
        data-command-layer={layerOn ? "on" : "off"}
        data-command-apply={applyOn ? "on" : "off"}
        data-lab2-command-state={state}
        data-command-review-covered={selectionOverlayOpen ? "" : undefined}
        data-command-plan-covered={planWorkbenchOpen ? "" : undefined}
        className={`relative w-full shrink-0 px-5 pb-2 pt-5 sm:px-6 sm:pb-4 sm:pt-10 ${
          selectionOverlayOpen || planWorkbenchOpen ? "hidden" : ""
        }`}
      >
        {showInstrumentTeaching ? (
          <Lab3CommandTeaching
            paused={fieldFocused}
            disabled={commandLocked}
            onFill={fillInstrumentExample}
            onExampleChange={rememberGhostExample}
          >
            {instrumentBody}
          </Lab3CommandTeaching>
        ) : (
          instrumentBody
        )}
      </div>
      {selectionReviewOverlay}
      {planWorkbenchOverlay}
      </>
    );
  }

  return (
    <>
    <div
      data-command-box
      data-command-state={state}
      data-command-risk={preview ? risk : undefined}
      data-command-layer={layerOn ? "on" : "off"}
      data-command-apply={applyOn ? "on" : "off"}
      data-lab2-command-harness={surface === "lab2" ? "" : undefined}
      data-lab2-command-state={state}
      className="min-w-0 shrink-0 overflow-hidden border-b border-[#0d0d0d] bg-[#070a08] px-5 py-2"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <label htmlFor={fieldId} className="sr-only">
          {label}
        </label>
        <textarea
          ref={textareaRef}
          id={fieldId}
          rows={1}
          value={instruction}
          disabled={busy || commandLocked}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={onTextKeyDown}
          placeholder={placeholder}
          className="min-h-8 min-w-[12rem] flex-1 basis-[12rem] resize-none rounded-md border border-[#1e2a22] bg-[#0a0f0b] px-2.5 py-1.5 text-[12px] text-[#d0ddd4] placeholder-[#3e4742] focus:border-[#9bf0c466] focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || commandLocked}
          onClick={() => void runInterpret(state === "clarification" ? choice : undefined)}
          className="h-8 shrink-0 whitespace-nowrap rounded-md border border-[#1e2a22] bg-[#0a0f0b] px-2.5 text-[11px] font-medium text-[#9bf0c4] hover:border-[#9bf0c466] disabled:opacity-50"
        >
          Preview
        </button>
        {showToolbarApply ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runApply()}
            className="h-8 shrink-0 whitespace-nowrap rounded-md border border-[#9bf0c466] bg-[#122018] px-2.5 text-[11px] font-medium text-[#9bf0c4] disabled:opacity-50"
          >
            {applyLabel}
          </button>
        ) : null}
        {state === "applied" ? (
          <button
            type="button"
            onClick={() => void runUndo()}
            className="h-8 shrink-0 whitespace-nowrap rounded-md border border-[#3a4a3e] px-2.5 text-[11px] font-medium text-[#d0ddd4] hover:border-[#9bf0c466]"
          >
            Undo
          </button>
        ) : null}
        {showResetBaseline ? (
          <button
            type="button"
            disabled={busy}
            data-lab2-reset-baseline
            onClick={() => void runResetBaseline()}
            className="h-8 shrink-0 whitespace-nowrap rounded-md border border-[#3a4a3e] px-2.5 text-[11px] font-medium text-[#8aa090] hover:border-[#9bf0c466] hover:text-[#d0ddd4] disabled:opacity-50"
          >
            Reset to baseline
          </button>
        ) : null}
      </div>

      {statusBlock}
    </div>
    {selectionReviewOverlay}
    {planWorkbenchOverlay}
    </>
  );
}

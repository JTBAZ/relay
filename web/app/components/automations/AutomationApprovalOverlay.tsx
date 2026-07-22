"use client";

/**
 * Thin Automations → Previewizer approval adapter (VS6 / B15–B16).
 * Reuses PreviewizerOverlay + staging upload + createPostDistributionPlan.
 * Completes the run only after a durable handoff attempt; Close without Cancel leaves work resumable.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PreviewizerOverlay } from "@/app/components/distribution/PreviewizerOverlay";
import { DistributionHandoffPanel } from "@/app/components/distribution/DistributionHandoffPanel";
import {
  cancelAutomationRun,
  completeAutomationRun,
  correlateAutomationRunPlan,
  getAutomationApprovalContext,
  type AutomationApprovalContextWire
} from "@/lib/automation-api";
import { buildAutomationPlanCreateBody } from "@/lib/automation-approval";
import { buildPreviewizerSession, type PreviewizerResult } from "@/lib/previewizer-session";
import {
  serializePreviewTemplateConfig,
  tryHydratePreviewTemplateConfig,
  type PreviewTemplateConfigV1
} from "@/lib/previewizer-template-config";
import { exportMediaContentUrl } from "@/lib/distribution-media-routing";
import { uploadFileToRelayStaging } from "@/lib/relay-native-staging-upload";
import {
  createPostDistributionPlan,
  fetchPostDistributionPlan,
  RelayApiError,
  type DistributionPlanWire
} from "@/lib/relay-api";
import { useStudioSession } from "@/lib/studio-session-context";

type Props = {
  open: boolean;
  automationId: string;
  runId: string;
  /** Optional deep-link draft id for assert-match. */
  draftId?: string | null;
  onClose: () => void;
};

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "previewizer"; ctx: AutomationApprovalContextWire; sessionReady: true }
  | { kind: "handoff"; plan: DistributionPlanWire; ctx: AutomationApprovalContextWire };

function snapshotToInitialConfig(
  raw: Record<string, unknown> | null
): PreviewTemplateConfigV1 | undefined {
  if (!raw) return undefined;
  const hydrated = tryHydratePreviewTemplateConfig(raw);
  if (!hydrated.ok) return undefined;
  const patch = hydrated.patch;
  return serializePreviewTemplateConfig(
    {
      preset: patch.preset,
      aspectKey: patch.aspectKey,
      compositionId: patch.compositionId,
      compositionProps: patch.compositionProps,
      compositionVariantIndex: patch.compositionVariantIndex,
      overlayDoc: patch.overlayDoc,
      templateOptions: patch.templateOptions
    },
    {
      selectedDestinationId: patch.destination.selectedDestinationId,
      customDestinationUrl: patch.destination.customDestinationUrl
    }
  );
}

export function AutomationApprovalOverlay({
  open,
  automationId,
  runId,
  draftId,
  onClose
}: Props) {
  const { creatorId } = useStudioSession();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [runCompleted, setRunCompleted] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase({ kind: "loading" });
    setPlanError(null);
    setRunCompleted(false);
    void (async () => {
      try {
        const ctx = await getAutomationApprovalContext(automationId, runId);
        if (cancelled) return;
        if (draftId && ctx.draft_id !== draftId) {
          setPhase({
            kind: "error",
            message: "This approval link does not match the prepared draft."
          });
          return;
        }
        if (ctx.existing_plan_id) {
          const { plan } = await fetchPostDistributionPlan(ctx.source_post_id);
          if (cancelled) return;
          if (plan && plan.plan_id === ctx.existing_plan_id) {
            setPhase({ kind: "handoff", plan, ctx });
            return;
          }
        }
        if (!ctx.source_media_id) {
          setPhase({
            kind: "error",
            message: "Source post has no image media for Previewizer."
          });
          return;
        }
        setPhase({ kind: "previewizer", ctx, sessionReady: true });
      } catch (e) {
        if (cancelled) return;
        const expired =
          e instanceof RelayApiError &&
          (e.code === "AUTOMATION_APPROVAL_EXPIRED" || e.status === 410);
        setPhase({
          kind: "error",
          message: expired
            ? "This automation approval has expired."
            : e instanceof Error
              ? e.message
              : "Could not load approval context."
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, automationId, runId, draftId]);

  const session = useMemo(() => {
    if (phase.kind !== "previewizer" || !creatorId) return null;
    const ctx = phase.ctx;
    const mediaId = ctx.source_media_id!;
    const sourceImageUrl =
      ctx.source_image_export_path?.startsWith("http")
        ? ctx.source_image_export_path
        : exportMediaContentUrl(creatorId, mediaId);
    return buildPreviewizerSession({
      creatorId,
      postId: ctx.source_post_id,
      sourceMediaId: mediaId,
      sourceImageUrl,
      initialTemplateConfig: snapshotToInitialConfig(ctx.preview_template_snapshot)
    });
  }, [phase, creatorId]);

  const onUploadPreview = useCallback(
    async (blob: Blob) => {
      if (!creatorId) throw new Error("Sign in to upload preview media.");
      const file = new File([blob], `automation-preview-${runId}.jpg`, {
        type: blob.type || "image/jpeg"
      });
      const uploaded = await uploadFileToRelayStaging({ creatorId, file });
      return { mediaId: uploaded.media_id };
    },
    [creatorId, runId]
  );

  const onComplete = useCallback(
    async (result: PreviewizerResult) => {
      if (phase.kind !== "previewizer") return;
      const ctx = phase.ctx;
      setPlanBusy(true);
      setPlanError(null);
      try {
        // Re-check expiry before creating a plan.
        await getAutomationApprovalContext(automationId, runId);
        const body = buildAutomationPlanCreateBody({
          destinations: ctx.target_destinations,
          draftId: ctx.draft_id,
          previewMediaId: result.previewMediaId
        });
        const { plan } = await createPostDistributionPlan(ctx.source_post_id, body);
        await correlateAutomationRunPlan(automationId, runId, plan.plan_id);
        setPhase({ kind: "handoff", plan, ctx });
      } catch (e) {
        const expired =
          e instanceof RelayApiError &&
          (e.code === "AUTOMATION_APPROVAL_EXPIRED" || e.status === 410);
        if (expired) {
          setPhase({
            kind: "error",
            message: "This automation approval has expired."
          });
        } else {
          setPlanError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setPlanBusy(false);
      }
    },
    [phase, automationId, runId]
  );

  const onDurableAttempt = useCallback(
    async (args: { attemptId: string }) => {
      try {
        await completeAutomationRun(automationId, runId, {
          attempt_id: args.attemptId
        });
        setRunCompleted(true);
      } catch (e) {
        const expired =
          e instanceof RelayApiError &&
          (e.code === "AUTOMATION_APPROVAL_EXPIRED" || e.status === 410);
        if (expired) {
          setPhase({
            kind: "error",
            message: "This automation approval has expired."
          });
        }
        // Non-expiry failures leave handoff UI usable; run stays materialized.
      }
    },
    [automationId, runId]
  );

  const onCancelApproval = useCallback(async () => {
    setCancelBusy(true);
    try {
      await cancelAutomationRun(automationId, runId);
      onClose();
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelBusy(false);
    }
  }, [automationId, runId, onClose]);

  if (!open) return null;

  if (phase.kind === "loading") {
    return (
      <div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-label="Loading automation approval"
      >
        <p className="rounded-md bg-[var(--lib-bg)] px-4 py-3 text-sm text-[var(--lib-fg)]">
          Loading approval…
        </p>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Automation approval error"
      >
        <div className="max-w-md space-y-3 rounded-md bg-[var(--lib-bg)] p-4 shadow-lg">
          <p className="text-sm text-red-400" role="alert">
            {phase.message}
          </p>
          <button
            type="button"
            className="h-8 rounded-md border border-[var(--lib-border)] px-3 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === "handoff") {
    return (
      <div
        className="fixed inset-0 z-[130] flex items-start justify-center overflow-auto bg-black/50 p-4 pt-10"
        role="dialog"
        aria-modal="true"
        aria-label="Automation distribution handoff"
      >
        <div className="w-full max-w-2xl space-y-3 rounded-md bg-[var(--lib-bg)] p-4 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--lib-fg)]">
              Review &amp; send destinations
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-8 rounded-md border border-[var(--lib-border)] px-3 text-xs disabled:opacity-50"
                disabled={cancelBusy || runCompleted}
                onClick={() => void onCancelApproval()}
              >
                {cancelBusy ? "Cancelling…" : "Cancel approval"}
              </button>
              <button
                type="button"
                className="h-8 rounded-md border border-[var(--lib-border)] px-3 text-xs"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
          <p className="text-xs text-[var(--lib-fg-muted)]">
            {runCompleted
              ? "Automation run marked complete after durable handoff. Close when finished sending."
              : "Preview export is ready. Sending still requires an explicit approve / handoff."}
          </p>
          <DistributionHandoffPanel
            plan={phase.plan}
            onComplete={onClose}
            onDurableAttempt={(args) => void onDurableAttempt(args)}
          />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50">
        <p className="rounded-md bg-[var(--lib-bg)] px-4 py-3 text-sm">
          Waiting for studio session…
        </p>
      </div>
    );
  }

  return (
    <>
      {planBusy ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40">
          <p className="rounded-md bg-[var(--lib-bg)] px-4 py-3 text-sm">Creating distribution plan…</p>
        </div>
      ) : null}
      {planError ? (
        <div className="fixed bottom-4 left-1/2 z-[150] max-w-md -translate-x-1/2 rounded-md border border-red-500/40 bg-[var(--lib-bg)] px-3 py-2 text-xs text-red-400">
          {planError}
          <button type="button" className="ml-2 underline" onClick={() => setPlanError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      <PreviewizerOverlay
        open
        session={session}
        onUploadPreview={onUploadPreview}
        onComplete={onComplete}
        onCancel={onClose}
      />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  createPostDistributionPlan,
  fetchCreatorPlanAccess,
  isPlanRequiredApiError,
  fetchPostDistributionPlan,
  type CreatorCapabilityWire,
  type DistributionDestination,
  type DistributionPlanWire
} from "@/lib/relay-api";
import {
  applyCustomTextDrafts,
  type CustomTextDraftsByDestination
} from "@/lib/custom-text-draft";
import { useStudioSession } from "@/lib/studio-session-context";
import { DistributionCompletionSummary } from "@/app/components/distribution/DistributionCompletionSummary";
import { DistributionHandoffPanel } from "@/app/components/distribution/DistributionHandoffPanel";
import {
  EMPTY_ASSISTANT_CONTEXT,
  type PostingAssistantContextValue
} from "@/app/components/distribution/PostingAssistantContextPanel";
import { TransformerNodePage } from "@/app/components/distribution/TransformerNodePage";
import { StudioPlanGate } from "@/app/components/studio/StudioPlanGate";

export type DistributionStep = "variation-planning" | "variant-review" | "cross-post" | "complete";

type Props = {
  postId: string;
  sourceDraftId?: string | null;
  mediaItems?: Array<{
    id: string;
    preview: string;
    filename: string;
    type: "image" | "video" | "audio";
  }>;
  initialSelectedDestinations?: DistributionDestination[];
  initialPreviewMediaId?: string | null;
  step: DistributionStep;
  onStepChange: (step: DistributionStep) => void;
};

const LOCKED_POSTING_ASSISTANT: CreatorCapabilityWire = {
  allowed: false,
  required_plan: "autopost",
  reason: "plan_required"
};

export function AutopostDistributionSteps({
  postId,
  sourceDraftId,
  mediaItems = [],
  initialSelectedDestinations = [],
  initialPreviewMediaId = null,
  step,
  onStepChange
}: Props) {
  const { creatorId } = useStudioSession();
  const [selected, setSelected] = useState<DistributionDestination[]>(initialSelectedDestinations);
  const [assistantByDestination, setAssistantByDestination] = useState<Record<string, boolean>>({});
  const [assistantContext, setAssistantContext] =
    useState<PostingAssistantContextValue>(EMPTY_ASSISTANT_CONTEXT);
  const [plan, setPlan] = useState<DistributionPlanWire | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [postingAssistantCap, setPostingAssistantCap] =
    useState<CreatorCapabilityWire>(LOCKED_POSTING_ASSISTANT);
  const [planRequiredWall, setPlanRequiredWall] = useState(false);

  useEffect(() => {
    if (initialSelectedDestinations.length > 0) {
      setSelected(initialSelectedDestinations);
    }
  }, [initialSelectedDestinations]);

  useEffect(() => {
    let cancelled = false;
    void fetchCreatorPlanAccess()
      .then((access) => {
        if (!cancelled) setPostingAssistantCap(access.capabilities.posting_assistant);
      })
      .catch(() => {
        /* leave locked — server enforces on write */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step === "cross-post" || step === "complete") return;

    let cancelled = false;
    setLoadingPlan(true);
    setError(null);
    void fetchPostDistributionPlan(postId)
      .then(({ plan: active }) => {
        if (cancelled) return;
        if (active) setPlan(active);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingPlan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, step]);

  async function generatePlan(options?: {
    customTextDrafts?: CustomTextDraftsByDestination;
    needs_preview?: boolean;
    preview_media_id?: string;
    media_routing_by_destination?: Record<string, "full" | "preview">;
    accepted_copy_by_destination?: Record<
      string,
      {
        title?: string | null;
        body_text: string;
        formula_id?: string;
        variant_id?: string;
      }
    >;
  }) {
    const destinations = selected.length > 0 ? selected : initialSelectedDestinations;
    if (destinations.length === 0) {
      setError("Select at least one platform on Upload & Select.");
      return;
    }
    setBusy(true);
    setError(null);
    setPlanRequiredWall(false);
    try {
      const { plan: created } = await createPostDistributionPlan(postId, {
        destinations,
        assistant_by_destination: assistantByDestination,
        assistant_context: {
          goals: assistantContext.goals,
          user_notes: assistantContext.user_notes || null,
          locale: assistantContext.locale || null,
          trend_note: assistantContext.trend_note || null,
          ...(options?.accepted_copy_by_destination
            ? { accepted_copy_by_destination: options.accepted_copy_by_destination }
            : {})
        },
        source_draft_id: sourceDraftId ?? null,
        ...(options?.needs_preview !== undefined ? { needs_preview: options.needs_preview } : {}),
        ...(options?.preview_media_id ? { preview_media_id: options.preview_media_id } : {}),
        ...(options?.media_routing_by_destination
          ? { media_routing_by_destination: options.media_routing_by_destination }
          : {})
      });
      const drafts = options?.customTextDrafts;
      const planWithDrafts =
        drafts && Object.keys(drafts).length > 0
          ? await applyCustomTextDrafts(created, drafts)
          : created;
      setPlan(planWithDrafts);
    } catch (e) {
      if (isPlanRequiredApiError(e)) {
        setPlanRequiredWall(true);
        setPostingAssistantCap(LOCKED_POSTING_ASSISTANT);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  if (step === "complete") {
    return <DistributionCompletionSummary postId={postId} />;
  }

  if (step === "cross-post" && !plan) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-4">
        <h2 className="text-xl font-bold text-[#f9fafb]">Cross-post</h2>
        <div
          className="rounded-xl border px-4 py-5 text-sm"
          style={{ borderColor: "#2a2a2a", background: "#0a0a0a", color: "#9ca3af" }}
        >
          {loadingPlan ? "Loading distribution plan…" : error ?? "No distribution plan is available."}
        </div>
        {!loadingPlan ? (
          <button
            type="button"
            onClick={() => onStepChange("variation-planning")}
            className="rounded-lg border px-3 py-2 text-xs font-semibold text-[#f9fafb]"
            style={{ borderColor: "#2a2a2a", background: "#111" }}
          >
            Back to Strategy
          </button>
        ) : null}
      </div>
    );
  }

  if (step === "cross-post" && plan) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-4">
        <h2 className="text-xl font-bold text-[#f9fafb]">Cross-post</h2>
        <p className="text-xs text-[#9ca3af]">
          Relay opens each platform and fills your approved variant. You publish manually on each site.
        </p>
        <DistributionHandoffPanel plan={plan} onComplete={() => onStepChange("complete")} />
      </div>
    );
  }

  if (step === "variation-planning" || step === "variant-review") {
    if (loadingPlan && !plan) {
      return (
        <div className="w-full max-w-3xl mx-auto px-4 py-12 text-center text-sm text-[#6b7280]">
          Loading strategy…
        </div>
      );
    }

    const destinations =
      selected.length > 0 ? selected : initialSelectedDestinations;

    return (
      <div className="space-y-4">
        {planRequiredWall ? (
          <div className="mx-auto w-full max-w-3xl px-4 pt-4">
            <StudioPlanGate
              capability={LOCKED_POSTING_ASSISTANT}
              feature="posting_assistant"
              featureName="Relay Coach"
              featureBenefit="Timing and copy tuned to your goals across platforms."
              testId="coach-plan-gate"
            />
          </div>
        ) : null}
        <TransformerNodePage
          creatorId={creatorId}
          postId={postId}
          selectedDestinations={destinations}
          mediaItems={mediaItems}
          plan={plan}
          onPlanChange={setPlan}
          postingAssistantAllowed={postingAssistantCap.allowed}
          postingAssistantCapability={postingAssistantCap}
          assistantByDestination={assistantByDestination}
          onAssistantByDestinationChange={setAssistantByDestination}
          assistantContext={assistantContext}
          onAssistantContextChange={setAssistantContext}
          onGeneratePlan={generatePlan}
          generating={busy}
          error={error}
          onContinueToHandoff={() => onStepChange("cross-post")}
          initialPreviewMediaId={initialPreviewMediaId}
        />
      </div>
    );
  }

  return null;
}

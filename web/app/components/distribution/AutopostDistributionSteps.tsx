"use client";

import { useEffect, useState } from "react";
import {
  createPostDistributionPlan,
  fetchPostDistributionPlan,
  type DistributionDestination,
  type DistributionPlanWire
} from "@/lib/relay-api";
import { DistributionCompletionSummary } from "@/app/components/distribution/DistributionCompletionSummary";
import { DistributionHandoffPanel } from "@/app/components/distribution/DistributionHandoffPanel";
import { DistributionVariantCards } from "@/app/components/distribution/DistributionVariantCards";
import { PlatformSelectionPanel } from "@/app/components/distribution/PlatformSelectionPanel";
import { PostingAssistantContextPanel, EMPTY_ASSISTANT_CONTEXT, type PostingAssistantContextValue } from "@/app/components/distribution/PostingAssistantContextPanel";

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
  step: DistributionStep;
  onStepChange: (step: DistributionStep) => void;
};

export function AutopostDistributionSteps({ postId, sourceDraftId, mediaItems = [], step, onStepChange }: Props) {
  const [selected, setSelected] = useState<DistributionDestination[]>([]);
  const [assistantByDestination, setAssistantByDestination] = useState<Record<string, boolean>>({});
  const [assistantContext, setAssistantContext] = useState<PostingAssistantContextValue>(EMPTY_ASSISTANT_CONTEXT);
  const [plan, setPlan] = useState<DistributionPlanWire | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [attemptedPlanLoad, setAttemptedPlanLoad] = useState(false);

  useEffect(() => {
    if (step === "variation-planning" || plan || loadingPlan || attemptedPlanLoad) return;
    let cancelled = false;
    setAttemptedPlanLoad(true);
    setLoadingPlan(true);
    setError(null);
    void fetchPostDistributionPlan(postId)
      .then(({ plan: active }) => {
        if (cancelled) return;
        if (active) {
          setPlan(active);
        } else {
          setError("No distribution plan is available. Go back to Plan and generate variants.");
        }
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
  }, [attemptedPlanLoad, loadingPlan, plan, postId, step]);

  async function generatePlan() {
    if (selected.length === 0) {
      setError("Select at least one platform.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { plan: created } = await createPostDistributionPlan(postId, {
        destinations: selected,
        assistant_by_destination: assistantByDestination,
        assistant_context: {
          goals: assistantContext.goals,
          user_notes: assistantContext.user_notes || null,
          locale: assistantContext.locale || null,
          trend_note: assistantContext.trend_note || null
        },
        source_draft_id: sourceDraftId ?? null
      });
      setPlan(created);
      setAttemptedPlanLoad(true);
      onStepChange("variant-review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (step === "complete") {
    return <DistributionCompletionSummary postId={postId} />;
  }

  if ((step === "variant-review" || step === "cross-post") && !plan) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-4">
        <h2 className="text-xl font-bold text-[#f9fafb]">
          {step === "variant-review" ? "Review variants" : "Cross-post"}
        </h2>
        <div
          className="rounded-xl border px-4 py-5 text-sm"
          style={{ borderColor: "#2a2a2a", background: "#0a0a0a", color: "#9ca3af" }}
        >
          {loadingPlan ? "Loading distribution plan..." : error ?? "No distribution plan is available."}
        </div>
        {!loadingPlan ? (
          <button
            type="button"
            onClick={() => onStepChange("variation-planning")}
            className="rounded-lg border px-3 py-2 text-xs font-semibold text-[#f9fafb]"
            style={{ borderColor: "#2a2a2a", background: "#111" }}
          >
            Back to Plan
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
        <DistributionHandoffPanel
          plan={plan}
          onComplete={() => onStepChange("complete")}
        />
      </div>
    );
  }

  if (step === "variant-review" && plan) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-4">
        <h2 className="text-xl font-bold text-[#f9fafb]">Review variants</h2>
        <DistributionVariantCards
          variants={plan.variants}
          mediaItems={mediaItems}
          onVariantsChange={(variants) => setPlan({ ...plan, variants })}
          onReviewComplete={() => onStepChange("cross-post")}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#f9fafb]">Plan distribution</h2>
        <p className="text-xs text-[#9ca3af] mt-1">
          Choose where to relay this post. Posting Assistant can optimize copy per platform.
        </p>
      </div>
      <PlatformSelectionPanel
        selected={selected}
        assistantByDestination={assistantByDestination}
        onSelectedChange={setSelected}
        onAssistantChange={(dest, enabled) =>
          setAssistantByDestination((prev) => ({ ...prev, [dest]: enabled }))
        }
      />
      {Object.values(assistantByDestination).some(Boolean) ? (
        <PostingAssistantContextPanel
          value={assistantContext}
          onChange={setAssistantContext}
        />
      ) : null}
      {error ? (
        <p className="text-xs text-red-300" role="alert">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={busy || selected.length === 0}
        onClick={() => void generatePlan()}
        className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
        style={{ background: "#00aa6f", color: "#000" }}
      >
        {busy ? "Generating variants…" : "Generate platform variants"}
      </button>
    </div>
  );
}

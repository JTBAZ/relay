"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AutopostDistributionSteps, type DistributionStep } from "@/app/components/distribution/AutopostDistributionSteps";
import { DistributionHandoffPanel } from "@/app/components/distribution/DistributionHandoffPanel";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import { ScheduledRelayPostConfirm } from "@/app/studio/distribution/scheduled-relay-post-confirm";
import {
  fetchScheduleRailReview,
  updateScheduleRailReviewStep,
  type ScheduleRailReviewContext
} from "@/lib/schedule-rail-api";
import {
  fetchCreatorPlanAccess,
  type CreatorPlanAccessWire,
  type DistributionDestination,
  type DistributionPlanWire
} from "@/lib/relay-api";
import { exportMediaContentUrl } from "@/lib/distribution-media-routing";
import { useStudioSession } from "@/lib/studio-session-context";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; review: ScheduleRailReviewContext; access: CreatorPlanAccessWire };

function reviewStepFromComposer(
  step: string | null,
  plan: DistributionPlanWire | null
): DistributionStep {
  if (step === "variant-review") return "variant-review";
  if (step === "complete") return "complete";
  if (step === "cross-post") {
    // Only resume handoff when at least one variant was explicitly approved.
    // Rail-seeded rail_prepared alone must not skip prepare.
    const variants = plan?.variants ?? [];
    const explicitlyReady = variants.some(
      (v) =>
        Boolean(v.approved_at) ||
        v.status === "approved" ||
        v.status === "handed_off"
    );
    if (explicitlyReady) return "cross-post";
  }
  return "variation-planning";
}

function ExactTextReview({
  plan,
  onComplete
}: {
  plan: DistributionPlanWire;
  onComplete: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6" data-testid="scheduled-post-core-review">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">Scheduled post</p>
        <h1 className="text-xl font-bold text-[#f9fafb]">Review and send</h1>
        <p className="text-sm text-[#9ca3af]">
          Your words are used as written on each platform. Relay opens the site; you publish.
        </p>
      </header>

      <div className="space-y-3 rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-4">
        <p className="text-xs font-medium text-[#9ca3af]">Destination copy</p>
        {plan.variants.map((variant) => {
          const text =
            variant.post_text?.trim() ||
            variant.body_text?.trim() ||
            variant.title?.trim() ||
            "(empty)";
          return (
            <div
              key={variant.variant_id}
              className="border-t border-[#1f1f1f] pt-3 first:border-t-0 first:pt-0"
            >
              <p className="text-sm font-medium text-[#e8e8e8]">{variant.destination}</p>
              {variant.title?.trim() ? (
                <p className="mt-1 text-xs text-[#9ca3af]">{variant.title}</p>
              ) : null}
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#d1d5db]">
                {text}
              </p>
            </div>
          );
        })}
      </div>

      <DistributionHandoffPanel plan={plan} onComplete={onComplete} />
    </div>
  );
}

function RecoveryPanel({
  review,
  reason
}: {
  review: ScheduleRailReviewContext;
  reason: "media" | "details";
}) {
  return (
    <div
      className="mx-auto w-full max-w-lg space-y-4 px-4 py-12 text-center"
      data-testid="scheduled-post-recovery"
    >
      <h1 className="text-xl font-bold text-[#f9fafb]">Finish this post in Studio</h1>
      <p className="text-sm text-[#9ca3af]">
        {reason === "media"
          ? "Attach media on the Schedule Rail before sending."
          : "Add title or description on the Schedule Rail before sending."}
      </p>
      <Link
        href="/studio"
        className="inline-flex rounded-lg bg-[#9bf0c4] px-4 py-2 text-sm font-medium text-[#0a100c]"
      >
        Open Studio
      </Link>
      {review.title ? (
        <p className="text-xs text-[#6b7280]">Post: {review.title}</p>
      ) : null}
    </div>
  );
}

function readReviewQuery(searchParams: URLSearchParams): {
  eventId: string | null;
  draftId: string | null;
  variantId: string | null;
  postId: string | null;
} {
  const fromParams = (key: string) => searchParams.get(key)?.trim() || null;
  let eventId = fromParams("event_id");
  let draftId = fromParams("draft_id");
  let variantId = fromParams("variant_id");
  let postId = fromParams("post_id");

  // Hydration / auth-redirect races can briefly yield empty useSearchParams —
  // fall back to the live URL so event_id is not lost.
  if (typeof window !== "undefined" && !eventId && !draftId && !variantId && !postId) {
    const live = new URLSearchParams(window.location.search);
    eventId = live.get("event_id")?.trim() || null;
    draftId = live.get("draft_id")?.trim() || null;
    variantId = live.get("variant_id")?.trim() || null;
    postId = live.get("post_id")?.trim() || null;
  }

  return { eventId, draftId, variantId, postId };
}

function ScheduledPostReviewBody() {
  const searchParams = useSearchParams();
  const { creatorId } = useStudioSession();
  const { eventId, draftId, variantId, postId } = readReviewQuery(searchParams);

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [step, setStep] = useState<DistributionStep>("variation-planning");
  const [plan, setPlan] = useState<DistributionPlanWire | null>(null);

  const queryMissing = !eventId && !draftId && !variantId && !postId;

  const applyReview = useCallback((review: ScheduleRailReviewContext, access: CreatorPlanAccessWire) => {
    setPlan(review.plan);
    setStep(reviewStepFromComposer(review.composer_step, review.plan));
    setLoad({ status: "ready", review, access });
  }, []);

  const refresh = useCallback(async () => {
    if (queryMissing) {
      setLoad({
        status: "error",
        message:
          "Missing event_id for scheduled-post review. Open this page from a Schedule Rail reminder or confirm link."
      });
      return;
    }
    setLoad({ status: "loading" });
    try {
      const [review, access] = await Promise.all([
        fetchScheduleRailReview({
          event_id: eventId,
          draft_id: draftId,
          variant_id: variantId,
          post_id: postId
        }),
        fetchCreatorPlanAccess()
      ]);
      applyReview(review, access);
    } catch (err) {
      setLoad({
        status: "error",
        message: err instanceof Error ? err.message : "Could not load scheduled post."
      });
    }
  }, [applyReview, draftId, eventId, postId, queryMissing, variantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleStepChange = useCallback(
    async (next: DistributionStep) => {
      setStep(next);
      if (load.status !== "ready") return;
      try {
        const review = await updateScheduleRailReviewStep(load.review.event_id, next);
        setPlan(review.plan);
      } catch {
        /* step still updates locally */
      }
    },
    [load]
  );

  const handleRelayPublished = useCallback(
    (review: ScheduleRailReviewContext) => {
      if (load.status !== "ready") return;
      applyReview(review, load.access);
    },
    [applyReview, load]
  );

  const destinations = useMemo(() => {
    if (load.status !== "ready") return [] as DistributionDestination[];
    return load.review.destinations;
  }, [load]);

  const mediaItems = useMemo(() => {
    if (load.status !== "ready" || !creatorId.trim()) return [];
    return load.review.media_ids.map((mediaId) => ({
      id: mediaId,
      preview: exportMediaContentUrl(creatorId, mediaId),
      filename: mediaId,
      type: "image" as const
    }));
  }, [creatorId, load]);

  if (load.status === "loading") {
    return (
      <div className="px-4 py-16 text-center text-sm text-[#6b7280]">
        Loading scheduled post…
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-12 text-center">
        <p className="text-sm text-red-400/90" role="alert">
          {load.message}
        </p>
        <Link href="/studio" className="text-sm text-[#9bf0c4] hover:underline">
          Back to Studio
        </Link>
      </div>
    );
  }

  const { review, access } = load;
  if (!review.media_ready) {
    return <RecoveryPanel review={review} reason="media" />;
  }
  if (review.post_details_state !== "authored") {
    return <RecoveryPanel review={review} reason="details" />;
  }

  // Publish gate: draft Relay posts confirm access before Autopost / Exact-text handoff.
  if (review.publish_state === "draft") {
    return (
      <ScheduledRelayPostConfirm
        creatorId={creatorId}
        review={review}
        onPublished={handleRelayPublished}
      />
    );
  }

  const activePlan = plan ?? review.plan;
  // QA/demo override: ?as=core forces Studio Core exact-text review even when Autopost is entitled.
  const forceCore = searchParams.get("as") === "core";
  const hasAutopost = !forceCore && access.capabilities.autopost.allowed === true;

  if (!hasAutopost) {
    if (!activePlan) {
      return (
        <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-[#9ca3af]">
          No distribution plan is ready for this post.
        </div>
      );
    }
    return (
      <ExactTextReview
        plan={activePlan}
        onComplete={() => void handleStepChange("complete")}
      />
    );
  }

  return (
    <div data-testid="scheduled-post-autopost-review">
      <AutopostDistributionSteps
        postId={review.post_id}
        sourceDraftId={review.draft_id}
        mediaItems={mediaItems}
        initialSelectedDestinations={destinations}
        step={step}
        onStepChange={(next) => void handleStepChange(next)}
        preserveScheduledPlan
        requireExplicitPrepare
      />
    </div>
  );
}

export function ScheduledPostReviewClient() {
  return (
    <StudioRouteGuard>
      <ScheduledPostReviewBody />
    </StudioRouteGuard>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Step2FusedReviewMock } from "@/components/dev/scheduled-post-step2/Step2FusedReviewMock";
import {
  STEP2_DEV_FIXTURE,
  type Step2DevFixture
} from "@/components/dev/scheduled-post-step2/fixtures";
import { exportMediaContentUrl } from "@/lib/distribution-media-routing";
import { fetchScheduleRailReview } from "@/lib/schedule-rail-api";
import type { DistributionDestination } from "@/lib/relay-api";
import {
  StudioSessionProvider,
  useStudioSession
} from "@/lib/studio-session-context";

function isDestination(value: string): value is DistributionDestination {
  return value === "patreon" || value === "x" || value === "deviantart" || value === "bluesky";
}

function ScheduledPostStep2DevBody() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("event_id")?.trim() || null;
  const { creatorId } = useStudioSession();

  const [live, setLive] = useState<Step2DevFixture | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  const hydrate = useCallback(async () => {
    if (!eventId) {
      setLive(null);
      setLiveError(null);
      return;
    }
    setLoadingLive(true);
    setLiveError(null);
    try {
      const review = await fetchScheduleRailReview({ event_id: eventId });
      const mediaId = review.media_ids[0] ?? null;
      const imageUrl =
        mediaId && creatorId.trim()
          ? exportMediaContentUrl(creatorId, mediaId)
          : STEP2_DEV_FIXTURE.imageUrl;

      const destinations = review.destinations.filter(isDestination);
      const destList =
        destinations.length > 0 ? destinations : STEP2_DEV_FIXTURE.destinations;

      const title = review.title?.trim() || STEP2_DEV_FIXTURE.title;
      const description =
        review.description?.trim() || STEP2_DEV_FIXTURE.description;

      const variantsFromPlan =
        review.plan?.variants
          ?.map((v) => {
            if (!isDestination(v.destination)) return null;
            return {
              destination: v.destination,
              title: v.title?.trim() || title,
              body:
                v.post_text?.trim() ||
                v.body_text?.trim() ||
                description
            };
          })
          .filter((v): v is NonNullable<typeof v> => v != null) ?? [];

      setLive({
        title,
        description,
        tags: review.tags?.length ? review.tags : STEP2_DEV_FIXTURE.tags,
        imageUrl,
        destinations: destList,
        variants:
          variantsFromPlan.length > 0
            ? variantsFromPlan
            : destList.map((destination) => ({
                destination,
                title,
                body: description
              }))
      });
    } catch (err) {
      setLive(null);
      setLiveError(err instanceof Error ? err.message : "Could not load event.");
    } finally {
      setLoadingLive(false);
    }
  }, [creatorId, eventId]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const data = live ?? STEP2_DEV_FIXTURE;
  const sourceLabel = useMemo(() => {
    if (loadingLive) return "Loading live event…";
    if (live) return `Live event ${eventId}`;
    if (liveError) return `Fixture (live failed: ${liveError})`;
    return "Fixture";
  }, [eventId, live, liveError, loadingLive]);

  return (
    <div className="min-h-[100dvh] bg-[#050706] text-[#edf2ef]">
      <div
        className="border-b px-4 py-2 text-[11px] sm:px-5"
        style={{ borderColor: "#141e16", background: "#070a08", color: "#6aaa7a" }}
      >
        <span className="font-semibold text-[#9bf0c4]">DEV</span>
        {" · "}
        Safe Step 2 clone. Production{" "}
        <Link href="/studio/distribution" className="underline decoration-[#3a4a3e] hover:text-[#9bf0c4]">
          /studio/distribution
        </Link>{" "}
        is unchanged. Optional live hydrate:{" "}
        <code className="text-[#5fb98f]">?event_id=…</code>
      </div>
      <Step2FusedReviewMock data={data} sourceLabel={sourceLabel} />
    </div>
  );
}

export function ScheduledPostStep2DevClient() {
  return (
    <StudioSessionProvider>
      <ScheduledPostStep2DevBody />
    </StudioSessionProvider>
  );
}

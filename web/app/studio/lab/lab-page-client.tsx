"use client";

import { StudioLabNav } from "@/app/components/studio/StudioLabNav";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import { GoalsLabProvider } from "@/app/components/goals-lab/GoalsLabContext";
import GalleryView from "../GalleryView";

/**
 * Lab floorspace — same GalleryView behavior islands as production Library,
 * with schedule-rail prototype chrome (pill nav lives in StudioLabNav).
 */
export default function StudioLabPageClient() {
  return (
    <StudioRouteGuard>
      <GoalsLabProvider>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050706]">
          <StudioLabNav />
          <GalleryView floorspace="lab" />
        </div>
      </GoalsLabProvider>
    </StudioRouteGuard>
  );
}

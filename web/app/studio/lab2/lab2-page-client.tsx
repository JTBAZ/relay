"use client";

import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import { GoalsLabProvider } from "@/app/components/goals-lab/GoalsLabContext";
import { StudioLab2Chassis } from "@/app/components/studio-lab2";

/**
 * Lab2 floorspace — v0 /4 Schedule Rail Studio chassis.
 * Phase 2: live Active Posts.
 * Phase 3: live Import Bay, Schedule Rail (ritual choice), real nav destinations.
 */
export default function StudioLab2PageClient() {
  return (
    <StudioRouteGuard>
      <GoalsLabProvider>
        <StudioLab2Chassis />
      </GoalsLabProvider>
    </StudioRouteGuard>
  );
}

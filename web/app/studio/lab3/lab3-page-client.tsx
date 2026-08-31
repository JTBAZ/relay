"use client";

import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import { GoalsLabProvider } from "@/app/components/goals-lab/GoalsLabContext";
import { Lab3TopBar } from "@/app/components/studio-lab3/Lab3TopBar";
import GalleryView from "../GalleryView";

/**
 * Lab 3 language-first floorspace — same GalleryView data plane as Lab 1,
 * with a Studio Command instrument instead of Lab 1 tools chrome.
 */
export default function StudioLab3PageClient() {
  return (
    <StudioRouteGuard>
      <GoalsLabProvider>
        <div
          className="studio-lab3 flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--lab3-bg,#050706)]"
          data-lab3-chassis
        >
          <Lab3TopBar />
          <GalleryView floorspace="lab3" />
        </div>
      </GoalsLabProvider>
    </StudioRouteGuard>
  );
}

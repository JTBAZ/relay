import { Suspense } from "react";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import RadarPreviewClient from "./RadarPreviewClient";

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#0A0A0A] text-sm text-[#888]">
      Loading radar preview…
    </div>
  );
}

export default function AnalyticsRadarPreviewPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<Fallback />}>
        <StudioRouteGuard>
          <RadarPreviewClient />
        </StudioRouteGuard>
      </Suspense>
    </div>
  );
}

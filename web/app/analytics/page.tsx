import { Suspense } from "react";
import { StudioRouteGuard } from "../components/studio/StudioRouteGuard";
import AnalyticsOverviewClient from "./AnalyticsOverviewClient";

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#0A0A0A] text-sm text-[#888]">
      Loading…
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<Fallback />}>
        <StudioRouteGuard>
          <AnalyticsOverviewClient />
        </StudioRouteGuard>
      </Suspense>
    </div>
  );
}

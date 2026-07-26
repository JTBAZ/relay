import type { Metadata } from "next";
import { Suspense } from "react";
import PlatformMetricsDashboard from "./PlatformMetricsDashboard";
import { PlatformOperatorRouteGuard } from "@/components/platform-metrics/PlatformOperatorRouteGuard";

export const metadata: Metadata = {
  title: "Relay · Platform Metrics"
};

export default function PlatformMetricsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-[#9A9A9A]">
          Loading platform metrics…
        </div>
      }
    >
      <PlatformOperatorRouteGuard>
        <div className="flex min-h-0 flex-1 flex-col">
          <PlatformMetricsDashboard />
        </div>
      </PlatformOperatorRouteGuard>
    </Suspense>
  );
}

import { Suspense } from "react";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import { GoalsAuditClient } from "./GoalsAuditClient";

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#0A0A0A] text-sm text-[#888]">
      Loading…
    </div>
  );
}

export default function GoalsAuditPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A] text-[#f3f4f6]">
      <Suspense fallback={<Fallback />}>
        <StudioRouteGuard>
          <GoalsAuditClient />
        </StudioRouteGuard>
      </Suspense>
    </div>
  );
}

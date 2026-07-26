import { Suspense } from "react";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import WorkDrilldownClient from "./WorkDrilldownClient";

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#0A0A0A] text-sm text-[#888]">
      Loading work drilldown…
    </div>
  );
}

export default function WorkDrilldownPage({
  params
}: {
  params: { creative_work_id: string };
}) {
  const creativeWorkId = params.creative_work_id?.trim() ?? "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<Fallback />}>
        <StudioRouteGuard>
          {creativeWorkId ? (
            <WorkDrilldownClient creativeWorkId={creativeWorkId} />
          ) : (
            <div className="mx-auto w-full max-w-[980px] px-4 py-8 text-sm text-[#888] sm:px-6">
              Missing work id.
            </div>
          )}
        </StudioRouteGuard>
      </Suspense>
    </div>
  );
}

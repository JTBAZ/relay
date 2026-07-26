import { Suspense } from "react";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import PromosHubView from "./PromosHubView";

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--lib-bg)] text-sm text-[var(--lib-fg-muted)]">
      Loading…
    </div>
  );
}

export default function PromosPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<Fallback />}>
        <StudioRouteGuard>
          <PromosHubView />
        </StudioRouteGuard>
      </Suspense>
    </div>
  );
}

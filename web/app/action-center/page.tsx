import { Suspense } from "react";
import ActionCenterView from "./ActionCenterView";
import { StudioRouteGuard } from "../components/studio/StudioRouteGuard";

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--lib-bg)] text-sm text-[var(--lib-fg-muted)]">
      Loading…
    </div>
  );
}

export default function ActionCenterPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<Fallback />}>
        <StudioRouteGuard>
          <ActionCenterView />
        </StudioRouteGuard>
      </Suspense>
    </div>
  );
}

"use client";

import { StudioRouteGuard } from "../components/studio/StudioRouteGuard";
import { CreatorNewPostShell } from "../components/shell/CreatorNewPostShell";
import { useStudioSession } from "@/lib/studio-session-context";

export function NewPostPageClient() {
  const { creatorId } = useStudioSession();

  return (
    <StudioRouteGuard>
      <div className="library-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--lib-bg)] text-[var(--lib-fg)]">
        <CreatorNewPostShell showBackLink creatorId={creatorId} />
      </div>
    </StudioRouteGuard>
  );
}

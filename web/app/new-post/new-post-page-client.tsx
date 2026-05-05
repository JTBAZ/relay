"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { StudioRouteGuard } from "../components/studio/StudioRouteGuard";
import { CreatorNewPostShell } from "../components/shell/CreatorNewPostShell";
import { useStudioSession } from "@/lib/studio-session-context";

function NewPostPageInner() {
  const { creatorId } = useStudioSession();
  const searchParams = useSearchParams();
  const initialMediaIds = useMemo(() => {
    const raw = searchParams.get("media_ids")?.trim();
    if (!raw) return undefined;
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return ids.length > 0 ? ids : undefined;
  }, [searchParams]);

  return (
    <div className="library-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--lib-bg)] text-[var(--lib-fg)]">
      <CreatorNewPostShell showBackLink creatorId={creatorId} initialMediaIds={initialMediaIds} />
    </div>
  );
}

export function NewPostPageClient() {
  return (
    <StudioRouteGuard>
      <Suspense
        fallback={
          <div className="library-shell flex min-h-[40vh] flex-1 items-center justify-center bg-[var(--lib-bg)] text-xs text-[var(--lib-fg-muted)]">
            Loading…
          </div>
        }
      >
        <NewPostPageInner />
      </Suspense>
    </StudioRouteGuard>
  );
}

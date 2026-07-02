"use client";

import { useSearchParams } from "next/navigation";
import { RelayAutopostComposer } from "@/app/components/autopost-v0/RelayAutopostComposer";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";

export function AutopostPageClient() {
  const searchParams = useSearchParams();
  const mediaIdsParam = searchParams.get("media_ids") ?? "";
  /** Import Bay / studio selection passes ids — composer skips Step 1 and commits them on load. */
  const initialMediaIds = mediaIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return (
    <StudioRouteGuard>
      <RelayAutopostComposer initialMediaIds={initialMediaIds} />
    </StudioRouteGuard>
  );
}
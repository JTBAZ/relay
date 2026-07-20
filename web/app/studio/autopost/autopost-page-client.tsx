"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RelayAutopostComposer } from "@/app/components/autopost-v0/RelayAutopostComposer";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import { StudioPlanGate } from "@/app/components/studio/StudioPlanGate";
import {
  fetchCreatorPlanAccess,
  type CreatorCapabilityWire,
  type CreatorPlanAccessWire
} from "@/lib/relay-api";

type AccessLoad =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; access: CreatorPlanAccessWire };

function AutopostEntitlementShell({
  initialMediaIds,
  initialDraftId
}: {
  initialMediaIds: string[];
  initialDraftId: string | null;
}) {
  const [load, setLoad] = useState<AccessLoad>({ status: "loading" });
  const [forceWall, setForceWall] = useState<CreatorCapabilityWire | null>(null);

  const refresh = useCallback(async () => {
    setLoad({ status: "loading" });
    setForceWall(null);
    try {
      const access = await fetchCreatorPlanAccess();
      setLoad({ status: "ready", access });
    } catch (err) {
      setLoad({
        status: "error",
        message: err instanceof Error ? err.message : "Could not load plan access."
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (load.status === "loading") {
    return (
      <p className="p-6 text-sm text-[var(--lib-fg-muted)]" data-testid="autopost-plan-loading">
        Checking Autopost access…
      </p>
    );
  }

  if (load.status === "error") {
    return (
      <div className="space-y-3 p-6" data-testid="autopost-plan-error" role="alert">
        <p className="text-sm text-red-400">{load.message}</p>
        <button
          type="button"
          className="h-7 rounded-md border border-[var(--lib-border)] px-3 text-xs font-medium text-[var(--lib-fg)]"
          onClick={() => void refresh()}
        >
          Retry
        </button>
      </div>
    );
  }

  const autopostCap = forceWall ?? load.access.capabilities.autopost;
  if (!autopostCap.allowed) {
    return (
      <div className="mx-auto w-full max-w-lg p-6">
        <StudioPlanGate
          capability={autopostCap}
          feature="autopost"
          featureName="Autopost"
          featureBenefit="Compose cross-post drafts, Style Profile, and the full Autopost pipeline."
          testId="autopost-plan-gate"
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end px-6 pt-4">
        <a
          href="/studio/autopost/routines"
          className="text-xs text-[var(--lib-fg-muted)] underline hover:text-[var(--lib-fg)]"
        >
          Routines &amp; rules
        </a>
      </div>
      <RelayAutopostComposer
        initialMediaIds={initialDraftId ? [] : initialMediaIds}
        initialDraftId={initialDraftId}
        onPlanRequired={() => {
          setForceWall({
            allowed: false,
            required_plan: "autopost",
            reason: "plan_required"
          });
        }}
      />
    </>
  );
}

export function AutopostPageClient() {
  const searchParams = useSearchParams();
  const mediaIdsParam = searchParams.get("media_ids") ?? "";
  const draftIdParam = searchParams.get("draft_id")?.trim() || null;
  /** Import Bay / studio selection passes ids — composer skips Step 1 and commits them on load. */
  const initialMediaIds = mediaIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return (
    <StudioRouteGuard>
      <AutopostEntitlementShell
        initialMediaIds={initialMediaIds}
        initialDraftId={draftIdParam}
      />
    </StudioRouteGuard>
  );
}

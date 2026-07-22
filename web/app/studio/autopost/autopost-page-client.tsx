"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RelayAutopostComposer } from "@/app/components/autopost-v0/RelayAutopostComposer";
import { AutomationApprovalOverlay } from "@/app/components/automations/AutomationApprovalOverlay";
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
  initialDraftId,
  automationId,
  automationRunId,
  prefillMode = "continue"
}: {
  initialMediaIds: string[];
  initialDraftId: string | null;
  automationId: string | null;
  automationRunId: string | null;
  /** platforms = stay on pick/platform step with media preselected. */
  prefillMode?: "continue" | "platforms";
}) {
  const [load, setLoad] = useState<AccessLoad>({ status: "loading" });
  const [forceWall, setForceWall] = useState<CreatorCapabilityWire | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(
    Boolean(automationId && automationRunId)
  );

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

  useEffect(() => {
    setApprovalOpen(Boolean(automationId && automationRunId));
  }, [automationId, automationRunId]);

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
        prefillMode={prefillMode}
        onPlanRequired={() => {
          setForceWall({
            allowed: false,
            required_plan: "autopost",
            reason: "plan_required"
          });
        }}
      />
      {automationId && automationRunId ? (
        <AutomationApprovalOverlay
          open={approvalOpen}
          automationId={automationId}
          runId={automationRunId}
          draftId={initialDraftId}
          onClose={() => setApprovalOpen(false)}
        />
      ) : null}
    </>
  );
}

export function AutopostPageClient() {
  const searchParams = useSearchParams();
  const mediaIdsParam = searchParams.get("media_ids") ?? "";
  const draftIdParam = searchParams.get("draft_id")?.trim() || null;
  const automationId = searchParams.get("automation_id")?.trim() || null;
  const automationRunId = searchParams.get("automation_run_id")?.trim() || null;
  const stageParam = searchParams.get("stage")?.trim() || null;
  /** Import Bay / studio selection passes ids — composer skips Step 1 and commits them on load. */
  const initialMediaIds = mediaIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const prefillMode = stageParam === "platforms" ? "platforms" : "continue";

  return (
    <StudioRouteGuard>
      <AutopostEntitlementShell
        initialMediaIds={initialMediaIds}
        initialDraftId={draftIdParam}
        automationId={automationId}
        automationRunId={automationRunId}
        prefillMode={prefillMode}
      />
    </StudioRouteGuard>
  );
}

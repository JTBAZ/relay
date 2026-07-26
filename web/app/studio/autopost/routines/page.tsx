"use client";

import { Suspense } from "react";
import { AutopostRoutinesPanel } from "@/app/components/autopost/AutopostRoutinesPanel";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import { StudioPlanGate } from "@/app/components/studio/StudioPlanGate";
import { useEffect, useState } from "react";
import {
  fetchCreatorPlanAccess,
  type CreatorPlanAccessWire,
} from "@/lib/relay-api";

function RoutinesGate() {
  const [access, setAccess] = useState<CreatorPlanAccessWire | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCreatorPlanAccess()
      .then(setAccess)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return <p className="p-6 text-sm text-red-400">{error}</p>;
  }
  if (!access) {
    return <p className="p-6 text-sm text-[var(--lib-fg-muted)]">Checking Autopost access…</p>;
  }
  if (!access.capabilities.autopost.allowed) {
    return (
      <div className="mx-auto w-full max-w-lg p-6">
        <StudioPlanGate
          capability={access.capabilities.autopost}
          feature="autopost"
          featureName="Autopost routines"
          featureBenefit="Recurring posting routines and Patreon preview distribution rules."
          testId="autopost-routines-plan-gate"
        />
      </div>
    );
  }
  return <AutopostRoutinesPanel />;
}

export default function AutopostRoutinesPage() {
  return (
    <StudioRouteGuard>
      <Suspense fallback={<p className="p-6 text-sm text-[var(--lib-fg-muted)]">Loading…</p>}>
        <RoutinesGate />
      </Suspense>
    </StudioRouteGuard>
  );
}

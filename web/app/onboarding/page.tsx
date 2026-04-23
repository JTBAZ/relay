import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingWizard } from "@/app/components/onboarding/onboarding-wizard";
import { resolvePatreonOAuthClientId } from "@/lib/resolve-patreon-oauth-client-id";

export const metadata: Metadata = {
  title: "Relay · Get started",
  description:
    "Set up your Relay account in three quick steps — for creators and supporters alike.",
};

export default function OnboardingPage() {
  const initialPatronClientId = resolvePatreonOAuthClientId();
  return (
    <div className="onboarding-shell min-h-dvh flex-1">
      <Suspense
        fallback={
          <div
            className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--relay-bg)] px-4 text-sm text-[var(--relay-fg-muted)]"
            role="status"
            aria-live="polite"
          >
            Loading onboarding…
          </div>
        }
      >
        <OnboardingWizard initialPatronClientId={initialPatronClientId} />
      </Suspense>
    </div>
  );
}

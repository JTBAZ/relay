import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingWizard } from "@/app/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Relay · Creator onboarding",
  description: "Set up your Relay creator account in minutes."
};

export default function OnboardingPage() {
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
        <OnboardingWizard />
      </Suspense>
    </div>
  );
}

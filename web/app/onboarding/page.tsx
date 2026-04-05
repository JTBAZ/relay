import type { Metadata } from "next";
import { OnboardingWizard } from "@/app/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Relay · Creator onboarding",
  description: "Set up your Relay creator account in minutes."
};

export default function OnboardingPage() {
  return (
    <div className="onboarding-shell min-h-dvh flex-1">
      <OnboardingWizard />
    </div>
  );
}

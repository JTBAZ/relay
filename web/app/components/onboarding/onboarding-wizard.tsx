"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/app/lib/cn";
import { ProgressStepper, type OnboardingStep } from "./progress-stepper";
import { StepWelcome, StepProfile, StepConnect, StepGoLive } from "./step-panels";

const STEPS: OnboardingStep[] = [
  { id: 1, label: "Welcome", description: "Introduction to Relay" },
  { id: 2, label: "Profile", description: "Set up your creator identity" },
  { id: 3, label: "Connect", description: "Link your platforms" },
  { id: 4, label: "Go Live", description: "Launch your presence" }
];

const STEP_COMPONENTS: Record<number, ComponentType> = {
  1: StepWelcome,
  2: StepProfile,
  3: StepConnect,
  4: StepGoLive
};

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(1);

  const isFirst = currentStep === 1;
  const isLast = currentStep === STEPS.length;
  const StepPanel = STEP_COMPONENTS[currentStep];

  const goNext = () => {
    if (!isLast) setCurrentStep((s) => s + 1);
  };

  const goBack = () => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--relay-bg)]">
      <header className="flex items-center justify-between border-b border-[var(--relay-border)] px-6 py-4">
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <rect width="22" height="22" rx="5" fill="#1B4332" />
            <path
              d="M6 16V6h5.5a3.5 3.5 0 0 1 0 7H6M11.5 13l3.5 3"
              stroke="#40916C"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="text-base font-semibold tracking-tight"
            style={{ color: "var(--relay-gold-500)" }}
          >
            Relay
          </span>
        </div>
        <span className="text-xs text-[var(--relay-fg-muted)]">
          Step {currentStep} of {STEPS.length}
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-lg flex-col gap-10">
          <ProgressStepper steps={STEPS} currentStep={currentStep} />

          <div
            key={currentStep}
            className={cn(
              "rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-2)] p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] onboarding-panel-animate"
            )}
          >
            <StepPanel />
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={goBack}
              disabled={isFirst}
              className={cn(
                "flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-all duration-150",
                isFirst
                  ? "cursor-not-allowed border-[var(--relay-border)] text-[var(--relay-fg-muted)] opacity-40"
                  : "border-[var(--relay-border)] text-[var(--relay-fg-muted)] hover:border-[var(--relay-green-600)]/50 hover:text-[var(--relay-fg)]"
              )}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              Back
            </button>

            <div className="flex items-center gap-1.5 sm:hidden">
              {STEPS.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    currentStep === s.id
                      ? "w-4 bg-[var(--relay-green-400)]"
                      : currentStep > s.id
                        ? "w-1.5 bg-[var(--relay-green-800)]"
                        : "w-1.5 bg-[var(--relay-border)]"
                  )}
                />
              ))}
            </div>

            {isLast ? (
              <Link
                href="/"
                className="flex items-center gap-2 rounded-md bg-[var(--relay-green-600)] px-5 py-2.5 text-sm font-semibold text-[var(--relay-fg)] transition-all duration-150 hover:bg-[var(--relay-green-400)]"
              >
                Go to Library
              </Link>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-2 rounded-md bg-[var(--relay-green-600)] px-5 py-2.5 text-sm font-semibold text-[var(--relay-fg)] transition-all duration-150 hover:bg-[var(--relay-green-400)]"
              >
                Continue
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="flex items-center justify-between border-t border-[var(--relay-border)] px-6 py-4">
        <p className="text-xs text-[var(--relay-fg-muted)]">
          Need help?{" "}
          <a
            href="mailto:support@relay.example"
            className="text-[var(--relay-green-400)] underline-offset-2 hover:underline"
          >
            Contact support
          </a>
        </p>
        <p className="text-xs text-[var(--relay-fg-muted)]">
          &copy; {new Date().getFullYear()} Relay. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

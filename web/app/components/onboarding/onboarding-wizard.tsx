"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/app/lib/cn";
import { ProgressStepper, type OnboardingStep } from "./progress-stepper";
import {
  PathPicker,
  RelayWordmark,
  RoadmapPreview,
  StepClaimHandleAndGo,
  StepConnectPatreonCreator,
  StepConnectPatreonSupporter,
  StepCreatorProfileBasics,
  StepSignUp,
  StepSupporterReady,
  type OnboardingPath,
} from "./step-panels";

const CREATOR_STEPS: OnboardingStep[] = [
  { id: 1, label: "Account", description: "Create your Relay account" },
  { id: 2, label: "Patreon", description: "Connect your Patreon" },
  { id: 3, label: "Profile", description: "Set your name + avatar" },
  { id: 4, label: "Gallery", description: "Claim your URL" },
];

const SUPPORTER_STEPS: OnboardingStep[] = [
  { id: 1, label: "Account", description: "Create your Relay account" },
  { id: 2, label: "Patreon", description: "Connect your Patreon" },
  { id: 3, label: "Feed", description: "Open your feed" },
];

export type WizardStep = 1 | 2 | 3 | 4;

function isPath(value: string | null | undefined): value is OnboardingPath {
  return value === "creator" || value === "supporter";
}

function clampStep(value: number, max: number): WizardStep {
  if (value <= 1) return 1;
  if (value >= max) return max as WizardStep;
  return Math.round(value) as WizardStep;
}

export function OnboardingWizard({
  initialPatronClientId,
}: {
  initialPatronClientId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  const stepsForPath = (p: OnboardingPath | null): OnboardingStep[] =>
    p === "supporter" ? SUPPORTER_STEPS : CREATOR_STEPS;

  // Hydrate state from URL on mount + when params change.
  useEffect(() => {
    const p = searchParams.get("path");
    const s = searchParams.get("step")?.trim() ?? "";
    const max = stepsForPath(isPath(p) ? p : null).length;
    if (isPath(p)) setPath(p);
    if (s === "patreon" || s === "2") {
      setCurrentStep(2);
    } else if (s === "profile" || s === "3") {
      setCurrentStep(clampStep(3, max));
    } else if (s === "4" || s === "finish") {
      setCurrentStep(clampStep(4, max));
    } else if (s === "1" || s === "account") {
      setCurrentStep(1);
    }
  }, [searchParams]);

  const writeUrl = useCallback(
    (next: { path?: OnboardingPath | null; step?: WizardStep }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.path === null) {
        params.delete("path");
      } else if (next.path) {
        params.set("path", next.path);
      }
      if (next.step) {
        params.set("step", String(next.step));
      }
      const href = `/onboarding${params.size ? `?${params.toString()}` : ""}`;
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [router, searchParams]
  );

  const handleChoosePath = (chosen: OnboardingPath) => {
    setPath(chosen);
    setCurrentStep(1);
    writeUrl({ path: chosen, step: 1 });
  };

  const handleResetPath = () => {
    setPath(null);
    setCurrentStep(1);
    writeUrl({ path: null, step: 1 });
  };

  const goNext = () => {
    const max = stepsForPath(path).length;
    setCurrentStep((s) => {
      const next = clampStep(s + 1, max);
      writeUrl({ step: next });
      return next;
    });
  };

  const goBack = () => {
    if (currentStep === 1) {
      handleResetPath();
      return;
    }
    const max = stepsForPath(path).length;
    setCurrentStep((s) => {
      const next = clampStep(s - 1, max);
      writeUrl({ step: next });
      return next;
    });
  };

  const steps = stepsForPath(path);
  const showStepper = path !== null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--relay-bg)]">
      <header className="relay-header flex items-center justify-between border-b border-[var(--relay-electric)]/10 px-6 py-4">
        <Link
          href="/landing"
          aria-label="Relay home"
          className="rounded-lg outline-none ring-[var(--relay-green-600)]/40 transition-opacity hover:opacity-90 focus-visible:ring-2"
        >
          <RelayWordmark size="md" />
        </Link>
        <div className="flex items-center gap-4 text-xs text-[var(--relay-fg-muted)]">
          {showStepper && (
            <span className="hidden tabular-nums sm:inline">
              Step {currentStep} of {steps.length}
            </span>
          )}
          <Link
            href="/login"
            className="font-medium text-[var(--relay-fg-muted)] transition-colors hover:text-[var(--relay-fg)]"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
        {path === null ? (
          <div
            key="picker"
            className="onboarding-panel-animate w-full max-w-3xl"
          >
            <PathPicker onChoose={handleChoosePath} />
          </div>
        ) : (
          <div className="flex w-full max-w-lg flex-col gap-8">
            <ProgressStepper steps={steps} currentStep={currentStep} />

            <RoadmapPreview path={path} currentStep={currentStep} />

            <div
              key={`${path}-${currentStep}`}
              className="onboarding-panel-animate rounded-2xl border border-[var(--relay-electric)]/15 bg-[var(--relay-surface-2)] p-7 shadow-[0_0_0_1px_rgba(34,197,94,0.04),0_8px_32px_-8px_rgba(0,0,0,0.6)] sm:p-8"
            >
              {renderStep({
                path,
                currentStep,
                initialPatronClientId,
                onAdvance: goNext,
              })}
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-2 rounded-xl border border-[var(--relay-border)] px-3.5 py-2 text-xs font-medium text-[var(--relay-fg-muted)] transition-all duration-150 hover:border-[var(--relay-electric)]/40 hover:text-[var(--relay-fg)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                {currentStep === 1 ? "Switch path" : "Back"}
              </button>

              <div className="flex items-center gap-1.5 sm:hidden" aria-hidden>
                {steps.map((s) => (
                  <span
                    key={s.id}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      currentStep === s.id
                        ? "w-5 bg-[var(--relay-electric)]"
                        : currentStep > s.id
                          ? "w-1.5 bg-[var(--relay-green-800)]"
                          : "w-1.5 bg-[var(--relay-border)]"
                    )}
                  />
                ))}
              </div>

              <span className="text-[11px] text-[var(--relay-fg-muted)]">
                {path === "creator" ? "Creator path" : "Supporter path"}
              </span>
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between border-t border-[var(--relay-electric)]/10 px-6 py-4">
        <p className="text-xs text-[var(--relay-fg-muted)]">
          Need help?{" "}
          <a
            href="mailto:support@relay.so"
            className="text-[var(--relay-green-400)] underline-offset-2 hover:underline"
          >
            Contact support
          </a>
        </p>
        <p className="text-xs text-[var(--relay-fg-muted)]">
          &copy; {new Date().getFullYear()} Relay
        </p>
      </footer>
    </div>
  );
}

function renderStep({
  path,
  currentStep,
  initialPatronClientId,
  onAdvance,
}: {
  path: OnboardingPath;
  currentStep: WizardStep;
  initialPatronClientId: string;
  onAdvance: () => void;
}) {
  if (currentStep === 1) {
    return <StepSignUp path={path} onSignedIn={onAdvance} />;
  }
  if (currentStep === 2) {
    return path === "creator" ? (
      <StepConnectPatreonCreator onSkip={onAdvance} />
    ) : (
      <StepConnectPatreonSupporter initialClientId={initialPatronClientId} />
    );
  }
  if (path === "creator" && currentStep === 3) {
    return <StepCreatorProfileBasics onAdvance={onAdvance} />;
  }
  return path === "creator" ? (
    <StepClaimHandleAndGo onFinish={() => (window.location.href = "/")}
    />
  ) : (
    <StepSupporterReady />
  );
}

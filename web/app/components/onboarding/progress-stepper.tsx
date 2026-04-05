"use client";

import { Check } from "lucide-react";
import { cn } from "@/app/lib/cn";

export interface OnboardingStep {
  id: number;
  label: string;
  description: string;
}

interface ProgressStepperProps {
  steps: OnboardingStep[];
  currentStep: number;
}

export function ProgressStepper({ steps, currentStep }: ProgressStepperProps) {
  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="flex w-full items-center gap-0">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isActive = currentStep === step.id;
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className={cn("flex items-center", !isLast && "flex-1")}>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-300",
                    isCompleted &&
                      "border-[var(--relay-green-600)] bg-[var(--relay-green-600)] text-[var(--relay-fg)]",
                    isActive &&
                      "border-[var(--relay-green-600)] bg-[var(--relay-surface-2)] text-[var(--relay-green-400)] ring-2 ring-[var(--relay-green-600)]/20",
                    !isCompleted &&
                      !isActive &&
                      "border-[var(--relay-border)] bg-[var(--relay-surface-2)] text-[var(--relay-fg-muted)]"
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </div>
                <div className="hidden flex-col items-center text-center sm:flex">
                  <span
                    className={cn(
                      "text-xs font-medium leading-tight",
                      isActive ? "text-[var(--relay-fg)]" : "text-[var(--relay-fg-muted)]"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              </div>

              {!isLast && (
                <div className="mx-3 mt-[-16px] flex-1">
                  <div className="relative h-px w-full overflow-hidden bg-[var(--relay-border)]">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 bg-[var(--relay-green-600)] transition-all duration-500",
                        isCompleted ? "w-full" : "w-0"
                      )}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

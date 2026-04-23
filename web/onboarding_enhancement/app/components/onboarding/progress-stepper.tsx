"use client";

import { Check, Zap } from "lucide-react";
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
      <ol className="flex w-full items-start gap-0">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isActive = currentStep === step.id;
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className={cn("flex items-start", !isLast && "flex-1")}>
              <div className="flex flex-col items-center gap-2">
                {/* Circle indicator */}
                <div
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-300",
                    isCompleted &&
                      "border-[var(--relay-electric)] bg-[var(--relay-electric)] text-[var(--relay-bg)]",
                    isActive &&
                      "relay-pulse-glow border-[var(--relay-electric)] bg-[var(--relay-green-950)] text-[var(--relay-green-400)]",
                    !isCompleted &&
                      !isActive &&
                      "border-[var(--relay-border)] bg-[var(--relay-surface-1)] text-[var(--relay-fg-muted)]"
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : isActive ? (
                    <Zap className="h-4 w-4 fill-current" strokeWidth={0} />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </div>

                {/* Label + description (desktop only) */}
                <div className="hidden flex-col items-center text-center sm:flex">
                  <span
                    className={cn(
                      "text-xs font-semibold leading-tight transition-colors duration-200",
                      isActive
                        ? "text-[var(--relay-green-400)]"
                        : isCompleted
                          ? "text-[var(--relay-electric)]"
                          : "text-[var(--relay-fg-muted)]"
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="mt-0.5 max-w-[8rem] text-[10px] leading-snug text-[var(--relay-fg-muted)]">
                    {step.description}
                  </span>
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="mx-3 mt-[18px] flex-1">
                  <div className="relative h-px w-full overflow-hidden rounded-full bg-[var(--relay-border)]">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-700",
                        isCompleted
                          ? "relay-connector-charged w-full bg-[var(--relay-electric)]"
                          : "w-0 bg-[var(--relay-electric)]"
                      )}
                    />
                    {/* Scanning spark on active step's leading connector */}
                    {isActive && (
                      <div
                        className="relay-scan-line pointer-events-none absolute inset-x-0 h-full"
                        style={{
                          background:
                            "linear-gradient(to right, transparent, var(--relay-electric), transparent)",
                        }}
                        aria-hidden
                      />
                    )}
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

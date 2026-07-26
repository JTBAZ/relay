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

/**
 * Connector after a completed checkpoint → next active step: half fill.
 * When that step finishes and currentStep advances, the bar completes (full)
 * and the next stage lights up.
 */
function connectorFillPercent(currentStep: number, nextStepId: number): number {
  if (currentStep > nextStepId) return 100;
  if (currentStep === nextStepId) return 50;
  return 0;
}

export function ProgressStepper({ steps, currentStep }: ProgressStepperProps) {
  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="flex w-full items-start">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isActive = currentStep === step.id;
          const isLast = index === steps.length - 1;
          const next = steps[index + 1];
          const fillPercent = next ? connectorFillPercent(currentStep, next.id) : 0;
          const isChargingIntoActive = fillPercent === 50;
          const isFullyCharged = fillPercent === 100;

          return (
            <li
              key={step.id}
              className="relative flex flex-1 flex-col items-center"
            >
              {/* Track from this circle’s center to the next circle’s center (full column width). */}
              {!isLast ? (
                <div
                  className="pointer-events-none absolute left-1/2 top-[18px] z-0 h-[3px] w-full -translate-y-1/2"
                  aria-hidden
                >
                  <div className="relative mx-[1.125rem] h-full overflow-hidden rounded-full bg-[var(--relay-border)]">
                    <div
                      className={cn(
                        "h-full rounded-full bg-[var(--relay-electric)] transition-[width,opacity] duration-700 ease-out",
                        isFullyCharged && "relay-connector-charged",
                        isChargingIntoActive && "opacity-90",
                        fillPercent === 0 && "opacity-0"
                      )}
                      style={{ width: `${fillPercent}%` }}
                    />
                    {isChargingIntoActive ? (
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 overflow-hidden"
                        aria-hidden
                      >
                        <div
                          className="relay-scan-line h-full w-full"
                          style={{
                            background:
                              "linear-gradient(to right, transparent, rgba(0,170,111,0.55), transparent)"
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div
                className={cn(
                  "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-300",
                  isCompleted &&
                    "border-[var(--relay-green-800)] bg-[var(--relay-electric)] text-[var(--relay-bg)] shadow-[0_0_0_2px_var(--relay-green-950)]",
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

              <div className="relative z-10 mt-2 hidden w-full flex-col items-center px-1 text-center sm:flex">
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
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

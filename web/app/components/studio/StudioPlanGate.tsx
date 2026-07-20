"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { creatorPlanEntry, type CreatorPlanId } from "@/lib/creator-plans";
import type { CreatorCapabilityWire } from "@/lib/relay-api";

export type StudioPlanGateCapability =
  | "autopost"
  | "posting_assistant"
  | "studio_core"
  | "growth_engine";

type Props = {
  /** Capability wire from GET /api/v1/creator/plan-access — caller fetches. */
  capability: CreatorCapabilityWire;
  feature: StudioPlanGateCapability;
  featureName: string;
  featureBenefit: string;
  /** When allowed, render children; when locked, show wall (optionally still show children disabled). */
  children?: ReactNode;
  /** If true and locked, still render children below the wall (read-only preview). Default false. */
  showChildrenWhenLocked?: boolean;
  className?: string;
  /** Override billing deep-link (defaults to feature query). */
  billingHref?: string;
  testId?: string;
};

function reasonCopy(capability: CreatorCapabilityWire, featureName: string): string {
  const plan = creatorPlanEntry(capability.required_plan);
  const planLabel = plan ? `${plan.ladder} · ${plan.name}` : "a higher plan";
  switch (capability.reason) {
    case "operator_grant":
    case "pilot":
      return `${featureName} is included by Relay.`;
    case "legacy_feature_flag":
      return `${featureName} is enabled for your account (pilot bridge).`;
    case "included":
      return `${featureName} is included in your plan.`;
    case "billing_past_due":
      return `Payment needs attention to keep ${featureName}. Update your card in Billing.`;
    case "feature_not_shipped":
      return `${featureName} is coming later — not available to purchase yet.`;
    case "plan_required":
    default:
      return `${featureName} requires ${planLabel}.`;
  }
}

function primaryAction(
  capability: CreatorCapabilityWire,
  feature: StudioPlanGateCapability,
  billingHref?: string
): { href: string; label: string } | null {
  if (capability.allowed) return null;
  if (capability.reason === "feature_not_shipped") return null;
  if (capability.reason === "billing_past_due") {
    return {
      href: billingHref ?? `/studio/settings/billing?feature=${feature}`,
      label: "Update payment"
    };
  }
  return {
    href: billingHref ?? `/studio/settings/billing?feature=${feature}`,
    label: "View plans"
  };
}

/**
 * Shared Studio entitlement wall (MB-15A).
 * Does not fetch — pass capability data from the plan-access wire.
 */
export function StudioPlanGate({
  capability,
  feature,
  featureName,
  featureBenefit,
  children,
  showChildrenWhenLocked = false,
  className,
  billingHref,
  testId = "studio-plan-gate"
}: Props) {
  if (capability.allowed) {
    return <>{children}</>;
  }

  const plan = creatorPlanEntry(capability.required_plan as CreatorPlanId);
  const action = primaryAction(capability, feature, billingHref);
  const comingLater = capability.reason === "feature_not_shipped";

  return (
    <div className={["space-y-3", className].filter(Boolean).join(" ")} data-testid={testId}>
      <div
        role="status"
        aria-label={`${featureName} locked`}
        data-testid={`${testId}-wall`}
        className="rounded-xl border border-dashed px-4 py-4"
        style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
      >
        <p className="text-[13px] font-medium text-white">{featureName}</p>
        <p className="mt-1 text-[11px] text-[#555]">{featureBenefit}</p>
        <p className="mt-2 text-[11px] text-[#888]" data-testid={`${testId}-reason`}>
          {reasonCopy(capability, featureName)}
          {plan && capability.reason === "plan_required" ? (
            <span className="tabular-nums"> ({plan.priceLabel})</span>
          ) : null}
        </p>
        {action ? (
          <Link
            href={action.href}
            data-testid={`${testId}-cta`}
            className="mt-3 inline-flex h-7 items-center rounded-md px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]"
            style={{
              background: "var(--lib-primary, #00AA6F)",
              color: "var(--lib-primary-fg, #03120d)"
            }}
          >
            {action.label}
          </Link>
        ) : comingLater ? (
          <p
            className="mt-3 text-[10px] font-medium uppercase tracking-wider text-[#555]"
            data-testid={`${testId}-coming-later`}
          >
            Coming later
          </p>
        ) : null}
      </div>
      {showChildrenWhenLocked ? (
        <div className="pointer-events-none opacity-50" aria-disabled="true">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function billingHrefForFeature(feature: StudioPlanGateCapability): string {
  return `/studio/settings/billing?feature=${feature}`;
}

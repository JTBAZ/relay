"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CREATOR_PLAN_CATALOG,
  FREEMIUM_PITCH,
  creatorPlanEntry,
  type CreatorPlanId
} from "@/lib/creator-plans";
import {
  RelayApiError,
  createCreatorBillingCheckout,
  createCreatorBillingPortal,
  fetchCreatorBillingSubscription,
  fetchCreatorPlanAccess,
  type CreatorBillingSubscription,
  type CreatorPlanAccessWire
} from "@/lib/relay-api";

type LoadState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      subscription: CreatorBillingSubscription;
      access: CreatorPlanAccessWire | null;
    }
  | { status: "error"; message: string };

const FEATURE_QUERY_VALUES = new Set([
  "autopost",
  "posting_assistant",
  "studio_core",
  "growth_engine"
]);

function planIdOf(sub: CreatorBillingSubscription): CreatorPlanId | null {
  if (!sub.plan) return null;
  return sub.plan;
}

function highlightPlanForFeature(feature: string | null): CreatorPlanId | null {
  if (!feature || !FEATURE_QUERY_VALUES.has(feature)) return null;
  if (feature === "studio_core") return "studio_core";
  if (feature === "growth_engine") return "growth_engine";
  // autopost + posting_assistant
  return "autopost";
}

function grantLabel(source: CreatorPlanAccessWire["entitlement_source"]): string | null {
  if (source === "operator_grant") return "Included by Relay (operator grant)";
  if (source === "pilot") return "Included by Relay (pilot)";
  return null;
}

export default function BillingSettingsClient() {
  const searchParams = useSearchParams();
  const featureParam = searchParams.get("feature");
  const highlightPlan = useMemo(
    () => highlightPlanForFeature(featureParam),
    [featureParam]
  );

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [busyPlan, setBusyPlan] = useState<CreatorPlanId | "portal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoad({ status: "loading" });
    setActionError(null);
    try {
      const subscription = await fetchCreatorBillingSubscription();
      let access: CreatorPlanAccessWire | null = null;
      try {
        access = await fetchCreatorPlanAccess();
      } catch {
        /* plan-access is additive; billing page still works from subscription alone */
      }
      setLoad({ status: "ready", subscription, access });
    } catch (err) {
      if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setLoad({
          status: "unavailable",
          message: "Billing is not enabled on this environment yet."
        });
        return;
      }
      setLoad({
        status: "error",
        message: err instanceof Error ? err.message : "Could not load subscription."
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!highlightPlan || load.status !== "ready") return;
    const el = document.querySelector(`[data-testid="billing-plan-${highlightPlan}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightPlan, load.status]);

  const startCheckout = async (plan: CreatorPlanId) => {
    setBusyPlan(plan);
    setActionError(null);
    try {
      const { checkout_url } = await createCreatorBillingCheckout(plan);
      window.location.assign(checkout_url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Checkout failed.");
      setBusyPlan(null);
    }
  };

  const openPortal = async () => {
    setBusyPlan("portal");
    setActionError(null);
    try {
      const { portal_url } = await createCreatorBillingPortal();
      window.location.assign(portal_url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not open billing portal.");
      setBusyPlan(null);
    }
  };

  if (load.status === "loading") {
    return (
      <p className="text-sm text-[var(--lib-fg-muted)]" data-testid="billing-loading">
        Loading plan…
      </p>
    );
  }

  if (load.status === "unavailable" || load.status === "error") {
    return (
      <div className="space-y-3" data-testid="billing-unavailable">
        <p className="text-sm text-[var(--lib-fg-muted)]">{load.message}</p>
        <button
          type="button"
          className="rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-sm text-[var(--lib-fg)] hover:bg-[var(--lib-sidebar-accent)]"
          onClick={() => void refresh()}
        >
          Retry
        </button>
      </div>
    );
  }

  const sub = load.subscription;
  const access = load.access;
  const stripePlanId = planIdOf(sub);
  const effectivePlanId = access?.effective_plan ?? stripePlanId;
  const current = creatorPlanEntry(effectivePlanId);
  const pastDue = "status" in sub && sub.status === "past_due";
  const hasStripeSubscription = stripePlanId != null && "status" in sub;
  const grantSourceLabel = grantLabel(access?.entitlement_source ?? null);
  const isGrantOnly =
    Boolean(grantSourceLabel) && access?.effective_plan != null && !hasStripeSubscription;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8" data-testid="billing-settings">
      {pastDue ? (
        <div
          role="alert"
          data-testid="billing-dunning-banner"
          className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
        >
          <p className="font-medium">Payment failed — update your card</p>
          <p className="mt-1 text-amber-200/90">
            Your subscription is past due. Update payment details in the Stripe portal to keep access.
          </p>
          <button
            type="button"
            data-testid="billing-dunning-portal"
            className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-50"
            disabled={busyPlan !== null}
            onClick={() => void openPortal()}
          >
            {busyPlan === "portal" ? "Opening…" : "Update payment"}
          </button>
        </div>
      ) : null}

      {highlightPlan ? (
        <div
          role="status"
          data-testid="billing-feature-context"
          className="rounded-lg border border-[var(--lib-primary)]/35 bg-[color-mix(in_srgb,var(--lib-primary)_12%,transparent)] px-4 py-3 text-sm text-[var(--lib-fg)]"
        >
          <p className="font-medium">
            Looking for{" "}
            {featureParam === "posting_assistant"
              ? "Relay Coach"
              : featureParam === "autopost"
                ? "Autopost"
                : featureParam === "growth_engine"
                  ? "Growth Engine"
                  : "Studio Core"}
          </p>
          <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
            Recommended plan:{" "}
            {creatorPlanEntry(highlightPlan)?.ladder} · {creatorPlanEntry(highlightPlan)?.name} (
            {creatorPlanEntry(highlightPlan)?.priceLabel})
          </p>
        </div>
      ) : null}

      {searchParams.get("from") === "onboarding" ? (
        <div
          role="status"
          data-testid="billing-from-onboarding"
          className="rounded-lg border border-[var(--lib-border)] px-4 py-3 text-sm text-[var(--lib-fg-muted)]"
        >
          Welcome back from onboarding. Your effective access comes from the subscription or grant
          below — not from the URL.
        </div>
      ) : null}

      <section className="space-y-2" data-testid="billing-current-plan">
        <h2 className="text-lg font-semibold text-[var(--lib-fg)]">Current plan</h2>
        {effectivePlanId && current ? (
          <div className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-sidebar)] px-4 py-3">
            <p className="text-sm text-[var(--lib-fg-muted)]">
              {current.ladder} · {current.name}
            </p>
            <p className="mt-1 text-xl font-semibold text-[var(--lib-fg)] tabular-nums">
              {isGrantOnly ? "Included" : current.priceLabel}
            </p>
            {grantSourceLabel ? (
              <p className="mt-2 text-xs text-[var(--lib-primary)]" data-testid="billing-grant-source">
                {grantSourceLabel}
                {access?.entitlement_expires_at
                  ? ` · expires ${new Date(access.entitlement_expires_at).toLocaleDateString()}`
                  : ""}
              </p>
            ) : null}
            {hasStripeSubscription ? (
              <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
                Status: {sub.status}
                {sub.current_period_end
                  ? ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}`
                  : ""}
                {sub.cancel_at_period_end ? " · cancels at period end" : ""}
              </p>
            ) : null}
            {hasStripeSubscription ? (
              <button
                type="button"
                data-testid="billing-manage-subscription"
                className="mt-3 rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-sm text-[var(--lib-fg)] hover:bg-[var(--lib-sidebar-accent)] disabled:opacity-50"
                disabled={busyPlan !== null}
                onClick={() => void openPortal()}
              >
                {busyPlan === "portal" ? "Opening…" : "Manage subscription"}
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed border-[var(--lib-border)] px-4 py-4"
            data-testid="billing-no-plan"
          >
            <p className="text-sm font-medium text-[var(--lib-fg)]">No paid plan yet</p>
            <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">{FREEMIUM_PITCH}</p>
          </div>
        )}
      </section>

      <section className="space-y-3" data-testid="billing-plans">
        <h2 className="text-lg font-semibold text-[var(--lib-fg)]">Plans</h2>
        <ul className="flex flex-col gap-3">
          {CREATOR_PLAN_CATALOG.map((plan) => {
            const isCurrent = effectivePlanId === plan.id;
            const isHighlight = highlightPlan === plan.id;
            return (
              <li
                key={plan.id}
                className={[
                  "flex flex-col gap-2 rounded-lg border bg-[var(--lib-sidebar)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                  isHighlight
                    ? "border-[var(--lib-primary)]/50 shadow-[inset_0_0_28px_rgba(0,170,111,0.08)]"
                    : "border-[var(--lib-border)]"
                ].join(" ")}
                data-testid={`billing-plan-${plan.id}`}
                data-highlighted={isHighlight ? "true" : undefined}
              >
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">
                    {plan.ladder}
                  </p>
                  <p className="font-medium text-[var(--lib-fg)]">
                    {plan.name}{" "}
                    <span className="text-[var(--lib-fg-muted)] tabular-nums">{plan.priceLabel}</span>
                  </p>
                  <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">{plan.blurb}</p>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 text-sm text-[var(--lib-fg-muted)]">Current</span>
                ) : (
                  <button
                    type="button"
                    data-testid={`billing-upgrade-${plan.id}`}
                    className="shrink-0 rounded-md bg-[#00AA6F] px-3 py-1.5 text-sm font-medium text-[#03120d] hover:bg-[#00c27f] disabled:opacity-50"
                    disabled={busyPlan !== null}
                    onClick={() => void startCheckout(plan.id)}
                  >
                    {busyPlan === plan.id
                      ? "Redirecting…"
                      : hasStripeSubscription || isGrantOnly
                        ? "Switch"
                        : "Upgrade"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {actionError ? (
        <p className="text-sm text-red-400" data-testid="billing-action-error" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

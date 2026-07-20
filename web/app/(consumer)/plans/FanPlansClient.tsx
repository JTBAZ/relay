"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FAN_PATRONAGE_PITCH,
  FAN_PLAN_CATALOG,
  RELOAD_PACK_LABEL,
  fanPlanEntry,
  isPaidFanPlanId,
  type FanPlanId
} from "@/lib/fan-plans";
import {
  RelayApiError,
  createFanBillingCheckout,
  createReloadPackCheckout,
  fetchTipsWallet,
  type TipsWalletWire
} from "@/lib/relay-api";
import { CuratorSupportCard } from "@/components/patron/CuratorSupportCard";

type LoadState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "ready"; wallet: TipsWalletWire }
  | { status: "error"; message: string };

function planFromWallet(wallet: TipsWalletWire): FanPlanId {
  const p = wallet.plan;
  if (p === "supporter" || p === "curator" || p === "free") return p;
  return "free";
}

export default function FanPlansClient() {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const fromTipReveal = fromParam === "tip_reveal";
  const fromOnboarding = fromParam === "onboarding";

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoad({ status: "loading" });
    setActionError(null);
    try {
      const wallet = await fetchTipsWallet();
      setLoad({ status: "ready", wallet });
    } catch (err) {
      if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setLoad({
          status: "unavailable",
          message: "Tip plans are not enabled on this environment yet."
        });
        return;
      }
      setLoad({
        status: "error",
        message: err instanceof Error ? err.message : "Could not load plans."
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (load.status !== "ready" || !fromTipReveal) return;
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const targetId =
      hash === "reload" && isPaidFanPlanId(planFromWallet(load.wallet))
        ? "fan-plans-reload"
        : isPaidFanPlanId(planFromWallet(load.wallet))
          ? `fan-plan-${planFromWallet(load.wallet)}`
          : "fan-plan-supporter";
    const el = document.querySelector(`[data-testid="${targetId}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [load, fromTipReveal]);

  const startCheckout = async (plan: "supporter" | "curator") => {
    setBusy(plan);
    setActionError(null);
    try {
      const { checkout_url } = await createFanBillingCheckout(plan);
      window.location.assign(checkout_url);
    } catch (err) {
      if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setActionError("Fan plans are not enabled yet.");
      } else {
        setActionError(err instanceof Error ? err.message : "Checkout failed.");
      }
      setBusy(null);
    }
  };

  const startReload = async () => {
    setBusy("reload");
    setActionError(null);
    try {
      const { checkout_url } = await createReloadPackCheckout();
      window.location.assign(checkout_url);
    } catch (err) {
      if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setActionError("Reload Packs are not enabled yet.");
      } else {
        setActionError(err instanceof Error ? err.message : "Checkout failed.");
      }
      setBusy(null);
    }
  };

  if (load.status === "loading") {
    return (
      <p className="text-sm text-[var(--lib-fg-muted)]" data-testid="fan-plans-loading">
        Loading plans…
      </p>
    );
  }

  if (load.status === "unavailable" || load.status === "error") {
    return (
      <div className="space-y-3" data-testid="fan-plans-unavailable">
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

  const currentId = planFromWallet(load.wallet);
  const current = fanPlanEntry(currentId);
  const isPremium = isPaidFanPlanId(currentId);
  const totalTips =
    load.wallet.granted_balance + load.wallet.purchased_balance;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8" data-testid="fan-plans">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--lib-fg)]">Support artists with Tips</h1>
        <p className="text-sm text-[var(--lib-fg-muted)]" data-testid="fan-plans-pitch">
          {FAN_PATRONAGE_PITCH}
        </p>
        {fromTipReveal ? (
          <p
            role="status"
            data-testid="fan-plans-from-tip-reveal"
            className="rounded-lg border border-[#1B4332] bg-[#0D1F17] px-3 py-2 text-xs text-[#9bf0c4]"
          >
            {isPremium
              ? "You need more Tips to finish that reveal — Reload Packs are below."
              : "You need Tips to finish that reveal — compare plans below."}
          </p>
        ) : null}
        {fromOnboarding ? (
          <p
            role="status"
            data-testid="fan-plans-from-onboarding"
            className="rounded-lg border border-[var(--lib-border)] px-3 py-2 text-xs text-[var(--lib-fg-muted)]"
          >
            Welcome back from onboarding. Your current plan comes from your wallet — not from the
            URL.
          </p>
        ) : null}
        <p className="text-sm text-[var(--lib-fg)]" data-testid="fan-plans-balance">
          Your balance:{" "}
          <span className="font-medium tabular-nums">{totalTips}</span> Tips
          {current ? (
            <>
              {" "}
              · Plan: <span data-testid="fan-plans-current">{current.name}</span>
            </>
          ) : null}
        </p>
      </header>

      <CuratorSupportCard />

      {actionError ? (
        <p role="alert" className="text-sm text-red-400" data-testid="fan-plans-error">
          {actionError}
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {FAN_PLAN_CATALOG.map((plan) => {
          const isCurrent = plan.id === currentId;
          const highlight =
            fromTipReveal &&
            ((plan.id === "supporter" && !isPremium) ||
              (isPremium && plan.id === currentId));
          return (
            <li
              key={plan.id}
              data-testid={`fan-plan-${plan.id}`}
              data-highlighted={highlight ? "true" : undefined}
              className={[
                "rounded-lg border px-4 py-4",
                highlight ? "border-[#2D6A4F] bg-[#0D1F17]/40" : "border-[var(--lib-border)]"
              ].join(" ")}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-medium text-[var(--lib-fg)]">{plan.name}</h2>
                <span className="text-sm text-[var(--lib-fg-muted)] tabular-nums">
                  {plan.priceLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">{plan.blurb}</p>
              {plan.monthlyTips > 0 ? (
                <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
                  {plan.monthlyTips} Tips / month
                  {plan.revealWindowDays
                    ? ` · ${plan.revealWindowDays}-day reveal window`
                    : ""}
                </p>
              ) : null}
              <div className="mt-3">
                {isCurrent ? (
                  <span
                    className="text-sm font-medium text-[var(--lib-fg)]"
                    data-testid={`fan-plan-${plan.id}-current`}
                  >
                    Current
                  </span>
                ) : isPaidFanPlanId(plan.id) ? (
                  <button
                    type="button"
                    data-testid={`fan-plans-upgrade-${plan.id}`}
                    disabled={busy != null}
                    className="rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-sm text-[var(--lib-fg)] hover:bg-[var(--lib-sidebar-accent)] disabled:opacity-50"
                    onClick={() => {
                      const paid = plan.id;
                      if (isPaidFanPlanId(paid)) void startCheckout(paid);
                    }}
                  >
                    {busy === plan.id ? "Redirecting…" : `Become a ${plan.name}`}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {isPremium ? (
        <section
          id="reload"
          className={[
            "rounded-lg border px-4 py-4",
            fromTipReveal ? "border-[#2D6A4F] bg-[#0D1F17]/40" : "border-[var(--lib-border)]"
          ].join(" ")}
          data-testid="fan-plans-reload"
          data-highlighted={fromTipReveal ? "true" : undefined}
        >
          <h2 className="text-lg font-medium text-[var(--lib-fg)]">Need more Tips?</h2>
          <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
            {RELOAD_PACK_LABEL}. Purchased Tips never expire.
          </p>
          <button
            type="button"
            data-testid="fan-plans-reload-cta"
            disabled={busy != null}
            className="mt-3 rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-sm text-[var(--lib-fg)] hover:bg-[var(--lib-sidebar-accent)] disabled:opacity-50"
            onClick={() => void startReload()}
          >
            {busy === "reload" ? "Redirecting…" : "Buy Reload Pack"}
          </button>
        </section>
      ) : null}
    </div>
  );
}

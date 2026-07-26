"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue
} from "framer-motion";
import {
  CREATOR_PLAN_CATALOG,
  FREEMIUM_PITCH,
  type CreatorPlanId
} from "@/lib/creator-plans";
import {
  FAN_PATRONAGE_PITCH,
  FAN_PLAN_CATALOG,
  type FanPlanId
} from "@/lib/fan-plans";
import {
  RelayApiError,
  createCreatorBillingCheckout,
  createFanBillingCheckout
} from "@/lib/relay-api";
import { StepBadge } from "@/app/components/onboarding/step-panels";

type CreatorSelection = "free" | CreatorPlanId;
type FanSelection = FanPlanId;

/**
 * MB-15C — creator plan education. Click a tier to advance (free) or checkout (paid).
 */
export function StepCreatorPlanChoice({
  onAdvance
}: {
  onAdvance: () => void;
}): React.ReactElement {
  const [selected, setSelected] = useState<CreatorSelection | null>(null);
  const [billingAvailable, setBillingAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = useId();

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/relay-api")
      .then(({ fetchCreatorBillingSubscription }) => fetchCreatorBillingSubscription())
      .then(() => {
        if (!cancelled) setBillingAvailable(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
          setBillingAvailable(false);
          return;
        }
        setBillingAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choosePlan = async (plan: CreatorSelection) => {
    if (busy) return;
    setSelected(plan);
    setError(null);
    if (plan === "free") {
      onAdvance();
      return;
    }
    if (billingAvailable === false) {
      setError("Paid plans are not available here yet. Select Free to finish onboarding.");
      return;
    }
    setBusy(true);
    try {
      const { checkout_url } = await createCreatorBillingCheckout(plan);
      onAdvance();
      window.location.assign(checkout_url);
    } catch (err) {
      if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setBillingAvailable(false);
        setError("Paid plans are not available here yet. Select Free to finish onboarding.");
      } else {
        setError(err instanceof Error ? err.message : "Checkout failed.");
      }
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-7" data-testid="onboarding-creator-plan-step">
      <div className="space-y-2">
        <StepBadge step={5} of={6} extra="Artists" />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Choose your Relay plan
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">{FREEMIUM_PITCH}</p>
      </div>

      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col" aria-label="Creator plan choices" disabled={busy}>
          <legend className="sr-only">Creator plan choices</legend>
          {/* PROTOTYPE scroll prominence — wrap Free / paid; REVERT: unwrap PlanTierScrollShelf */}
          <PlanTierScrollShelf
            free={
              <PlanOption
                testId="onboarding-plan-free"
                groupName={`${groupId}-creator-plan`}
                name="Free"
                priceLabel="$0"
                benefits={["Sync, backup, and basic gallery", "Start without a card"]}
                compact
                selected={selected === "free"}
                hasSelection={selected !== null}
                disabled={busy}
                onSelect={() => void choosePlan("free")}
              />
            }
            paid={
              <div className="flex flex-col gap-3">
                {CREATOR_PLAN_CATALOG.map((plan) => (
                  <PlanOption
                    key={plan.id}
                    testId={`onboarding-plan-${plan.id}`}
                    groupName={`${groupId}-creator-plan`}
                    name={plan.name}
                    ladder={plan.ladder}
                    priceLabel={plan.priceLabel}
                    benefits={creatorPlanBenefits(plan.id)}
                    recommended={plan.id === "autopost"}
                    selected={selected === plan.id}
                    hasSelection={selected !== null}
                    disabled={busy}
                    busyLabel={busy && selected === plan.id ? "Opening checkout…" : undefined}
                    onSelect={() => void choosePlan(plan.id)}
                    comingLaterNote={plan.id === "growth_engine"}
                  />
                ))}
              </div>
            }
          />
        </fieldset>

        {billingAvailable === false ? (
          <p
            className="rounded-xl border border-dashed border-[var(--relay-border)] px-3 py-2 text-xs text-[var(--relay-fg-muted)]"
            data-testid="onboarding-plan-billing-unavailable"
          >
            Paid plans are not available on this environment yet. Select Free to continue.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-red-400" data-testid="onboarding-plan-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * MB-15C — patron/supporter plan education. Click a tier to advance or checkout.
 */
export function StepSupporterPlanChoice({
  onAdvance
}: {
  onAdvance: () => void;
}): React.ReactElement {
  const [selected, setSelected] = useState<FanSelection | null>(null);
  const [plansAvailable, setPlansAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = useId();

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/relay-api")
      .then(({ fetchTipsWallet }) => fetchTipsWallet())
      .then(() => {
        if (!cancelled) setPlansAvailable(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
          setPlansAvailable(false);
          return;
        }
        setPlansAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choosePlan = async (plan: FanSelection) => {
    if (busy) return;
    setSelected(plan);
    setError(null);
    if (plan === "free") {
      onAdvance();
      return;
    }
    if (plansAvailable === false) {
      setError("Paid Tip plans are not available here yet. Select Free to open your feed.");
      return;
    }
    setBusy(true);
    try {
      const { checkout_url } = await createFanBillingCheckout(plan);
      onAdvance();
      window.location.assign(checkout_url);
    } catch (err) {
      if (err instanceof RelayApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setPlansAvailable(false);
        setError("Paid Tip plans are not available here yet. Select Free to open your feed.");
      } else {
        setError(err instanceof Error ? err.message : "Checkout failed.");
      }
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-7" data-testid="onboarding-supporter-plan-step">
      <div className="space-y-2">
        <StepBadge step={4} of={5} extra="Patrons" />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Choose how you support
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">{FAN_PATRONAGE_PITCH}</p>
      </div>

      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col" aria-label="Fan plan choices" disabled={busy}>
          <legend className="sr-only">Fan plan choices</legend>
          {/* PROTOTYPE scroll prominence — wrap Free / paid; REVERT: unwrap PlanTierScrollShelf */}
          <PlanTierScrollShelf
            free={
              <>
                {FAN_PLAN_CATALOG.filter((plan) => plan.id === "free").map((plan) => (
                  <PlanOption
                    key={plan.id}
                    testId={`onboarding-fan-plan-${plan.id}`}
                    groupName={`${groupId}-fan-plan`}
                    name={plan.name}
                    priceLabel={plan.priceLabel}
                    benefits={fanPlanBenefits(plan.id)}
                    selected={selected === plan.id}
                    hasSelection={selected !== null}
                    disabled={busy}
                    onSelect={() => void choosePlan(plan.id)}
                  />
                ))}
              </>
            }
            paid={
              <div className="flex flex-col gap-3">
                {FAN_PLAN_CATALOG.filter((plan) => plan.id !== "free").map((plan) => (
                  <PlanOption
                    key={plan.id}
                    testId={`onboarding-fan-plan-${plan.id}`}
                    groupName={`${groupId}-fan-plan`}
                    name={plan.name}
                    priceLabel={plan.priceLabel}
                    benefits={fanPlanBenefits(plan.id)}
                    recommended={plan.id === "supporter"}
                    selected={selected === plan.id}
                    hasSelection={selected !== null}
                    disabled={busy}
                    busyLabel={busy && selected === plan.id ? "Opening checkout…" : undefined}
                    onSelect={() => void choosePlan(plan.id)}
                  />
                ))}
              </div>
            }
          />
        </fieldset>

        {plansAvailable === false ? (
          <p
            className="rounded-xl border border-dashed border-[var(--relay-border)] px-3 py-2 text-xs text-[var(--relay-fg-muted)]"
            data-testid="onboarding-fan-plan-unavailable"
          >
            Paid Tip plans are not available on this environment yet. Select Free to continue.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-red-400" data-testid="onboarding-fan-plan-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * PROTOTYPE: scroll prominence handoff (Free ↔ paid)
 * ----------------------------------------------------------------------------
 * As the paid shelf moves toward mid-viewport, paid gains micro scale/opacity
 * and Free softens — reverse on scroll up. No aspect-ratio stretch.
 * On mount, Free floats into place first (focus), then paid fades up quieter.
 *
 * REVERT: delete this component; restore static Free → PlanShelfDivider → paid
 * markup inside each fieldset (see git history or REVERT comments at call sites).
 * ============================================================================
 */
function PlanTierScrollShelf({
  free,
  paid
}: {
  free: ReactNode;
  paid: ReactNode;
}): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const paidRef = useRef<HTMLDivElement>(null);

  // t: 0 = Free-zone / paid still low; 1 = paid shelf near mid-viewport
  const { scrollYProgress } = useScroll({
    target: paidRef,
    offset: ["start 0.88", "center 0.42"]
  });
  const t = useSpring(scrollYProgress, { stiffness: 140, damping: 34, mass: 0.35 });

  // Free rests a touch larger so it owns first attention; softens as paid take focus.
  const freeScale = useTransform(t, [0, 1], [1.04, 1.01]);
  const freeOpacity = useTransform(t, [0, 1], [1, 0.9]);
  const paidScale = useTransform(t, [0, 1], [1, 1.022]);
  const paidOpacity = useTransform(t, [0, 1], [0.94, 1]);
  const dashOpacity = useTransform(t, [0, 1], [0.45, 0.95]);

  if (reduceMotion) {
    return (
      <>
        {free}
        <PlanShelfDivider />
        <div ref={paidRef}>{paid}</div>
      </>
    );
  }

  return (
    <>
      {/* Entrance on outer; scroll prominence on inner (avoids fighting the same scale). */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
        data-prototype="plan-scroll-prominence-free-enter"
      >
        <motion.div
          style={{ scale: freeScale, opacity: freeOpacity }}
          className="origin-top will-change-transform"
          data-prototype="plan-scroll-prominence-free"
        >
          {free}
        </motion.div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
      >
        <PlanShelfDivider dashOpacity={dashOpacity} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
        data-prototype="plan-scroll-prominence-paid-enter"
      >
        <motion.div
          ref={paidRef}
          style={{ scale: paidScale, opacity: paidOpacity }}
          className="origin-center will-change-transform"
          data-prototype="plan-scroll-prominence-paid"
        >
          {paid}
        </motion.div>
      </motion.div>
    </>
  );
}

/** ~3× card gap between Free and paid shelf; short dash marks the type break. */
function PlanShelfDivider({
  dashOpacity
}: {
  /** PROTOTYPE: optional motion value; omit when reverting scroll handoff. */
  dashOpacity?: MotionValue<number>;
}): React.ReactElement {
  return (
    <div
      className="flex h-9 shrink-0 items-center justify-center"
      aria-hidden="true"
      data-testid="onboarding-plan-shelf-divider"
    >
      {dashOpacity ? (
        <motion.span
          style={{ opacity: dashOpacity }}
          className="h-px w-10 bg-[#2e2e2e]"
          data-prototype="plan-scroll-prominence-dash"
        />
      ) : (
        <span className="h-px w-10 bg-[#2e2e2e]" />
      )}
    </div>
  );
}

function splitPriceLabel(priceLabel: string): { amount: string; period: string | null } {
  const match = priceLabel.match(/^(\$?[\d.]+)(\/mo)?$/i);
  if (!match) return { amount: priceLabel, period: null };
  return { amount: match[1], period: match[2] ?? null };
}

function fanPlanBenefits(id: FanPlanId): string[] {
  switch (id) {
    case "free":
      return [
        "Your Patreon subscriptions in *one clean gallery*",
        "Trade Tips to new artists in exchange for special samples and promo deals",
        "Tip to unlock more — every Tip helps that artist get discovered"
      ];
    case "supporter":
      return [
        "*Find your next Patreon muse* — we send you preview offers from artists hoping to be discovered that we think you'll love.",
        "First 5 Tips of the month Free — we pay the artist, you still get the promo.",
        "14-day reveal windows"
      ];
    case "curator":
      return [
        "Custom profile aesthetics, collection tools, and your engagement *boosts an artist's spotlight*",
        "30-day reveal windows",
        "Premium collector tools — scan and gather art to review while you're AFK."
      ];
  }
}

/** Renders copy with *emphasized* segments as semibold foreground. */
function EmphasizedCopy({ text }: { text: string }): React.ReactElement {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <strong key={i} className="font-semibold text-[var(--relay-fg)]">
              {part.slice(1, -1)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function creatorPlanBenefits(id: CreatorPlanId): string[] {
  switch (id) {
    case "studio_core":
      return ["Library curation & gallery", "Analytics and backup sync", "Promo Pool tools"];
    case "autopost":
      return ["Full Autopost pipeline", "Style Profile & Coach", "Cross-post drafts"];
    case "growth_engine":
      return ["Everything in Autopost", "Multilingual, A/B, targeting", "Ships as features land"];
  }
}

function PlanOption({
  testId,
  groupName,
  name,
  ladder,
  priceLabel,
  benefits,
  selected,
  hasSelection,
  onSelect,
  compact,
  recommended,
  comingLaterNote,
  disabled,
  busyLabel
}: {
  testId: string;
  groupName: string;
  name: string;
  ladder?: string;
  priceLabel: string;
  benefits: string[];
  selected: boolean;
  hasSelection: boolean;
  onSelect: () => void;
  compact?: boolean;
  recommended?: boolean;
  comingLaterNote?: boolean;
  disabled?: boolean;
  busyLabel?: string;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const { amount, period } = splitPriceLabel(priceLabel);

  // Soft green when hovering an unselected card (before any lock), or always when selected.
  // Dim gray when another card is locked selected.
  let backgroundColor = "#111111";
  let borderColor = "var(--relay-border)";
  let opacity = 1;
  if (selected) {
    backgroundColor = "#0d2a1f";
    borderColor = "#00aa6f";
  } else if (hasSelection) {
    backgroundColor = "#141414";
    borderColor = "#2a2a2a";
    opacity = 0.55;
  } else if (hovered && !disabled) {
    backgroundColor = "#0d2a1f";
    borderColor = "#00aa6f";
  } else if (recommended) {
    borderColor = "#2a4a3c";
  }

  return (
    <label
      data-testid={testId}
      data-selected={selected ? "true" : undefined}
      data-hovered={hovered && !selected && !hasSelection && !disabled ? "true" : undefined}
      data-recommended={recommended ? "true" : undefined}
      onMouseEnter={() => {
        if (!disabled) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onSelect();
      }}
      style={{ backgroundColor, borderColor, opacity }}
      className={[
        "relative flex flex-col rounded-xl border",
        "transition-[background-color,border-color,opacity] duration-150",
        "outline-none focus-within:ring-2 focus-within:ring-[#00aa6f]/35",
        compact ? "gap-2 px-4 py-4" : "gap-3 px-5 py-5",
        selected ? "shadow-[inset_0_0_0_1px_rgba(0,170,111,0.4)]" : "",
        disabled ? "cursor-wait" : "cursor-pointer"
      ].join(" ")}
    >
      <input
        type="radio"
        name={groupName}
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
        tabIndex={disabled ? -1 : 0}
      />

      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          {ladder ? (
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--relay-fg-muted)]">
              {ladder}
            </span>
          ) : null}
          <span
            className={[
              "font-medium uppercase tracking-[0.12em] text-[var(--relay-fg-muted)]",
              compact ? "text-[10px]" : "text-[11px]"
            ].join(" ")}
          >
            {name}
          </span>
        </span>
        {recommended ? (
          <span className="shrink-0 rounded-md bg-[#00aa6f]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#00aa6f]">
            Recommended
          </span>
        ) : null}
      </span>

      <span className="flex items-baseline gap-1.5">
        <span
          className={[
            "font-semibold tracking-tight tabular-nums text-[var(--relay-fg)]",
            compact ? "text-2xl leading-none" : "text-3xl leading-none"
          ].join(" ")}
        >
          {amount}
        </span>
        {period ? (
          <span className="text-sm font-medium text-[var(--relay-fg-muted)]">{period}</span>
        ) : null}
      </span>

      <ul
        className={[
          "flex flex-col text-[var(--relay-fg-muted)]",
          compact
            ? "gap-0.5 text-xs leading-snug"
            : "gap-1.5 border-t border-[var(--relay-border)]/60 pt-3 text-sm leading-snug"
        ].join(" ")}
      >
        {benefits.map((line, index) => (
          <li key={line} className="flex gap-2">
            <span
              aria-hidden
              className={[
                "mt-[0.35em] h-1 w-1 shrink-0 rounded-full",
                selected ? "bg-[#00aa6f]" : "bg-[var(--relay-fg-muted)]"
              ].join(" ")}
            />
            <span>
              {/* Emphasis allowed only on the first benefit line’s key phrase. */}
              {index === 0 ? <EmphasizedCopy text={line} /> : line.replace(/\*/g, "")}
            </span>
          </li>
        ))}
      </ul>

      {comingLaterNote ? (
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
          Coming later features
        </span>
      ) : null}

      {busyLabel ? (
        <span className="text-[11px] font-semibold tracking-wide text-[#00aa6f]">{busyLabel}</span>
      ) : null}
    </label>
  );
}

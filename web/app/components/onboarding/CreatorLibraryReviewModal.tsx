"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { cn } from "@/app/lib/cn";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  CREATOR_GROWTH_GOALS,
  fetchCreatorGalleryFacets,
  fetchCreatorGalleryItems,
  fetchCreatorOnboarding,
  fetchCreatorPromoSlots,
  fetchCreatorPostingGoal,
  galleryItemImageGridSrc,
  mergeCreatorOnboardingMetadata,
  patchCreatorOnboarding,
  putCreatorPostingGoal,
  putCreatorPromoSlots,
  type CreatorGrowthGoal,
  type GalleryItem,
  type PutCreatorPromoSlotRow,
  type TierFacet,
} from "@/lib/relay-api";

const SEARCH_DEBOUNCE_MS = 320;
const MAX_PROMO_SLOTS = 5;
const DEFAULT_POSTS_PER_MONTH = 1;
const MAX_POSTS_PER_MONTH = 31;

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function clampMonthlyPostTarget(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POSTS_PER_MONTH;
  return Math.min(MAX_POSTS_PER_MONTH, Math.max(1, Math.round(value)));
}

type SelectedPromo = {
  slot_rank: PutCreatorPromoSlotRow["slot_rank"];
  target_kind: "media";
  target_id: string;
  title: string;
  thumb_url_path?: string;
};

type Props = {
  open: boolean;
  creatorId: string;
  onClose: () => void;
  onComplete: () => void;
};

function nextAvailableRank(selected: Map<number, SelectedPromo>): number | null {
  for (let rank = 1; rank <= MAX_PROMO_SLOTS; rank += 1) {
    if (!selected.has(rank)) return rank;
  }
  return null;
}

function rankForMediaId(selected: Map<number, SelectedPromo>, mediaId: string): number | null {
  for (const [rank, row] of Array.from(selected.entries())) {
    if (row.target_id === mediaId) return rank;
  }
  return null;
}

function tierChipLabel(tierId: string, tierTitleById: Record<string, string>): string {
  return tierTitleById[tierId]?.trim() || tierId.replace(/^patreon_tier_/, "").replace(/^relay_tier_/, "");
}

export function CreatorLibraryReviewModal({
  open,
  creatorId,
  onComplete,
}: Props) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, SEARCH_DEBOUNCE_MS);
  const [tierPick, setTierPick] = useState<string[]>([]);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [tiers, setTiers] = useState<TierFacet[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<number, SelectedPromo>>(new Map());
  const [growthGoal, setGrowthGoal] = useState<CreatorGrowthGoal | null>(null);
  const [postsPerMonth, setPostsPerMonth] = useState<number>(DEFAULT_POSTS_PER_MONTH);
  const [bonusNudgesEnabled, setBonusNudgesEnabled] = useState(false);
  const [phase, setPhase] = useState<"intro" | "select" | "goal">("intro");
  const [introStep, setIntroStep] = useState<0 | 1>(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const tierTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tier of tiers) map[tier.tier_id] = tier.title;
    return map;
  }, [tiers]);

  const resetState = useCallback(() => {
    setQ("");
    setTierPick([]);
    setItems([]);
    setTiers([]);
    setSelected(new Map());
    setGrowthGoal(null);
    setPostsPerMonth(DEFAULT_POSTS_PER_MONTH);
    setBonusNudgesEnabled(false);
    setPhase("intro");
    setIntroStep(0);
    setListError(null);
    setSaveError(null);
    setHydrated(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: 0 });
      if (phase === "intro") window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, phase]);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [facets, existingSlots, onboarding, postingGoalRes] = await Promise.all([
          fetchCreatorGalleryFacets(creatorId),
          fetchCreatorPromoSlots().catch(() => ({ creator_id: creatorId, slots: [] })),
          fetchCreatorOnboarding().catch(() => null),
          fetchCreatorPostingGoal().catch(() => null),
        ]);
        if (cancelled) return;

        setTiers(facets.tiers ?? []);

        const restored = new Map<number, SelectedPromo>();
        for (const slot of existingSlots.slots) {
          if (slot.target_kind !== "media") continue;
          restored.set(slot.slot_rank, {
            slot_rank: slot.slot_rank,
            target_kind: "media",
            target_id: slot.target_id,
            title: slot.title ?? "Untitled",
            thumb_url_path: slot.thumb_url_path,
          });
        }
        setSelected(restored);

        const meta =
          onboarding?.metadata &&
          typeof onboarding.metadata === "object" &&
          !Array.isArray(onboarding.metadata)
            ? (onboarding.metadata as Record<string, unknown>)
            : null;
        const savedGoal = meta?.growth_goal;
        if (
          savedGoal === "discovery" ||
          savedGoal === "conversion" ||
          savedGoal === "consistency"
        ) {
          setGrowthGoal(savedGoal);
        }

        const savedPostingGoal = postingGoalRes?.goal;
        if (savedPostingGoal && !savedPostingGoal.is_default) {
          setPostsPerMonth(clampMonthlyPostTarget(savedPostingGoal.monthly_post_target));
          setBonusNudgesEnabled(Boolean(savedPostingGoal.bonus_nudges_enabled));
        } else {
          const savedPostsPerMonth = meta?.posting_cadence_per_month;
          if (
            typeof savedPostsPerMonth === "number" &&
            Number.isFinite(savedPostsPerMonth) &&
            savedPostsPerMonth >= 1
          ) {
            setPostsPerMonth(clampMonthlyPostTarget(savedPostsPerMonth));
          }
        }
      } catch {
        /* non-fatal — modal still usable */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, creatorId, resetState]);

  useEffect(() => {
    if (!open || !creatorId.trim()) return;

    let cancelled = false;
    void (async () => {
      setLoadingItems(true);
      setListError(null);
      try {
        const wantsSearchFocus = Boolean(debouncedQ.trim());
        const data = await fetchCreatorGalleryItems({
          creator_id: creatorId,
          q: debouncedQ || undefined,
          tier_ids: tierPick.length ? tierPick : undefined,
          display: wantsSearchFocus ? "post_primary" : "all_media",
          limit: 60,
        });
        if (!cancelled) setItems(data.items);
      } catch (e) {
        if (!cancelled) {
          setListError(e instanceof Error ? e.message : "Could not load your library.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, creatorId, debouncedQ, tierPick]);

  const toggleTier = (tierId: string) => {
    setTierPick((prev) =>
      prev.includes(tierId) ? prev.filter((id) => id !== tierId) : [...prev, tierId]
    );
  };

  const toggleItem = (item: GalleryItem) => {
    setSelected((prev) => {
      const existingRank = rankForMediaId(prev, item.media_id);
      if (existingRank != null) {
        const next = new Map(prev);
        next.delete(existingRank);
        return next;
      }
      const rank = nextAvailableRank(prev);
      if (rank == null) return prev;
      const next = new Map(prev);
      next.set(rank, {
        slot_rank: rank as PutCreatorPromoSlotRow["slot_rank"],
        target_kind: "media",
        target_id: item.media_id,
        title: item.title?.trim() || "Untitled",
        thumb_url_path: item.thumb_url_path,
      });
      return next;
    });
  };

  const selectedCount = selected.size;
  const validPostsPerMonth =
    Number.isFinite(postsPerMonth) &&
    postsPerMonth >= 1 &&
    postsPerMonth <= MAX_POSTS_PER_MONTH;
  const canSubmitPromos = selectedCount >= 1 && selectedCount <= MAX_PROMO_SLOTS;
  const canFinish = canSubmitPromos && growthGoal != null && validPostsPerMonth;
  const submitLabel =
    selectedCount === 1 ? "Submit 1 piece" : `Submit ${selectedCount} pieces`;
  const headerKicker =
    phase === "goal"
      ? "Step 5 · Growth focus"
      : phase === "select"
        ? "Step 5 · Explore"
        : "Step 5 · Library ready";
  const headerTitle =
    phase === "goal"
      ? "Choose your growth goal"
      : phase === "select"
        ? "Review your Library"
        : "Your art is in!";
  const headerDescription =
    phase === "goal"
      ? "Tell Relay what outcome to optimize for so the recommendations stay consistent."
      : phase === "select"
        ? "Search your imported gallery and select 1-5 promo pieces."
        : "Explore your gallery, and choose your promotions.";

  const handleFinish = async () => {
    if (!canFinish || !growthGoal) return;
    setSaving(true);
    setSaveError(null);
    try {
      const slots: PutCreatorPromoSlotRow[] = Array.from(selected.values())
        .sort((a, b) => a.slot_rank - b.slot_rank)
        .map((row) => ({
          slot_rank: row.slot_rank,
          target_kind: row.target_kind,
          target_id: row.target_id,
        }));

      await putCreatorPromoSlots(slots);

      const monthlyPostTarget = clampMonthlyPostTarget(postsPerMonth);
      await putCreatorPostingGoal({
        monthly_post_target: monthlyPostTarget,
        bonus_nudges_enabled: bonusNudgesEnabled,
        timezone: browserTimezone(),
      });

      const onboarding = await fetchCreatorOnboarding();
      const metadata = mergeCreatorOnboardingMetadata(onboarding.metadata, {
        growth_goal: growthGoal,
        library_review_completed_at: new Date().toISOString(),
      });
      const patch: { metadata: Record<string, unknown>; step?: "organized" } = { metadata };
      if (onboarding.step === "import_started") {
        patch.step = "organized";
      }
      await patchCreatorOnboarding(patch);

      onComplete();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save your selections.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex justify-center bg-[var(--relay-bg)] relay-animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="creator-library-review-title"
    >
      <div className="relative flex h-dvh w-full max-w-5xl flex-col overflow-hidden bg-[var(--relay-bg)] onboarding-panel-animate">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--relay-border)] px-4 py-4 sm:px-6">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--relay-green-400)]">
              {headerKicker}
            </p>
            <h2
              id="creator-library-review-title"
              className="text-xl font-semibold tracking-tight text-[var(--relay-fg)]"
            >
              {headerTitle}
            </h2>
            <p className="text-sm text-[var(--relay-fg-muted)]">
              {headerDescription}
            </p>
          </div>
        </header>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {phase === "intro" ? (
            <div className="mx-auto flex max-w-2xl flex-col space-y-5 py-5 sm:py-8">
              <section
                className={cn(
                  "rounded-[1.75rem] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 sm:p-6",
                  introStep === 0
                    ? "border-[var(--relay-green-600)]/40 bg-gradient-to-br from-[var(--relay-green-950)]/85 via-[var(--relay-surface-1)] to-[var(--relay-bg)] shadow-[0_18px_60px_rgba(45,106,79,0.16)] relay-animate-fade-up"
                    : "border-[var(--relay-border)] bg-[var(--relay-surface-1)]/70 opacity-75"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--relay-green-400)]">
                      Promo Pieces
                    </p>
                    <p className="mt-3 text-base leading-relaxed text-[var(--relay-fg)]">
                      Select a few pieces that give people a strong look at your storefront without
                      giving away the store. Relay uses them as teasers to promote your content to
                      likely subscribers.
                    </p>
                  </div>
                  {introStep === 1 ? (
                    <span className="rounded-full border border-[var(--relay-green-600)]/40 bg-[var(--relay-green-600)]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--relay-green-400)]">
                      Seen
                    </span>
                  ) : null}
                </div>
              </section>
              {introStep === 1 ? (
                <section className="rounded-[1.75rem] border border-[var(--relay-green-600)]/30 bg-gradient-to-br from-[var(--relay-surface-1)] via-[var(--relay-bg)] to-[var(--relay-green-950)]/60 p-5 shadow-[0_18px_60px_rgba(45,106,79,0.14)] relay-animate-fade-up sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--relay-green-400)]">
                    Discovery that pays
                  </p>
                  <p className="mt-3 text-base leading-relaxed text-[var(--relay-fg)]">
                    Curious browsers can tip you to sample these promos, so you make money from
                    your own discovery. Relay splits those proceeds with you.
                  </p>
                </section>
              ) : null}
              <div className="flex justify-end pt-1 relay-animate-fade-up">
                <button
                  type="button"
                  onClick={() => {
                    if (introStep === 0) {
                      setIntroStep(1);
                      return;
                    }
                    setPhase("select");
                  }}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--relay-green-600)] px-5 py-3 text-sm font-semibold text-[var(--relay-fg)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {introStep === 0 ? "Next" : "Review my gallery"}
                  <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
          ) : phase === "select" ? (
            <div className="space-y-4">
              <section aria-label="Library search" className="space-y-3">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--relay-fg-muted)]"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search titles and tags…"
                    className="w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] py-2.5 pl-10 pr-3 text-sm text-[var(--relay-fg)] outline-none ring-[var(--relay-green-600)] focus:ring-2"
                  />
                </div>
                {tiers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tiers.map((tier) => {
                      const active = tierPick.includes(tier.tier_id);
                      return (
                        <button
                          key={tier.tier_id}
                          type="button"
                          onClick={() => toggleTier(tier.tier_id)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            active
                              ? "border-[var(--relay-green-600)] bg-[var(--relay-green-600)]/15 text-[var(--relay-green-400)]"
                              : "border-[var(--relay-border)] text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)]"
                          )}
                        >
                          {tierChipLabel(tier.tier_id, tierTitleById)}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section aria-label="Imported media grid">
                {!hydrated || loadingItems ? (
                  <p className="flex items-center gap-2 py-8 text-sm text-[var(--relay-fg-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading your imported media…
                  </p>
                ) : listError ? (
                  <p className="rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                    {listError}
                  </p>
                ) : items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--relay-fg-muted)]">
                    No media matches your search yet. Try a different query or clear filters.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {items.map((item) => {
                      const rank = rankForMediaId(selected, item.media_id);
                      const selectedItem = rank != null;
                      const thumb = galleryItemImageGridSrc(item);
                      return (
                        <button
                          key={item.media_id}
                          type="button"
                          onClick={() => toggleItem(item)}
                          disabled={!selectedItem && selectedCount >= MAX_PROMO_SLOTS}
                          className={cn(
                            "group relative aspect-square overflow-hidden rounded-xl border text-left transition-colors",
                            selectedItem
                              ? "border-[var(--relay-green-600)] ring-2 ring-[var(--relay-green-600)]/40"
                              : "border-[var(--relay-border)] hover:border-[var(--relay-green-600)]/60",
                            !selectedItem && selectedCount >= MAX_PROMO_SLOTS
                              ? "cursor-not-allowed opacity-50"
                              : ""
                          )}
                          aria-pressed={selectedItem}
                          aria-label={`${selectedItem ? "Remove" : "Add"} ${item.title || "media"} as promo piece`}
                        >
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element -- gallery thumb
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-[var(--relay-surface-1)] px-2 text-center text-xs text-[var(--relay-fg-muted)]">
                              {item.title || "Media"}
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
                            <p className="line-clamp-2 text-xs font-medium text-white">
                              {item.title || "Untitled"}
                            </p>
                          </div>
                          {selectedItem ? (
                            <span className="absolute left-2 top-2 rounded bg-[var(--relay-green-600)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              #{rank}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-2xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] p-4">
                <p className="text-sm font-semibold text-[var(--relay-fg)]">
                  {selectedCount} promotional piece{selectedCount === 1 ? "" : "s"} selected.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--relay-fg-muted)]">
                  Now choose the growth goal Relay should optimize around. This lets your analytics,
                  campaign prompts, and recommendation surfaces speak the same language.
                </p>
              </section>

              <section aria-label="Growth goal" className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--relay-fg)]">Growth goal</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CREATOR_GROWTH_GOALS.map((goal) => {
                    const active = growthGoal === goal.id;
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => setGrowthGoal(goal.id)}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-left transition-colors",
                          active
                            ? "border-[var(--relay-green-600)] bg-[var(--relay-green-600)]/10"
                            : "border-[var(--relay-border)] bg-[var(--relay-surface-1)] hover:border-[var(--relay-green-600)]/50"
                        )}
                        aria-pressed={active}
                      >
                        <p className="text-sm font-semibold text-[var(--relay-fg)]">{goal.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--relay-fg-muted)]">
                          {goal.detail}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section aria-label="Posting rhythm" className="space-y-2">
                <label
                  htmlFor="creator-review-posts-per-month"
                  className="text-sm font-semibold text-[var(--relay-fg)]"
                >
                  How many times do you want to post on Relay each month?
                </label>
                <input
                  id="creator-review-posts-per-month"
                  type="number"
                  min={1}
                  max={MAX_POSTS_PER_MONTH}
                  value={postsPerMonth}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setPostsPerMonth(
                      Number.isFinite(next) ? clampMonthlyPostTarget(next) : DEFAULT_POSTS_PER_MONTH
                    );
                  }}
                  className="w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2.5 text-sm text-[var(--relay-fg)] outline-none ring-[var(--relay-green-600)] focus:ring-2"
                />
                <p className="text-xs leading-relaxed text-[var(--relay-fg-muted)]">
                  Most creators start with 1. Relay uses this only to help you stay on pace.
                </p>
                <label className="flex items-start gap-2 pt-1 text-sm text-[var(--relay-fg)]">
                  <input
                    type="checkbox"
                    checked={bonusNudgesEnabled}
                    onChange={(e) => setBonusNudgesEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--relay-border)]"
                  />
                  <span>Suggest an extra post when I have unused media ready.</span>
                </label>
              </section>
            </div>
          )}
        </div>

        {phase !== "intro" ? (
        <footer className="flex shrink-0 flex-col gap-2 border-t border-[var(--relay-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-[var(--relay-fg-muted)]">
            {phase === "select"
              ? selectedCount < 1
                ? "Pick at least one promo piece to continue."
                : `${selectedCount} / ${MAX_PROMO_SLOTS} selected — click a piece again to remove it.`
              : !growthGoal
                ? "Choose a growth goal to continue."
                : !validPostsPerMonth
                  ? `Enter a posting goal between 1 and ${MAX_POSTS_PER_MONTH} Relay posts per month.`
                  : "Selections save to your studio — no tier access changes."}
          </p>
          <div className="flex gap-2">
            {phase === "goal" ? (
              <button
                type="button"
                onClick={() => setPhase("select")}
                disabled={saving}
                className="rounded-xl border border-[var(--relay-border)] px-4 py-2.5 text-sm font-medium text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)] disabled:opacity-50"
              >
                Back
              </button>
            ) : null}
            {phase === "select" ? (
              <button
                type="button"
                onClick={() => setPhase("goal")}
                disabled={!canSubmitPromos || saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--relay-green-600)] px-5 py-2.5 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={!canFinish || saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--relay-green-600)] px-5 py-2.5 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Continue to Library
              </button>
            )}
          </div>
          {saveError ? (
            <p className="w-full text-sm text-red-300" role="alert">
              {saveError}
            </p>
          ) : null}
        </footer>
        ) : null}
      </div>
    </div>
  );
}

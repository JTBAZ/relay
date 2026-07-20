"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Target,
  FileEdit,
  Users2,
  ArrowRight,
  FileBarChart2,
  MessageSquare
} from "lucide-react";

import { FindingsCard } from "./FindingsCard";
import { RecentPosts } from "./RecentPosts";
import { EditBriefModal, ReviewGoalsModal } from "./Modals";
import { FrameConfirmation } from "./FrameConfirmation";
import { IAH, IAH_ROOT_STYLE } from "./action-hub-tokens";
import {
  type PostingAssistantContext,
  type AutopostDraftFrame,
  type GoalId,
  type LatestReport
} from "./action-hub-types";
import {
  emptyMountedReport,
  recentPostsFromUnified,
  reportFromDistributionPlan
} from "./action-hub-report";
import {
  createAutopostDraft,
  fetchCreatorOnboarding,
  fetchCreatorPostingGoal,
  fetchCreatorPostingGoalStatus,
  fetchCreatorStudioBrief,
  fetchPostDistributionPlan,
  growthGoalMeta,
  mergeCreatorOnboardingMetadata,
  parseGrowthGoal,
  patchCreatorOnboarding,
  patchCreatorStudioBrief,
  proposeCoachAttackPlans,
  putCreatorPostingGoal,
  type CreatorGrowthGoal,
  type CreatorPostingGoalStatusWire,
  type CreatorUnifiedPerformanceData,
  type DistributionDestination,
  type StudioBriefWire
} from "@/lib/relay-api";

const DEFAULT_COACH_DESTINATIONS: DistributionDestination[] = [
  "patreon",
  "x",
  "bluesky",
  "deviantart"
];

function briefFromWire(wire: StudioBriefWire): PostingAssistantContext {
  return {
    goals: wire.goals as GoalId[],
    user_notes: wire.user_notes ?? "",
    locale: wire.locale,
    trend_note: wire.trend_note
  };
}

const EMPTY_BRIEF: PostingAssistantContext = {
  goals: [],
  user_notes: "",
  locale: null,
  trend_note: null
};

type InsightsActionHubProps = {
  unifiedPerformance?: CreatorUnifiedPerformanceData | null;
};

/**
 * Insights Action Hub — v0 UX + Relay branding.
 * Mounts studio brief + coach_review checkpoint report for focused post.
 */
export function InsightsActionHub({ unifiedPerformance = null }: InsightsActionHubProps) {
  const router = useRouter();

  const livePosts = useMemo(
    () => recentPostsFromUnified(unifiedPerformance),
    [unifiedPerformance]
  );

  const [brief, setBrief] = useState<PostingAssistantContext>(EMPTY_BRIEF);
  const [briefMounted, setBriefMounted] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [focusedPostId, setFocusedPostId] = useState<string>("");
  const [report, setReport] = useState<LatestReport>(() => emptyMountedReport(null));
  const [reportLoading, setReportLoading] = useState(false);
  const [showEditBrief, setShowEditBrief] = useState(false);
  const [showReviewGoals, setShowReviewGoals] = useState(false);
  const [framingState, setFramingState] = useState<"idle" | "framing" | "done">("idle");
  const [drafts, setDrafts] = useState<AutopostDraftFrame[]>([]);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [monthlyTarget, setMonthlyTarget] = useState(1);
  const [bonusNudgesEnabled, setBonusNudgesEnabled] = useState(false);
  const [postsThisMonth, setPostsThisMonth] = useState<number | null>(null);
  const [paceStatusLive, setPaceStatusLive] = useState<
    CreatorPostingGoalStatusWire["pace_status"] | null
  >(null);
  const [growthGoal, setGrowthGoal] = useState<CreatorGrowthGoal | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  // Default focus to top live post when list arrives
  useEffect(() => {
    if (!focusedPostId && livePosts[0]?.id) {
      setFocusedPostId(livePosts[0].id);
    }
  }, [livePosts, focusedPostId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ brief: wire }, goalRes, statusRes, onboarding] = await Promise.all([
          fetchCreatorStudioBrief(),
          fetchCreatorPostingGoal().catch(() => null),
          fetchCreatorPostingGoalStatus().catch(() => null),
          fetchCreatorOnboarding().catch(() => null)
        ]);
        if (cancelled) return;
        const next = briefFromWire(wire);
        setBrief(next);
        const hasContent =
          next.goals.length > 0 ||
          Boolean(next.user_notes.trim()) ||
          Boolean(next.locale) ||
          Boolean(next.trend_note);
        setBriefMounted(hasContent);
        setBriefError(null);
        if (goalRes?.goal) {
          setMonthlyTarget(Math.max(1, goalRes.goal.monthly_post_target || 1));
          setBonusNudgesEnabled(Boolean(goalRes.goal.bonus_nudges_enabled));
        }
        if (statusRes?.status) {
          setPostsThisMonth(statusRes.status.posts_this_month);
          setPaceStatusLive(statusRes.status.pace_status);
          setMonthlyTarget(Math.max(1, statusRes.status.goal.monthly_post_target || 1));
          setBonusNudgesEnabled(Boolean(statusRes.status.goal.bonus_nudges_enabled));
        }
        setGrowthGoal(parseGrowthGoal(onboarding?.metadata ?? null));
      } catch (err) {
        if (cancelled) return;
        setBriefError(err instanceof Error ? err.message : "Could not load studio brief");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mount checkpoint report for focused post (no auto-repropose)
  useEffect(() => {
    if (!focusedPostId) {
      setReport(emptyMountedReport(null));
      return;
    }
    let cancelled = false;
    setReportLoading(true);
    (async () => {
      try {
        const { plan } = await fetchPostDistributionPlan(focusedPostId);
        if (cancelled) return;
        const mounted = reportFromDistributionPlan(focusedPostId, plan);
        setReport(mounted ?? emptyMountedReport(focusedPostId));
      } catch {
        if (cancelled) return;
        setReport(emptyMountedReport(focusedPostId));
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusedPostId]);

  const chips = report.findings.chips;
  const cadence = report.fact_pack.cadence;
  const hasOpenReview = report.coach_review.hasOpenReview;
  const displayPostsThisMonth = postsThisMonth ?? cadence.posts_this_month;
  const focusedPost = livePosts.find((p) => p.id === focusedPostId);

  const handleFrameNextPosts = useCallback(async () => {
    if (framingState !== "idle") return;
    setFramingState("framing");
    setFrameError(null);
    try {
      const intents =
        chips.length > 0
          ? chips.slice(0, 3).map((c) =>
              c.highlight
                ? c.label.replace(c.highlight.text, c.highlight.value)
                : c.label
            )
          : brief.goals.length > 0
            ? brief.goals.map((g) => `Frame next post for ${g.replace(/_/g, " ")}`)
            : ["Frame next post from Insights"];

      const created: AutopostDraftFrame[] = [];
      for (let i = 0; i < intents.length; i++) {
        const intent = intents[i]!.slice(0, 280);
        const { draft } = await createAutopostDraft({
          media_ids: [],
          status: "nudged",
          intent,
          composer_step: "upload"
        });
        created.push({
          id: draft.draft_id,
          status: "nudged",
          intent: draft.intent ?? intent,
          media_ids: draft.media_ids ?? []
        });
      }
      setDrafts(created);
      setFramingState("done");
    } catch (err) {
      setFrameError(err instanceof Error ? err.message : "Could not create draft frames");
      setFramingState("idle");
    }
  }, [framingState, chips, brief.goals]);

  const handleRunReview = useCallback(async () => {
    if (!focusedPostId) {
      throw new Error("Select a focus post before running review.");
    }
    setReviewBusy(true);
    try {
      await proposeCoachAttackPlans(focusedPostId, {
        destinations: DEFAULT_COACH_DESTINATIONS,
        assistant_by_destination: Object.fromEntries(
          DEFAULT_COACH_DESTINATIONS.map((d) => [d, true])
        ) as Partial<Record<DistributionDestination, boolean>>,
        assistant_context: {
          goals: brief.goals,
          user_notes: brief.user_notes || null,
          locale: brief.locale,
          trend_note: brief.trend_note
        }
      });
      const { plan } = await fetchPostDistributionPlan(focusedPostId);
      const mounted = reportFromDistributionPlan(focusedPostId, plan);
      setReport(mounted ?? emptyMountedReport(focusedPostId));
    } finally {
      setReviewBusy(false);
    }
  }, [focusedPostId, brief]);

  const handleSaveGoals = async (next: {
    monthly_post_target: number;
    bonus_nudges_enabled: boolean;
    growth_goal: CreatorGrowthGoal | null;
  }) => {
    setReviewBusy(true);
    try {
      const { goal } = await putCreatorPostingGoal({
        monthly_post_target: next.monthly_post_target,
        bonus_nudges_enabled: next.bonus_nudges_enabled,
        enabled: true
      });
      setMonthlyTarget(Math.max(1, goal.monthly_post_target || 1));
      setBonusNudgesEnabled(Boolean(goal.bonus_nudges_enabled));

      if (next.growth_goal) {
        const onboarding = await fetchCreatorOnboarding();
        const metadata = mergeCreatorOnboardingMetadata(onboarding.metadata, {
          growth_goal: next.growth_goal
        });
        await patchCreatorOnboarding({ metadata });
        setGrowthGoal(next.growth_goal);
      }

      const statusRes = await fetchCreatorPostingGoalStatus().catch(() => null);
      if (statusRes?.status) {
        setPostsThisMonth(statusRes.status.posts_this_month);
        setPaceStatusLive(statusRes.status.pace_status);
      }
      setShowReviewGoals(false);
    } finally {
      setReviewBusy(false);
    }
  };
  const handleSaveBrief = async (updated: PostingAssistantContext) => {
    setBriefBusy(true);
    setBriefError(null);
    try {
      const { brief: wire } = await patchCreatorStudioBrief({
        goals: updated.goals,
        user_notes: updated.user_notes || null,
        locale: updated.locale,
        trend_note: updated.trend_note
      });
      const next = briefFromWire(wire);
      setBrief(next);
      setBriefMounted(true);
      setShowEditBrief(false);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : "Could not save studio brief");
    } finally {
      setBriefBusy(false);
    }
  };

  const effectivePace = paceStatusLive ?? cadence.pace_status;
  const paceColor =
    effectivePace === "on_track" || effectivePace === "complete" || effectivePace === "bonus_available"
      ? IAH.accent
      : effectivePace === "behind"
        ? IAH.paceBehind
        : IAH.fgMuted;

  const paceLabel =
    effectivePace === "on_track"
      ? "on track"
      : effectivePace === "behind"
        ? "behind"
        : effectivePace === "bonus_available"
          ? "bonus ready"
          : "complete";

  return (
    <div
      className="insights-action-hub relative overflow-x-hidden"
      style={IAH_ROOT_STYLE}
      data-testid="insights-action-hub"
    >
      <motion.div
        className="pointer-events-none absolute inset-0 z-0"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(ellipse 60% 40% at 15% 10%, ${IAH.accentGlow} 0%, transparent 70%)`
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-col gap-0 px-1 py-2 sm:px-2">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_minmax(320px,36%)] lg:gap-8">
          <section aria-label="Relay Coach insights hub">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mb-5"
            >
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h1
                  className="text-balance font-[family-name:var(--font-display)] text-[2.6rem] font-bold leading-none tracking-tight"
                  style={{ color: IAH.fg }}
                >
                  Relay Coach
                </h1>
                <AnimatePresence>
                  {briefMounted ? (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        background: IAH.accentSoft,
                        borderColor: IAH.accentBorder,
                        color: IAH.accent
                      }}
                    >
                      Brief mounted
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="mt-1 space-y-2">
                <div>
                  <p
                    className="text-[10px] font-medium uppercase tracking-[0.16em]"
                    style={{ color: IAH.fgSubtle }}
                  >
                    Growth goal
                  </p>
                  {growthGoal ? (
                    <button
                      type="button"
                      onClick={() => setShowReviewGoals(true)}
                      className="mt-1 block max-w-xl text-left transition-opacity hover:opacity-90"
                      aria-label="Edit growth goal"
                    >
                      <span className="text-sm font-medium" style={{ color: IAH.fg }}>
                        {growthGoalMeta(growthGoal).label}
                      </span>
                      <span
                        className="mt-0.5 block text-xs leading-snug"
                        style={{ color: IAH.fgMuted }}
                      >
                        {growthGoalMeta(growthGoal).detail}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowReviewGoals(true)}
                      className="mt-1 text-sm italic transition-opacity hover:opacity-90"
                      style={{ color: IAH.accent }}
                    >
                      set goal
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm" style={{ color: IAH.fgMuted }}>
                  <Target size={14} aria-hidden="true" className="flex-shrink-0" />
                  <span>
                    {displayPostsThisMonth} of {monthlyTarget} posts this month
                  </span>
                  {monthlyTarget > 0 ? (
                    <>
                      <span className="opacity-30" aria-hidden="true">
                        •
                      </span>
                      <span className="font-medium" style={{ color: paceColor }}>
                        {paceLabel}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {focusedPost ? (
                  <motion.p
                    key={focusedPostId}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.2 }}
                    className="mt-1.5 text-xs"
                    style={{ color: IAH.fgSubtle }}
                  >
                    Focus:{" "}
                    <span style={{ color: IAH.fgMuted }}>
                      &ldquo;{focusedPost.title}&rdquo;
                    </span>
                  </motion.p>
                ) : null}
              </AnimatePresence>

              {briefError ? (
                <p className="mt-2 text-xs" style={{ color: IAH.paceBehind }} role="alert">
                  {briefError}
                </p>
              ) : null}
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="mb-8 flex items-center gap-5"
            >
              <button
                type="button"
                onClick={() => setShowEditBrief(true)}
                className="flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: IAH.fgMuted }}
                aria-label="Edit studio brief"
              >
                <FileEdit size={13} aria-hidden="true" />
                Edit brief
              </button>
              <span className="select-none text-xs opacity-30" aria-hidden="true">
                •
              </span>
              <button
                type="button"
                onClick={() => setShowReviewGoals(true)}
                className="flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: IAH.fgMuted }}
                aria-label="Review analysis and goals"
              >
                <Users2 size={13} aria-hidden="true" />
                Review &amp; goals
              </button>
            </motion.div>

            <div className="mb-8">
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mb-4 text-base font-semibold"
                style={{ color: IAH.fg }}
              >
                Here&apos;s what I found
              </motion.h2>

              {reportLoading ? (
                <p className="text-sm" style={{ color: IAH.fgMuted }}>
                  Loading report…
                </p>
              ) : chips.length === 0 ? (
                <p className="text-sm leading-relaxed" style={{ color: IAH.fgMuted }}>
                  No mounted Coach report for this post yet. Use{" "}
                  <span style={{ color: IAH.fg }}>Review &amp; goals</span> to refresh analysis.
                </p>
              ) : (
                <div className="flex flex-col gap-3" role="list" aria-label="AI findings">
                  {chips.map((chip, i) => (
                    <div key={chip.id} role="listitem">
                      <FindingsCard chip={chip} index={i} isActive />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.45 }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <motion.button
                  type="button"
                  onClick={() => void handleFrameNextPosts()}
                  disabled={framingState === "framing"}
                  className="relative flex flex-1 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl py-3.5 text-sm font-semibold transition-opacity disabled:opacity-70"
                  style={{ background: IAH.accent, color: IAH.onAccent }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  aria-label="Frame next posts from AI findings"
                >
                  <motion.span
                    className="pointer-events-none absolute inset-0 motion-reduce:hidden"
                    style={{
                      background:
                        "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)",
                      backgroundSize: "200% auto"
                    }}
                    animate={
                      framingState === "idle"
                        ? { backgroundPosition: ["200% center", "-200% center"] }
                        : {}
                    }
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    aria-hidden="true"
                  />

                  {framingState === "framing" ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        className="inline-block h-4 w-4 rounded-full border-2"
                        style={{
                          borderColor: "rgba(10,10,10,0.3)",
                          borderTopColor: IAH.onAccent
                        }}
                        aria-hidden="true"
                      />
                      Preparing frames…
                    </>
                  ) : (
                    <>
                      <ArrowRight size={16} aria-hidden="true" />
                      Frame next posts
                    </>
                  )}
                </motion.button>

                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/studio/analytics/report${focusedPostId ? `?postId=${encodeURIComponent(focusedPostId)}` : ""}`
                    )
                  }
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-medium transition-all"
                  style={{ borderColor: IAH.border, color: IAH.accent }}
                  aria-label="Open full AI analysis report"
                >
                  <FileBarChart2 size={15} aria-hidden="true" />
                  Full report
                </button>
              </div>

              <FrameConfirmation drafts={drafts} visible={framingState === "done"} />

              {frameError ? (
                <p className="text-xs" style={{ color: IAH.paceBehind }} role="alert">
                  {frameError}
                </p>
              ) : null}
              {hasOpenReview && focusedPostId ? (
                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center gap-1.5 py-1 text-xs transition-colors"
                  style={{ color: IAH.fgMuted }}
                  aria-label="Continue open coach review"
                  onClick={() =>
                    router.push(
                      `/studio/preview?post_id=${encodeURIComponent(focusedPostId)}`
                    )
                  }
                >
                  <MessageSquare size={12} aria-hidden="true" />
                  Continue review
                </button>
              ) : null}
            </motion.div>
          </section>

          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            {livePosts.length === 0 ? (
              <aside
                className="rounded-2xl border p-5 text-sm"
                style={{ borderColor: IAH.border, color: IAH.fgMuted, background: IAH.surface }}
              >
                No recent posts with reach yet. Publish and import metrics to populate this board.
              </aside>
            ) : (
              <RecentPosts
                posts={livePosts}
                focusedPostId={focusedPostId}
                onSelect={setFocusedPostId}
              />
            )}
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {showEditBrief ? (
          <EditBriefModal
            brief={brief}
            busy={briefBusy}
            onSave={handleSaveBrief}
            onClose={() => setShowEditBrief(false)}
          />
        ) : null}
        {showReviewGoals ? (
          <ReviewGoalsModal
            target={monthlyTarget}
            bonusNudgesEnabled={bonusNudgesEnabled}
            growthGoal={growthGoal}
            busy={reviewBusy}
            onRunReview={focusedPostId ? handleRunReview : undefined}
            onSave={handleSaveGoals}
            onClose={() => setShowReviewGoals(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, RotateCcw, Check } from "lucide-react";
import type { PostingAssistantContext, GoalId } from "./action-hub-types";
import { GOAL_LABELS } from "./action-hub-types";
import { IAH } from "./action-hub-tokens";
import {
  CREATOR_GROWTH_GOALS,
  type CreatorGrowthGoal,
} from "@/lib/relay-api";

function Overlay({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40"
      style={{ background: IAH.overlay, backdropFilter: "blur(4px)" }}
      onClick={onClose}
      aria-hidden="true"
    />
  );
}

function ModalPanel({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-lg -translate-y-1/2 overflow-hidden rounded-2xl border"
      style={{
        borderColor: IAH.border,
        background: IAH.surface,
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)"
      }}
    >
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: IAH.border }}
      >
        <h2 className="text-sm font-semibold" style={{ color: IAH.fg }}>
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 transition-colors"
          style={{ color: IAH.fgMuted }}
          aria-label="Close modal"
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </motion.div>
  );
}

type EditBriefModalProps = {
  brief: PostingAssistantContext;
  busy?: boolean;
  onSave: (brief: PostingAssistantContext) => void | Promise<void>;
  onClose: () => void;
};

export function EditBriefModal({ brief, busy = false, onSave, onClose }: EditBriefModalProps) {
  const [draft, setDraft] = useState<PostingAssistantContext>({ ...brief });
  const [saving, setSaving] = useState(false);

  const toggleGoal = (g: GoalId) => {
    setDraft((prev) => {
      if (prev.goals.includes(g)) {
        return { ...prev, goals: prev.goals.filter((x) => x !== g) };
      }
      // Cap at 2 synergistic path goals (Coach path discipline)
      const next = [...prev.goals, g].slice(-2);
      return { ...prev, goals: next };
    });
  };

  const allGoals = Object.keys(GOAL_LABELS) as GoalId[];
  const fieldClass =
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1";

  const handleSave = async () => {
    if (busy || saving) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const disabled = busy || saving;
  return (
    <AnimatePresence>
      <Overlay onClose={onClose} />
      <ModalPanel title="Edit brief" onClose={onClose}>
        <div className="flex flex-col gap-5">
          <div>
            <label
              className="mb-2 block text-xs uppercase tracking-widest"
              style={{ color: IAH.fgMuted }}
            >
              Goals
            </label>
            <div className="flex flex-wrap gap-2">
              {allGoals.map((g) => {
                const active = draft.goals.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGoal(g)}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150"
                    style={{
                      background: active ? "rgba(0,170,111,0.15)" : "transparent",
                      borderColor: active ? IAH.accent : "rgba(255,255,255,0.12)",
                      color: active ? IAH.accent : IAH.fgSubtle
                    }}
                  >
                    {GOAL_LABELS[g]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="iah-brief-notes"
              className="mb-2 block text-xs uppercase tracking-widest"
              style={{ color: IAH.fgMuted }}
            >
              Notes
            </label>
            <textarea
              id="iah-brief-notes"
              value={draft.user_notes}
              onChange={(e) => setDraft((p) => ({ ...p, user_notes: e.target.value }))}
              rows={3}
              className={`${fieldClass} resize-none`}
              style={{
                borderColor: IAH.border,
                background: IAH.surface2,
                color: IAH.fg
              }}
              placeholder="What tone, topics, or constraints matter…"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label
                htmlFor="iah-brief-locale"
                className="mb-2 block text-xs uppercase tracking-widest"
                style={{ color: IAH.fgMuted }}
              >
                Locale
              </label>
              <input
                id="iah-brief-locale"
                type="text"
                value={draft.locale ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, locale: e.target.value || null }))
                }
                className={fieldClass}
                style={{
                  borderColor: IAH.border,
                  background: IAH.surface2,
                  color: IAH.fg
                }}
                placeholder="en-US"
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="iah-brief-trend"
                className="mb-2 block text-xs uppercase tracking-widest"
                style={{ color: IAH.fgMuted }}
              >
                Trend note
              </label>
              <input
                id="iah-brief-trend"
                type="text"
                value={draft.trend_note ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, trend_note: e.target.value || null }))
                }
                className={fieldClass}
                style={{
                  borderColor: IAH.border,
                  background: IAH.surface2,
                  color: IAH.fg
                }}
                placeholder="What's trending…"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={disabled}
              className="flex-1 rounded-xl border py-2.5 text-sm transition-all disabled:opacity-60"
              style={{ borderColor: IAH.border, color: IAH.fgMuted }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={disabled}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: IAH.accent, color: IAH.onAccent }}
            >
              {disabled ? "Saving…" : "Save brief"}
            </button>
          </div>
        </div>
      </ModalPanel>
    </AnimatePresence>
  );
}

type ReviewGoalsModalProps = {
  target: number;
  bonusNudgesEnabled?: boolean;
  growthGoal?: CreatorGrowthGoal | null;
  busy?: boolean;
  onSave: (next: {
    monthly_post_target: number;
    bonus_nudges_enabled: boolean;
    growth_goal: CreatorGrowthGoal | null;
  }) => void | Promise<void>;
  onRunReview?: () => void | Promise<void>;
  onClose: () => void;
};

export function ReviewGoalsModal({
  target,
  bonusNudgesEnabled = false,
  growthGoal = null,
  busy = false,
  onSave,
  onRunReview,
  onClose
}: ReviewGoalsModalProps) {
  const [localTarget, setLocalTarget] = useState(Math.max(1, Math.min(31, target || 1)));
  const [localBonus, setLocalBonus] = useState(bonusNudgesEnabled);
  const [localGrowthGoal, setLocalGrowthGoal] = useState<CreatorGrowthGoal | null>(growthGoal);
  const [reviewing, setReviewing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    setLocalTarget(Math.max(1, Math.min(31, target || 1)));
  }, [target]);

  useEffect(() => {
    setLocalBonus(bonusNudgesEnabled);
  }, [bonusNudgesEnabled]);

  useEffect(() => {
    setLocalGrowthGoal(growthGoal);
  }, [growthGoal]);

  const runReview = async () => {
    if (!onRunReview || reviewing || busy) return;
    setReviewing(true);
    setReviewError(null);
    try {
      await onRunReview();
      setReviewed(true);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewing(false);
    }
  };

  return (
    <AnimatePresence>
      <Overlay onClose={onClose} />
      <ModalPanel title="Review & goals" onClose={onClose}>
        <div className="flex flex-col gap-5">
          <div
            className="flex items-center justify-between rounded-xl border p-4"
            style={{
              borderColor: IAH.border,
              background: "rgba(0,170,111,0.06)"
            }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: IAH.fg }}>
                Refresh analysis
              </p>
              <p className="mt-0.5 text-xs" style={{ color: IAH.fgMuted }}>
                Re-runs grounded search across your posts
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runReview()}
              disabled={reviewing || busy || !onRunReview}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all disabled:opacity-60"
              style={{ background: IAH.accent, color: IAH.onAccent }}
              aria-label="Run review"
            >
              {reviewing ? (
                <>
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    aria-hidden="true"
                  >
                    <RotateCcw size={13} />
                  </motion.span>
                  Gathering…
                </>
              ) : reviewed ? (
                <>
                  <Check size={13} />
                  Done
                </>
              ) : (
                <>
                  <RotateCcw size={13} />
                  Run review
                </>
              )}
            </button>
          </div>

          {reviewError ? (
            <p className="text-xs" style={{ color: IAH.paceBehind }} role="alert">
              {reviewError}
            </p>
          ) : !onRunReview ? (
            <p className="text-xs" style={{ color: IAH.fgSubtle }}>
              Select a focus post to run review.
            </p>
          ) : null}

          <div>
            <p
              className="mb-2 text-xs uppercase tracking-widest"
              style={{ color: IAH.fgMuted }}
            >
              Growth goal
            </p>
            <p className="mb-3 text-xs leading-relaxed" style={{ color: IAH.fgSubtle }}>
              Chosen in onboarding — Relay optimizes analytics and prompts around this.
            </p>
            <div className="flex flex-col gap-2" role="group" aria-label="Growth goal">
              {CREATOR_GROWTH_GOALS.map((goal) => {
                const active = localGrowthGoal === goal.id;
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => setLocalGrowthGoal(goal.id)}
                    disabled={busy || reviewing}
                    aria-pressed={active}
                    className="rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60"
                    style={{
                      borderColor: active ? IAH.accentBorder : IAH.border,
                      background: active ? IAH.accentSoft : "transparent",
                    }}
                  >
                    <span className="block text-sm font-medium" style={{ color: IAH.fg }}>
                      {goal.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug" style={{ color: IAH.fgMuted }}>
                      {goal.detail}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              className="mb-3 block text-xs uppercase tracking-widest"
              style={{ color: IAH.fgMuted }}
            >
              Monthly Relay post target
            </label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setLocalTarget((p) => Math.max(1, p - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
                style={{ borderColor: IAH.border, color: IAH.fg }}
                aria-label="Decrease target"
              >
                <Minus size={14} />
              </button>
              <span
                className="w-10 text-center font-mono text-2xl font-semibold tabular-nums"
                style={{ color: IAH.fg }}
              >
                {localTarget}
              </span>
              <button
                type="button"
                onClick={() => setLocalTarget((p) => Math.min(31, p + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
                style={{ borderColor: IAH.border, color: IAH.fg }}
                aria-label="Increase target"
              >
                <Plus size={14} />
              </button>
              <span className="ml-1 text-sm" style={{ color: IAH.fgMuted }}>
                posts / month
              </span>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm" style={{ color: IAH.fg }}>
            <input
              type="checkbox"
              className="mt-1"
              checked={localBonus}
              onChange={(e) => setLocalBonus(e.target.checked)}
              disabled={busy || reviewing}
            />
            <span>
              <span className="font-medium">Suggest an extra post</span>
              <span className="mt-0.5 block text-xs" style={{ color: IAH.fgMuted }}>
                When you&apos;ve hit your goal and still have unused media in your bin.
              </span>
            </span>
          </label>

          <p className="text-xs leading-relaxed" style={{ color: IAH.fgSubtle }}>
            Performance goal cards live under{" "}
            <span style={{ color: IAH.fgMuted }}>Studio data</span> below. Path goals for Coach
            live in <span style={{ color: IAH.fgMuted }}>Edit brief</span>.
          </p>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy || reviewing}
              className="flex-1 rounded-xl border py-2.5 text-sm transition-all disabled:opacity-60"
              style={{ borderColor: IAH.border, color: IAH.fgMuted }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                void onSave({
                  monthly_post_target: localTarget,
                  bonus_nudges_enabled: localBonus,
                  growth_goal: localGrowthGoal
                })
              }
              disabled={busy || reviewing || !localGrowthGoal}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: IAH.accent, color: IAH.onAccent }}
            >
              {busy ? "Saving…" : "Save goals"}
            </button>
          </div>
        </div>
      </ModalPanel>
    </AnimatePresence>
  );
}

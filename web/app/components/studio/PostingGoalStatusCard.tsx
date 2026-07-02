"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";
import PostingGoalUploadModal from "@/app/components/studio/PostingGoalUploadModal";
import {
  fetchCreatorPostingGoalStatus,
  RelayApiError,
  skipCurrentCreatorPostingGoalNudge,
  snoozeCurrentCreatorPostingGoalNudge,
  type CreatorPostingGoalStatusWire,
} from "@/lib/relay-api";
import {
  postingGoalProgressLabel,
  postingGoalShowDismissActions,
  postingGoalShowStartAutopost,
  postingGoalShowUploadMedia,
  postingGoalStatusMessage,
  shouldShowPostingGoalStatusCard,
} from "@/lib/posting-goal-status-copy";
import { useStudioSession } from "@/lib/studio-session-context";

type Props = {
  /** Increment to refetch status (e.g. after uploads elsewhere). */
  reloadKey?: number;
};

export default function PostingGoalStatusCard({ reloadKey = 0 }: Props) {
  const { creatorId } = useStudioSession();
  const [status, setStatus] = useState<CreatorPostingGoalStatusWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<"snooze" | "skip" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const loadStatus = useCallback(async (mode: "full" | "quiet" = "full") => {
    if (mode === "full") setLoading(true);
    setActionError(null);
    try {
      const res = await fetchCreatorPostingGoalStatus();
      setStatus(res.status);
    } catch (e) {
      if (mode === "full") setStatus(null);
      if (e instanceof RelayApiError && e.status === 404) {
        setStatus(null);
      }
    } finally {
      if (mode === "full") setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, reloadKey]);

  const onSnooze = async () => {
    setActionBusy("snooze");
    setActionError(null);
    try {
      await snoozeCurrentCreatorPostingGoalNudge(null);
      await loadStatus("quiet");
    } catch (e) {
      const msg = e instanceof RelayApiError ? e.message : String(e);
      setActionError(msg);
    } finally {
      setActionBusy(null);
    }
  };

  const onSkip = async () => {
    setActionBusy("skip");
    setActionError(null);
    try {
      await skipCurrentCreatorPostingGoalNudge();
      await loadStatus("quiet");
    } catch (e) {
      const msg = e instanceof RelayApiError ? e.message : String(e);
      setActionError(msg);
    } finally {
      setActionBusy(null);
    }
  };

  if (loading) {
    return (
      <div
        className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-3 text-xs text-[var(--lib-fg-muted)]"
        aria-busy="true"
        aria-label="Loading posting goal"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading posting rhythm…
      </div>
    );
  }

  if (!status || !shouldShowPostingGoalStatusCard(status)) return null;

  const message = postingGoalStatusMessage(status);
  const progress = postingGoalProgressLabel(status);
  const showDismiss = postingGoalShowDismissActions(status);
  const showAutopost = postingGoalShowStartAutopost(status);
  const showUpload = postingGoalShowUploadMedia(status);
  const busy = actionBusy !== null;

  return (
    <>
      <section
        aria-label="Monthly posting rhythm"
        className="mx-4 mt-3 rounded-xl border border-[#2D6A4F]/35 bg-[color-mix(in_srgb,#2D6A4F_8%,var(--lib-card))] px-4 py-3"
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2D6A4F]/30 bg-[#2D6A4F]/10 text-[#40916C]">
            <Target className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--lib-fg-muted)]">
              Posting rhythm
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--lib-fg)]">{message}</p>
            <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">{progress} Relay posts this month</p>
            {actionError ? (
              <p role="alert" className="mt-2 text-xs text-red-400">
                {actionError}
              </p>
            ) : null}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            {showAutopost ? (
              <Link
                href="/studio/autopost"
                className="rounded-lg border border-[#2D6A4F]/45 bg-[#2D6A4F] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#40916C]"
              >
                Start Autopost
              </Link>
            ) : null}
            {showUpload ? (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-1.5 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[#2D6A4F]/45"
              >
                Upload media
              </button>
            ) : null}
            {showDismiss ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSnooze()}
                  className="rounded-lg border border-[var(--lib-border)] px-3 py-1.5 text-xs font-medium text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-fg)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionBusy === "snooze" ? "Snoozing…" : "Snooze"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSkip()}
                  className="rounded-lg border border-[var(--lib-border)] px-3 py-1.5 text-xs font-medium text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-fg)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionBusy === "skip" ? "Skipping…" : "Skip this month"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <PostingGoalUploadModal
        open={uploadOpen}
        creatorId={creatorId}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void loadStatus("quiet")}
      />
    </>
  );
}

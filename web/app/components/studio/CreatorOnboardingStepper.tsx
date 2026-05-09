"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  CREATOR_ONBOARDING_STEP_ORDER,
  fetchCreatorOnboarding,
  patchCreatorOnboarding,
  RelayApiError,
  type CreatorOnboardingData,
  type CreatorOnboardingStep
} from "@/lib/relay-api";

const STEP_COPY: Record<
  CreatorOnboardingStep,
  { title: string; hint?: string }
> = {
  connected: { title: "Connect Patreon", hint: "Link your creator account." },
  import_started: { title: "Import", hint: "Sync posts from Patreon (menu above)." },
  organized: { title: "Organize", hint: "Curate in Library — you're here." },
  published: { title: "Go live", hint: "Mark setup complete when you're ready to publish layout." }
};

function stepIndex(step: CreatorOnboardingStep): number {
  return CREATOR_ONBOARDING_STEP_ORDER.indexOf(step);
}

export default function CreatorOnboardingStepper({
  creatorId,
  /** Increment (e.g. after Library auto-organize ack) to refetch onboarding. */
  reloadKey = 0
}: {
  creatorId: string | null | undefined;
  reloadKey?: number;
}) {
  const [data, setData] = useState<CreatorOnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [advanceBusy, setAdvanceBusy] = useState(false);

  const load = useCallback(async (mode: "full" | "quiet" = "full") => {
    const id = creatorId?.trim();
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }
    if (mode === "full") {
      setLoading(true);
    }
    try {
      const d = await fetchCreatorOnboarding();
      setData(d);
    } catch {
      if (mode === "full") {
        setData(null);
      }
    } finally {
      if (mode === "full") {
        setLoading(false);
      }
    }
  }, [creatorId]);

  useEffect(() => {
    void load("full");
  }, [load]);

  useEffect(() => {
    if (reloadKey < 1) return;
    void load("quiet");
  }, [reloadKey, load]);

  const onMarkReadyToPublish = useCallback(async () => {
    setAdvanceError(null);
    setAdvanceBusy(true);
    try {
      const next = await patchCreatorOnboarding({ step: "published" });
      setData(next);
    } catch (e) {
      const msg =
        e instanceof RelayApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not update step.";
      setAdvanceError(msg);
    } finally {
      setAdvanceBusy(false);
    }
  }, []);

  if (!creatorId?.trim()) {
    return null;
  }

  if (loading && !data) {
    return (
      <div
        className="flex items-center justify-center gap-2 border-b border-[var(--lib-border)] bg-[var(--lib-card)]/60 px-4 py-2.5 text-xs text-[var(--lib-fg-muted)]"
        aria-hidden
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
        Loading setup…
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const currentIdx = stepIndex(data.step);

  if (data.step === "published") {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--lib-border)] bg-[var(--lib-card)]/60 px-4 py-2.5 text-sm text-[var(--lib-fg)]">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lib-primary)]/20 text-[var(--lib-primary)]">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="font-medium">You&apos;re live</span>
        <span className="text-xs text-[var(--lib-fg-muted)]">
          Setup complete — you can publish layout changes from the designer.
        </span>
      </div>
    );
  }

  return (
    <nav
      className="border-b border-[var(--lib-border)] bg-[var(--lib-card)]/60 px-3 py-3 sm:px-4"
      aria-label="Studio setup progress"
    >
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 sm:gap-x-0">
        {CREATOR_ONBOARDING_STEP_ORDER.map((stepId, i) => {
          const idx = stepIndex(stepId);
          const done = idx < currentIdx;
          const current = idx === currentIdx;
          const copy = STEP_COPY[stepId];

          return (
            <li key={stepId} className="flex items-center">
              {i > 0 ? (
                <span
                  aria-hidden
                  className="mx-1.5 hidden text-[var(--lib-fg-muted)] sm:inline sm:mx-2"
                >
                  /
                </span>
              ) : null}
              <span
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs sm:text-sm ${
                  current
                    ? "bg-[var(--lib-primary)]/15 font-semibold text-[var(--lib-primary)]"
                    : done
                      ? "text-[var(--lib-fg-muted)]"
                      : "text-[var(--lib-fg-muted)]/80"
                }`}
                aria-current={current ? "step" : undefined}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--lib-primary)]" aria-hidden />
                ) : (
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      current
                        ? "bg-[var(--lib-primary)] text-[var(--lib-bg)]"
                        : "border border-[var(--lib-border)] text-[var(--lib-fg-muted)]"
                    }`}
                  >
                    {i + 1}
                  </span>
                )}
                <span>{copy.title}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-[var(--lib-fg-muted)]">
          {data.step === "connected" ? (
            <>
              {STEP_COPY.connected.hint}{" "}
              <Link
                href="/creator/connect"
                className="font-medium text-[var(--lib-primary)] underline-offset-2 hover:underline"
              >
                Open Patreon connect
              </Link>
              .
            </>
          ) : (
            STEP_COPY[data.step].hint ?? null
          )}
        </p>

        {data.step === "organized" ? (
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            {advanceError ? (
              <p className="text-xs text-red-400" role="alert">
                {advanceError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={advanceBusy}
              onClick={() => void onMarkReadyToPublish()}
              className="rounded-lg bg-[var(--lib-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--lib-bg)] disabled:opacity-50"
            >
              {advanceBusy ? "Saving…" : "Mark ready to publish"}
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

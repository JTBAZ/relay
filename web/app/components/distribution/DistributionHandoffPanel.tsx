"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  approveDistributionVariant,
  completeDistributionAttempt,
  crossPostBlueskyPost,
  fetchDistributionAttempt,
  startDistributionHandoff,
  type DistributionPlanWire,
  type DistributionVariantWire
} from "@/lib/relay-api";
import {
  describeRelayCrossPostFailure,
  probeRelayExtensionStatus,
  sendRelayCrossPostToExtension
} from "@/lib/relay-extension-messaging";
import { subscribeRelayDistributionRefresh } from "@/lib/relay-distribution-refresh";

type VariantSendState = {
  busy: boolean;
  confirmBusy: boolean;
  error: string | null;
  attemptId: string | null;
  fillStatus: string | null;
  confirmExpanded: boolean;
  confirmUrlDraft: string;
};

type Props = {
  plan: DistributionPlanWire;
  onComplete: () => void;
};

export function DistributionHandoffPanel({ plan, onComplete }: Props) {
  const [sendState, setSendState] = useState<Record<string, VariantSendState>>({});
  const [fallbackVariant, setFallbackVariant] = useState<DistributionVariantWire | null>(null);
  const [manualUrl, setManualUrl] = useState("");

  const setVariantState = useCallback((variantId: string, patch: Partial<VariantSendState>) => {
    setSendState((prev) => {
      const current = prev[variantId] ?? {
        busy: false,
        confirmBusy: false,
        error: null,
        attemptId: null,
        fillStatus: null,
        confirmExpanded: false,
        confirmUrlDraft: ""
      };
      return {
        ...prev,
        [variantId]: { ...current, ...patch }
      };
    });
  }, []);

  useEffect(() => {
    const refreshAttempts = () => {
      const entries = Object.entries(sendState).filter(([, state]) => state.attemptId);
      if (entries.length === 0) return;

      for (const [variantId, state] of entries) {
        const attemptId = state.attemptId;
        if (!attemptId) continue;

        void fetchDistributionAttempt(attemptId)
          .then(({ attempt }) => {
            if (attempt.status !== "posted") return;
            setFallbackVariant(null);
            setVariantState(variantId, {
              fillStatus: "posted",
              confirmBusy: false,
              confirmExpanded: false,
              confirmUrlDraft: ""
            });
          })
          .catch(() => {
            /* focus/extension refresh is best-effort */
          });
      }
    };

    const unsubscribe = subscribeRelayDistributionRefresh(refreshAttempts);
    return unsubscribe;
  }, [sendState, setVariantState]);

  async function pollAttempt(variantId: string, attemptId: string) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const { attempt } = await fetchDistributionAttempt(attemptId);
        if (attempt.status.startsWith("fill_") || attempt.status === "posted") {
          setVariantState(variantId, { fillStatus: attempt.status, attemptId });
          if (attempt.status === "fill_failed" || attempt.status === "fill_partial") {
            const variant = plan.variants.find((v) => v.variant_id === variantId) ?? null;
            setFallbackVariant(variant);
          }
          return;
        }
      } catch {
        /* keep polling */
      }
    }
  }

  async function sendVariant(variant: DistributionVariantWire) {
    setVariantState(variant.variant_id, { busy: true, error: null });
    try {
      await approveDistributionVariant(variant.variant_id);
      if (variant.destination === "bluesky") {
        const result = await crossPostBlueskyPost(plan.post_id);
        const { attempt } = await startDistributionHandoff(variant.variant_id);
        await completeDistributionAttempt(attempt.attempt_id, {
          external_id: result.cid,
          external_url: result.uri,
          status: "posted"
        });
        setVariantState(variant.variant_id, {
          busy: false,
          attemptId: attempt.attempt_id,
          fillStatus: "posted"
        });
        return;
      }

      const probe = await probeRelayExtensionStatus();
      if (!probe.ok) {
        setVariantState(variant.variant_id, {
          busy: false,
          error: "Connect the Relay extension before cross-posting."
        });
        setFallbackVariant(variant);
        return;
      }

      const { attempt } = await startDistributionHandoff(variant.variant_id);
      const result = await sendRelayCrossPostToExtension(plan.post_id, variant.destination, undefined, {
        distribution_attempt_id: attempt.attempt_id
      });
      if (!result.ok) {
        setVariantState(variant.variant_id, {
          busy: false,
          error: describeRelayCrossPostFailure(result),
          attemptId: attempt.attempt_id
        });
        setFallbackVariant(variant);
        return;
      }
      setVariantState(variant.variant_id, {
        busy: false,
        attemptId: attempt.attempt_id,
        fillStatus: "handoff_started"
      });
      void pollAttempt(variant.variant_id, attempt.attempt_id);
    } catch (e) {
      setVariantState(variant.variant_id, {
        busy: false,
        error: e instanceof Error ? e.message : String(e)
      });
      setFallbackVariant(variant);
    }
  }

  async function confirmPosted(variant: DistributionVariantWire, url?: string) {
    const state = sendState[variant.variant_id];
    if (!state?.attemptId || state.confirmBusy) return;
    setVariantState(variant.variant_id, { confirmBusy: true });
    try {
      const trimmedUrl = url?.trim() || null;
      await completeDistributionAttempt(state.attemptId, {
        status: "posted",
        ...(trimmedUrl ? { external_url: trimmedUrl } : {})
      });
      setFallbackVariant(null);
      setVariantState(variant.variant_id, {
        fillStatus: "posted",
        confirmBusy: false,
        confirmExpanded: false,
        confirmUrlDraft: ""
      });
    } catch {
      setVariantState(variant.variant_id, { confirmBusy: false });
    }
  }

  async function markManualComplete(variant: DistributionVariantWire) {
    const state = sendState[variant.variant_id];
    if (!state?.attemptId) return;
    await completeDistributionAttempt(state.attemptId, {
      external_url: manualUrl.trim() || null,
      status: "posted"
    });
    setManualUrl("");
    setFallbackVariant(null);
    setVariantState(variant.variant_id, { fillStatus: "posted" });
  }

  const allDone = plan.variants.every((v) => {
    const st = sendState[v.variant_id];
    return st?.fillStatus === "posted" || v.status === "posted";
  });

  const DEST_LABEL: Record<string, string> = {
    patreon: "Patreon",
    x: "X",
    deviantart: "DeviantArt",
    bluesky: "Bluesky"
  };

  return (
    <div className="space-y-4">
      {plan.variants.map((variant) => {
        const st = sendState[variant.variant_id] ?? {
          busy: false,
          confirmBusy: false,
          error: null,
          attemptId: null,
          fillStatus: null,
          confirmExpanded: false,
          confirmUrlDraft: ""
        };
        const destLabel = DEST_LABEL[variant.destination] ?? variant.destination;
        const isFilled =
          st.fillStatus != null &&
          st.fillStatus !== "posted" &&
          st.fillStatus !== "handoff_started";
        const isPosted = st.fillStatus === "posted" || variant.status === "posted";
        const isPolling = st.fillStatus === "handoff_started";

        return (
          <div
            key={variant.variant_id}
            className="rounded-xl border p-4"
            style={{
              borderColor: isPosted
                ? "rgba(0,170,111,0.4)"
                : isFilled
                  ? "rgba(234,179,8,0.3)"
                  : "#2a2a2a",
              background: "#0a0a0a"
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#f9fafb]">{destLabel}</p>
                {isPosted ? (
                  <p className="text-[11px] text-emerald-400 mt-0.5">Posted</p>
                ) : isFilled && !st.confirmExpanded ? (
                  <p className="text-[11px] text-amber-300 mt-0.5">
                    Form filled — publish on {destLabel}, then confirm below
                  </p>
                ) : isPolling ? (
                  <p className="text-[11px] text-[#6b7280] mt-0.5">Opening {destLabel}…</p>
                ) : null}
                {st.error ? (
                  <p className="text-[11px] text-red-300 mt-1" role="alert">{st.error}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {isPosted ? (
                  <span
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{ background: "rgba(0,170,111,0.15)", color: "#34d399" }}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Posted
                  </span>
                ) : isFilled ? (
                  <button
                    type="button"
                    disabled={st.confirmBusy}
                    onClick={() =>
                      setVariantState(variant.variant_id, { confirmExpanded: true })
                    }
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ background: "#00aa6f", color: "#000" }}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Confirm Posted
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={st.busy || isPolling}
                    onClick={() => void sendVariant(variant)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                    style={{ background: "#00aa6f", color: "#000" }}
                  >
                    {st.busy || isPolling ? "Opening…" : `Post to ${destLabel}`}
                  </button>
                )}
              </div>
            </div>
            {st.confirmExpanded ? (
              <div className="mt-3 flex items-center gap-2">
                <input
                  autoFocus
                  value={st.confirmUrlDraft}
                  onChange={(e) =>
                    setVariantState(variant.variant_id, { confirmUrlDraft: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void confirmPosted(variant, st.confirmUrlDraft);
                    if (e.key === "Escape") {
                      setVariantState(variant.variant_id, {
                        confirmExpanded: false,
                        confirmUrlDraft: ""
                      });
                    }
                  }}
                  placeholder={`Paste the ${destLabel} post URL (optional)`}
                  className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1.5 text-xs text-[#f9fafb]"
                  style={{ borderColor: "#2a2a2a" }}
                />
                <button
                  type="button"
                  disabled={st.confirmBusy}
                  onClick={() => void confirmPosted(variant, st.confirmUrlDraft)}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  style={{ background: "#00aa6f", color: "#000" }}
                >
                  {st.confirmBusy ? "Confirming…" : "Confirm"}
                </button>
                <button
                  type="button"
                  disabled={st.confirmBusy}
                  onClick={() =>
                    setVariantState(variant.variant_id, {
                      confirmExpanded: false,
                      confirmUrlDraft: ""
                    })
                  }
                  className="shrink-0 text-xs text-[#9ca3af] underline disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {fallbackVariant ? (
        <div
          className="rounded-xl border p-4 space-y-2"
          style={{ borderColor: "#92400e", background: "rgba(146,64,14,0.15)" }}
        >
          <p className="text-xs font-medium text-amber-200">Fallback — copy manually</p>
          {fallbackVariant.destination === "x" || fallbackVariant.destination === "bluesky" ? (
            <pre className="text-[11px] text-[#f9fafb] whitespace-pre-wrap font-mono">
              {fallbackVariant.post_text}
            </pre>
          ) : (
            <>
              <p className="text-[11px] text-[#f9fafb]"><strong>Title:</strong> {fallbackVariant.title}</p>
              <pre className="text-[11px] text-[#f9fafb] whitespace-pre-wrap">{fallbackVariant.body_text}</pre>
              {fallbackVariant.tags.length > 0 ? (
                <p className="text-[11px] text-[#9ca3af]">Tags: {fallbackVariant.tags.join(", ")}</p>
              ) : null}
            </>
          )}
          <input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="Paste published URL (optional)"
            className="w-full rounded border bg-transparent px-2 py-1 text-xs text-[#f9fafb]"
            style={{ borderColor: "#2a2a2a" }}
          />
          <button
            type="button"
            onClick={() => void markManualComplete(fallbackVariant)}
            className="text-xs underline text-amber-200"
          >
            Mark as posted
          </button>
        </div>
      ) : null}

      {allDone ? (
        <button
          type="button"
          onClick={onComplete}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: "#00aa6f", color: "#000" }}
        >
          View completion summary
        </button>
      ) : null}
    </div>
  );
}

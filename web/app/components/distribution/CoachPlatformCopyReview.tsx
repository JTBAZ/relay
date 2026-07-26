"use client";

/**
 * Relay Coach — Phase C: per-platform copy variants.
 * Select Recommended (or an alt) → edit inline → Commit. No chat.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import type { CoachCopyVariantWire, DistributionDestination } from "@/lib/relay-api";
import { tryGetAttackFormula } from "@/lib/coach-attack-formulae";

const DESTINATION_LABEL: Record<DistributionDestination, string> = {
  patreon: "Patreon",
  x: "X / Twitter",
  deviantart: "DeviantArt",
  bluesky: "Bluesky"
};

const DESTINATION_ACCENT: Record<DistributionDestination, string> = {
  patreon: "#ff424d",
  x: "#1d9bf0",
  deviantart: "#05cc47",
  bluesky: "#0085ff"
};

function usesTitleField(destination: DistributionDestination): boolean {
  return destination === "patreon" || destination === "deviantart";
}

function sortVariants(variants: CoachCopyVariantWire[]): CoachCopyVariantWire[] {
  return [...variants].sort((a, b) => {
    if (a.recommended === b.recommended) return 0;
    return a.recommended ? -1 : 1;
  });
}

export type CoachPlatformCommit = {
  destination: DistributionDestination;
  variant_id: string;
  formula_id: string;
  title: string | null;
  body_text: string;
};

export type CoachPlatformCopyReviewProps = {
  destination: DistributionDestination;
  /** 1-based index for progress display. */
  stepIndex: number;
  stepTotal: number;
  variants: CoachCopyVariantWire[];
  /** Last platform in the Coach loop → CTA says “Commit & continue to Send”. */
  isLastPlatform?: boolean;
  /** When true, omit outer card chrome (parent modal provides it). */
  embedded?: boolean;
  onCommit: (commit: CoachPlatformCommit) => void;
  onBack: () => void;
};

export function CoachPlatformCopyReview({
  destination,
  stepIndex,
  stepTotal,
  variants,
  isLastPlatform = false,
  embedded = false,
  onCommit,
  onBack
}: CoachPlatformCopyReviewProps) {
  const ordered = useMemo(() => sortVariants(variants), [variants]);
  const defaultId =
    ordered.find((v) => v.recommended)?.id ?? ordered[0]?.id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(defaultId);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  useEffect(() => {
    const nextDefault =
      ordered.find((v) => v.recommended)?.id ?? ordered[0]?.id ?? null;
    setSelectedId(nextDefault);
  }, [destination, ordered]);

  useEffect(() => {
    const selected = ordered.find((v) => v.id === selectedId) ?? ordered[0];
    if (!selected) {
      setDraftTitle("");
      setDraftBody("");
      return;
    }
    setDraftTitle(selected.title?.trim() ?? "");
    setDraftBody(selected.body_text ?? "");
  }, [selectedId, ordered]);

  const selected = ordered.find((v) => v.id === selectedId) ?? null;
  const showTitle = usesTitleField(destination);
  const accent = DESTINATION_ACCENT[destination];
  const platformLabel = DESTINATION_LABEL[destination];
  const canCommit =
    selected != null && draftBody.trim().length > 0 && (!showTitle || draftTitle.trim().length > 0);

  const commitLabel = isLastPlatform
    ? "Commit & continue to Send"
    : stepTotal > 1
      ? "Commit — next platform"
      : "Commit copy";

  return (
    <div
      className={embedded ? "flex flex-col gap-4" : "flex flex-col gap-5 rounded-2xl border p-5"}
      style={
        embedded
          ? undefined
          : { borderColor: "#2a2a2a", background: "rgba(10,10,10,0.95)" }
      }
      data-testid="coach-platform-copy-review"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {embedded ? (
            <p className="text-[11px] text-[#6b7280]">
              Pick a draft, edit if you want, then commit.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex h-2 w-2 shrink-0 rounded-full"
                  style={{ background: accent }}
                  aria-hidden
                />
                <h3 className="text-sm font-bold text-[#f9fafb]">{platformLabel}</h3>
              </div>
              <p className="mt-1 text-[11px] text-[#6b7280]">
                Pick a draft, edit if you want, then commit.
              </p>
            </>
          )}
        </div>
        <p className="shrink-0 text-[11px] font-semibold tabular-nums text-[#9ca3af]">
          {stepIndex}/{stepTotal}
        </p>
      </div>

      {ordered.length === 0 ? (
        <div
          className="rounded-xl border px-3 py-4 text-[11px] text-[#6b7280]"
          style={{ borderColor: "#2a2a2a", background: "#0c0c0c" }}
        >
          No variants for this platform. Go back and re-run Coach, or skip this destination.
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((variant) => {
            const active = variant.id === selectedId;
            const formula = tryGetAttackFormula(variant.formula_id);
            const slots = formula?.structureSlots?.join(" → ");
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedId(variant.id)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                style={{
                  background: active ? "rgba(0,170,111,0.08)" : "#111",
                  border: `1px solid ${active ? "rgba(0,170,111,0.45)" : "#222"}`
                }}
                aria-pressed={active}
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{
                    border: `1.5px solid ${active ? "#00aa6f" : "#444"}`,
                    background: active ? "#00aa6f" : "transparent"
                  }}
                  aria-hidden
                >
                  {active ? <span className="h-1.5 w-1.5 rounded-full bg-black" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#f9fafb]">
                      {variant.label}
                    </span>
                    {variant.recommended ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                        style={{
                          background: "rgba(0,170,111,0.18)",
                          color: "#9bf0c4",
                          border: "1px solid rgba(0,170,111,0.35)"
                        }}
                      >
                        <Sparkles className="h-2.5 w-2.5" aria-hidden />
                        Recommended
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[#6b7280]">
                    {variant.fit_reason}
                  </span>
                  {slots ? (
                    <span className="mt-1 block text-[10px] text-[#4b5563]">{slots}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div
          className="space-y-3 rounded-xl border p-3"
          style={{ borderColor: "rgba(0,170,111,0.3)", background: "#0c0c0c" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
            Edit before commit
          </p>
          {showTitle ? (
            <label className="block text-xs text-[#9ca3af]">
              Title
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                style={{ borderColor: "#2a2a2a" }}
                placeholder={`${platformLabel} title`}
              />
            </label>
          ) : null}
          <label className="block text-xs text-[#9ca3af]">
            {showTitle ? "Body" : "Post text"}
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={5}
              className="mt-1 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed text-[#f9fafb]"
              style={{ borderColor: "#2a2a2a" }}
              placeholder={`Final copy for ${platformLabel}`}
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-[#9ca3af] transition-colors hover:text-[#f9fafb]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
        <button
          type="button"
          disabled={!canCommit}
          onClick={() => {
            if (!selected || !canCommit) return;
            onCommit({
              destination,
              variant_id: selected.id,
              formula_id: selected.formula_id,
              title: showTitle ? draftTitle.trim() || null : null,
              body_text: draftBody.trim()
            });
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-40 sm:w-auto"
          style={{ background: "#00aa6f", color: "#000" }}
        >
          <Check className="h-4 w-4" aria-hidden />
          {commitLabel}
        </button>
      </div>
    </div>
  );
}

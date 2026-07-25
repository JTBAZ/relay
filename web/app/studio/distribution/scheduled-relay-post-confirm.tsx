"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ImageIcon, Loader2, X } from "lucide-react";
import { CreatorTierCatalogMultiselect } from "@/app/components/shell/CreatorTierCatalogMultiselect";
import type { ScheduleRailReviewContext } from "@/lib/schedule-rail-api";
import { publishScheduleRailReview } from "@/lib/schedule-rail-api";
import { exportMediaContentUrl } from "@/lib/distribution-media-routing";

type Props = {
  creatorId: string;
  review: ScheduleRailReviewContext;
  onPublished: (review: ScheduleRailReviewContext) => void;
};

const SOFT_GREEN = "#2D6A4F";
const SOFT_GREEN_WASH = "rgba(45, 106, 79, 0.18)";
const SOFT_GREEN_BORDER = "rgba(45, 106, 79, 0.45)";
const MINT_CHIP = "#9bf0c4";

/**
 * Prefilled Relay Post + access confirm before Schedule Rail → Autopost handoff.
 * Visual language aligned with Autoposter draft-post: hero media, rounded bubbles, soft forest green.
 */
export function ScheduledRelayPostConfirm({
  creatorId,
  review,
  onPublished
}: Props) {
  const tierSectionId = useId();
  const reduceMotion = useReducedMotion();
  const [title, setTitle] = useState(review.title ?? "");
  const [description, setDescription] = useState(review.description ?? "");
  const [tags, setTags] = useState<string[]>(() =>
    (review.tags ?? []).map((t) => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 10)
  );
  const [tagInput, setTagInput] = useState("");
  const [isPublic, setIsPublic] = useState(review.is_public !== false);
  const [tierIds, setTierIds] = useState<string[]>(
    review.is_public === false ? (review.tier_ids ?? []) : []
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mediaIds = review.media_ids ?? [];
  const heroId = mediaIds[0] ?? null;
  const extraIds = mediaIds.slice(1);
  const heroUrl = heroId ? exportMediaContentUrl(creatorId, heroId) : null;
  const heroLabel = heroId ? heroId.slice(0, 28) + (heroId.length > 28 ? "…" : "") : null;

  const canPublish = title.trim().length > 0 && (isPublic || tierIds.length > 0);

  const descLen = useMemo(() => description.length, [description]);

  function setAccessPublic(nextPublic: boolean): void {
    setIsPublic(nextPublic);
    if (nextPublic) setTierIds([]);
  }

  const addTag = useCallback(() => {
    const next = tagInput.trim().replace(/^#/, "");
    if (!next || tags.includes(next) || tags.length >= 10) return;
    setTags((prev) => [...prev, next]);
    setTagInput("");
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  async function onPublish(): Promise<void> {
    if (!isPublic && tierIds.length === 0) {
      setError("Select at least one tier, or make the post public.");
      return;
    }
    if (!title.trim()) {
      setError("Add a title before publishing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await publishScheduleRailReview(review.event_id, {
        is_public: isPublic,
        tier_ids: isPublic ? [] : tierIds,
        title: title.trim() || null,
        description: description.trim().slice(0, 500) || null,
        tags
      });
      setSuccess(true);
      onPublished(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const enter = reduceMotion
    ? undefined
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-8"
      data-testid="scheduled-relay-post-confirm"
    >
      <header className="w-full max-w-2xl space-y-1 text-left lg:max-w-none">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#6b7280]">
          Scheduled post
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-[#f3f4f6]">
          Confirm Relay Post
        </h1>
        <p className="max-w-[52ch] text-sm leading-relaxed text-[#9ca3af]">
          Relay is the source for platform posts. Publish here, then continue to prepare and send.
        </p>
      </header>

      {success ? (
        <p
          className="w-full rounded-full border px-4 py-2 text-center text-xs"
          style={{
            borderColor: SOFT_GREEN_BORDER,
            background: SOFT_GREEN_WASH,
            color: MINT_CHIP
          }}
          role="status"
        >
          Published to Relay. Continuing…
        </p>
      ) : null}

      <div className="flex w-full flex-col items-start justify-center gap-5 lg:flex-row">
        <motion.div
          {...(enter ?? {})}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="min-w-0 flex-1 rounded-2xl border p-5"
          style={{ background: "rgba(17,17,17,0.65)", borderColor: "#1f1f1f" }}
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {/* Hero media */}
            <div
              className="relative aspect-video overflow-hidden rounded-2xl border"
              style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
            >
              {heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroUrl}
                  alt={title.trim() || "Scheduled post media"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#111] text-[#3a3a3a]">
                  <ImageIcon size={28} aria-hidden />
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />

              <div
                className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{ background: SOFT_GREEN }}
              >
                <Check size={12} className="text-[#e8f5e9]" strokeWidth={3} aria-hidden />
                <span className="text-xs font-medium text-[#e8f5e9]">Ready to publish</span>
              </div>

              {heroLabel ? (
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <div
                    className="flex max-w-[240px] items-center gap-1.5 rounded-full px-2.5 py-1"
                    style={{
                      background: "rgba(0,0,0,0.72)",
                      backdropFilter: "blur(8px)"
                    }}
                  >
                    <ImageIcon size={12} className="shrink-0 text-[#9ca3af]" aria-hidden />
                    <span className="truncate text-[11px] font-medium text-[#e5e7eb]">
                      {heroLabel}
                    </span>
                  </div>
                  {extraIds.length > 0 ? (
                    <span className="rounded-full border border-[#2a2a2a] bg-black/70 px-2.5 py-1 text-[10px] text-[#9ca3af]">
                      +{extraIds.length} more
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {extraIds.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {extraIds.map((mediaId) => (
                  <div
                    key={mediaId}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#111]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={exportMediaContentUrl(creatorId, mediaId)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {/* Title */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-[#9ca3af]" htmlFor="relay-confirm-title">
                Title
              </label>
              <input
                id="relay-confirm-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
                placeholder="Give this Relay post a title..."
                className="w-full rounded-full border bg-transparent px-4 py-3 text-sm text-[#f9fafb] placeholder-[#6b7280] outline-none transition-colors focus:border-[#2D6A4F] disabled:opacity-50"
                style={{ borderColor: "#2a2a2a" }}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <label
                  className="text-xs font-medium text-[#9ca3af]"
                  htmlFor="relay-confirm-description"
                >
                  Description
                </label>
                <span className="text-[10px] tabular-nums text-[#6b7280]">
                  {descLen} / 500
                </span>
              </div>
              <textarea
                id="relay-confirm-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                disabled={busy}
                rows={4}
                placeholder="Add a caption or description for your post..."
                className="w-full resize-none rounded-2xl border bg-transparent px-4 py-3 text-sm leading-relaxed text-[#f9fafb] placeholder-[#6b7280] outline-none transition-colors focus:border-[#2D6A4F] disabled:opacity-50"
                style={{ borderColor: "#2a2a2a", minHeight: "96px" }}
              />
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-2.5">
              <label className="text-xs font-medium text-[#9ca3af]" htmlFor="relay-confirm-tag">
                Tags (max 10)
              </label>
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => removeTag(tag)}
                      disabled={busy}
                      title="Remove tag"
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-transform hover:scale-[1.03] disabled:opacity-50"
                      style={{
                        background: SOFT_GREEN_WASH,
                        color: MINT_CHIP,
                        border: `1px solid ${SOFT_GREEN_BORDER}`
                      }}
                    >
                      <span>#{tag}</span>
                      <X size={12} aria-hidden />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  id="relay-confirm-tag"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  disabled={busy || tags.length >= 10}
                  placeholder={tags.length >= 10 ? "Max tags reached" : "Add a tag..."}
                  className="flex-1 rounded-full border bg-transparent px-4 py-2.5 text-sm text-[#f9fafb] placeholder-[#6b7280] outline-none transition-colors focus:border-[#2D6A4F] disabled:opacity-50"
                  style={{ borderColor: "#2a2a2a" }}
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={busy || tags.length >= 10 || !tagInput.trim()}
                  className="rounded-full border px-4 py-2.5 text-xs font-medium transition-transform enabled:hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background:
                      tags.length >= 10 || !tagInput.trim()
                        ? "rgba(42,42,42,0.5)"
                        : SOFT_GREEN_WASH,
                    color:
                      tags.length >= 10 || !tagInput.trim() ? "#6b7280" : MINT_CHIP,
                    borderColor:
                      tags.length >= 10 || !tagInput.trim()
                        ? "#2a2a2a"
                        : SOFT_GREEN_BORDER
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            {error ? (
              <p
                className="rounded-full border px-4 py-2 text-[11px]"
                style={{
                  borderColor: "rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.08)",
                  color: "#fca5a5"
                }}
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => void onPublish()}
                disabled={!canPublish || busy}
                className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full py-3.5 text-sm font-semibold transition-all duration-200 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                style={
                  canPublish && !busy
                    ? {
                        background: SOFT_GREEN,
                        color: "#e8f5e9",
                        boxShadow: "0 8px 28px rgba(45, 106, 79, 0.35)"
                      }
                    : { background: "#1a1a1a", color: "#6b7280" }
                }
              >
                {busy ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                    Publishing to Relay…
                  </>
                ) : (
                  <>
                    Publish to Relay and continue
                    <ArrowRight size={15} aria-hidden />
                  </>
                )}
              </button>
              <p className="text-center text-[11px] leading-snug text-[#6b7280]">
                Publishes this scheduled Relay post - does not create a new one.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.aside
          {...(enter
            ? {
                initial: { opacity: 0, x: 16 },
                animate: { opacity: 1, x: 0 }
              }
            : {})}
          transition={{ delay: 0.08, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="flex w-full shrink-0 flex-col gap-3 rounded-2xl border p-4 lg:w-[220px]"
          style={{ background: "rgba(22,22,22,0.55)", borderColor: "#252525" }}
        >
          <h2
            id={tierSectionId}
            className="text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]"
          >
            Relay access
          </h2>
          <CreatorTierCatalogMultiselect
            creatorId={creatorId}
            value={tierIds}
            onChange={setTierIds}
            isPublic={isPublic}
            onPublicChange={setAccessPublic}
            disabled={busy}
            aria-labelledby={tierSectionId}
          />
        </motion.aside>
      </div>
    </div>
  );
}

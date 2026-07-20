"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCreatorProfile,
  patchDistributionVariant,
  type CreatorProfileIdentity,
  type DistributionDestination,
  type DistributionVariantWire
} from "@/lib/relay-api";
import { PlatformPostPreview } from "@/app/components/distribution/PlatformPostPreview";

type Props = {
  variants: DistributionVariantWire[];
  mediaItems?: Array<{
    id: string;
    preview: string;
    filename: string;
    type: "image" | "video" | "audio";
  }>;
  onVariantsChange: (variants: DistributionVariantWire[]) => void;
  onReviewComplete: () => void;
};

const DESTINATION_LABEL: Record<DistributionDestination, string> = {
  patreon: "Patreon",
  x: "X",
  deviantart: "DeviantArt",
  bluesky: "Bluesky"
};

function warningsForVariant(variant: DistributionVariantWire): string[] {
  const advice = variant.advice;
  const raw = advice?.warnings;
  return Array.isArray(raw) ? raw.map(String) : [];
}

function normalizeXHashtag(tag: string): string {
  const normalized = tag
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
  return normalized ? `#${normalized}` : "";
}

function normalizeDeviantArtTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
}

function normalizeNativeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
}

function parseTags(raw: string, destination: DistributionDestination): string[] {
  const normalizer =
    destination === "x"
      ? normalizeXHashtag
      : destination === "deviantart"
        ? normalizeDeviantArtTag
        : normalizeNativeTag;
  return Array.from(
    new Set(
      raw
        .split(",")
        .map(normalizer)
        .filter(Boolean)
    )
  );
}

function compileXPostText(body: string, tags: string[]): string {
  const text = body.trim();
  const hashtags = tags.map(normalizeXHashtag).filter(Boolean).join(" ");
  if (!hashtags) return text.slice(0, 280);
  const full = text ? `${text}\n\n${hashtags}` : hashtags;
  if (full.length <= 280) return full;
  const reserved = hashtags.length + (text ? 2 : 0);
  if (reserved >= 280) return hashtags.slice(0, 280);
  return `${text.slice(0, 280 - reserved).trimEnd()}\n\n${hashtags}`;
}

function previewTextForVariant(variant: DistributionVariantWire): string {
  if (variant.destination === "x") {
    return compileXPostText(variant.body_text ?? variant.post_text ?? "", variant.tags);
  }
  if (variant.destination === "bluesky") {
    return variant.post_text ?? "";
  }
  const parts = [
    variant.title?.trim(),
    variant.body_text?.trim(),
    variant.tags.length > 0 ? `Tags: ${variant.tags.join(", ")}` : null
  ].filter(Boolean);
  return parts.join("\n\n");
}

function tagHelper(destination: DistributionDestination): string {
  if (destination === "x") return "Comma-separated; Relay normalizes each tag into Twitter hashtag syntax.";
  if (destination === "deviantart") return "Comma-separated; Relay removes spaces and # so tags become single words (e.g. Star Wars → starwars).";
  return "Comma-separated tags.";
}

function tagsToDraft(tags: string[]): string {
  return tags.join(", ");
}

/** `<input type="datetime-local">` uses local-wall-clock "YYYY-MM-DDTHH:mm" with no timezone. */
function isoToDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalValueToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatScheduledFor(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function suggestedTimeFromAdvice(variant: DistributionVariantWire): string | null {
  const raw = variant.advice?.suggested_post_time;
  if (typeof raw !== "string" || !raw.trim()) return null;
  // Older deterministic advice used a free-text hint ("Evening in your local timezone...");
  // only surface it as a real schedulable time when it parses as an actual timestamp.
  return Number.isNaN(new Date(raw).getTime()) ? null : raw;
}

function rationaleFromAdvice(variant: DistributionVariantWire): string | null {
  const raw = variant.advice?.rationale;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function relayCreatorPreviewIdentity(profile: CreatorProfileIdentity | null): {
  creatorName: string;
  avatarUrl: string | null;
} {
  if (!profile) {
    return { creatorName: "Your name", avatarUrl: null };
  }
  const creatorName =
    profile.display_name?.trim() ||
    profile.username?.trim() ||
    profile.public_slug?.trim().replace(/-/g, " ") ||
    "Your name";
  const avatarUrl = profile.avatar_url?.trim() || null;
  return { creatorName, avatarUrl };
}

export function DistributionVariantCards({
  variants,
  mediaItems = [],
  onVariantsChange,
  onReviewComplete
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [maxReviewedIndex, setMaxReviewedIndex] = useState(0);
  const [localVariants, setLocalVariants] = useState<DistributionVariantWire[]>(variants);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileIdentity | null>(null);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      variants
        .filter((v) => v.destination === "x" || v.destination === "deviantart")
        .map((v) => [v.variant_id, tagsToDraft(v.tags)])
    )
  );

  useEffect(() => {
    let cancelled = false;
    void getCreatorProfile()
      .then((profile) => {
        if (!cancelled) setCreatorProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setCreatorProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewIdentity = useMemo(
    () => relayCreatorPreviewIdentity(creatorProfile),
    [creatorProfile]
  );

  useEffect(() => {
    setLocalVariants(variants);
    setActiveIndex((index) => Math.min(index, Math.max(0, variants.length - 1)));
    setMaxReviewedIndex((index) => Math.min(index, Math.max(0, variants.length - 1)));
    setTagDrafts(
      Object.fromEntries(
        variants
          .filter((v) => v.destination === "x" || v.destination === "deviantart")
          .map((v) => [v.variant_id, tagsToDraft(v.tags)])
      )
    );
  }, [variants]);

  const activeVariant = localVariants[activeIndex] ?? localVariants[0] ?? null;
  const activeTagDraft =
    activeVariant && (activeVariant.destination === "x" || activeVariant.destination === "deviantart")
      ? tagDrafts[activeVariant.variant_id] ?? tagsToDraft(activeVariant.tags)
      : "";

  async function saveVariant(local: DistributionVariantWire) {
    setBusyId(local.variant_id);
    try {
      const { variant } = await patchDistributionVariant(local.variant_id, {
        title: local.title,
        body_text: local.body_text,
        post_text: local.destination === "x"
          ? compileXPostText(local.body_text ?? "", local.tags)
          : local.post_text,
        tags: local.tags,
        platform_fields: local.platform_fields
      });
      const next = localVariants.map((v) => (v.variant_id === variant.variant_id ? variant : v));
      setLocalVariants(next);
      onVariantsChange(next);
    } finally {
      setBusyId(null);
    }
  }

  function updateLocal(variantId: string, patch: Partial<DistributionVariantWire>) {
    setLocalVariants((prev) =>
      prev.map((variant) =>
        variant.variant_id === variantId
          ? {
              ...variant,
              ...patch,
              post_text:
                variant.destination === "x"
                  ? compileXPostText(
                      patch.body_text ?? variant.body_text ?? variant.post_text ?? "",
                      patch.tags ?? variant.tags
                    )
                  : patch.post_text ?? variant.post_text
            }
          : variant
      )
    );
  }

  function handleTagDraftChange(variant: DistributionVariantWire, raw: string) {
    setTagDrafts((prev) => ({ ...prev, [variant.variant_id]: raw }));
    updateLocal(variant.variant_id, {
      tags: parseTags(raw, variant.destination)
    });
  }

  function handleTagBlur(variant: DistributionVariantWire) {
    const raw = tagDrafts[variant.variant_id] ?? tagsToDraft(variant.tags);
    const parsed = parseTags(raw, variant.destination);
    setTagDrafts((prev) => ({ ...prev, [variant.variant_id]: tagsToDraft(parsed) }));
    const next = { ...variant, tags: parsed };
    updateLocal(variant.variant_id, { tags: parsed });
    void saveVariant(next);
  }

  async function saveSchedule(
    variant: DistributionVariantWire,
    patch: { scheduled_for?: string | null; remind_me?: boolean }
  ) {
    updateLocal(variant.variant_id, patch);
    setBusyId(variant.variant_id);
    try {
      const { variant: updated } = await patchDistributionVariant(variant.variant_id, patch);
      const next = localVariants.map((v) => (v.variant_id === updated.variant_id ? updated : v));
      setLocalVariants(next);
      onVariantsChange(next);
    } finally {
      setBusyId(null);
    }
  }

  const progressLabel = useMemo(
    () => `${Math.min(activeIndex + 1, localVariants.length)} / ${localVariants.length}`,
    [activeIndex, localVariants.length]
  );

  if (!activeVariant) {
    return null;
  }

  const warnings = warningsForVariant(activeVariant);
  const previewText = previewTextForVariant(activeVariant);
  const isSaving = busyId === activeVariant.variant_id;
  const isFinalPlatform = activeIndex >= localVariants.length - 1;

  async function handlePrimaryAction() {
    if (!activeVariant || isSaving) return;
    await saveVariant(activeVariant);
    if (isFinalPlatform) {
      onReviewComplete();
      return;
    }
    const nextIndex = activeIndex + 1;
    setMaxReviewedIndex((index) => Math.max(index, nextIndex));
    setActiveIndex(nextIndex);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {localVariants.map((variant, index) => (
            <button
              key={variant.variant_id}
              type="button"
              disabled={index > maxReviewedIndex}
              onClick={() => setActiveIndex(index)}
              className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                borderColor: index === activeIndex ? "rgba(0,170,111,0.7)" : "#2a2a2a",
                background: index === activeIndex ? "rgba(0,170,111,0.14)" : "#0a0a0a",
                color: index === activeIndex ? "#f9fafb" : index > maxReviewedIndex ? "#4b5563" : "#9ca3af",
                cursor: index > maxReviewedIndex ? "not-allowed" : "pointer",
                opacity: index > maxReviewedIndex ? 0.55 : 1
              }}
            >
              {DESTINATION_LABEL[variant.destination]}
            </button>
          ))}
        </div>
        <span className="shrink-0 text-[11px] text-[#6b7280]">{progressLabel}</span>
      </div>

      <section
        className="rounded-2xl border p-4 md:p-5"
        style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#00aa6f]">
              Platform variant
            </p>
            <h3 className="mt-1 text-lg font-bold text-[#f9fafb]">
              {DESTINATION_LABEL[activeVariant.destination]}
            </h3>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-[#6b7280]">
            {activeVariant.status}
          </span>
        </div>

        {warnings.length > 0 ? (
          <ul className="mb-4 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        {activeVariant.assistant_enabled && rationaleFromAdvice(activeVariant) ? (
          <div className="mb-4 rounded-lg border border-[#00aa6f]/30 bg-[#00aa6f]/[0.07] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#00d488]">
              Posting Assistant recommends
            </p>
            <p className="mt-1 text-[12px] text-[#e5faf1]">{rationaleFromAdvice(activeVariant)}</p>
          </div>
        ) : null}

        <div className="mb-4 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2.5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-[#9ca3af]">
              <span className="block">Schedule for</span>
              <input
                type="datetime-local"
                value={isoToDatetimeLocalValue(activeVariant.scheduled_for)}
                onChange={(event) =>
                  void saveSchedule(activeVariant, {
                    scheduled_for: datetimeLocalValueToIso(event.target.value)
                  })
                }
                className="mt-1 rounded-lg border bg-transparent px-2.5 py-1.5 text-xs text-[#f9fafb]"
                style={{ borderColor: "#2a2a2a" }}
              />
            </label>
            {suggestedTimeFromAdvice(activeVariant) && !activeVariant.scheduled_for ? (
              <button
                type="button"
                onClick={() =>
                  void saveSchedule(activeVariant, {
                    scheduled_for: suggestedTimeFromAdvice(activeVariant)
                  })
                }
                className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold text-[#00d488]"
                style={{ borderColor: "rgba(0,170,111,0.4)" }}
              >
                Use recommended: {formatScheduledFor(suggestedTimeFromAdvice(activeVariant))}
              </button>
            ) : null}
            {activeVariant.scheduled_for ? (
              <>
                <label className="flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                  <input
                    type="checkbox"
                    checked={activeVariant.remind_me}
                    onChange={(event) =>
                      void saveSchedule(activeVariant, { remind_me: event.target.checked })
                    }
                  />
                  Remind me when it&apos;s time
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void saveSchedule(activeVariant, { scheduled_for: null, remind_me: false })
                  }
                  className="text-[11px] text-[#6b7280] underline"
                >
                  Clear
                </button>
              </>
            ) : null}
          </div>
          <p className="mt-1.5 text-[10px] text-[#6b7280]">
            {activeVariant.scheduled_for
              ? `Queued for ${formatScheduledFor(activeVariant.scheduled_for)}. When you cross-post, we'll fill ${DESTINATION_LABEL[activeVariant.destination]}'s composer — use its own "Schedule" button to set the exact time.`
              : "Optional — pick a time and we'll remind you (if opted in) instead of posting immediately."}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            {activeVariant.destination === "x" ? (
              <>
                <label className="block text-xs text-[#9ca3af]">
                  Body
                  <textarea
                    value={activeVariant.body_text ?? activeVariant.post_text ?? ""}
                    onChange={(event) =>
                      updateLocal(activeVariant.variant_id, { body_text: event.target.value })
                    }
                    onBlur={() => void saveVariant(activeVariant)}
                    rows={5}
                    className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                    style={{ borderColor: "#2a2a2a" }}
                  />
                </label>
                <label className="block text-xs text-[#9ca3af]">
                  Hashtags
                  <textarea
                    value={activeTagDraft}
                    onChange={(event) => handleTagDraftChange(activeVariant, event.target.value)}
                    onBlur={() => handleTagBlur(activeVariant)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                    style={{ borderColor: "#2a2a2a" }}
                  />
                  <span className="mt-1 block text-[10px] text-[#6b7280]">{tagHelper("x")}</span>
                </label>
              </>
            ) : activeVariant.destination === "bluesky" ? (
              <label className="block text-xs text-[#9ca3af]">
                Post text
                <textarea
                  value={activeVariant.post_text ?? ""}
                  onChange={(event) =>
                    updateLocal(activeVariant.variant_id, { post_text: event.target.value })
                  }
                  onBlur={() => void saveVariant(activeVariant)}
                  rows={5}
                  className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                  style={{ borderColor: "#2a2a2a" }}
                />
              </label>
            ) : (
              <>
                <label className="block text-xs text-[#9ca3af]">
                  Title
                  <input
                    value={activeVariant.title ?? ""}
                    onChange={(event) =>
                      updateLocal(activeVariant.variant_id, { title: event.target.value })
                    }
                    onBlur={() => void saveVariant(activeVariant)}
                    className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                    style={{ borderColor: "#2a2a2a" }}
                  />
                </label>
                <label className="block text-xs text-[#9ca3af]">
                  Description
                  <textarea
                    value={activeVariant.body_text ?? ""}
                    onChange={(event) =>
                      updateLocal(activeVariant.variant_id, { body_text: event.target.value })
                    }
                    onBlur={() => void saveVariant(activeVariant)}
                    rows={5}
                    className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                    style={{ borderColor: "#2a2a2a" }}
                  />
                </label>
                {activeVariant.destination === "deviantart" ? (
                  <label className="block text-xs text-[#9ca3af]">
                    Tags
                    <textarea
                      value={activeTagDraft}
                      onChange={(event) => handleTagDraftChange(activeVariant, event.target.value)}
                      onBlur={() => handleTagBlur(activeVariant)}
                      rows={2}
                      className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-[#f9fafb]"
                      style={{ borderColor: "#2a2a2a" }}
                    />
                    <span className="mt-1 block text-[10px] text-[#6b7280]">
                      {tagHelper("deviantart")}
                    </span>
                  </label>
                ) : null}
              </>
            )}

            {isSaving ? (
              <p className="text-[10px] text-[#6b7280]">Saving variant fields...</p>
            ) : null}
          </div>

          <aside className="space-y-3 rounded-xl border border-white/[0.08] bg-black/45 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
              Live preview
            </p>
            <PlatformPostPreview
              destination={activeVariant.destination}
              postText={previewText}
              title={activeVariant.title}
              tags={activeVariant.tags}
              imageUrl={mediaItems[0]?.preview ?? null}
              extraImageCount={Math.max(0, mediaItems.length - 1)}
              creatorName={previewIdentity.creatorName}
              avatarUrl={previewIdentity.avatarUrl}
            />
            {activeVariant.destination === "x" ? (
              <p className="text-right text-[10px] text-[#6b7280]">
                {compileXPostText(activeVariant.body_text ?? "", activeVariant.tags).length} / 280
              </p>
            ) : null}
          </aside>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={activeIndex === 0}
          onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
          className="rounded-lg border px-3 py-2 text-xs font-semibold text-[#9ca3af] disabled:opacity-35"
          style={{ borderColor: "#2a2a2a", background: "#0a0a0a" }}
        >
          Previous platform
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handlePrimaryAction()}
          className="rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-50"
          style={{ background: "#00aa6f", color: "#000" }}
        >
          {isSaving ? "Saving..." : isFinalPlatform ? "Cross-post" : "Next platform"}
        </button>
      </div>
    </div>
  );
}

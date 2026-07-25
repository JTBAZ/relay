"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { PlatformPostPreview } from "@/app/components/distribution/PlatformPostPreview";
import { CustomTextEditorFields } from "@/app/components/distribution/CustomTextEditorFields";
import { PreviewMediaPicker } from "@/app/components/distribution/PreviewMediaPicker";
import type { CustomTextDraft } from "@/lib/custom-text-draft";
import type {
  DistributionDestination,
  DistributionVariantWire,
  GalleryItem
} from "@/lib/relay-api";
import type { MediaRoutingByDestination, MediaVersion } from "@/lib/distribution-media-routing";

const DEST_LABEL: Record<DistributionDestination, string> = {
  patreon: "Patreon",
  deviantart: "DeviantArt",
  x: "X / Twitter",
  bluesky: "Bluesky"
};

const DEST_ACCENT: Record<DistributionDestination, string> = {
  patreon: "#f96854",
  deviantart: "#05cc47",
  x: "#e7e9ea",
  bluesky: "#0085ff"
};

const UNFURL = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const }
};

export type ScheduledPrepareVariant = {
  destination: DistributionDestination;
  title: string;
  body: string;
  tags: string[];
  variant?: DistributionVariantWire | null;
};

export type ScheduledPostPreparePanelProps = {
  title: string;
  description: string;
  tags: string[];
  imageUrl: string | null;
  mediaMeta?: string[];
  destinations: DistributionDestination[];
  variants: ScheduledPrepareVariant[];

  coachOn: boolean;
  onCoachChange: (enabled: boolean) => void;
  coachAllowed: boolean;
  coachGoalsSummary?: string | null;
  onOpenCoachPath?: () => void;

  needsPreview: boolean | null;
  onNeedsPreviewChange: (value: boolean) => void;
  needsCustomText: boolean | null;
  onNeedsCustomTextChange: (value: boolean) => void;

  mediaRouting: MediaRoutingByDestination;
  onMediaVersionChange: (dest: DistributionDestination, version: MediaVersion) => void;
  previewMediaId: string;
  onPreviewMediaIdChange: (mediaId: string) => void;
  onOpenPreviewizer: () => void;
  previewizerAvailable: boolean;
  previewizerDisabled: boolean;
  showExistingPicker: boolean;
  onToggleExistingPicker: () => void;
  creatorId: string;
  postMedia?: GalleryItem[] | null;

  customTextDestinations: DistributionDestination[];
  editingDestination: DistributionDestination | null;
  editDraft: CustomTextDraft;
  onOpenCustomEditor: (dest: DistributionDestination) => void;
  onEditDraftChange: (patch: Partial<CustomTextDraft>) => void;
  onSaveCustomText: () => void;
  savingCustomText?: boolean;

  onRoute: () => void;
  routeDisabled: boolean;
  routeBusy: boolean;
  routeLabel: string;
  routeHint: string | null;
  error?: string | null;

  onApprove: (dest: DistributionDestination) => void;
  approvingDestination: DistributionDestination | null;
  customDrafts: Partial<Record<DistributionDestination, CustomTextDraft>>;
};

/**
 * Fused Step 2 prepare panel for scheduled posts (hero band + destinations).
 * Controlled by TransformerNodePage — no API calls of its own.
 */
export function ScheduledPostPreparePanel({
  title,
  description,
  tags,
  imageUrl,
  mediaMeta,
  destinations,
  variants,
  coachOn,
  onCoachChange,
  coachAllowed,
  coachGoalsSummary,
  onOpenCoachPath,
  needsPreview,
  onNeedsPreviewChange,
  needsCustomText,
  onNeedsCustomTextChange,
  mediaRouting,
  onMediaVersionChange,
  previewMediaId,
  onPreviewMediaIdChange,
  onOpenPreviewizer,
  previewizerAvailable,
  previewizerDisabled,
  showExistingPicker,
  onToggleExistingPicker,
  creatorId,
  postMedia,
  customTextDestinations,
  editingDestination,
  editDraft,
  onOpenCustomEditor,
  onEditDraftChange,
  onSaveCustomText,
  savingCustomText = false,
  onRoute,
  routeDisabled,
  routeBusy,
  routeLabel,
  routeHint,
  error,
  onApprove,
  approvingDestination,
  customDrafts
}: ScheduledPostPreparePanelProps) {
  const destCount = Math.max(variants.length, destinations.length, 1);
  const previewReady = Boolean(previewMediaId.trim());
  const metaChips = mediaMeta ?? (imageUrl ? ["Image"] : []);

  const canRouteAnswers = needsPreview !== null && needsCustomText !== null;

  return (
    <div
      className="mx-auto w-full max-w-[1200px] space-y-5"
      data-testid="scheduled-post-prepare-panel"
    >
      {/* Fused origin band */}
      <section
        className="relative overflow-hidden rounded-2xl border"
        style={{
          borderColor: "#1a2a1e",
          background: "#050706",
          minHeight: 380
        }}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "center center" }}
            />
          ) : (
            <div className="absolute inset-0 bg-[#0a0f0b]" />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(
                  90deg,
                  transparent 0%,
                  transparent 30%,
                  rgba(5, 7, 6, 0.03) 40%,
                  rgba(5, 7, 6, 0.1) 48%,
                  rgba(5, 7, 6, 0.22) 54%,
                  rgba(5, 7, 6, 0.4) 60%,
                  rgba(5, 7, 6, 0.6) 66%,
                  rgba(5, 7, 6, 0.78) 72%,
                  rgba(5, 7, 6, 0.9) 78%,
                  rgba(5, 7, 6, 0.97) 84%,
                  #050706 90%
                )
              `
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[58%] lg:right-[28%]"
            style={{
              background:
                "linear-gradient(to top, rgba(5,7,6,0.94) 0%, rgba(5,7,6,0.45) 48%, transparent 100%)"
            }}
          />
        </div>

        <div className="relative z-10 grid min-h-[380px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(220px,28%)]">
          <div className="flex min-h-[300px] flex-col justify-end p-5 sm:p-6 lg:max-w-[70%] lg:pr-8">
            <h2 className="max-w-[28ch] text-xl font-semibold tracking-tight text-[#edf2ef] sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-[#c8d5cc]">
              {description || "No description yet."}
            </p>
            {metaChips.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {metaChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full px-2.5 py-1 text-[10px] font-medium tabular-nums"
                    style={{
                      background: "rgba(10, 15, 11, 0.72)",
                      border: "1px solid rgba(155,240,196,0.14)",
                      color: chip === "Image" ? "#9bf0c4" : "#8ea898"
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col justify-center gap-5 p-5 sm:px-5 sm:py-6 lg:pl-2 lg:pr-5">
            <PrepareRow
              label="Coach this post"
              trailing={
                <button
                  type="button"
                  role="switch"
                  aria-checked={coachOn}
                  aria-label="Coach this post"
                  disabled={!coachAllowed}
                  title={
                    coachAllowed
                      ? undefined
                      : "Relay Coach requires Autopost plan — open Billing to upgrade"
                  }
                  onClick={() => onCoachChange(!coachOn)}
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: coachOn ? "#1B4332" : "#1a2a1e",
                    boxShadow: coachOn
                      ? "inset 0 0 0 1px #2D6A4F"
                      : "inset 0 0 0 1px #243426"
                  }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full transition-transform"
                    style={{
                      left: coachOn ? "22px" : "2px",
                      background: coachOn ? "#9bf0c4" : "#8ea898"
                    }}
                  />
                </button>
              }
            />
            {!coachAllowed ? (
              <p className="text-[10px] text-[#6aaa7a]">
                Upgrade required.{" "}
                <Link
                  href="/studio/settings/billing?feature=posting_assistant"
                  className="text-[#9bf0c4] underline-offset-2 hover:underline"
                >
                  View plans
                </Link>
              </p>
            ) : null}
            {coachOn && coachGoalsSummary && onOpenCoachPath ? (
              <button
                type="button"
                onClick={onOpenCoachPath}
                className="w-full rounded-xl border px-3 py-2 text-left text-[11px] text-[#9bf0c4]"
                style={{
                  borderColor: "rgba(45,106,79,0.45)",
                  background: "rgba(45,106,79,0.12)"
                }}
              >
                {coachGoalsSummary}
              </button>
            ) : null}

            <YesNoRow
              label="Generate a Preview?"
              value={needsPreview}
              onChange={onNeedsPreviewChange}
            />
            <YesNoRow
              label="Custom text?"
              value={needsCustomText}
              onChange={onNeedsCustomTextChange}
            />

            <button
              type="button"
              disabled={routeDisabled || routeBusy}
              onClick={onRoute}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-[transform,opacity] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: !routeDisabled && !routeBusy ? "#9bf0c4" : "#0a140d",
                color: !routeDisabled && !routeBusy ? "#050706" : "#3a4a3e"
              }}
            >
              {routeBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RouteIcon />
              )}
              {routeLabel}
            </button>
            {routeHint ? (
              <p className="text-center text-[10px] text-[#3a4a3e]">{routeHint}</p>
            ) : !canRouteAnswers ? (
              <p className="text-center text-[10px] text-[#3a4a3e]">
                Answer both questions to unlock routing.
              </p>
            ) : null}
            {error ? (
              <p className="text-center text-[11px] text-red-300" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Preview expand */}
      <AnimatePresence initial={false}>
        {needsPreview === true ? (
          <motion.section
            key="preview-panel"
            {...UNFURL}
            className="overflow-hidden"
            data-testid="scheduled-prepare-preview-panel"
          >
            <div
              className="rounded-2xl border px-5 py-4"
              style={{ borderColor: "#1a2a1e", background: "#070a08" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#d0ddd4]">Preview</p>
                {previewReady ? (
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold text-[#9bf0c4]">Ready</span>
                    <button
                      type="button"
                      onClick={onToggleExistingPicker}
                      className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                      style={{ color: "#6aaa7a", boxShadow: "inset 0 0 0 1px #1e2a22" }}
                    >
                      Edit
                    </button>
                  </div>
                ) : previewizerAvailable ? (
                  <button
                    type="button"
                    onClick={onOpenPreviewizer}
                    disabled={previewizerDisabled}
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold disabled:opacity-40"
                    style={{
                      background: "rgba(155,240,196,0.12)",
                      color: "#9bf0c4",
                      boxShadow: "inset 0 0 0 1px rgba(155,240,196,0.45)"
                    }}
                  >
                    <WandIcon />
                    Open Previewizer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onToggleExistingPicker}
                    className="rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-[#9bf0c4]"
                    style={{
                      background: "rgba(155,240,196,0.12)",
                      boxShadow: "inset 0 0 0 1px rgba(155,240,196,0.45)"
                    }}
                  >
                    Choose preview
                  </button>
                )}
              </div>

              <div className="mt-4">
                <p
                  className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "#404a44" }}
                >
                  Image per platform
                </p>
                <div className="divide-y divide-[#141e16]">
                  {destinations.map((dest) => {
                    const version = mediaRouting[dest] ?? "full";
                    return (
                      <div
                        key={dest}
                        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="text-[12px] text-[#c8d5cc]">{DEST_LABEL[dest]}</span>
                        <div className="flex gap-1.5">
                          {(["full", "preview"] as const).map((opt) => {
                            const selected = version === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => onMediaVersionChange(dest, opt)}
                                className="rounded-full px-3 py-1 text-[10px] font-semibold capitalize"
                                style={{
                                  background: selected
                                    ? "rgba(155,240,196,0.12)"
                                    : "transparent",
                                  color: selected ? "#9bf0c4" : "#6aaa7a",
                                  boxShadow: selected
                                    ? "inset 0 0 0 1px rgba(155,240,196,0.45)"
                                    : "inset 0 0 0 1px #1e2a22"
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleExistingPicker}
                className="mt-3 text-[11px] font-medium text-[#5fb98f] hover:text-[#9bf0c4]"
              >
                {showExistingPicker ? "Hide existing previews" : "Choose existing preview"}
              </button>

              <AnimatePresence initial={false}>
                {showExistingPicker ? (
                  <motion.div key="existing-picker" {...UNFURL} className="overflow-hidden">
                    <div className="mt-3">
                      <PreviewMediaPicker
                        creatorId={creatorId}
                        postMedia={postMedia ?? undefined}
                        selectedMediaId={previewMediaId}
                        onSelect={onPreviewMediaIdChange}
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* Custom text expand */}
      <AnimatePresence initial={false}>
        {needsCustomText === true ? (
          <motion.section
            key="custom-text-panel"
            {...UNFURL}
            className="overflow-hidden"
            data-testid="scheduled-prepare-custom-text-panel"
          >
            <div
              className="rounded-2xl border px-5 py-4"
              style={{ borderColor: "#1a2a1e", background: "#070a08" }}
            >
              <p className="text-sm font-medium text-[#d0ddd4]">Custom text by platform</p>
              <p className="mt-0.5 text-[11px] text-[#3a4a3e]">
                Consider: X has a 280 character limit
              </p>

              <p className="mt-4 text-[11px] text-[#6aaa7a]">Select platform to customize:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {destinations.map((dest) => {
                  const active = customTextDestinations.includes(dest);
                  const current = editingDestination === dest;
                  return (
                    <button
                      key={dest}
                      type="button"
                      onClick={() => onOpenCustomEditor(dest)}
                      className="rounded-full border px-4 py-1.5 text-[11px] font-semibold"
                      style={{
                        borderColor: current
                          ? DEST_ACCENT[dest]
                          : active
                            ? `${DEST_ACCENT[dest]}88`
                            : "#1e2a22",
                        background: current ? `${DEST_ACCENT[dest]}18` : "transparent",
                        color: current || active ? DEST_ACCENT[dest] : "#6aaa7a"
                      }}
                    >
                      {DEST_LABEL[dest]}
                      {active && !current ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {editingDestination ? (
                  <motion.div
                    key={editingDestination}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="mt-4 space-y-3 border-t border-[#141e16] pt-4"
                  >
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: DEST_ACCENT[editingDestination] }}
                    >
                      {DEST_LABEL[editingDestination]}
                    </p>
                    <CustomTextEditorFields
                      dest={editingDestination}
                      draft={editDraft}
                      onChange={onEditDraftChange}
                      variant="questionnaire"
                    />
                    <button
                      type="button"
                      onClick={onSaveCustomText}
                      disabled={savingCustomText}
                      className="rounded-xl px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                      style={{
                        background: "#1B4332",
                        color: "#9bf0c4",
                        boxShadow: "inset 0 0 0 1px #2D6A4F"
                      }}
                    >
                      {savingCustomText ? "Saving…" : "Save"}
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* Destinations */}
      <section className="space-y-3">
        <p
          className="text-[9.5px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "#404a44" }}
        >
          Destinations
        </p>
        <div
          className={[
            "grid gap-3 sm:gap-4 grid-cols-1",
            destCount === 1
              ? "md:grid-cols-1"
              : destCount === 2
                ? "md:grid-cols-2"
                : destCount === 3
                  ? "md:grid-cols-3"
                  : "md:grid-cols-4"
          ].join(" ")}
        >
          {variants.map((variant) => {
            const dest = variant.destination;
            const accent = DEST_ACCENT[dest];
            const draft = customDrafts[dest];
            const cardTitle = draft?.title?.trim() || variant.title;
            const body = draft?.body?.trim() || variant.body;
            const cardTags = draft?.tags
              ? draft.tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
              : variant.tags.length > 0
                ? variant.tags
                : tags;
            const postText =
              dest === "x" || dest === "bluesky"
                ? [cardTitle, body].filter(Boolean).join("\n\n")
                : body;
            const mediaVersion = mediaRouting[dest] ?? "full";
            const approved =
              variant.variant?.status === "approved" ||
              Boolean(variant.variant?.approved_at);

            return (
              <article
                key={dest}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border"
                style={{
                  borderColor: "#1a2a1e",
                  background: "#070a08",
                  height: 480
                }}
                data-testid={`scheduled-prepare-dest-${dest}`}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <DestinationMark destination={dest} />
                    <span className="text-[12px] font-semibold" style={{ color: accent }}>
                      {DEST_LABEL[dest]}
                    </span>
                  </div>
                  {needsPreview === true ? (
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#6aaa7a]">
                      {mediaVersion}
                    </span>
                  ) : null}
                </div>

                <div className="relative min-h-0 flex-1 overflow-hidden px-2.5">
                  <div className="h-full overflow-hidden rounded-xl" style={{ maxHeight: "100%" }}>
                    <PlatformPostPreview
                      destination={dest}
                      title={cardTitle}
                      postText={postText}
                      tags={cardTags}
                      imageUrl={imageUrl}
                    />
                  </div>
                </div>

                <div className="mt-auto flex shrink-0 gap-2 border-t border-[#141e16] px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenCustomEditor(dest)}
                    className="flex-1 rounded-xl border py-1.5 text-[11px] font-semibold text-[#8ea898]"
                    style={{ borderColor: "#1e2a22", background: "#0a0f0b" }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onApprove(dest)}
                    disabled={!variant.variant || approvingDestination === dest || approved}
                    className="flex-1 rounded-xl py-1.5 text-[11px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
                    style={{
                      background: approved ? "#0a140d" : "#1B4332",
                      color: "#9bf0c4",
                      boxShadow: "inset 0 0 0 1px #2D6A4F"
                    }}
                  >
                    {approvingDestination === dest
                      ? "…"
                      : approved
                        ? "Approved"
                        : "Approve"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PrepareRow({ label, trailing }: { label: string; trailing: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-[#d0ddd4]">{label}</p>
      {trailing}
    </div>
  );
}

function YesNoRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[#d0ddd4]">{label}</p>
      <div className="flex gap-2">
        {([true, false] as const).map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={String(opt)}
              type="button"
              onClick={() => onChange(opt)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{
                background: selected ? "rgba(155,240,196,0.12)" : "transparent",
                color: selected ? "#9bf0c4" : "#6aaa7a",
                boxShadow: selected
                  ? "inset 0 0 0 1px rgba(155,240,196,0.45)"
                  : "inset 0 0 0 1px #1e2a22"
              }}
            >
              {selected ? (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#9bf0c4" }}
                  aria-hidden
                />
              ) : null}
              {opt ? "Yes" : "No"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RouteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 4V2M15 16v-2M8 9H6M22 9h-2M18.4 14.4L17 13M18.4 3.6L17 5M5 21l9-9M3.6 5.6L5 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DestinationMark({ destination }: { destination: DistributionDestination }) {
  if (destination === "patreon") {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{ background: "#f96854" }}
        aria-hidden
      >
        P
      </span>
    );
  }
  if (destination === "deviantart") {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
        style={{ background: "#05cc47", color: "#041208" }}
        aria-hidden
      >
        dA
      </span>
    );
  }
  if (destination === "bluesky") {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: "#0085ff" }}
        aria-hidden
      >
        bsky
      </span>
    );
  }
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: "#e7e9ea", color: "#0a0a0a" }}
      aria-hidden
    >
      𝕏
    </span>
  );
}

/** Build destination cards from selected destinations + plan variants. */
export function buildScheduledPrepareVariants(args: {
  destinations: DistributionDestination[];
  variantsByDest: Map<DistributionDestination, DistributionVariantWire>;
  title: string;
  description: string;
  tags: string[];
}): ScheduledPrepareVariant[] {
  return args.destinations.map((destination) => {
    const variant = args.variantsByDest.get(destination) ?? null;
    return {
      destination,
      title: variant?.title?.trim() || args.title,
      body:
        variant?.body_text?.trim() ||
        variant?.post_text?.trim() ||
        args.description,
      tags: variant?.tags?.length ? variant.tags : args.tags,
      variant
    };
  });
}

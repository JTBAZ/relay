"use client";

import { useMemo, useState } from "react";
import {
  ScheduledPostPreparePanel,
  type ScheduledPrepareVariant
} from "@/app/components/distribution/ScheduledPostPreparePanel";
import type { CustomTextDraft } from "@/lib/custom-text-draft";
import type { DistributionDestination } from "@/lib/relay-api";
import type { MediaRoutingByDestination, MediaVersion } from "@/lib/distribution-media-routing";
import type { Step2DevFixture } from "./fixtures";

type Props = {
  data: Step2DevFixture;
  sourceLabel?: string;
};

/**
 * Dev playground: same presentational panel as production scheduled prepare,
 * with local state and stub Route / Approve (no plan writes).
 */
export function Step2FusedReviewMock({ data, sourceLabel = "Fixture" }: Props) {
  const destinations = useMemo(
    () => data.variants.map((v) => v.destination),
    [data.variants]
  );

  const variants: ScheduledPrepareVariant[] = useMemo(
    () =>
      data.variants.map((v) => ({
        destination: v.destination,
        title: v.title,
        body: v.body,
        tags: data.tags
      })),
    [data]
  );

  const [coachOn, setCoachOn] = useState(false);
  const [needsPreview, setNeedsPreview] = useState<boolean | null>(false);
  const [needsCustomText, setNeedsCustomText] = useState<boolean | null>(false);
  const [mediaRouting, setMediaRouting] = useState<MediaRoutingByDestination>(() => {
    const next: MediaRoutingByDestination = {};
    for (const dest of destinations) {
      next[dest] = dest === "patreon" ? "full" : "preview";
    }
    return next;
  });
  const [previewMediaId, setPreviewMediaId] = useState("");
  const [showExistingPicker, setShowExistingPicker] = useState(false);
  const [customDestinations, setCustomDestinations] = useState<DistributionDestination[]>([]);
  const [editingDestination, setEditingDestination] = useState<DistributionDestination | null>(
    null
  );
  const [editDraft, setEditDraft] = useState<CustomTextDraft>({
    title: "",
    body: "",
    tags: ""
  });
  const [customDrafts, setCustomDrafts] = useState<
    Partial<Record<DistributionDestination, CustomTextDraft>>
  >({});

  const previewBlocking =
    needsPreview === true &&
    !previewMediaId.trim() &&
    destinations.some((d) => (mediaRouting[d] ?? "full") === "preview");

  const canRoute = needsPreview !== null && needsCustomText !== null && !previewBlocking;

  function openCustomEditor(dest: DistributionDestination) {
    setNeedsCustomText(true);
    setCustomDestinations((prev) => (prev.includes(dest) ? prev : [...prev, dest]));
    setEditingDestination(dest);
    const existing = customDrafts[dest];
    const variant = data.variants.find((v) => v.destination === dest);
    setEditDraft(
      existing ?? {
        title: variant?.title ?? data.title,
        body: variant?.body ?? data.description,
        tags: data.tags.join(", ")
      }
    );
  }

  return (
    <div
      className="studio-lab2-v0 mx-auto w-full max-w-[1200px] space-y-5 px-4 py-6 sm:px-5"
      data-testid="step2-fused-dev-mock"
    >
      <header className="space-y-1.5">
        <p
          className="text-[9.5px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "#404a44" }}
        >
          Scheduled post
        </p>
        <h1 className="text-[1.65rem] font-bold tracking-tight text-[#edf2ef]">
          Prepare platforms
        </h1>
        <p className="max-w-[42ch] text-sm leading-relaxed text-[#6aaa7a]">
          Review source content and prepare it for each platform.
        </p>
        <p className="text-[11px] text-[#3a4a3e]">
          Dev clone · <span className="text-[#5fb98f]">{sourceLabel}</span>
        </p>
      </header>

      <ScheduledPostPreparePanel
        title={data.title}
        description={data.description}
        tags={data.tags}
        imageUrl={data.imageUrl}
        mediaMeta={data.mediaMeta}
        destinations={destinations}
        variants={variants}
        coachOn={coachOn}
        onCoachChange={setCoachOn}
        coachAllowed
        needsPreview={needsPreview}
        onNeedsPreviewChange={(v) => {
          setNeedsPreview(v);
          if (!v) {
            setPreviewMediaId("");
            setShowExistingPicker(false);
          }
        }}
        needsCustomText={needsCustomText}
        onNeedsCustomTextChange={(v) => {
          setNeedsCustomText(v);
          if (!v) {
            setCustomDestinations([]);
            setEditingDestination(null);
          }
        }}
        mediaRouting={mediaRouting}
        onMediaVersionChange={(dest, version: MediaVersion) =>
          setMediaRouting((prev) => ({ ...prev, [dest]: version }))
        }
        previewMediaId={previewMediaId}
        onPreviewMediaIdChange={setPreviewMediaId}
        onOpenPreviewizer={() => setPreviewMediaId("dev-preview")}
        previewizerAvailable
        previewizerDisabled={false}
        showExistingPicker={showExistingPicker}
        onToggleExistingPicker={() => setShowExistingPicker((v) => !v)}
        creatorId=""
        postMedia={null}
        customTextDestinations={customDestinations}
        editingDestination={editingDestination}
        editDraft={editDraft}
        onOpenCustomEditor={openCustomEditor}
        onEditDraftChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))}
        onSaveCustomText={() => {
          if (!editingDestination) return;
          setCustomDrafts((prev) => ({ ...prev, [editingDestination]: { ...editDraft } }));
          setEditingDestination(null);
        }}
        onRoute={() => {
          /* stub — no plan write */
        }}
        routeDisabled={!canRoute}
        routeBusy={false}
        routeLabel="Route to platforms"
        routeHint={
          !canRoute
            ? previewBlocking
              ? "Attach a preview image or set platforms to Full."
              : "Answer both questions to unlock routing."
            : "Dev mock - Route does not write a plan."
        }
        onApprove={() => {
          /* stub */
        }}
        approvingDestination={null}
        customDrafts={customDrafts}
      />
    </div>
  );
}

"use client";

import type { ChangeEvent, MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { FileText, FolderPlus, ImagePlus, Layers3, Music, PencilLine, Tags, UploadCloud } from "lucide-react";
import {
  patchPostPresentation,
  putRelayNativeUpload,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  type GalleryItem,
  type GalleryPostDetail,
  type TierFacet
} from "@/lib/relay-api";
import { guessRelayUploadContentType } from "@/lib/guess-relay-upload-content-type";

/** Local Inspect upload feedback (blob URL revoked after commit or failure / unmount). */
type OptimisticMediaPreview = {
  postId: string;
  mediaId?: string;
  objectUrl: string;
  fileName: string;
  mimeType: string;
  status: "uploading" | "committing" | "attached" | "failed";
};

function revokeBlobUrlRef(ref: MutableRefObject<string | null>) {
  if (ref.current) {
    URL.revokeObjectURL(ref.current);
    ref.current = null;
  }
}

function optimisticUploadPhaseLabel(status: OptimisticMediaPreview["status"]): string {
  switch (status) {
    case "uploading":
      return "Uploading to storage…";
    case "committing":
      return "Committing attachment…";
    case "attached":
      return "Refreshing gallery…";
    case "failed":
      return "Upload failed";
    default:
      return "";
  }
}

type Props = {
  preview: GalleryItem;
  previewDetail: GalleryPostDetail | null;
  accessTiers: TierFacet[];
  creatorId: string;
  postId: string;
  onPresentationUpdated: () => Promise<void>;
};

export function InspectMetaSidebar({
  preview,
  previewDetail,
  accessTiers,
  creatorId,
  postId,
  onPresentationUpdated
}: Props) {
  const title = previewDetail?.title ?? preview.title;
  const tagIds = previewDetail?.tag_ids ?? preview.tag_ids;
  const description = previewDetail?.description ?? preview.description ?? "";
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftDescription, setDraftDescription] = useState(description);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const optimisticBlobUrlRef = useRef<string | null>(null);
  const [optimisticPreview, setOptimisticPreview] = useState<OptimisticMediaPreview | null>(null);
  const [addMediaBusy, setAddMediaBusy] = useState(false);
  const [addMediaError, setAddMediaError] = useState<string | null>(null);

  useEffect(() => {
    return () => revokeBlobUrlRef(optimisticBlobUrlRef);
  }, []);

  useEffect(() => {
    if (!editorOpen) {
      setDraftDescription(description);
    }
  }, [description, editorOpen]);

  async function saveDescription() {
    setSaveBusy(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const clean = draftDescription.trim();
      await patchPostPresentation({
        relayCreatorId: creatorId,
        postId,
        relay_description: clean.length > 0 ? draftDescription : null
      });
      await onPresentationUpdated();
      setSaveOk(true);
      setEditorOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaveBusy(false);
    }
  }

  async function onAddMediaPicked(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0] ?? null;
    ev.target.value = "";
    if (!file || file.size <= 0) return;

    revokeBlobUrlRef(optimisticBlobUrlRef);

    const contentType = guessRelayUploadContentType(file);
    if (contentType === "application/octet-stream") {
      setAddMediaError("Could not determine the file type. Try a common image, video, or audio extension.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    optimisticBlobUrlRef.current = objectUrl;
    const baseOptimistic: OptimisticMediaPreview = {
      postId,
      objectUrl,
      fileName: file.name,
      mimeType: contentType,
      status: "uploading"
    };
    setOptimisticPreview(baseOptimistic);

    setAddMediaBusy(true);
    setAddMediaError(null);

    try {
      const init = await relayNativeUploadInit({
        creator_id: creatorId,
        content_type: contentType,
        byte_size: file.size,
        post_id: postId
      });
      setOptimisticPreview((prev) =>
        prev ? { ...prev, mediaId: init.media_id, status: "uploading" as const } : prev
      );
      const putContentType = init.upload.headers["Content-Type"] ?? contentType;
      await putRelayNativeUpload(init.upload.url, file, putContentType);

      setOptimisticPreview((prev) =>
        prev ? { ...prev, status: "committing" as const } : prev
      );
      await relayNativeUploadCommit({
        creator_id: creatorId,
        media_id: init.media_id,
        content_type: contentType,
        byte_size: file.size,
        post_id: postId
      });
      setOptimisticPreview((prev) =>
        prev ? { ...prev, status: "attached" as const } : prev
      );

      await onPresentationUpdated();

      revokeBlobUrlRef(optimisticBlobUrlRef);
      setOptimisticPreview(null);
    } catch (error) {
      setAddMediaError(error instanceof Error ? error.message : String(error));
      revokeBlobUrlRef(optimisticBlobUrlRef);
      setOptimisticPreview(null);
    } finally {
      setAddMediaBusy(false);
    }
  }

  const addMediaActionLabel = optimisticPreview
    ? optimisticUploadPhaseLabel(optimisticPreview.status)
    : addMediaBusy
      ? "Working…"
      : "Add media";

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4 text-sm text-[var(--lib-fg)]">
      <section className="space-y-2">
        <ActionCard
          icon={PencilLine}
          title="Edit Description"
          body={description ? `Update “${title}” with a Relay description override.` : "Add Relay copy for this post."}
          action={editorOpen ? "Editor open" : "Open editor"}
          onAction={() => {
            setDraftDescription(description);
            setSaveError(null);
            setSaveOk(false);
            setEditorOpen(true);
          }}
        />
        {editorOpen ? (
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--lib-primary)_35%,var(--lib-border))] bg-[var(--lib-bg)] p-3 shadow-xl">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--lib-fg)]">Relay description</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--lib-fg-muted)]">
                  Saved as a Relay presentation override, so Patreon re-syncs keep your edited copy.
                </p>
              </div>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => {
                  setEditorOpen(false);
                  setDraftDescription(description);
                  setSaveError(null);
                }}
                className="rounded-full px-2 py-1 text-[10px] text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <textarea
              value={draftDescription}
              onChange={(e) => {
                setDraftDescription(e.target.value);
                setSaveOk(false);
              }}
              rows={8}
              className="min-h-36 w-full resize-y rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-sm leading-5 text-[var(--lib-fg)] outline-none focus:border-[var(--lib-primary)]"
              placeholder="Write a Relay-specific post description..."
            />
            <p className="mt-1 text-[10px] text-[var(--lib-fg-muted)]">
              Empty saves clear the Relay override and fall back to the latest synced Patreon copy.
            </p>
            {saveError ? (
              <p className="mt-2 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {saveError}
              </p>
            ) : null}
            {saveOk ? (
              <p className="mt-2 rounded-lg border border-[color-mix(in_srgb,var(--lib-primary)_35%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_12%,var(--lib-card))] px-3 py-2 text-xs text-[var(--lib-fg)]">
                Description updated.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => {
                  setDraftDescription("");
                  setSaveOk(false);
                }}
                className="rounded-full border border-[var(--lib-border)] px-3 py-1.5 text-xs text-[var(--lib-fg-muted)] hover:border-[var(--lib-primary)]/45 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void saveDescription()}
                className="rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_55%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_18%,var(--lib-card))] px-3 py-1.5 text-xs font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:opacity-50"
              >
                {saveBusy ? "Saving..." : "Update description"}
              </button>
            </div>
          </div>
        ) : null}
        <ActionCard
          icon={ImagePlus}
          title="Edit or Add Media"
          body="Upload images, GIFs, video, or bonus files to the Relay layer and arrange them with the source media."
          action={addMediaActionLabel}
          busy={addMediaBusy}
          onAction={() => {
            if (!addMediaBusy) mediaFileInputRef.current?.click();
          }}
        />
        <input
          ref={mediaFileInputRef}
          type="file"
          className="sr-only"
          accept="video/*,image/*,audio/*"
          disabled={addMediaBusy}
          onChange={(e) => void onAddMediaPicked(e)}
        />
        {optimisticPreview ? (
          <div
            className="rounded-xl border border-[color-mix(in_srgb,var(--lib-primary)_25%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_8%,var(--lib-card))] p-3"
            role="status"
            aria-live="polite"
          >
            <div className="flex gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--lib-border)] bg-[var(--lib-muted)]">
                <OptimisticLocalMediaThumb mimeType={optimisticPreview.mimeType} url={optimisticPreview.objectUrl} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--lib-fg)]" title={optimisticPreview.fileName}>
                  {optimisticPreview.fileName}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--lib-fg-muted)]">
                  {optimisticUploadPhaseLabel(optimisticPreview.status)}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        {addMediaError ? (
          <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">{addMediaError}</p>
        ) : null}
        <ActionCard
          icon={UploadCloud}
          title="Custom Preview Asset"
          body="Use a Relay-uploaded image or clip as the locked preview instead of relying on Patreon media."
          action="Choose preview"
        />
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <Layers3 className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            Audience access
          </p>
        </div>
        {accessTiers.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {accessTiers.map((tier) => (
              <span
                key={tier.tier_id}
                className="rounded border border-[var(--lib-border)] bg-[var(--lib-muted)] px-1.5 py-0.5 text-[10px] text-[var(--lib-fg)]"
              >
                {tier.title}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--lib-fg-muted)]">No audience tier data is attached yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Tags className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            Tags and collections
          </p>
        </div>
        {tagIds.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tagIds.slice(0, 12).map((t) => (
              <span key={t} className="rounded bg-[var(--lib-muted)] px-1.5 py-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--lib-fg-muted)]">No Relay tags yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-1.5 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45">
            Add Tags
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-1.5 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45">
            <FolderPlus className="h-3.5 w-3.5" aria-hidden />
            Add to Collection
          </button>
        </div>
      </section>
    </div>
  );
}

/** Ephemeral blob preview for the active Relay upload row (Inspect sidebar only). */
function OptimisticLocalMediaThumb({ mimeType, url }: { mimeType: string; url: string }) {
  if (mimeType.startsWith("image/")) {
    return <img src={url} alt="" className="h-full w-full object-cover" decoding="async" />;
  }
  if (mimeType.startsWith("video/")) {
    return (
      <video
        src={url}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[var(--lib-fg-muted)]">
      <Music className="h-5 w-5 shrink-0" aria-hidden />
      <span className="max-w-[3.25rem] px-1 text-center text-[8px] leading-tight">Audio</span>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  body,
  action,
  onAction,
  busy
}: {
  icon: typeof FileText;
  title: string;
  body: string;
  action: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-primary)]">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--lib-fg)]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--lib-fg-muted)]">{body}</p>
          <button
            type="button"
            onClick={onAction}
            disabled={Boolean(busy) || !onAction}
            className="mt-2 rounded-full border border-[var(--lib-border)] px-3 py-1 text-[10px] font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

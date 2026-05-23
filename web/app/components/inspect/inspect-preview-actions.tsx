"use client";

import type { ChangeEvent, MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Music, PencilLine } from "lucide-react";
import {
  patchPostPresentation,
  putRelayNativeUpload,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  type GalleryItem,
  type GalleryPostDetail
} from "@/lib/relay-api";
import { guessRelayUploadContentType } from "@/lib/guess-relay-upload-content-type";

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
      return "Uploading…";
    case "committing":
      return "Committing…";
    case "attached":
      return "Refreshing…";
    case "failed":
      return "Upload failed";
    default:
      return "";
  }
}

type PresentationProps = {
  preview: GalleryItem;
  previewDetail: GalleryPostDetail | null;
  creatorId: string;
  postId: string;
  onPresentationUpdated: () => Promise<void>;
};

export function InspectPostDescription({
  preview,
  previewDetail,
  creatorId,
  postId,
  onPresentationUpdated
}: PresentationProps) {
  const description = previewDetail?.description ?? preview.description ?? "";
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftDescription, setDraftDescription] = useState(description);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

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

  const displayText = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
          Description
        </p>
        {!editorOpen ? (
          <button
            type="button"
            onClick={() => {
              setDraftDescription(description);
              setSaveError(null);
              setSaveOk(false);
              setEditorOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--lib-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45"
          >
            <PencilLine className="h-3 w-3 text-[var(--lib-primary)]" aria-hidden />
            Edit
          </button>
        ) : (
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
            Cancel
          </button>
        )}
      </div>

      {editorOpen ? (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--lib-primary)_30%,var(--lib-border))] bg-[var(--lib-bg)] p-2.5">
          <textarea
            value={draftDescription}
            onChange={(e) => {
              setDraftDescription(e.target.value);
              setSaveOk(false);
            }}
            rows={5}
            className="min-h-24 w-full resize-y rounded-md border border-[var(--lib-border)] bg-[var(--lib-card)] px-2.5 py-2 text-xs leading-5 text-[var(--lib-fg)] outline-none focus:border-[var(--lib-primary)]"
            placeholder="Write a Relay-specific post description…"
          />
          <p className="mt-1 text-[9px] leading-4 text-[var(--lib-fg-muted)]">
            Saved as a Relay override; empty clears back to synced Patreon copy.
          </p>
          {saveError ? (
            <p className="mt-2 rounded-md border border-red-800/50 bg-red-950/40 px-2 py-1.5 text-[10px] text-red-200">
              {saveError}
            </p>
          ) : null}
          {saveOk ? (
            <p className="mt-2 rounded-md border border-[color-mix(in_srgb,var(--lib-primary)_35%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_12%,var(--lib-card))] px-2 py-1.5 text-[10px] text-[var(--lib-fg)]">
              Description updated.
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => {
                setDraftDescription("");
                setSaveOk(false);
              }}
              className="rounded-full border border-[var(--lib-border)] px-2.5 py-1 text-[10px] text-[var(--lib-fg-muted)] hover:border-[var(--lib-primary)]/45 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void saveDescription()}
              className="rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_55%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_18%,var(--lib-card))] px-2.5 py-1 text-[10px] font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:opacity-50"
            >
              {saveBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs leading-5 text-[var(--lib-fg-muted)]">
          {displayText || "No post copy has been synced for this preview yet."}
        </p>
      )}
    </div>
  );
}

export function InspectAddMediaControl({
  creatorId,
  postId,
  onPresentationUpdated
}: Pick<PresentationProps, "creatorId" | "postId" | "onPresentationUpdated">) {
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const optimisticBlobUrlRef = useRef<string | null>(null);
  const [optimisticPreview, setOptimisticPreview] = useState<OptimisticMediaPreview | null>(null);
  const [addMediaBusy, setAddMediaBusy] = useState(false);
  const [addMediaError, setAddMediaError] = useState<string | null>(null);

  useEffect(() => {
    return () => revokeBlobUrlRef(optimisticBlobUrlRef);
  }, []);

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
    setOptimisticPreview({
      postId,
      objectUrl,
      fileName: file.name,
      mimeType: contentType,
      status: "uploading"
    });

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

  const addMediaLabel = optimisticPreview
    ? optimisticUploadPhaseLabel(optimisticPreview.status)
    : addMediaBusy
      ? "Working…"
      : "Add media";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={addMediaBusy}
        onClick={() => {
          if (!addMediaBusy) mediaFileInputRef.current?.click();
        }}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--lib-border)] bg-black/40 px-2.5 py-1 text-[10px] font-medium text-[var(--lib-fg)] backdrop-blur-sm hover:border-[var(--lib-primary)]/45 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ImagePlus className="h-3 w-3 text-[var(--lib-primary)]" aria-hidden />
        {addMediaLabel}
      </button>
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
          className="flex max-w-[11rem] items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--lib-primary)_25%,var(--lib-border))] bg-black/55 px-2 py-1.5 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-[var(--lib-border)] bg-[var(--lib-muted)]">
            <OptimisticLocalMediaThumb mimeType={optimisticPreview.mimeType} url={optimisticPreview.objectUrl} />
          </div>
          <p className="min-w-0 truncate text-[9px] text-white/80" title={optimisticPreview.fileName}>
            {optimisticPreview.fileName}
          </p>
        </div>
      ) : null}
      {addMediaError ? (
        <p className="max-w-[12rem] rounded-md border border-red-800/50 bg-red-950/70 px-2 py-1 text-[9px] text-red-200">
          {addMediaError}
        </p>
      ) : null}
    </div>
  );
}

function OptimisticLocalMediaThumb({ mimeType, url }: { mimeType: string; url: string }) {
  if (mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-full w-full object-cover" decoding="async" />;
  }
  if (mimeType.startsWith("video/")) {
    return <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />;
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-[var(--lib-fg-muted)]">
      <Music className="h-4 w-4 shrink-0" aria-hidden />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Target, Upload, X } from "lucide-react";
import LibraryUploadZone from "@/app/components/library/LibraryUploadZone";
import { uploadFilesToRelayStaging } from "@/lib/relay-native-staging-upload";

type Props = {
  open: boolean;
  creatorId: string | null | undefined;
  onClose: () => void;
  /** Called after one or more files land in the staging bin. */
  onUploaded?: (uploadedCount: number) => void;
};

export default function PostingGoalUploadModal({
  open,
  creatorId,
  onClose,
  onUploaded,
}: Props) {
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUploadedCount(0);
    setUploadBusy(false);
  }, [open]);

  const handleClose = useCallback(() => {
    if (uploadBusy) return;
    onClose();
  }, [onClose, uploadBusy]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const cid = creatorId?.trim();
      if (!cid) {
        setError("Sign in to upload files to your Library.");
        return;
      }
      if (files.length === 0) return;
      setUploadBusy(true);
      setError(null);
      try {
        const { uploaded, errors } = await uploadFilesToRelayStaging({
          creatorId: cid,
          files,
        });
        if (uploaded.length > 0) {
          setUploadedCount((prev) => prev + uploaded.length);
          onUploaded?.(uploaded.length);
        }
        if (errors.length > 0) {
          setError(errors.join(" "));
        }
      } finally {
        setUploadBusy(false);
      }
    },
    [creatorId, onUploaded]
  );

  if (!open) return null;

  const readyForAutopost = uploadedCount > 0;

  return (
    <div
      className="library-shell fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Upload media to your bin"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--lib-border)_85%,transparent)] bg-[var(--lib-card)] shadow-2xl shadow-black/60">
        <div className="relative overflow-hidden border-b border-[var(--lib-border)] px-5 py-3.5">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[120px] w-[min(100%,360px)] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl"
            style={{
              background: "radial-gradient(ellipse at center, var(--lib-primary) 0%, transparent 70%)",
            }}
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2D6A4F]/30 bg-[#2D6A4F]/10 text-[#40916C]">
                <Target className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--lib-fg-muted)]">
                  Posting rhythm
                </p>
                <h2 className="truncate text-[13px] font-semibold tracking-tight text-[var(--lib-fg)]">
                  Drop a WIP into your bin
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={uploadBusy}
              className="rounded-md p-2 text-[var(--lib-fg-muted)] transition-colors hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)] disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm leading-relaxed text-[var(--lib-fg-muted)]">
            Upload a work-in-progress and Relay will stage it for Autopost — the same path your Library import
            station uses.
          </p>

          <div className="rounded-2xl border border-[var(--lib-border)] bg-black/25 p-4">
            <LibraryUploadZone
              onFiles={(files) => void handleFiles(files)}
              disabled={uploadBusy}
              helperText="Images, video, and audio upload straight into your staging bin."
            />
            {uploadBusy ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[var(--lib-fg-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Uploading to Relay…
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-red-800/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}

          {readyForAutopost ? (
            <div className="rounded-xl border border-[#2D6A4F]/35 bg-[color-mix(in_srgb,#2D6A4F_8%,var(--lib-card))] px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-[var(--lib-fg)]">
                <Upload className="h-4 w-4 text-[#40916C]" aria-hidden />
                {uploadedCount} file{uploadedCount === 1 ? "" : "s"} staged in your bin
              </p>
              <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
                Ready when you are — turn staged media into a quick Relay post.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-muted)_40%,var(--lib-card))] px-5 py-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploadBusy}
            className="rounded-lg border border-[var(--lib-border)] px-3 py-2 text-xs font-medium text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-fg)] disabled:opacity-50"
          >
            {readyForAutopost ? "Done" : "Not now"}
          </button>
          {readyForAutopost ? (
            <Link
              href="/studio/autopost"
              className="rounded-lg border border-[#2D6A4F]/45 bg-[#2D6A4F] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#40916C]"
            >
              Start Autopost
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

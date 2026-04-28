"use client";

import { useId, useState, type FormEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  putRelayNativeUpload,
  relayNativeCreatePost,
  relayNativeUploadCommit,
  relayNativeUploadInit
} from "@/lib/relay-api";
import { CreatorTierCatalogMultiselect } from "./CreatorTierCatalogMultiselect";

function guessContentType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  const n = file.name.toLowerCase();
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".mov")) return "video/quicktime";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".m4a")) return "audio/mp4";
  return "application/octet-stream";
}

export type CreatorRelayPostComposerProps = {
  creatorId: string;
  /** Shown as secondary text under success (e.g. link to Library). */
  successHint?: string;
};

/**
 * T-6.3 — presigned R2 upload (`init` → `PUT` → `commit`) then `POST /api/v1/relay/posts` with `media_ids`.
 */
export function CreatorRelayPostComposer({ creatorId, successHint }: CreatorRelayPostComposerProps) {
  const formId = useId();
  const titleId = `${formId}-title`;
  const descId = `${formId}-desc`;
  const fileId = `${formId}-file`;
  const tierSectionId = `${formId}-tiers`;
  const publicId = `${formId}-public`;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [tierIds, setTierIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPostId, setLastPostId] = useState<string | null>(null);

  const canSubmit =
    Boolean(creatorId.trim()) && title.trim().length > 0 && file != null && file.size > 0 && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLastPostId(null);
    if (!file || !creatorId.trim()) {
      return;
    }
    if (!isPublic && tierIds.length === 0) {
      setError("For a members-only post, select at least one access tier, or make the post public.");
      return;
    }
    const contentType = guessContentType(file);
    if (contentType === "application/octet-stream") {
      setError("Could not determine the file’s media type. Try a .mp4 or other common extension.");
      return;
    }

    setBusy(true);
    try {
      const init = await relayNativeUploadInit({
        creator_id: creatorId.trim(),
        content_type: contentType,
        byte_size: file.size
      });
      const ct = init.upload.headers["Content-Type"] ?? contentType;
      await putRelayNativeUpload(init.upload.url, file, ct);
      await relayNativeUploadCommit({
        creator_id: creatorId.trim(),
        media_id: init.media_id,
        content_type: contentType,
        byte_size: file.size
      });
      const created = await relayNativeCreatePost({
        creator_id: creatorId.trim(),
        title: title.trim(),
        description: description.trim() || null,
        is_public: isPublic,
        required_tier_id: null,
        tier_ids: isPublic ? [] : tierIds,
        tag_ids: [],
        media_ids: [init.media_id],
        publish: true
      });
      setLastPostId(created.post.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!creatorId.trim()) {
    return (
      <p className="text-center text-xs text-[var(--lib-fg-muted)]">
        Connect your studio (creator id) to upload and publish.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-5xl text-left">
      {lastPostId && (
        <p
          className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
          role="status"
        >
          Published post <span className="font-mono text-[11px]">{lastPostId}</span>.
          {successHint ? ` ${successHint}` : " Open the Library to see it in your grid."}
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={titleId} className="text-[11px] font-medium text-[var(--lib-fg-muted)]">
            Title
          </label>
          <input
            id={titleId}
            className="mt-1 w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-sm text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)]/70"
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            required
            maxLength={2000}
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={descId} className="text-[11px] font-medium text-[var(--lib-fg-muted)]">
            Description <span className="font-normal">(optional)</span>
          </label>
          <textarea
            id={descId}
            className="mt-1 min-h-[72px] w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-sm text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)]/70"
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            maxLength={20000}
          />
        </div>
        <div>
          <label htmlFor={fileId} className="text-[11px] font-medium text-[var(--lib-fg-muted)]">
            Media file
          </label>
          <div className="mt-1 flex items-center gap-2">
            <label
              htmlFor={fileId}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-xs font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50"
            >
              <Upload className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
              Choose file
            </label>
            <span className="min-w-0 truncate text-[11px] text-[var(--lib-fg-muted)]">
              {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MiB)` : "e.g. .mp4"}
            </span>
            <input
              id={fileId}
              type="file"
              className="sr-only"
              accept="video/*,image/*,audio/*"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
              }}
            />
          </div>
        </div>
        <div className="flex items-end">
          <div className="flex w-full items-center gap-2 rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)]/30 px-3 py-2">
            <input
              id={publicId}
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--lib-border)]"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={busy}
            />
            <label htmlFor={publicId} className="text-xs text-[var(--lib-fg)]">
              Public in gallery
            </label>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <h3
          id={tierSectionId}
          className="mb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--lib-fg)]"
        >
          Access tiers
        </h3>
        <p className="mb-2 text-[10px] text-[var(--lib-fg-muted)]">
          When <strong>Public</strong> is off, pick at least one tier. Ids are{" "}
          <code className="font-mono text-[10px]">Tier.id</code> from facets (same as{" "}
          <code className="font-mono text-[10px]">tier_ids</code> on the API).
        </p>
        <CreatorTierCatalogMultiselect
          creatorId={creatorId}
          value={tierIds}
          onChange={setTierIds}
          disabled={busy}
          aria-labelledby={tierSectionId}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--lib-primary)]/60 bg-[var(--lib-primary)]/20 px-4 text-xs font-semibold text-[var(--lib-fg)] enabled:hover:bg-[var(--lib-primary)]/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {busy ? "Uploading…" : "Upload & publish"}
        </button>
        <span className="text-[10px] text-[var(--lib-fg-muted)]">Flow: init → PUT to R2 → commit → create post</span>
      </div>
    </form>
  );
}

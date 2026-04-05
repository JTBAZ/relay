"use client";

import type {
  GalleryItem,
  GalleryPostDetail,
  PostVisibility,
  TierFacet
} from "@/lib/relay-api";

type Props = {
  preview: GalleryItem;
  previewDetail: GalleryPostDetail | null;
  accessTiers: TierFacet[];
  busy: boolean;
  onVisibility: (visibility: PostVisibility) => void;
};

export function InspectMetaSidebar({
  preview,
  previewDetail,
  accessTiers,
  busy,
  onVisibility
}: Props) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4 text-sm text-[var(--lib-fg)]">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--lib-fg)]">
          {previewDetail?.title ?? preview.title}
        </h2>
        <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
          {previewDetail?.published_at?.slice(0, 10) ?? preview.published_at.slice(0, 10)}
        </p>
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
          {preview.mime_type ?? "text"} · {preview.media_id}
        </p>
      </div>

      <div>
        <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">Tags</p>
        <div className="flex flex-wrap gap-1">
          {(previewDetail?.tag_ids ?? preview.tag_ids).map((t) => (
            <span key={t} className="rounded bg-[var(--lib-muted)] px-1.5 py-0.5 text-[10px] text-[var(--lib-fg-muted)]">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
          Patreon access
        </p>
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
          <p className="text-[11px] text-[var(--lib-fg-muted)]">No tier data ingested for this post.</p>
        )}
      </div>

      <div>
        <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
          Gallery visibility
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onVisibility("visible")}
            className="rounded border border-[color-mix(in_srgb,var(--lib-success)_45%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-success)_12%,var(--lib-card))] px-2.5 py-1 text-xs text-[var(--lib-fg)] hover:opacity-90 disabled:opacity-50"
          >
            To workspace
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onVisibility("review")}
            className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100/90 hover:bg-amber-500/15 disabled:opacity-50"
          >
            Review
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onVisibility("hidden")}
            className="rounded border border-[var(--lib-border)] bg-[var(--lib-muted)] px-2.5 py-1 text-xs text-[var(--lib-fg-muted)] hover:bg-[var(--lib-input)] disabled:opacity-50"
          >
            Hide
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
          Description
        </p>
        {previewDetail?.description ? (
          <div
            className="prose prose-invert prose-sm max-w-none text-[var(--lib-fg)]"
            dangerouslySetInnerHTML={{ __html: previewDetail.description }}
          />
        ) : (
          <p className="text-sm italic text-[var(--lib-fg-muted)]">No text content for this post.</p>
        )}
      </div>
    </div>
  );
}

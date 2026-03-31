"use client";

import { RELAY_API_BASE, type GalleryItem, type GalleryPostDetail } from "@/lib/relay-api";

type Props = {
  preview: GalleryItem;
  previewDetail: GalleryPostDetail | null;
  onClose: () => void;
};

export default function InspectModal({ preview, previewDetail, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-8"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="max-w-[92vw] max-h-[90vh] overflow-auto grid lg:grid-cols-[minmax(360px,1fr)_340px] gap-4 items-start"
        onClick={(e) => e.stopPropagation()}
      >
        {preview.has_export && preview.mime_type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${RELAY_API_BASE}${preview.content_url_path}`}
            alt={preview.title}
            className="max-w-full max-h-[85vh] rounded shadow-2xl border border-[#3d342b]"
          />
        ) : preview.has_export && preview.mime_type?.startsWith("video/") ? (
          <video
            src={`${RELAY_API_BASE}${preview.content_url_path}`}
            controls
            className="max-w-full max-h-[85vh] rounded shadow-2xl border border-[#3d342b]"
          />
        ) : preview.has_export && preview.mime_type?.startsWith("audio/") ? (
          <div className="flex flex-col items-center justify-center gap-4 p-8 rounded border border-[#3d342b] bg-[#1a1410]">
            <svg className="w-16 h-16 text-[#8a7f72]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <audio
              src={`${RELAY_API_BASE}${preview.content_url_path}`}
              controls
              className="w-full max-w-md"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-8 rounded border border-[#3d342b] bg-[#1a1410] text-[#8a7f72]">
            <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm">{preview.mime_type ?? "Unknown type"}</p>
            <p className="text-[#f0e6d8]">{preview.title}</p>
          </div>
        )}
        <aside className="rounded border border-[#3d342b] bg-[#161210] p-4 text-sm text-[#d8cebf]">
          <h3 className="font-[family-name:var(--font-display)] text-xl text-[#f5ebe0]">
            {previewDetail?.title ?? preview.title}
          </h3>
          <p className="mt-1 text-xs text-[#8a7f72]">
            {previewDetail?.published_at?.slice(0, 10) ?? preview.published_at.slice(0, 10)}
          </p>
          <p className="mt-2 text-xs text-[#8a7f72]">
            {preview.mime_type ?? "text"} · {preview.media_id}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            {(previewDetail?.tag_ids ?? preview.tag_ids).map((t) => (
              <span key={t} className="text-[10px] px-1.5 bg-[#2a221c] rounded">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {(previewDetail?.tiers ?? []).map((tier) => (
              <span key={tier.tier_id} className="text-[10px] px-1.5 rounded border border-[#4a3f36]">
                {tier.title}
              </span>
            ))}
          </div>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-[#8a7f72] mb-1">Description</p>
            {previewDetail?.description ? (
              <div
                className="prose prose-invert prose-sm max-w-none text-[#ede5da]"
                dangerouslySetInnerHTML={{ __html: previewDetail.description }}
              />
            ) : (
              <p className="text-[#8a7f72] text-sm">Description unavailable for this post.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

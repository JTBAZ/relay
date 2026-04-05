"use client";

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import {
  type GalleryItem,
  type GalleryPostDetail,
  type PostVisibility,
  type TierFacet
} from "@/lib/relay-api";
import { InspectAssetPreview } from "./inspect/inspect-asset-preview";
import { InspectMetaSidebar } from "./inspect/inspect-meta-sidebar";
import { InspectSmartTagPanel } from "./inspect/inspect-smart-tag-panel";

type Props = {
  preview: GalleryItem;
  previewDetail: GalleryPostDetail | null;
  onClose: () => void;
  onVisibilityApplied: () => void;
  onVisibilityError?: (message: string) => void;
  setItemVisibility: (items: GalleryItem[], visibility: PostVisibility) => Promise<void>;
};

export default function InspectModal({
  preview,
  previewDetail,
  onClose,
  onVisibilityApplied,
  onVisibilityError,
  setItemVisibility
}: Props) {
  const [busy, setBusy] = useState(false);

  const accessTiers: TierFacet[] =
    previewDetail && previewDetail.tiers.length > 0
      ? previewDetail.tiers
      : preview.tier_ids.map((tier_id) => ({
          tier_id,
          title: tier_id.startsWith("patreon_tier_")
            ? tier_id.slice("patreon_tier_".length)
            : tier_id.startsWith("relay_tier_")
              ? tier_id.slice("relay_tier_".length)
              : tier_id
        }));

  const applyVis = useCallback(
    async (visibility: PostVisibility) => {
      setBusy(true);
      try {
        await setItemVisibility([preview], visibility);
        onVisibilityApplied();
      } catch (e) {
        onVisibilityError?.(
          e instanceof Error ? e.message : String(e)
        );
      } finally {
        setBusy(false);
      }
    },
    [preview, setItemVisibility, onVisibilityApplied, onVisibilityError]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal
      aria-label={`Inspect: ${preview.title}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--lib-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-[var(--lib-fg-muted)]">Creator Library</p>
            <p className="truncate text-sm font-medium text-[var(--lib-fg)]">{previewDetail?.title ?? preview.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-[220px] flex-1 items-center justify-center bg-[var(--lib-bg)] lg:min-h-0">
            <InspectAssetPreview item={preview} />
          </div>

          <aside className="flex w-full shrink-0 flex-col border-t border-[var(--lib-border)] lg:w-[360px] lg:border-l lg:border-t-0">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <InspectMetaSidebar
                preview={preview}
                previewDetail={previewDetail}
                accessTiers={accessTiers}
                busy={busy}
                onVisibility={applyVis}
              />
            </div>
            <InspectSmartTagPanel />
          </aside>
        </div>
      </div>
    </div>
  );
}

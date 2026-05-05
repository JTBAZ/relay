"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  type GalleryItem,
  type GalleryPostDetail,
  type TierFacet
} from "@/lib/relay-api";
import { InspectMetaSidebar } from "./inspect/inspect-meta-sidebar";
import {
  AudiencePreviewControls,
  PostAudiencePreviewCard,
  audienceCanView,
  buildAudienceOptions,
  type AudiencePreviewPreference,
  type PreviewStyle
} from "./inspect/post-audience-preview";

type Props = {
  preview: GalleryItem;
  previewDetail: GalleryPostDetail | null;
  creatorId: string;
  onPresentationUpdated: () => Promise<void>;
  onClose: () => void;
};

export default function InspectModal({
  preview,
  previewDetail,
  creatorId,
  onPresentationUpdated,
  onClose
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [activeAudienceId, setActiveAudienceId] = useState("free");
  const [previewStyle, setPreviewStyle] = useState<PreviewStyle>("default");
  const [ctaText, setCtaText] = useState("Unlock this post");
  const [audiencePreferences, setAudiencePreferences] = useState<Record<string, AudiencePreviewPreference>>({});

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

  const audienceOptions = useMemo(() => buildAudienceOptions(accessTiers), [accessTiers]);
  const activeAudience = audienceOptions.find((option) => option.id === activeAudienceId) ?? audienceOptions[0]!;
  const activeAudienceCanView = audienceCanView(preview, activeAudience.id, audienceOptions);

  const changeAudience = useCallback(
    (id: string) => {
      setActiveAudienceId(id);
      const preference = audiencePreferences[id];
      if (preference) {
        setPreviewStyle(preference.previewStyle);
        setCtaText(preference.ctaText);
      }
    },
    [audiencePreferences]
  );

  const saveAudiencePreference = useCallback(() => {
    setAudiencePreferences((current) => ({
      ...current,
      [activeAudience.id]: {
        previewStyle,
        ctaText,
        locked: true
      }
    }));
  }, [activeAudience.id, ctaText, previewStyle]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const modal = (
    <div
      className="library-shell fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 text-[var(--lib-fg)] backdrop-blur-[2px]"
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
          <div className="flex min-h-[360px] flex-1 bg-[var(--lib-bg)] lg:min-h-0">
            <PostAudiencePreviewCard
              item={preview}
              postDetail={previewDetail}
              audience={activeAudience}
              canView={activeAudienceCanView}
              previewStyle={previewStyle}
              ctaText={ctaText}
            />
          </div>

          <aside className="flex w-full shrink-0 flex-col border-t border-[var(--lib-border)] lg:w-[360px] lg:border-l lg:border-t-0">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AudiencePreviewControls
                item={preview}
                audienceOptions={audienceOptions}
                activeAudienceId={activeAudience.id}
                onAudienceChange={changeAudience}
                previewStyle={previewStyle}
                onPreviewStyleChange={setPreviewStyle}
                ctaText={ctaText}
                onCtaTextChange={setCtaText}
                savedPreferences={audiencePreferences}
                onSavePreference={saveAudiencePreference}
              />
              <InspectMetaSidebar
                preview={preview}
                previewDetail={previewDetail}
                accessTiers={accessTiers}
                creatorId={creatorId}
                postId={preview.post_id}
                onPresentationUpdated={onPresentationUpdated}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(modal, document.body) : null;
}

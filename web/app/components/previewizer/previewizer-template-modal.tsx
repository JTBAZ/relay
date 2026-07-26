"use client";

import { useMemo } from "react";
import { PreviewizerStudioCanvas } from "./previewizer-studio-canvas";
import {
  ACTIVE_COMPOSITION_TEMPLATES,
  applyCompositionTemplate,
  getCompositionTemplateMeta,
  type CompositionTemplateId
} from "./previewizer-template-compositions";
import {
  ASPECT_OUTPUT,
  reshapeSelectionToAspect
} from "./previewizer-presets";

type Props = {
  open: boolean;
  imageEl: HTMLImageElement | null;
  onSelectTemplate: (id: CompositionTemplateId) => void;
  onStartBlank: () => void;
};

function TemplatePreviewCard({
  templateId,
  imageEl,
  onSelect
}: {
  templateId: CompositionTemplateId;
  imageEl: HTMLImageElement;
  onSelect: () => void;
}) {
  const applied = useMemo(() => {
    const base = applyCompositionTemplate(templateId);
    if (templateId !== "blur_plug") return base;
    const imgAspect =
      imageEl.naturalHeight > 0 ? imageEl.naturalWidth / imageEl.naturalHeight : 1;
    return {
      ...base,
      selection: reshapeSelectionToAspect(base.selection, base.aspectKey, imgAspect)
    };
  }, [templateId, imageEl]);
  const meta = getCompositionTemplateMeta(templateId);
  const outputSize = ASPECT_OUTPUT[applied.aspectKey];
  const aspectClass =
    applied.aspectKey === "1:1" ? "aspect-square" : "aspect-[4/5]";

  const blurCropUrl = useMemo(() => {
    if (templateId !== "blur_plug") return null;
    return imageEl.src;
  }, [templateId, imageEl]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] text-left transition-all hover:border-[#00aa6f] hover:shadow-[0_0_24px_rgba(0,170,111,0.15)]"
    >
      <div className={`relative w-full overflow-hidden bg-[#111] ${aspectClass}`}>
        <PreviewizerStudioCanvas
          imageEl={imageEl}
          preset={applied.preset}
          selection={applied.selection}
          aspectKey={applied.aspectKey}
          outputSize={outputSize}
          overlayDoc={applied.overlayDoc}
          platformId="patreon"
          compositionId={applied.compositionId}
          compositionProps={applied.compositionProps}
          compositionImageSrc={blurCropUrl}
          compositionFocalX={50}
          compositionFocalY={50}
          compositionCropRect={templateId === "blur_plug" ? applied.selection : null}
          onSelectionChange={() => {}}
          compact
        />
      </div>
      <div className="border-t border-[#1a1a1a] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#f9fafb]">{meta.label}</span>
          <span className="rounded-full border border-[#2a2a2a] px-2 py-0.5 text-[10px] font-medium text-[#9bf0c4]">
            {meta.badge}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-[#6b7280]">{meta.description}</p>
      </div>
    </button>
  );
}

export function PreviewizerTemplateModal({ open, imageEl, onSelectTemplate, onStartBlank }: Props) {
  if (!open || !imageEl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.92)] p-6 backdrop-blur-sm">
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] shadow-2xl">
        <div className="border-b border-[#1a1a1a] px-6 py-5">
          <h2 className="text-lg font-bold text-[#f9fafb]">Blur Plug</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            General-use blur teaser. Open the studio to edit content and framing.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ACTIVE_COMPOSITION_TEMPLATES.map((t) => (
              <TemplatePreviewCard
                key={t.id}
                templateId={t.id}
                imageEl={imageEl}
                onSelect={() => onSelectTemplate(t.id)}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#1a1a1a] px-6 py-4">
          <p className="text-sm text-[#6b7280]">Opens Blur Plug studio</p>
          <button
            type="button"
            onClick={onStartBlank}
            className="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-2 text-sm font-medium text-[#9ca3af] hover:border-[#3a3a3a] hover:text-[#f9fafb]"
          >
            Start blank
          </button>
        </div>
      </div>
    </div>
  );
}

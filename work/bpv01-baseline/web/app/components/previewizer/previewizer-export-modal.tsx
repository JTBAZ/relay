"use client";

import { Download, Loader2, Upload, X } from "lucide-react";
import { PRESET_LABELS } from "./previewizer-presets";
import type { PreviewizerMode } from "@/lib/previewizer-session";
import { MAX_CUSTOM_PREVIEW_TEMPLATES } from "@/lib/previewizer-template-config";

export type PreviewTemplateSlotOption = {
  template_id: string;
  name: string;
};

type Props = {
  open: boolean;
  previewUrl: string | null;
  outputLabel: string;
  presetLabel: string;
  templateLabel: string | null;
  exportBusy: boolean;
  mode?: PreviewizerMode;
  uploadBusy?: boolean;
  uploadError?: string | null;
  /** Distribution-only: offer save-as-template checkbox. */
  allowSaveTemplate?: boolean;
  saveTemplateChecked?: boolean;
  saveTemplateName?: string;
  saveTemplateSlotsUsed?: number;
  saveTemplateOptions?: PreviewTemplateSlotOption[];
  replaceTemplateId?: string | null;
  templateSaveError?: string | null;
  templateSaveBusy?: boolean;
  onSaveTemplateCheckedChange?: (checked: boolean) => void;
  onSaveTemplateNameChange?: (name: string) => void;
  onReplaceTemplateIdChange?: (id: string | null) => void;
  onClose: () => void;
  onDownload: (format: "jpeg" | "png") => void;
  onUseAsPreview?: () => void;
};

export function PreviewizerExportModal({
  open,
  previewUrl,
  outputLabel,
  presetLabel,
  templateLabel,
  exportBusy,
  mode = "standalone",
  uploadBusy = false,
  uploadError = null,
  allowSaveTemplate = false,
  saveTemplateChecked = false,
  saveTemplateName = "",
  saveTemplateSlotsUsed = 0,
  saveTemplateOptions = [],
  replaceTemplateId = null,
  templateSaveError = null,
  templateSaveBusy = false,
  onSaveTemplateCheckedChange,
  onSaveTemplateNameChange,
  onReplaceTemplateIdChange,
  onClose,
  onDownload,
  onUseAsPreview
}: Props) {
  if (!open) return null;

  const isHostedExport = mode === "distribution";
  const busy = exportBusy || uploadBusy || templateSaveBusy;
  const atCapacity = saveTemplateSlotsUsed >= MAX_CUSTOM_PREVIEW_TEMPLATES;
  const saveBlocked =
    allowSaveTemplate &&
    saveTemplateChecked &&
    (!saveTemplateName.trim() || (atCapacity && !replaceTemplateId));

  const savePanel =
    allowSaveTemplate && onSaveTemplateCheckedChange ? (
      <div className="space-y-2 rounded-xl border border-[#2a2a2a] bg-[#111] p-3">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 accent-[#00aa6f]"
            checked={saveTemplateChecked}
            disabled={busy}
            onChange={(e) => onSaveTemplateCheckedChange(e.target.checked)}
          />
          <span className="text-xs leading-snug text-[#f9fafb]">
            Also save these settings as a template
            <span className="mt-0.5 block text-[10px] text-[#6b7280]">
                          {saveTemplateSlotsUsed}/{MAX_CUSTOM_PREVIEW_TEMPLATES} slots used · overlay &
              QR settings (not crop)
            </span>
          </span>
        </label>
        {saveTemplateChecked ? (
          <div className="space-y-2 pl-5">
            <input
              type="text"
              value={saveTemplateName}
              disabled={busy}
              maxLength={80}
              placeholder="Template name"
              onChange={(e) => onSaveTemplateNameChange?.(e.target.value)}
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-2.5 py-1.5 text-xs text-[#f9fafb] placeholder:text-[#6b7280]"
            />
            {atCapacity ? (
              <div className="space-y-1.5">
                <p className="text-[10px] text-[#9ca3af]">
                  All 3 slots full — pick one to replace:
                </p>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {saveTemplateOptions.map((opt) => (
                    <label
                      key={opt.template_id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-[#2a2a2a] px-2 py-1.5 text-[11px] text-[#f9fafb] hover:border-[#3a3a3a]"
                    >
                      <input
                        type="radio"
                        name="replace-preview-template"
                        className="accent-[#00aa6f]"
                        checked={replaceTemplateId === opt.template_id}
                        disabled={busy}
                        onChange={() => onReplaceTemplateIdChange?.(opt.template_id)}
                      />
                      <span className="truncate">{opt.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {templateSaveError ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">
            {templateSaveError}
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.85)] p-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1a1a1a] px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#f9fafb]">
              {isHostedExport ? "Save preview" : "Export preview"}
            </h2>
            <p className="mt-0.5 text-sm text-[#6b7280]">
              {outputLabel}
              {templateLabel ? ` · ${templateLabel}` : ""} · {presetLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#2a2a2a] p-2 text-[#9ca3af] hover:border-[#3a3a3a] hover:text-[#f9fafb]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 lg:flex-row">
          <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#111]">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Export preview" className="max-h-[50vh] w-full object-contain" />
            ) : (
              <p className="text-sm text-[#6b7280]">Rendering preview…</p>
            )}
          </div>
          <div className="flex flex-col gap-3 lg:w-64">
            {savePanel}
            {isHostedExport && onUseAsPreview ? (
              <>
                <button
                  type="button"
                  disabled={busy || !previewUrl || Boolean(saveBlocked)}
                  onClick={onUseAsPreview}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00aa6f] px-4 py-3 text-sm font-bold text-black disabled:opacity-50"
                >
                  {uploadBusy || templateSaveBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden />
                  )}
                  Use as preview
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !previewUrl || Boolean(saveBlocked && saveTemplateChecked)}
                    onClick={() => onDownload("jpeg")}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#2a2a2a] bg-[#111] px-3 py-2.5 text-xs font-semibold text-[#f9fafb] disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    JPEG
                  </button>
                  <button
                    type="button"
                    disabled={busy || !previewUrl || Boolean(saveBlocked && saveTemplateChecked)}
                    onClick={() => onDownload("png")}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#2a2a2a] bg-[#111] px-3 py-2.5 text-xs font-semibold text-[#f9fafb] disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    PNG
                  </button>
                </div>
                {uploadError ? (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">
                    {uploadError}
                  </p>
                ) : null}
                <p className="text-xs leading-relaxed text-[#6b7280]">
                  Upload sends this to Relay for cross-post preview routing. Download keeps a local
                  copy.
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy || !previewUrl}
                  onClick={() => onDownload("jpeg")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00aa6f] px-4 py-3 text-sm font-bold text-black disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Download JPEG
                </button>
                <button
                  type="button"
                  disabled={busy || !previewUrl}
                  onClick={() => onDownload("png")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 text-sm font-semibold text-[#f9fafb] disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Download PNG
                </button>
                <p className="text-xs leading-relaxed text-[#6b7280]">
                  Confirm this matches what you see on canvas before saving.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { PRESET_LABELS };

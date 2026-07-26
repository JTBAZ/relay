"use client";

import { Loader2, Trash2, X } from "lucide-react";
import { getCompositionTemplateMeta, type CompositionTemplateId } from "./previewizer-template-compositions";
import type { PreviewTemplateWire } from "@/lib/previewizer-api";
import { MAX_CUSTOM_PREVIEW_TEMPLATES } from "@/lib/previewizer-template-config";

type Props = {
  open: boolean;
  templates: PreviewTemplateWire[];
  loading: boolean;
  error: string | null;
  applyingId: string | null;
  deletingId: string | null;
  onClose: () => void;
  onApply: (template: PreviewTemplateWire) => void;
  onDelete: (template: PreviewTemplateWire) => void;
};

const KNOWN_COMPOSITION_IDS = new Set<string>([
  "blur_plug",
  "bottom_blur_paywall",
  "mystery_crop",
  "cinematic_eyes",
  "frosted_glass_card",
  "collage_windows"
]);

function compositionLabel(config: Record<string, unknown>): string {
  const id = config.compositionId;
  if (typeof id !== "string" || !id) return "Blank / graphics";
  if (!KNOWN_COMPOSITION_IDS.has(id)) return id;
  return getCompositionTemplateMeta(id as CompositionTemplateId).label;
}

export function PreviewizerMyTemplatesModal({
  open,
  templates,
  loading,
  error,
  applyingId,
  deletingId,
  onClose,
  onApply,
  onDelete
}: Props) {
  if (!open) return null;

  const busy = Boolean(applyingId || deletingId);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.85)] p-6 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1a1a1a] px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#f9fafb]">My templates</h2>
            <p className="mt-0.5 text-sm text-[#6b7280]">
              {templates.length}/{MAX_CUSTOM_PREVIEW_TEMPLATES} saved · applies overlay settings, not
              crop
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

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#6b7280]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          ) : templates.length === 0 ? (
            <p className="py-8 text-center text-sm leading-relaxed text-[#6b7280]">
              No saved templates yet. On Export, check{" "}
              <span className="text-[#9ca3af]">Also save these settings as a template</span> after
              you like a look.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl) => {
                const applying = applyingId === tpl.template_id;
                const deleting = deletingId === tpl.template_id;
                return (
                  <li
                    key={tpl.template_id}
                    className="flex items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#111] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#f9fafb]">{tpl.name}</p>
                      <p className="truncate text-[11px] text-[#6b7280]">
                        {compositionLabel(tpl.config)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onApply(tpl)}
                      className="rounded-lg bg-[#00aa6f] px-2.5 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                    >
                      {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete template “${tpl.name}”? This cannot be undone.`
                          )
                        ) {
                          onDelete(tpl);
                        }
                      }}
                      className="rounded-lg border border-[#2a2a2a] p-1.5 text-[#9ca3af] hover:border-red-500/40 hover:text-red-200 disabled:opacity-50"
                      aria-label={`Delete ${tpl.name}`}
                    >
                      {deleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  getCompositionVariantAccent,
  getCompositionVariants,
  type CompositionTemplateId
} from "./previewizer-template-compositions";

type Props = {
  compositionId: CompositionTemplateId;
  activeVariantIndex: number | null;
  onSelectVariant: (index: number) => void;
  embedded?: boolean;
  hideLabel?: boolean;
};

const ACTIVE_CLASS: Record<
  ReturnType<typeof getCompositionVariantAccent>,
  string
> = {
  "purple-teal":
    "border-[#7C3AED] bg-gradient-to-br from-[#7C3AED] to-[#0D9488] text-white",
  orange: "border-[#EA580C] bg-gradient-to-br from-[#EA580C] to-[#FB923C] text-white",
  patreon: "border-[#F96854] bg-[#F96854] text-white"
};

export function PreviewizerCompositionVariants({
  compositionId,
  activeVariantIndex,
  onSelectVariant,
  embedded = false,
  hideLabel = false
}: Props) {
  const variants = getCompositionVariants(compositionId);
  const accent = getCompositionVariantAccent(compositionId);
  const activeClass = ACTIVE_CLASS[accent];

  return (
    <div
      className={
        embedded
          ? hideLabel
            ? "flex flex-wrap gap-2"
            : "mb-3 space-y-2"
          : "mb-3 flex flex-wrap items-center gap-2 border-b border-[#1a1a1a] pb-3"
      }
    >
      {!hideLabel ? (
        <span className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
          Text preset
        </span>
      ) : null}
      <div className={embedded ? "flex flex-wrap gap-2" : "contents"}>
        {variants.map((variant, index) => {
          const active = activeVariantIndex === index;
          return (
            <button
              key={variant.label}
              type="button"
              onClick={() => onSelectVariant(index)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
                active
                  ? activeClass
                  : "border-[#2a2a2a] bg-[#111] text-[#9ca3af] hover:border-[#3a3a3a] hover:text-[#f9fafb]"
              }`}
            >
              {variant.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

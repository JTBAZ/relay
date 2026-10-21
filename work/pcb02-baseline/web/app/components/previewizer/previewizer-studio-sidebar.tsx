"use client";

import {
  BUNDLED_LOGOS,
  PLATFORM_URL_DEFAULTS,
  createLogoLayer,
  createTextLayerFromTemplate,
  type LogoBucketItem,
  type OverlayDocument,
  type TextTemplateId
} from "./previewizer-overlay-layers";
import {
  BLUR_PLUG_ANCHORS,
  BLUR_PLUG_BLUR_TYPES,
  BLUR_PLUG_BORDER_STYLES,
  BLUR_PLUG_HANDLE_SIZES,
  BLUR_PLUG_PLATFORMS,
  BLUR_PLUG_QR_LAYER_ID,
  BLUR_PLUG_QR_SIZES,
  BLUR_PLUG_REVEAL_SHAPES,
  BLUR_PLUG_STAMP_FONTS,
  BLUR_PLUG_STAMP_STYLES,
  BLUR_PLUG_TEXT_SIZES,
  CINEMATIC_EYES_BAR_SCALES,
  FROSTED_GLASS_CARD_SCALES,
  MYSTERY_CROP_LOCKUP_SCALES,
  compositionAllowsAspectSwitch,
  getCompositionPlatformUrlSlot,
  createBlurPlugStamp,
  normalizeBlurPlugQrStamp,
  removeBlurPlugStamp,
  toggleBlurPlugBorderStyle,
  updateBlurPlugStamp,
  type BlurPlugAnchor,
  type BlurPlugBorderEffect,
  type BlurPlugBlurType,
  type BlurPlugPlatform,
  type BlurPlugProps,
  type BlurPlugQrSize,
  type BlurPlugRevealShape,
  type BlurPlugStamp,
  type BlurPlugStampFont,
  type BlurPlugStampStyle,
  type BlurPlugTextSize,
  type CinematicEyesBarScale,
  type CinematicEyesProps,
  type CollageWindowsProps,
  type CompositionPropsById,
  type CompositionTemplateId,
  type FrostedGlassCardProps,
  type FrostedGlassCardScale,
  type MysteryCropLockupScale,
  type MysteryCropProps
} from "./previewizer-template-compositions";
import {
  PROMO_COPY_PRESETS,
  PROMO_GRAPHIC_META,
  supportsTitleField,
  type DesignTemplateOptions
} from "./previewizer-design-templates";
import { v0FontToKey } from "./previewizer-graphic-placement";
import { PreviewizerCompositionVariants } from "./previewizer-composition-variants";
import { PreviewizerHueWheel } from "./previewizer-hue-wheel";
import { PreviewizerV0GraphicPicker } from "./previewizer-v0-graphic-picker";
import { type AspectRatioKey, type NormalizedRect, type PresetId } from "./previewizer-presets";
import type { PromoGraphicId } from "./previewizer-v0-promo-graphics";
import type {
  PreviewizerLinkDestination,
  PreviewizerLinkPlatformId
} from "@/lib/previewizer-link-destinations";
import { compositionSupportsDestinationQr } from "@/lib/previewizer-link-destinations";

export type StudioSidebarTab = "templates" | "photo" | "graphics" | "content";

type Props = {
  tab: StudioSidebarTab;
  imageUrl: string | null;
  compositionId: CompositionTemplateId | null;
  compositionProps: CompositionPropsById[CompositionTemplateId] | null;
  compositionVariantIndex: number | null;
  templateOptions: DesignTemplateOptions;
  aspectKey: AspectRatioKey;
  preset: PresetId;
  selection: NormalizedRect;
  customLogos: LogoBucketItem[];
  outputWidth: number;
  outputHeight: number;
  selectedLayerId: string | null;
  selectedStampId?: string | null;
  overlayDoc: OverlayDocument;
  onTabChange: (tab: StudioSidebarTab) => void;
  onCompositionPropsChange: (patch: Partial<CompositionPropsById[CompositionTemplateId]>) => void;
  onSelectCompositionVariant: (index: number) => void;
  onOptionsChange: (patch: Partial<DesignTemplateOptions>) => void;
  onPresetChange: (preset: PresetId) => void;
  onSelectionChange: (sel: NormalizedRect) => void;
  onAddGraphic: (graphicId: PromoGraphicId) => void;
  onCustomLogoAdded: (item: LogoBucketItem) => void;
  onDocumentChange: (doc: OverlayDocument | ((prev: OverlayDocument) => OverlayDocument)) => void;
  onSelectLayerId: (id: string | null) => void;
  onSelectStampId?: (id: string | null) => void;
  onResetComposition: () => void;
  onResetCompositionFraming: () => void;
  onAspectChange?: (aspect: AspectRatioKey) => void;
  linkDestinations?: PreviewizerLinkDestination[];
  selectedDestinationId?: PreviewizerLinkPlatformId;
  customDestinationUrl?: string;
  destinationsLoading?: boolean;
  qrSrc?: string | null;
  onSelectLinkDestination?: (id: PreviewizerLinkPlatformId) => void;
  onCustomDestinationUrlChange?: (url: string) => void;
};

const TABS: { id: StudioSidebarTab; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "graphics", label: "Graphics" }
];

export function PreviewizerStudioSidebar({
  tab,
  compositionId,
  compositionProps,
  compositionVariantIndex,
  templateOptions,
  aspectKey,
  customLogos,
  outputWidth,
  outputHeight,
  selectedLayerId,
  selectedStampId = null,
  overlayDoc,
  onTabChange,
  onCompositionPropsChange,
  onSelectCompositionVariant,
  onOptionsChange,
  onAddGraphic,
  onCustomLogoAdded,
  onDocumentChange,
  onSelectLayerId,
  onSelectStampId,
  onAspectChange,
  linkDestinations = [],
  selectedDestinationId = "custom",
  customDestinationUrl = "",
  destinationsLoading = false,
  qrSrc = null,
  onSelectLinkDestination,
  onCustomDestinationUrlChange
}: Props) {
  const allLogos = [...BUNDLED_LOGOS, ...customLogos];

  const selectedLayer = overlayDoc.graphicLayers?.find((l) => l.id === selectedLayerId) ?? null;
  const isPromoLayer = selectedLayer?.layerRole === "promo";
  const isBrandingLayer = selectedLayer?.graphicId === "platform_lockup";
  const selectedGraphic =
    templateOptions.promoGraphic ??
    (selectedLayer?.layerRole === "promo" ? selectedLayer.graphicId : "sticker_outline");

  function addLogo(item: LogoBucketItem) {
    const layer = createLogoLayer(item, outputWidth, outputHeight);
    onDocumentChange((prev) => ({ ...prev, logoLayers: [...prev.logoLayers, layer] }));
    onSelectLayerId(layer.id);
  }

  function addText(template: TextTemplateId) {
    const layer = createTextLayerFromTemplate(template, outputWidth, outputHeight, overlayDoc.textLayers.length);
    onDocumentChange((prev) => ({ ...prev, textLayers: [...prev.textLayers, layer] }));
    onSelectLayerId(layer.id);
  }

  function onCustomLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const item: LogoBucketItem = {
      id: `custom-${Date.now()}` as LogoBucketItem["id"],
      label: file.name.replace(/\.[^.]+$/, "") || "Custom",
      src: url
    };
    onCustomLogoAdded(item);
    addLogo(item);
    e.target.value = "";
  }

  const visibleTabs = compositionId ? TABS.filter((t) => t.id !== "graphics") : TABS;
  const showTabNav = visibleTabs.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-[#1a1a1a] bg-[#0a0a0a]">
      {showTabNav ? (
        <nav className="flex shrink-0 border-b border-[#1a1a1a]" aria-label="Studio tabs">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`flex-1 px-1 py-3 text-xs font-medium transition-colors ${
                tab === t.id
                  ? "border-b-2 border-[#00aa6f] text-[#9bf0c4]"
                  : "text-[#6b7280] hover:text-[#9ca3af]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      <div
        data-previewizer-sidebar-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
      >
        {tab === "graphics" && !compositionId ? (
          <PreviewizerV0GraphicPicker
            selected={selectedLayer?.graphicId ?? "sticker_outline"}
            promoText={
              isBrandingLayer
                ? templateOptions.platformUrl ?? PLATFORM_URL_DEFAULTS[templateOptions.platformId]
                : templateOptions.promoText ?? "30% OFF"
            }
            platform={templateOptions.platformId}
            onSelect={(graphicId) => {
              if (isPromoLayer && graphicId !== "platform_lockup") {
                onOptionsChange({
                  promoGraphic: graphicId,
                  hookFont: v0FontToKey(PROMO_GRAPHIC_META[graphicId].defaultFont)
                });
              } else {
                onAddGraphic(graphicId);
              }
            }}
          />
        ) : tab === "graphics" && compositionId ? (
          <p className="text-sm text-[#6b7280]">
            Template overlays are self-contained. Use Content to edit text, or start blank to add
            promo graphics.
          </p>
        ) : null}

        {tab === "content" || (!showTabNav && compositionId) ? (
          <div className="space-y-3">
            {compositionId && compositionProps ? (
              <>
                <section className="space-y-3 rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] p-3">
                  <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#9bf0c4]">
                    Compose
                  </h3>
                  <div>
                    <p className="mb-2 text-xs text-[#6b7280]">Text preset</p>
                    <PreviewizerCompositionVariants
                      embedded
                      hideLabel
                      compositionId={compositionId}
                      activeVariantIndex={compositionVariantIndex}
                      onSelectVariant={onSelectCompositionVariant}
                    />
                  </div>
                  {compositionAllowsAspectSwitch(compositionId) && onAspectChange ? (
                    <div className="border-t border-[#1a1a1a] pt-3">
                      <p className="mb-2 text-xs text-[#6b7280]">Aspect ratio</p>
                      <div className="flex gap-2">
                        {(["1:1", "4:5", "9:16"] as const).map((ratio) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => onAspectChange(ratio)}
                            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                              aspectKey === ratio
                                ? "border-[#7C3AED] bg-[rgba(124,58,237,0.2)] text-[#c4b5fd]"
                                : "border-[#2a2a2a] bg-[#0a0a0a] text-[#9ca3af] hover:border-[#3a3a3a]"
                            }`}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
                {compositionSupportsDestinationQr(compositionId) &&
                compositionId !== "blur_plug" ? (
                  <div className="space-y-3 rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] p-3">
                    <div>
                      <p className="text-sm text-[#9ca3af]">Link destination</p>
                      <p className="mt-0.5 text-[11px] text-[#6b7280]">
                        QR encodes this URL on templates that show a platform link.
                      </p>
                      {destinationsLoading ? (
                        <p className="mt-2 text-[11px] text-[#6b7280]">Loading connected links…</p>
                      ) : null}
                      <div className="mt-2 space-y-1.5">
                        {linkDestinations.map((dest) => {
                          const selected = selectedDestinationId === dest.id;
                          const disabled = !dest.available && dest.id !== "custom";
                          return (
                            <label
                              key={dest.id}
                              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                                selected
                                  ? "border-[#00aa6f]/60 bg-[rgba(0,170,111,0.12)]"
                                  : "border-[#2a2a2a] bg-[#0a0a0a]"
                              } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
                            >
                              <input
                                type="radio"
                                name="previewizer-link-destination"
                                className="mt-1"
                                checked={selected}
                                disabled={disabled}
                                onChange={() => onSelectLinkDestination?.(dest.id)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium text-[#f9fafb]">{dest.label}</span>
                                <span className="block truncate text-[11px] text-[#6b7280]">
                                  {disabled
                                    ? dest.id === "patreon"
                                      ? "Sync Patreon to auto-fill"
                                      : "Not connected"
                                    : dest.displayText || "Enter a URL"}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    {(() => {
                      const platformUrlSlot = getCompositionPlatformUrlSlot(compositionId);
                      const fieldKey =
                        platformUrlSlot?.key ??
                        (compositionId === "collage_windows" ||
                        compositionId === "mystery_crop" ||
                        compositionId === "cinematic_eyes"
                          ? "platformUrl"
                          : null);
                      if (!fieldKey) return null;
                      const value = String(
                        compositionProps[fieldKey as keyof typeof compositionProps] ?? ""
                      );
                      return (
                        <label className="block">
                          <span className="text-sm text-[#9ca3af]">
                            {platformUrlSlot?.label ?? "Platform URL"}
                          </span>
                          <input
                            type="text"
                            value={value}
                            placeholder={platformUrlSlot?.placeholder ?? "patreon.com/you"}
                            onChange={(e) => {
                              const next = e.target.value;
                              onCompositionPropsChange({ [fieldKey]: next });
                              onSelectLinkDestination?.("custom");
                              onCustomDestinationUrlChange?.(next);
                            }}
                            className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f9fafb]"
                          />
                        </label>
                      );
                    })()}
                  </div>
                ) : null}
                {compositionId === "blur_plug" ? (
                  <div className="space-y-3">
                    {(() => {
                      const plug = compositionProps as BlurPlugProps;
                      const chip = (
                        active: boolean,
                        onClick: () => void,
                        label: string,
                        key: string
                      ) => (
                        <button
                          key={key}
                          type="button"
                          onClick={onClick}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            active
                              ? "border-[#7C3AED] bg-gradient-to-br from-[rgba(124,58,237,0.35)] to-[rgba(13,148,136,0.25)] text-white"
                              : "border-[#2a2a2a] bg-[#0a0a0a] text-[#9ca3af] hover:border-[#3a3a3a]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                      return (
                        <>
                          {/* Blur family */}
                          <section className="space-y-3 rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] p-3">
                            <h3
                              data-previewizer-reveal-anchor
                              className="text-sm font-bold uppercase tracking-[0.12em] text-[#9bf0c4]"
                            >
                              Blur
                            </h3>
                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs text-[#6b7280]">Blur effect</p>
                                <button
                                  type="button"
                                  onClick={() => onCompositionPropsChange({ blurType: "none" })}
                                  className="text-xs font-semibold text-[#a78bfa]"
                                >
                                  Clear
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {BLUR_PLUG_BLUR_TYPES.map((item) =>
                                  chip(
                                    plug.blurType === item.id,
                                    () =>
                                      onCompositionPropsChange({
                                        blurType: item.id as BlurPlugBlurType
                                      }),
                                    item.label,
                                    item.id
                                  )
                                )}
                              </div>
                              {plug.blurType === "pixelated" || plug.blurType === "gaussian" ? (
                                <div className="mt-3 space-y-3">
                                  {plug.blurType === "pixelated" ? (
                                    <label className="block">
                                      <span className="text-xs text-[#6b7280]">
                                        Pixel size ({plug.pixelSize ?? 18}px)
                                      </span>
                                      <input
                                        type="range"
                                        min={8}
                                        max={48}
                                        value={plug.pixelSize ?? 18}
                                        onChange={(e) =>
                                          onCompositionPropsChange({
                                            pixelSize: Number(e.target.value)
                                          })
                                        }
                                        className="mt-1 w-full accent-[#7C3AED]"
                                      />
                                    </label>
                                  ) : null}
                                  <label className="block">
                                    <span className="text-xs text-[#6b7280]">
                                      Opacity ({plug.blurOpacity ?? 100}%)
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={plug.blurOpacity ?? 100}
                                      onChange={(e) =>
                                        onCompositionPropsChange({
                                          blurOpacity: Number(e.target.value)
                                        })
                                      }
                                      className="mt-1 w-full accent-[#7C3AED]"
                                    />
                                  </label>
                                </div>
                              ) : null}
                            </div>
                            <div className="border-t border-[#1a1a1a] pt-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs text-[#6b7280]">
                                  Reveal window
                                </p>
                                <button
                                  type="button"
                                  onClick={() => onCompositionPropsChange({ revealShape: "none" })}
                                  className="text-xs font-semibold text-[#a78bfa]"
                                >
                                  Clear
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {BLUR_PLUG_REVEAL_SHAPES.map((item) =>
                                  chip(
                                    plug.revealShape === item.id,
                                    () =>
                                      onCompositionPropsChange({
                                        revealShape: item.id as BlurPlugRevealShape
                                      }),
                                    item.label,
                                    item.id
                                  )
                                )}
                              </div>
                            </div>
                          </section>

                          {/* Text family */}
                          <section className="space-y-3 rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] p-3">
                            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#9bf0c4]">
                              Text
                            </h3>
                            <div>
                              <div className="mb-2 flex items-end justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="mb-2 text-xs text-[#6b7280]">Platform logo</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {BLUR_PLUG_PLATFORMS.map((item) =>
                                      chip(
                                        plug.platform === item.id,
                                        () =>
                                          onCompositionPropsChange({
                                            platform: item.id as BlurPlugPlatform,
                                            handle: item.handle
                                          }),
                                        item.label,
                                        item.id
                                      )
                                    )}
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  <p className="mb-1.5 text-[10px] text-[#6b7280]">Anchor</p>
                                  <div className="grid grid-cols-3 gap-0.5">
                                    {BLUR_PLUG_ANCHORS.map((pos) => (
                                      <button
                                        key={pos}
                                        type="button"
                                        aria-label={pos}
                                        title={pos}
                                        onClick={() =>
                                          onCompositionPropsChange({
                                            anchor: pos as BlurPlugAnchor
                                          })
                                        }
                                        className={`flex h-5 w-5 items-center justify-center rounded border ${
                                          plug.anchor === pos
                                            ? "border-[#7C3AED] bg-[rgba(124,58,237,0.25)]"
                                            : "border-[#2a2a2a] bg-[#0a0a0a] hover:border-[#3a3a3a]"
                                        }`}
                                      >
                                        <span
                                          className={`h-1.5 w-1.5 rounded-full ${
                                            plug.anchor === pos ? "bg-white" : "bg-[#6b7280]"
                                          }`}
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="border-t border-[#1a1a1a] pt-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-[#6b7280]">Label</p>
                                  <div className="flex gap-1">
                                    {BLUR_PLUG_TEXT_SIZES.map((size) => (
                                      <button
                                        key={size.id}
                                        type="button"
                                        onClick={() =>
                                          onCompositionPropsChange({
                                            labelSize: size.id as BlurPlugTextSize
                                          })
                                        }
                                        className={`h-7 w-7 rounded-full border text-[11px] font-bold ${
                                          plug.labelSize === size.id
                                            ? "border-[#7C3AED] bg-[#7C3AED] text-white"
                                            : "border-[#2a2a2a] text-[#9ca3af]"
                                        }`}
                                      >
                                        {size.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onCompositionPropsChange({ label: "" })}
                                  className="text-xs font-semibold text-[#a78bfa]"
                                >
                                  Clear
                                </button>
                              </div>
                              <input
                                type="text"
                                value={plug.label}
                                placeholder="Follow me on"
                                onChange={(e) =>
                                  onCompositionPropsChange({ label: e.target.value })
                                }
                                className="w-full rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm font-semibold text-[#f9fafb] outline-none focus:border-[#7C3AED]"
                              />
                            </div>
                            <div>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-[#6b7280]">Handle</p>
                                  <div className="flex gap-1">
                                    {BLUR_PLUG_HANDLE_SIZES.map((size) => (
                                      <button
                                        key={size.id}
                                        type="button"
                                        onClick={() =>
                                          onCompositionPropsChange({
                                            handleSize: size.id as BlurPlugTextSize
                                          })
                                        }
                                        className={`h-7 min-w-7 rounded-full border px-1.5 text-[11px] font-bold ${
                                          plug.handleSize === size.id
                                            ? "border-[#7C3AED] bg-[#7C3AED] text-white"
                                            : "border-[#2a2a2a] text-[#9ca3af]"
                                        }`}
                                      >
                                        {size.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onCompositionPropsChange({ handle: "" })}
                                  className="text-xs font-semibold text-[#a78bfa]"
                                >
                                  Clear
                                </button>
                              </div>
                              <input
                                type="text"
                                value={plug.handle}
                                placeholder="patreon.com/user"
                                onChange={(e) => {
                                  onCompositionPropsChange({ handle: e.target.value });
                                }}
                                className="w-full rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm font-semibold text-[#f9fafb] outline-none focus:border-[#7C3AED]"
                              />
                            </div>
                          </section>

                          {/* QR Code — free-placed stamp */}
                          <section className="space-y-3 rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] p-3">
                            {(() => {
                              const qrStamp = normalizeBlurPlugQrStamp(plug.qrStamp);
                              return (
                                <>
                                  <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#9bf0c4]">
                                      QR Code
                                    </h3>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onCompositionPropsChange({
                                          qrStamp: { ...qrStamp, enabled: !qrStamp.enabled }
                                        })
                                      }
                                      className="text-xs font-semibold text-[#a78bfa]"
                                    >
                                      {qrStamp.enabled ? "Hide" : "Show"}
                                    </button>
                                  </div>

                                  <div>
                                    <p className="mb-1.5 text-xs text-[#6b7280]">Link destination</p>
                                    {destinationsLoading ? (
                                      <p className="mb-1.5 text-[11px] text-[#6b7280]">
                                        Loading connected links…
                                      </p>
                                    ) : null}
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {linkDestinations.map((dest) => {
                                        const selected = selectedDestinationId === dest.id;
                                        const disabled = !dest.available && dest.id !== "custom";
                                        const status = disabled
                                          ? dest.id === "patreon"
                                            ? "Sync to unlock"
                                            : "Not connected"
                                          : dest.id === "custom"
                                            ? dest.displayText
                                              ? "Manual"
                                              : "Type URL below"
                                            : "Ready";
                                        return (
                                          <button
                                            key={dest.id}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => onSelectLinkDestination?.(dest.id)}
                                            className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                                              selected
                                                ? "border-[#7C3AED] bg-[rgba(124,58,237,0.18)]"
                                                : "border-[#2a2a2a] bg-[#0a0a0a] hover:border-[#3a3a3a]"
                                            } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                                          >
                                            <span className="block text-xs font-semibold text-[#f9fafb]">
                                              {dest.label}
                                            </span>
                                            <span className="mt-0.5 block truncate text-[10px] leading-tight text-[#6b7280]">
                                              {status}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {selectedDestinationId === "custom" ? (
                                      <label className="mt-2 block">
                                        <span className="text-xs text-[#6b7280]">Custom URL</span>
                                        <input
                                          type="url"
                                          value={customDestinationUrl}
                                          placeholder="https://patreon.com/you"
                                          onChange={(e) =>
                                            onCustomDestinationUrlChange?.(e.target.value)
                                          }
                                          className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f9fafb] outline-none focus:border-[#7C3AED]"
                                          data-testid="previewizer-qr-custom-url"
                                        />
                                      </label>
                                    ) : null}
                                  </div>

                                  <div className="border-t border-[#1a1a1a] pt-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs text-[#6b7280]">Size</p>
                                        <div className="flex gap-1">
                                          {BLUR_PLUG_QR_SIZES.map((size) => (
                                            <button
                                              key={size.id}
                                              type="button"
                                              onClick={() => {
                                                onCompositionPropsChange({
                                                  qrStamp: {
                                                    ...qrStamp,
                                                    enabled: true,
                                                    size: size.id as BlurPlugQrSize
                                                  }
                                                });
                                                onSelectStampId?.(BLUR_PLUG_QR_LAYER_ID);
                                              }}
                                              className={`h-7 w-7 rounded-full border text-[11px] font-bold ${
                                                qrStamp.size === size.id
                                                  ? "border-[#7C3AED] bg-[#7C3AED] text-white"
                                                  : "border-[#2a2a2a] text-[#9ca3af]"
                                              }`}
                                            >
                                              {size.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onCompositionPropsChange({
                                            qrStamp: {
                                              ...qrStamp,
                                              x: 84,
                                              y: 86,
                                              size: "medium",
                                              enabled: true
                                            }
                                          })
                                        }
                                        className="text-xs font-semibold text-[#a78bfa]"
                                      >
                                        Reset place
                                      </button>
                                    </div>
                                    <p className="text-[11px] leading-snug text-[#6b7280]">
                                      Drag the QR on the canvas to place it. Size is independent of
                                      the handle lockup.
                                    </p>
                                  </div>

                                  {qrSrc && qrStamp.enabled ? (
                                    <div className="flex items-center gap-3 rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-2.5">
                                      {/* eslint-disable-next-line @next/next/no-img-element -- data-URL QR preview */}
                                      <img
                                        src={qrSrc}
                                        alt=""
                                        width={56}
                                        height={56}
                                        className="h-14 w-14 shrink-0 rounded-lg bg-white p-1.5"
                                        data-testid="previewizer-sidebar-qr-preview"
                                      />
                                      <p className="text-[11px] leading-snug text-[#6b7280]">
                                        Encodes the selected destination and exports with the
                                        composition.
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="rounded-lg border border-dashed border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-[11px] text-[#6b7280]">
                                      {!qrStamp.enabled
                                        ? "QR is hidden. Tap Show to place it on the canvas."
                                        : selectedDestinationId === "custom"
                                          ? "Type a full URL above to generate the QR."
                                          : "Choose an available destination to generate a QR."}
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </section>

                          {/* Effects family */}
                          <section className="space-y-3 rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] p-3">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#9bf0c4]">
                                Effects
                              </h3>
                              <button
                                type="button"
                                onClick={() => onCompositionPropsChange({ borderStyles: [] })}
                                className="text-xs font-semibold text-[#a78bfa]"
                              >
                                Clear
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {BLUR_PLUG_BORDER_STYLES.map((item) =>
                                chip(
                                  (plug.borderStyles ?? []).includes(item.id),
                                  () =>
                                    onCompositionPropsChange({
                                      borderStyles: toggleBlurPlugBorderStyle(
                                        plug.borderStyles ?? [],
                                        item.id as BlurPlugBorderEffect
                                      )
                                    }),
                                  item.label,
                                  item.id
                                )
                              )}
                            </div>
                            {(plug.borderStyles ?? []).includes("glow") ? (
                              <div className="space-y-3 border-t border-[#1a1a1a] pt-3">
                                <label className="block">
                                  <span className="mb-1.5 flex items-center justify-between text-xs text-[#6b7280]">
                                    <span>Glow hue ({plug.glowHue ?? 262}°)</span>
                                    <span
                                      className="h-3 w-3 rounded-full border border-white/20"
                                      style={{
                                        background: `hsl(${plug.glowHue ?? 262}, 83%, 58%)`
                                      }}
                                      aria-hidden
                                    />
                                  </span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={360}
                                    value={plug.glowHue ?? 262}
                                    onChange={(e) =>
                                      onCompositionPropsChange({
                                        glowHue: Number(e.target.value)
                                      })
                                    }
                                    className="mt-1 w-full"
                                    style={{
                                      accentColor: `hsl(${plug.glowHue ?? 262}, 83%, 58%)`,
                                      background:
                                        "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
                                      height: 6,
                                      borderRadius: 999,
                                      appearance: "none"
                                    }}
                                  />
                                </label>
                              </div>
                            ) : null}
                            {(plug.borderStyles ?? []).includes("vignette") ? (
                              <div className="space-y-3 border-t border-[#1a1a1a] pt-3">
                                <label className="block">
                                  <span className="text-xs text-[#6b7280]">
                                    Vignette size ({plug.vignetteSize ?? 50})
                                  </span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={plug.vignetteSize ?? 50}
                                    onChange={(e) =>
                                      onCompositionPropsChange({
                                        vignetteSize: Number(e.target.value)
                                      })
                                    }
                                    className="mt-1 w-full accent-[#7C3AED]"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs text-[#6b7280]">
                                    Vignette intensity ({plug.vignetteIntensity ?? 55})
                                  </span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={plug.vignetteIntensity ?? 55}
                                    onChange={(e) =>
                                      onCompositionPropsChange({
                                        vignetteIntensity: Number(e.target.value)
                                      })
                                    }
                                    className="mt-1 w-full accent-[#7C3AED]"
                                  />
                                </label>
                              </div>
                            ) : null}
                            <div className="border-t border-[#1a1a1a] pt-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs text-[#6b7280]">Censor stamp</p>
                                {(plug.stamps?.length ?? 0) > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onCompositionPropsChange({ stamps: [] });
                                      onSelectStampId?.(null);
                                    }}
                                    className="text-xs font-semibold text-[#a78bfa]"
                                  >
                                    Clear all
                                  </button>
                                ) : null}
                              </div>
                              <p className="mb-2 text-[11px] text-[#4b5563]">Click a style to add</p>
                              <div className="flex flex-wrap gap-2">
                                {BLUR_PLUG_STAMP_STYLES.map((item) =>
                                  chip(
                                    false,
                                    () => {
                                      const next = createBlurPlugStamp(
                                        item.id as BlurPlugStampStyle,
                                        plug.stamps?.length ?? 0
                                      );
                                      onCompositionPropsChange({
                                        stamps: [...(plug.stamps ?? []), next]
                                      });
                                      onSelectStampId?.(next.id);
                                    },
                                    item.label,
                                    item.id
                                  )
                                )}
                              </div>
                              {(plug.stamps?.length ?? 0) > 0 ? (
                                <div className="mt-3 space-y-2">
                                  <p className="text-xs text-[#6b7280]">Layers</p>
                                  <ul className="space-y-1">
                                    {(plug.stamps ?? []).map((stamp: BlurPlugStamp, index: number) => {
                                      const label =
                                        BLUR_PLUG_STAMP_STYLES.find((s) => s.id === stamp.style)
                                          ?.label ?? stamp.style;
                                      const active = selectedStampId === stamp.id;
                                      return (
                                        <li
                                          key={stamp.id}
                                          className={`flex items-center gap-1 rounded-md border ${
                                            active
                                              ? "border-[#a78bfa] bg-[rgba(167,139,250,0.12)]"
                                              : "border-[#2a2a2a] bg-[#0a0a0a]"
                                          }`}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => onSelectStampId?.(stamp.id)}
                                            className={`min-w-0 flex-1 px-2 py-1.5 text-left text-xs ${
                                              active ? "text-[#e9d5ff]" : "text-[#9ca3af]"
                                            }`}
                                          >
                                            {index + 1}. {label}
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`Delete ${label}`}
                                            onClick={() => {
                                              const next = removeBlurPlugStamp(
                                                plug.stamps ?? [],
                                                stamp.id
                                              );
                                              onCompositionPropsChange({ stamps: next });
                                              if (selectedStampId === stamp.id) {
                                                onSelectStampId?.(
                                                  next.length ? next[next.length - 1].id : null
                                                );
                                              }
                                            }}
                                            className="px-2 py-1.5 text-xs text-[#f87171] hover:text-[#fca5a5]"
                                          >
                                            Delete
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  {(() => {
                                    const selected =
                                      (plug.stamps ?? []).find((s) => s.id === selectedStampId) ??
                                      null;
                                    if (!selected) {
                                      return (
                                        <p className="text-[11px] text-[#4b5563]">
                                          Select a stamp to edit size, rotation, or font
                                        </p>
                                      );
                                    }
                                    const selectedFont = selected.font ?? "system";
                                    return (
                                      <div className="space-y-3 border-t border-[#1a1a1a] pt-3">
                                        {selected.style !== "blank_bar" ? (
                                          <div>
                                            <p className="mb-2 text-xs text-[#6b7280]">Font</p>
                                            <div className="flex flex-wrap gap-1.5">
                                              {BLUR_PLUG_STAMP_FONTS.map((item) =>
                                                chip(
                                                  selectedFont === item.id,
                                                  () =>
                                                    onCompositionPropsChange({
                                                      stamps: updateBlurPlugStamp(
                                                        plug.stamps ?? [],
                                                        selected.id,
                                                        {
                                                          font: item.id as BlurPlugStampFont
                                                        }
                                                      )
                                                    }),
                                                  item.label,
                                                  `stamp-font-${item.id}`
                                                )
                                              )}
                                            </div>
                                          </div>
                                        ) : null}
                                        <label className="block">
                                          <span className="text-xs text-[#6b7280]">
                                            Size ({selected.size})
                                          </span>
                                          <input
                                            type="range"
                                            min={8}
                                            max={100}
                                            value={selected.size}
                                            onChange={(e) =>
                                              onCompositionPropsChange({
                                                stamps: updateBlurPlugStamp(
                                                  plug.stamps ?? [],
                                                  selected.id,
                                                  { size: Number(e.target.value) }
                                                )
                                              })
                                            }
                                            className="mt-1 w-full accent-[#7C3AED]"
                                          />
                                        </label>
                                        <label className="block">
                                          <span className="text-xs text-[#6b7280]">
                                            Rotation ({selected.rotation}°)
                                          </span>
                                          <input
                                            type="range"
                                            min={-45}
                                            max={45}
                                            value={selected.rotation}
                                            onChange={(e) =>
                                              onCompositionPropsChange({
                                                stamps: updateBlurPlugStamp(
                                                  plug.stamps ?? [],
                                                  selected.id,
                                                  { rotation: Number(e.target.value) }
                                                )
                                              })
                                            }
                                            className="mt-1 w-full accent-[#7C3AED]"
                                          />
                                        </label>
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          </section>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
                {compositionId === "mystery_crop" ? (
                  <div className="mb-3 space-y-3 rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <p className="text-sm font-semibold text-[#9bf0c4]">Mystery Crop</p>
                    {(() => {
                      const cropProps = compositionProps as MysteryCropProps;
                      return (
                        <div>
                          <p className="mb-2 text-sm text-[#9ca3af]">Platform lockup size</p>
                          <div className="flex gap-2">
                            {MYSTERY_CROP_LOCKUP_SCALES.map((size) => (
                              <button
                                key={size.id}
                                type="button"
                                onClick={() =>
                                  onCompositionPropsChange({
                                    lockupScale: size.id as MysteryCropLockupScale
                                  })
                                }
                                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${
                                  cropProps.lockupScale === size.id
                                    ? "border-[#FB923C] bg-[rgba(251,146,60,0.15)] text-[#fdba74]"
                                    : "border-[#2a2a2a] bg-[#0a0a0a] text-[#9ca3af] hover:border-[#3a3a3a]"
                                }`}
                              >
                                {size.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
                {compositionId === "cinematic_eyes" ? (
                  <div className="mb-3 space-y-3 rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <p className="text-sm font-semibold text-[#9bf0c4]">Cinematic Eyes</p>
                    {(() => {
                      const eyesProps = compositionProps as CinematicEyesProps;
                      return (
                        <>
                          <label className="block">
                            <span className="text-sm text-[#9ca3af]">
                              Vignette intensity ({eyesProps.vignetteIntensity})
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={eyesProps.vignetteIntensity}
                              onChange={(e) =>
                                onCompositionPropsChange({
                                  vignetteIntensity: Number(e.target.value)
                                })
                              }
                              className="mt-1 w-full accent-[#F96854]"
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm text-[#9ca3af]">
                              Spotlight radius ({eyesProps.vignetteRadius})
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={eyesProps.vignetteRadius}
                              onChange={(e) =>
                                onCompositionPropsChange({
                                  vignetteRadius: Number(e.target.value)
                                })
                              }
                              className="mt-1 w-full accent-[#F96854]"
                            />
                          </label>
                          <div>
                            <p className="mb-2 text-sm text-[#9ca3af]">Bar size</p>
                            <div className="flex gap-2">
                              {CINEMATIC_EYES_BAR_SCALES.map((size) => (
                                <button
                                  key={size.id}
                                  type="button"
                                  onClick={() =>
                                    onCompositionPropsChange({
                                      barScale: size.id as CinematicEyesBarScale
                                    })
                                  }
                                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${
                                    eyesProps.barScale === size.id
                                      ? "border-[#F96854] bg-[rgba(249,104,84,0.15)] text-[#ffb4a8]"
                                      : "border-[#2a2a2a] bg-[#0a0a0a] text-[#9ca3af] hover:border-[#3a3a3a]"
                                  }`}
                                >
                                  {size.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
                {compositionId === "frosted_glass_card" ? (
                  <div className="mb-3 space-y-3 rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <p className="text-sm font-semibold text-[#9bf0c4]">Frosted Glass</p>
                    {(() => {
                      const glassProps = compositionProps as FrostedGlassCardProps;
                      return (
                        <>
                          <div>
                            <p className="mb-2 text-sm text-[#9ca3af]">Glass size</p>
                            <div className="flex gap-2">
                              {FROSTED_GLASS_CARD_SCALES.map((size) => (
                                <button
                                  key={size.id}
                                  type="button"
                                  onClick={() =>
                                    onCompositionPropsChange({
                                      glassScale: size.id as FrostedGlassCardScale
                                    })
                                  }
                                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${
                                    glassProps.glassScale === size.id
                                      ? "border-[#7C3AED] bg-gradient-to-br from-[rgba(124,58,237,0.2)] to-[rgba(13,148,136,0.15)] text-[#c4b5fd]"
                                      : "border-[#2a2a2a] bg-[#0a0a0a] text-[#9ca3af] hover:border-[#3a3a3a]"
                                  }`}
                                >
                                  {size.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <label className="block">
                            <span className="text-sm text-[#9ca3af]">
                              Glass bloom ({glassProps.glassOpacity}) · 100 = uniform
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={glassProps.glassOpacity}
                              onChange={(e) =>
                                onCompositionPropsChange({
                                  glassOpacity: Number(e.target.value)
                                })
                              }
                              className="mt-1 w-full accent-[#7C3AED]"
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm text-[#9ca3af]">
                              Dim background ({glassProps.backgroundDim})
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={glassProps.backgroundDim}
                              onChange={(e) =>
                                onCompositionPropsChange({
                                  backgroundDim: Number(e.target.value)
                                })
                              }
                              className="mt-1 w-full accent-[#7C3AED]"
                            />
                          </label>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
                {compositionId === "collage_windows" ? (
                  <div className="mb-3 space-y-3 rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <p className="text-sm font-semibold text-[#9bf0c4]">Collage Windows</p>
                    {(() => {
                      const collageProps = compositionProps as CollageWindowsProps;
                      return (
                        <label className="block">
                          <span className="mb-2 block text-sm text-[#9ca3af]">Background hue</span>
                          <PreviewizerHueWheel
                            value={collageProps.accentHue}
                            onChange={(accentHue) => onCompositionPropsChange({ accentHue })}
                          />
                        </label>
                      );
                    })()}
                  </div>
                ) : null}
              </>
            ) : null}

            {!compositionId ? (
            <>
            <section>
              <p className="mb-3 text-sm font-semibold text-[#9bf0c4]">Brand</p>
              <>
                <div className="grid grid-cols-4 gap-2">
                    {BUNDLED_LOGOS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          onOptionsChange({
                            platformId: item.id as DesignTemplateOptions["platformId"],
                            platformUrl: PLATFORM_URL_DEFAULTS[item.id as keyof typeof PLATFORM_URL_DEFAULTS]
                          })
                        }
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 ${
                          templateOptions.platformId === item.id
                            ? "border-[#00aa6f] bg-[rgba(0,170,111,0.1)]"
                            : "border-[#2a2a2a] bg-[#111]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.src} alt={item.label} className="h-8 w-8 object-contain" />
                        <span className="text-[10px] text-[#9ca3af]">{item.label}</span>
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 block">
                    <span className="text-sm text-[#9ca3af]">Platform URL</span>
                    <input
                      type="text"
                      value={
                        templateOptions.platformUrl ?? PLATFORM_URL_DEFAULTS[templateOptions.platformId]
                      }
                      onChange={(e) => onOptionsChange({ platformUrl: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-[#f9fafb]"
                    />
                  </label>
              </>
              <p className="mb-2 mt-4 text-sm text-[#9ca3af]">Logo bucket</p>
              <div className="grid grid-cols-4 gap-2">
                {allLogos.map((item) => (
                  <button
                    key={item.id + item.src}
                    type="button"
                    onClick={() => addLogo(item)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#111] p-2 hover:border-[rgba(0,170,111,0.4)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.src} alt={item.label} className="h-8 w-8 object-contain" />
                    <span className="text-[9px] text-[#9ca3af]">{item.label}</span>
                  </button>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="text-sm text-[#6b7280]">Custom logo</span>
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  onChange={onCustomLogoFile}
                  className="mt-1 block w-full text-sm text-[#6b7280] file:mr-2 file:rounded-lg file:border-0 file:bg-[#00aa6f] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-black"
                />
              </label>
              <div className="mt-3">
                <p className="mb-2 text-sm text-[#9ca3af]">Promo copy presets</p>
                <div className="flex flex-wrap gap-1.5">
                  {PROMO_COPY_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOptionsChange({ promoText: p.text })}
                      className="rounded-full border border-[#2a2a2a] bg-[#111] px-2.5 py-1 text-xs font-medium text-[#9ca3af] hover:border-[#3a3a3a]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <p className="mb-3 text-sm font-semibold text-[#9bf0c4]">Text</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["title", "Title"],
                    ["promo", "Promo"],
                    ["bottom_banner", "Bottom banner"],
                    ["centered_plate", "Centered plate"],
                    ["plain", "Plain + stroke"]
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => addText(id)}
                    className="rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-[#9ca3af] hover:border-[#3a3a3a]"
                  >
                    Add · {label}
                  </button>
                ))}
              </div>
              {supportsTitleField(selectedGraphic) ? (
                <label className="mt-4 block">
                  <span className="text-sm text-[#9ca3af]">Title (split banner)</span>
                  <input
                    type="text"
                    value={templateOptions.titleText ?? "The Reapers — Issue #1"}
                    onChange={(e) => onOptionsChange({ titleText: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-[#f9fafb]"
                  />
                </label>
              ) : null}
            </section>
            </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

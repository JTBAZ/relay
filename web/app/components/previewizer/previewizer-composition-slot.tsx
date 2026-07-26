"use client";

import BottomPaywallOverlay from "./compositions/bottom-paywall-overlay";
import BlurPlugOverlay from "./compositions/blur-plug-overlay";
import CinematicEyesOverlay from "./compositions/cinematic-eyes-overlay";
import CollageWindowsOverlay from "./compositions/collage-windows-overlay";
import GlassCardOverlay from "./compositions/glass-card-overlay";
import MysteryCropOverlay from "./compositions/mystery-crop-overlay";
import type {
  CompositionPropsById,
  CompositionTemplateId
} from "./previewizer-template-compositions";
import type {
  StampFontId,
  StampNsfwVariant,
  StampEighteenVariant
} from "./compositions/blur-plug-overlay";

type StampPatch = Partial<{
  size: number;
  rotation: number;
  font: StampFontId;
  variant: StampNsfwVariant | StampEighteenVariant;
}>;

type Props<T extends CompositionTemplateId = CompositionTemplateId> = {
  compositionId: T;
  compositionProps: CompositionPropsById[T];
  exportMode?: boolean;
  onExportReady?: () => void;
  imageSrc?: string | null;
  focalX?: number;
  focalY?: number;
  cropRect?: { x: number; y: number; w: number; h: number } | null;
  selectedStampId?: string | null;
  onSelectStamp?: (id: string | null) => void;
  onStampMove?: (id: string, x: number, y: number) => void;
  onStampPatch?: (id: string, patch: StampPatch) => void;
  onStampMoveEnd?: () => void;
  /** Destination QR PNG data URL for URL/handle lockups. */
  qrSrc?: string | null;
};

export function PreviewizerCompositionSlot<T extends CompositionTemplateId>({
  compositionId,
  compositionProps,
  exportMode = false,
  onExportReady,
  imageSrc = null,
  focalX = 50,
  focalY = 50,
  cropRect = null,
  selectedStampId = null,
  onSelectStamp,
  onStampMove,
  onStampPatch,
  onStampMoveEnd,
  qrSrc = null
}: Props<T>) {
  switch (compositionId) {
    case "blur_plug": {
      if (!imageSrc) return null;
      const props = compositionProps as CompositionPropsById["blur_plug"];
      return (
        <BlurPlugOverlay
          imageSrc={imageSrc}
          blurType={props.blurType}
          platform={props.platform}
          handle={props.handle}
          label={props.label}
          anchor={props.anchor}
          revealShape={props.revealShape}
          revealSize={props.revealSize}
          revealX={props.revealX}
          revealY={props.revealY}
          revealFeather={props.revealFeather}
          revealOpacity={props.revealOpacity ?? 100}
          borderStyles={props.borderStyles}
          stamps={props.stamps ?? []}
          qrStamp={props.qrStamp}
          selectedStampId={selectedStampId}
          onSelectStamp={onSelectStamp}
          onStampMove={onStampMove}
          onStampPatch={onStampPatch}
          onStampMoveEnd={onStampMoveEnd}
          labelSize={props.labelSize}
          handleSize={props.handleSize}
          pixelSize={props.pixelSize}
          blurOpacity={props.blurOpacity ?? 100}
          vignetteSize={props.vignetteSize}
          vignetteIntensity={props.vignetteIntensity}
          glowHue={props.glowHue}
          exportMode={exportMode}
          onExportReady={onExportReady}
          focalX={focalX}
          focalY={focalY}
          cropRect={cropRect}
          qrSrc={qrSrc}
        />
      );
    }
    case "bottom_blur_paywall":
      return (
        <BottomPaywallOverlay
          {...(compositionProps as CompositionPropsById["bottom_blur_paywall"])}
          exportMode={exportMode}
        />
      );
    case "mystery_crop":
      return (
        <MysteryCropOverlay
          {...(compositionProps as CompositionPropsById["mystery_crop"])}
          exportMode={exportMode}
          qrSrc={qrSrc}
        />
      );
    case "cinematic_eyes":
      return (
        <CinematicEyesOverlay
          {...(compositionProps as CompositionPropsById["cinematic_eyes"])}
          qrSrc={qrSrc}
        />
      );
    case "frosted_glass_card":
      return (
        <GlassCardOverlay
          {...(compositionProps as CompositionPropsById["frosted_glass_card"])}
          exportMode={exportMode}
        />
      );
    case "collage_windows":
      return (
        <CollageWindowsOverlay
          {...(compositionProps as CompositionPropsById["collage_windows"])}
          qrSrc={qrSrc}
        />
      );
    default: {
      const _exhaustive: never = compositionId;
      return _exhaustive;
    }
  }
}

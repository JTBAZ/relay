"use client";

import {
  PromoGraphicRenderer,
  PRESET_META,
  type Platform as V0Platform
} from "./previewizer-v0-promo-graphics";
import { fontKeyToV0 } from "./previewizer-graphic-placement";
import type { GraphicOverlayLayer } from "./previewizer-overlay-layers";

type Props = {
  layer: GraphicOverlayLayer;
  platform: V0Platform;
  title?: string;
  /** Thumbnail scale (0.26) vs live preview (1). */
  scale?: number;
};

export function PreviewizerV0GraphicSlot({
  layer,
  platform,
  title,
  scale = 1
}: Props) {
  if (!layer.text.trim() || layer.visible === false) return null;

  const layerPlatform = layer.platformId ?? platform;

  return (
    <div
      className="pointer-events-none h-full w-full overflow-hidden"
      style={{ fontSize: scale >= 0.5 ? 16 : 14 }}
    >
      <PromoGraphicRenderer
        preset={layer.graphicId}
        text={layer.text}
        fontClass={fontKeyToV0(layer.fontKey)}
        platform={layerPlatform}
        title={title}
        scale={scale}
        textFillRatio={layer.textFillRatio}
        opacity={layer.opacity}
        showPlatformLockup={false}
      />
    </div>
  );
}

export function graphicMetaLabel(graphicId: GraphicOverlayLayer["graphicId"]): string {
  return PRESET_META[graphicId].name;
}

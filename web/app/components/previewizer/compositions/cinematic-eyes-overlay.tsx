"use client";

import type { CinematicEyesBarScale } from "../previewizer-template-compositions";
import { PreviewizerQrBadge } from "./previewizer-qr-badge";

interface CinematicEyesOverlayProps {
  headline?: string;
  platformUrl?: string;
  vignetteIntensity?: number;
  vignetteRadius?: number;
  barScale?: CinematicEyesBarScale;
  qrSrc?: string | null;
}

const CORAL = "#F96854";

const BAR_SCALE: Record<
  CinematicEyesBarScale,
  { height: string; logoCqh: number; headlineCqh: number; urlCqh: number; gapCqh: number }
> = {
  small: { height: "32%", logoCqh: 6.5, headlineCqh: 4.2, urlCqh: 2.2, gapCqh: 1.8 },
  medium: { height: "38%", logoCqh: 8, headlineCqh: 5.4, urlCqh: 2.6, gapCqh: 2.2 },
  large: { height: "44%", logoCqh: 9.5, headlineCqh: 6.4, urlCqh: 3, gapCqh: 2.6 }
};

function buildVignetteLayers(intensity: number, radius: number): string {
  const t = Math.max(0, Math.min(100, intensity)) / 100;
  const r = Math.max(0, Math.min(100, radius)) / 100;

  const clearStop = 14 + r * 26;
  const midStop = 42 + (1 - r) * 18;
  const edgeA = 0.3 + t * 0.45;
  const midA = 0.65 + t * 0.28;
  const outerA = 0.82 + t * 0.15;
  const ellipseW = 52 + (1 - r) * 24;
  const ellipseH = 38 + (1 - r) * 20;
  const sideA = 0.55 + t * 0.4;
  const topA = 0.72 + t * 0.25;
  const bottomA = 0.82 + t * 0.18;

  return [
    `radial-gradient(ellipse ${ellipseW}% ${ellipseH}% at 50% 40%, transparent 0%, transparent ${clearStop}%, rgba(0,0,0,${edgeA}) ${midStop}%, rgba(0,0,0,${midA}) ${midStop + 16}%, rgba(0,0,0,${outerA}) 100%)`,
    `linear-gradient(to bottom, rgba(0,0,0,${topA}) 0%, rgba(0,0,0,${topA * 0.55}) 18%, transparent 38%)`,
    `linear-gradient(to top, rgba(0,0,0,${0.88 + t * 0.12}) 32%, rgba(0,0,0,${bottomA}) 46%, transparent 62%)`,
    `linear-gradient(to right, rgba(0,0,0,${sideA}) 0%, rgba(0,0,0,${sideA * 0.45}) 20%, transparent 40%)`,
    `linear-gradient(to left, rgba(0,0,0,${sideA}) 0%, rgba(0,0,0,${sideA * 0.45}) 20%, transparent 40%)`
  ].join(", ");
}

export default function CinematicEyesOverlay({
  headline = "See the Full Image",
  platformUrl = "Patreon.com/you",
  vignetteIntensity = 55,
  vignetteRadius = 50,
  barScale = "small",
  qrSrc = null
}: CinematicEyesOverlayProps) {
  const scale = BAR_SCALE[barScale] ?? BAR_SCALE.small;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        containerType: "size",
        pointerEvents: "none",
        overflow: "hidden"
      }}
      aria-label="Cinematic paywall overlay"
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: buildVignetteLayers(vignetteIntensity, vignetteRadius),
          pointerEvents: "none"
        }}
        aria-hidden="true"
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: scale.height,
          background: "#000000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: `clamp(6px, ${scale.gapCqh}cqh, 18px)`,
          padding: "0 clamp(16px, 4cqw, 32px)",
          pointerEvents: "auto"
        }}
      >
        <svg
          viewBox="0 0 109 118"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Patreon"
          role="img"
          style={{
            width: `clamp(28px, ${scale.logoCqh}cqh, 72px)`,
            height: `clamp(28px, ${scale.logoCqh}cqh, 72px)`,
            flexShrink: 0,
            filter: "drop-shadow(0 2px 10px rgba(249,104,84,0.45))"
          }}
        >
          <rect width="109" height="118" rx="20" fill={CORAL} />
          <rect x="18" y="20" width="16" height="78" rx="4" fill="white" />
          <circle cx="68" cy="42" r="27" fill="white" />
        </svg>

        <p
          style={{
            margin: 0,
            color: "#ffffff",
            fontSize: `clamp(14px, ${scale.headlineCqh}cqh, 44px)`,
            fontFamily: "var(--font-playfair), 'Georgia', 'Times New Roman', serif",
            fontWeight: 700,
            fontStyle: "normal",
            lineHeight: 1.1,
            letterSpacing: "0.01em",
            textAlign: "center",
            textShadow: "0 2px 12px rgba(0,0,0,0.6)"
          }}
        >
          {headline}
        </p>

        <p
          style={{
            margin: 0,
            color: CORAL,
            fontSize: `clamp(9px, ${scale.urlCqh}cqh, 20px)`,
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textAlign: "center",
            lineHeight: 1
          }}
        >
          {platformUrl}
        </p>
        {qrSrc ? (
          <div style={{ marginTop: `clamp(6px, ${scale.gapCqh}cqh, 12px)` }}>
            <PreviewizerQrBadge qrSrc={qrSrc} sizeCqh={scale.logoCqh} sizeMin={40} sizeMax={80} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type { CinematicEyesOverlayProps };

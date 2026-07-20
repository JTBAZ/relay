"use client";

import type { MysteryCropLockupScale } from "../previewizer-template-compositions";
import { PreviewizerQrBadge } from "./previewizer-qr-badge";

interface MysteryCropOverlayProps {
  line1?: string;
  line2?: string;
  line3?: string;
  platformUrl?: string;
  lockupScale?: MysteryCropLockupScale;
  exportMode?: boolean;
  qrSrc?: string | null;
}

const LOCKUP_SCALE: Record<
  MysteryCropLockupScale,
  { logoMin: number; logoCqh: number; logoMax: number; urlMin: number; urlCqh: number; urlMax: number; gapMin: number; gapCqw: number; gapMax: number }
> = {
  small: { logoMin: 22, logoCqh: 5, logoMax: 36, urlMin: 9, urlCqh: 2.2, urlMax: 13, gapMin: 6, gapCqw: 1.5, gapMax: 10 },
  medium: { logoMin: 28, logoCqh: 6.5, logoMax: 48, urlMin: 11, urlCqh: 2.8, urlMax: 17, gapMin: 8, gapCqw: 1.8, gapMax: 12 },
  large: { logoMin: 34, logoCqh: 8, logoMax: 60, urlMin: 13, urlCqh: 3.4, urlMax: 22, gapMin: 10, gapCqw: 2.2, gapMax: 14 }
};

const STREAKS = [
  { top: "8%", width: "28%", height: "2.2cqh", opacity: 0.55, blur: 1 },
  { top: "13%", width: "42%", height: "1.4cqh", opacity: 0.4, blur: 0.5 },
  { top: "18%", width: "22%", height: "3cqh", opacity: 0.65, blur: 1.5 },
  { top: "24%", width: "36%", height: "1.2cqh", opacity: 0.35, blur: 0.5 },
  { top: "30%", width: "18%", height: "2cqh", opacity: 0.5, blur: 1 },
  { top: "36%", width: "48%", height: "1.6cqh", opacity: 0.45, blur: 0.5 },
  { top: "42%", width: "26%", height: "2.6cqh", opacity: 0.6, blur: 1.5 },
  { top: "50%", width: "38%", height: "1.4cqh", opacity: 0.38, blur: 0.5 },
  { top: "57%", width: "20%", height: "3.2cqh", opacity: 0.55, blur: 2 },
  { top: "63%", width: "44%", height: "1cqh", opacity: 0.3, blur: 0 },
  { top: "69%", width: "30%", height: "2.4cqh", opacity: 0.5, blur: 1 },
  { top: "75%", width: "16%", height: "1.8cqh", opacity: 0.42, blur: 0.5 },
  { top: "80%", width: "40%", height: "1.2cqh", opacity: 0.35, blur: 0 },
  { top: "86%", width: "24%", height: "2cqh", opacity: 0.48, blur: 1 },
  { top: "91%", width: "34%", height: "1.6cqh", opacity: 0.4, blur: 0.5 }
];

export default function MysteryCropOverlay({
  line1 = "FULL",
  line2 = "IMAGE",
  line3 = "INSIDE",
  platformUrl = "PATREON.COM/YOU",
  lockupScale = "small",
  exportMode = false,
  qrSrc = null
}: MysteryCropOverlayProps) {
  const lockup = LOCKUP_SCALE[lockupScale] ?? LOCKUP_SCALE.small;
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
      aria-label="Mystery crop paywall overlay"
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: [
            "radial-gradient(ellipse 120% 60% at 50% 100%, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.70) 35%, transparent 70%)",
            "radial-gradient(ellipse 80% 90% at 0% 50%,   rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.40) 45%, transparent 75%)",
            "radial-gradient(ellipse 100% 40% at 50% 0%,  rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 50%, transparent 80%)",
            "radial-gradient(ellipse 40%  100% at 100% 50%, rgba(0,0,0,0.50) 0%, transparent 70%)"
          ].join(", "),
          pointerEvents: "none",
          mixBlendMode: exportMode ? undefined : "multiply"
        }}
        aria-hidden="true"
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to right, rgba(8,6,18,0.92) 0%, rgba(8,6,18,0.78) 25%, rgba(8,6,18,0.45) 40%, transparent 65%)",
          pointerEvents: "none"
        }}
        aria-hidden="true"
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none"
        }}
        aria-hidden="true"
      >
        {STREAKS.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: s.top,
              width: s.width,
              height: s.height,
              background:
                "linear-gradient(to right, rgba(251,146,60,0.9) 0%, rgba(251,146,60,0.6) 40%, transparent 100%)",
              opacity: s.opacity,
              filter: s.blur > 0 ? `blur(${s.blur}px)` : undefined,
              borderRadius: "0 9999px 9999px 0",
              transform: "translateY(-50%)"
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: "clamp(16px, 5cqw, 32px)",
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "clamp(0px, 0.5cqh, 4px)",
          width: "55%"
        }}
      >
        <span
          style={{
            display: "block",
            color: "#ffffff",
            fontSize: "clamp(22px, 11cqh, 80px)",
            fontFamily:
              "var(--font-bebas-neue), 'Arial Narrow', 'Impact', 'Franklin Gothic Medium', Arial, sans-serif",
            fontWeight: 700,
            fontStyle: "italic",
            lineHeight: 0.95,
            letterSpacing: "0.03em",
            textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.9)"
          }}
        >
          {line1}
        </span>

        <span
          style={{
            display: "block",
            color: "#ffffff",
            fontSize: "clamp(22px, 11cqh, 80px)",
            fontFamily:
              "var(--font-bebas-neue), 'Arial Narrow', 'Impact', 'Franklin Gothic Medium', Arial, sans-serif",
            fontWeight: 700,
            fontStyle: "italic",
            lineHeight: 0.95,
            letterSpacing: "0.03em",
            textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.9)"
          }}
        >
          {line2}
        </span>

        <span
          style={{
            display: "block",
            color: "#FB923C",
            fontSize: "clamp(26px, 13.5cqh, 96px)",
            fontFamily:
              "var(--font-bebas-neue), 'Arial Narrow', 'Impact', 'Franklin Gothic Medium', Arial, sans-serif",
            fontWeight: 700,
            fontStyle: "italic",
            lineHeight: 0.92,
            letterSpacing: "0.03em",
            textShadow: "0 2px 20px rgba(251,146,60,0.45), 0 1px 4px rgba(0,0,0,0.9)"
          }}
        >
          {line3}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: "clamp(14px, 4.5cqw, 28px)",
          bottom: "clamp(12px, 3.5cqh, 24px)",
          display: "flex",
          alignItems: "center",
          gap: `clamp(${lockup.gapMin}px, ${lockup.gapCqw}cqw, ${lockup.gapMax}px)`,
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
            width: `clamp(${lockup.logoMin}px, ${lockup.logoCqh}cqh, ${lockup.logoMax}px)`,
            height: `clamp(${lockup.logoMin}px, ${lockup.logoCqh}cqh, ${lockup.logoMax}px)`,
            flexShrink: 0,
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))"
          }}
        >
          <rect width="109" height="118" rx="20" fill="#FF424D" />
          <rect x="18" y="20" width="16" height="78" rx="4" fill="white" />
          <circle cx="68" cy="42" r="27" fill="white" />
        </svg>

        <span
          style={{
            color: "rgba(255,255,255,0.88)",
            fontSize: `clamp(${lockup.urlMin}px, ${lockup.urlCqh}cqh, ${lockup.urlMax}px)`,
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            textShadow: "0 1px 6px rgba(0,0,0,0.8)",
            lineHeight: 1
          }}
        >
          {platformUrl}
        </span>
        {qrSrc ? <PreviewizerQrBadge qrSrc={qrSrc} sizeCqh={lockup.logoCqh + 1.5} sizeMin={32} sizeMax={64} /> : null}
      </div>
    </div>
  );
}

export type { MysteryCropOverlayProps };

"use client";

import type { FrostedGlassCardScale } from "../previewizer-template-compositions";

interface GlassCardOverlayProps {
  label?: string;
  cta?: string;
  glassScale?: FrostedGlassCardScale;
  glassOpacity?: number;
  backgroundDim?: number;
  exportMode?: boolean;
}

const GLASS_SCALE: Record<FrostedGlassCardScale, { width: string; height: string }> = {
  small: { width: "58%", height: "72%" },
  medium: { width: "68%", height: "80%" },
  large: { width: "78%", height: "88%" }
};

function buildGlassBloom(glassOpacity: number, exportMode: boolean) {
  const t = Math.max(0, Math.min(100, glassOpacity)) / 100;

  const uniformBackground = exportMode
    ? "linear-gradient(160deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.22) 60%, rgba(255,255,255,0.30) 100%)"
    : "linear-gradient(160deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.14) 60%, rgba(255,255,255,0.20) 100%)";

  if (t >= 1) {
    return { uniform: true as const, background: uniformBackground };
  }

  // Inside-out: solid frosted core, soft feather toward card edges.
  // Lower bloom = feather starts closer to center; higher values expand toward edges.
  const peakAlpha = exportMode ? 0.38 : 0.28;
  const solidCore = 12 + t * 58;
  const fadeEnd = 38 + t * 60;

  const background = `radial-gradient(ellipse 100% 100% at 50% 48%, rgba(255,255,255,${peakAlpha}) 0%, rgba(255,255,255,${peakAlpha * 0.55}) ${solidCore}%, rgba(255,255,255,0) ${fadeEnd}%)`;
  const maskImage = `radial-gradient(ellipse 100% 100% at 50% 48%, black 0%, black ${solidCore + 4}%, transparent ${fadeEnd}%)`;

  return {
    uniform: false as const,
    background,
    maskImage,
    WebkitMaskImage: maskImage
  };
}

export default function GlassCardOverlay({
  label = "Premium Content",
  cta = "SEE FULL ART",
  glassScale = "small",
  glassOpacity = 100,
  backgroundDim = 0,
  exportMode = false
}: GlassCardOverlayProps) {
  const scale = GLASS_SCALE[glassScale] ?? GLASS_SCALE.small;
  const bloom = buildGlassBloom(glassOpacity, exportMode);
  const dimAlpha = (Math.max(0, Math.min(100, backgroundDim)) / 100) * 0.62;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        containerType: "size",
        pointerEvents: "none"
      }}
      aria-label="Premium content paywall"
      role="region"
    >
      {dimAlpha > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `rgba(0,0,0,${dimAlpha})`,
            pointerEvents: "none"
          }}
          aria-hidden="true"
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: scale.width,
          height: scale.height,
          pointerEvents: "none"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "clamp(12px, 3.5cqh, 28px)",
            backdropFilter: exportMode ? undefined : "blur(28px) saturate(1.15) brightness(1.05)",
            WebkitBackdropFilter: exportMode
              ? undefined
              : "blur(28px) saturate(1.15) brightness(1.05)",
            background: bloom.background,
            ...(bloom.uniform
              ? {}
              : {
                  maskImage: bloom.maskImage,
                  WebkitMaskImage: bloom.WebkitMaskImage
                }),
            border: "1px solid rgba(255,255,255,0.45)",
            boxShadow: [
              "0 8px 48px rgba(0,0,0,0.32)",
              "0 2px 8px rgba(0,0,0,0.18)",
              "inset 0 1px 0 rgba(255,255,255,0.55)"
            ].join(", "),
            pointerEvents: "none"
          }}
          aria-hidden="true"
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            height: "100%",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "clamp(14px, 4.5cqh, 36px)",
            paddingBottom: "clamp(14px, 4.5cqh, 36px)",
            paddingLeft: "clamp(12px, 3cqh, 24px)",
            paddingRight: "clamp(12px, 3cqh, 24px)",
            pointerEvents: "auto"
          }}
        >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "clamp(6px, 1.4cqh, 11px)"
          }}
        >
          <svg
            viewBox="0 0 109 118"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{
              width: "clamp(20px, 5cqh, 38px)",
              height: "clamp(20px, 5cqh, 38px)",
              flexShrink: 0
            }}
          >
            <rect width="109" height="118" rx="20" fill="white" />
            <rect x="18" y="20" width="16" height="78" rx="4" fill="#1a1a1a" />
            <circle cx="68" cy="42" r="27" fill="#1a1a1a" />
          </svg>

          <span
            style={{
              color: "#ffffff",
              fontSize: "clamp(11px, 2.8cqh, 22px)",
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              lineHeight: 1,
              textShadow: "0 1px 4px rgba(0,0,0,0.25)"
            }}
          >
            PATREON
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "clamp(8px, 2cqh, 16px)",
            width: "100%"
          }}
        >
          <p
            style={{
              color: "#ffffff",
              fontSize: "clamp(13px, 3.5cqh, 26px)",
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              margin: 0,
              textAlign: "center",
              textShadow: "0 1px 6px rgba(0,0,0,0.30)",
              lineHeight: 1.2
            }}
          >
            {label}
          </p>

          <button
            type="button"
            style={{
              background: "linear-gradient(135deg, #6D28D9 0%, #7C3AED 35%, #0D9488 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "9999px",
              padding: "clamp(7px, 1.6cqh, 13px) clamp(18px, 5cqh, 40px)",
              fontSize: "clamp(9px, 2.2cqh, 17px)",
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 18px rgba(109,40,217,0.45), 0 1px 4px rgba(0,0,0,0.25)"
            }}
          >
            {cta}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

export type { GlassCardOverlayProps };

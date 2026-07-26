"use client";

import { useId } from "react";

import { buildCollageWindowsPalette } from "./collage-windows-palette";
import { PreviewizerQrBadge } from "./previewizer-qr-badge";

interface CollageWindowsOverlayProps {
  cta?: string;
  platformUrl?: string;
  accentHue?: number;
  qrSrc?: string | null;
}

export default function CollageWindowsOverlay({
  cta = "SEE FULL ART",
  platformUrl = "patreon.com/you",
  accentHue = 224,
  qrSrc = null
}: CollageWindowsOverlayProps) {
  const palette = buildCollageWindowsPalette(accentHue);
  const uid = useId().replace(/:/g, "");
  const navyBgId = `navyBg-${uid}`;
  const windowMaskId = `windowMask-${uid}`;

  const VW = 80;
  const VH = 100;

  const windows: [number, number, number, number, number][] = [
    [3.5, 11, 35, 28, -3],
    [42, 12.5, 35, 26, 3],
    [3.5, 42, 35, 36, -2],
    [42, 42, 35, 16, 2],
    [42, 61, 35, 15, -2]
  ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        containerType: "size",
        pointerEvents: "none"
      }}
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={navyBgId} cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor={palette.gradientLight} />
            <stop offset="60%" stopColor={palette.gradientMid} />
            <stop offset="100%" stopColor={palette.gradientDark} />
          </radialGradient>

          <mask id={windowMaskId}>
            <rect width={VW} height={VH} fill="white" />
            {windows.map(([x, y, w, h, rot], i) => {
              const cx = x + w / 2;
              const cy = y + h / 2;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx="1.2"
                  fill="black"
                  transform={`rotate(${rot}, ${cx}, ${cy})`}
                />
              );
            })}
          </mask>
        </defs>

        <rect width={VW} height={VH} fill={`url(#${navyBgId})`} mask={`url(#${windowMaskId})`} />

        {windows.map(([x, y, w, h, rot], i) => {
          const cx = x + w / 2;
          const cy = y + h / 2;
          return (
            <rect
              key={`border-${i}`}
              x={x}
              y={y}
              width={w}
              height={h}
              rx="1.2"
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="0.35"
              transform={`rotate(${rot}, ${cx}, ${cy})`}
            />
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          top: "clamp(8px, 4cqh, 22px)",
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(5px, 1.2cqh, 9px)"
        }}
      >
        <svg
          viewBox="0 0 109 118"
          aria-label="Patreon"
          role="img"
          style={{
            width: "clamp(18px, 4cqh, 30px)",
            height: "clamp(18px, 4cqh, 30px)",
            flexShrink: 0
          }}
        >
          <rect width="109" height="118" rx="20" fill="white" fillOpacity="0.9" />
          <rect x="18" y="20" width="16" height="78" rx="4" fill={palette.logoTop} />
          <circle cx="68" cy="42" r="27" fill={palette.logoTop} />
        </svg>

        <span
          style={{
            color: "#ffffff",
            fontSize: "clamp(10px, 2.6cqh, 17px)",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            lineHeight: 1
          }}
        >
          PATREON
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "clamp(8px, 3.5cqh, 20px)",
          left: "clamp(10px, 3cqw, 22px)",
          right: "clamp(10px, 3cqw, 22px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "clamp(6px, 1.4cqh, 12px)",
            minWidth: 0
          }}
        >
          <svg
            viewBox="0 0 109 118"
            aria-label="Patreon"
            role="img"
            style={{
              width: "clamp(22px, 5cqh, 38px)",
              height: "clamp(22px, 5cqh, 38px)",
              flexShrink: 0
            }}
          >
            <rect width="109" height="118" rx="20" fill="rgba(255,255,255,0.92)" />
            <rect x="18" y="20" width="16" height="78" rx="4" fill={palette.logoBottom} />
            <circle cx="68" cy="42" r="27" fill={palette.logoBottom} />
          </svg>

          <span
            style={{
              color: "rgba(255,255,255,0.88)",
              fontSize: "clamp(9px, 2.1cqh, 14px)",
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textShadow: "0 1px 6px rgba(0,0,0,0.55)",
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            {platformUrl}
          </span>
          {qrSrc ? <PreviewizerQrBadge qrSrc={qrSrc} sizeCqh={5} sizeMin={28} sizeMax={48} /> : null}
        </div>

        <button
          type="button"
          style={{
            background: "linear-gradient(135deg, #6B7FD4 0%, #2A7E7C 100%)",
            border: "none",
            borderRadius: "9999px",
            padding: "clamp(6px, 1.4cqh, 11px) clamp(14px, 4cqw, 28px)",
            color: "#ffffff",
            fontSize: "clamp(9px, 2.1cqh, 14px)",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            whiteSpace: "nowrap",
            pointerEvents: "auto",
            boxShadow: "0 4px 20px rgba(42,126,124,0.45)"
          }}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

export type { CollageWindowsOverlayProps };

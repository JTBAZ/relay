"use client"

import type { ReactNode } from "react"

interface PromoProps {
  text: string
  fontClass?: FontClass
  platform?: Platform
  title?: string
  scale?: number // 1 = full (preview), 0.22 = mini thumbnail
  /** Multiplier for hook text size within the graphic shell (0.5–1.5). */
  textFillRatio?: number
  /** When false, platform lockup is omitted (Previewizer draws lockup separately). */
  showPlatformLockup?: boolean
}

export type FontClass = "impact" | "condensed" | "minimal" | "mono"
export type Platform = "patreon" | "x" | "deviantart" | "bluesky"

function hookEm(base: number, s: number, textFillRatio = 1): number {
  return base * s * textFillRatio
}

function fontStyles(fontClass: FontClass = "impact"): React.CSSProperties {
  switch (fontClass) {
    case "impact":
      return {
        fontFamily: "var(--font-bebas, 'Bebas Neue', Impact, sans-serif)",
        fontWeight: 400,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }
    case "condensed":
      return {
        fontFamily: "var(--font-oswald, 'Oswald', 'Arial Narrow', sans-serif)",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }
    case "minimal":
      return {
        fontFamily: "var(--font-inter, Inter, sans-serif)",
        fontWeight: 500,
        letterSpacing: "0em",
        textTransform: "none",
      }
    case "mono":
      return {
        fontFamily: "'Courier New', Courier, monospace",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }
  }
}

/** Mimics ink pressed into material — triple-layer depth shadow + stroke fill. */
function stampedShadow(s: number, color = "rgba(0,0,0,0.85)"): React.CSSProperties {
  const d = Math.max(1, s * 1.5)
  const b = Math.max(2, s * 4)
  return {
    textShadow: [
      `0 ${d}px ${b}px ${color}`,
      `0 ${d * 0.5}px ${b * 0.5}px ${color}`,
      `${d * 0.5}px ${d}px ${b * 1.5}px rgba(0,0,0,0.6)`,
    ].join(", "),
    WebkitTextStroke: `${Math.max(0.5, s * 0.7)}px rgba(0,0,0,0.45)`,
    paintOrder: "stroke fill",
  } as React.CSSProperties
}

/** Reversed stamped shadow for dark text on a light background. */
function stampedShadowDark(s: number): React.CSSProperties {
  const d = Math.max(0.5, s * 0.8)
  const b = Math.max(1, s * 2)
  return {
    textShadow: [
      `0 ${d}px ${b}px rgba(0,0,0,0.35)`,
      `0 ${-d * 0.4}px ${b * 0.5}px rgba(255,255,255,0.6)`,
    ].join(", "),
    WebkitTextStroke: `${Math.max(0.3, s * 0.4)}px rgba(0,0,0,0.2)`,
    paintOrder: "stroke fill",
  } as React.CSSProperties
}

const DEFAULT_PLATFORM_LABELS: Record<Platform, string> = {
  patreon: "PATREON.COM/YOU",
  x: "X.COM/YOU",
  deviantart: "DEVIANTART.COM/YOU",
  bluesky: "BSKY.APP/YOU",
}

/** Compact pill for embedding inside other presets (showPlatformLockup). */
export function PlatformLockup({
  platform,
  scale = 1,
  urlText,
  textFillRatio = 1,
}: {
  platform: Platform
  scale?: number
  urlText?: string
  textFillRatio?: number
}) {
  const s = scale
  const label = urlText?.trim() || DEFAULT_PLATFORM_LABELS[platform]

  const logo = platformLogoSvg(platform, s)

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4 * s,
        background: "rgba(0,0,0,0.72)",
        borderRadius: 4 * s,
        padding: `${3 * s}px ${7 * s}px`,
        backdropFilter: "blur(4px)",
      }}
    >
      {logo}
      <span
        style={{
          fontSize: hookEm(7, s, textFillRatio),
          color: "rgba(200,200,200,0.75)",
          fontFamily: "var(--font-inter, Inter, sans-serif)",
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: `${42 * s}em`,
        }}
      >
        {label}
      </span>
    </div>
  )
}

function platformLogoSvg(platform: Platform, size: number | string) {
  const w = typeof size === "number" ? 9 * size : size
  const h = typeof size === "number" ? 9 * size : size
  const logos: Record<Platform, ReactNode> = {
    patreon: (
      <svg width={w} height={h} viewBox="0 0 24 24" fill="#FF424D">
        <circle cx="14.5" cy="9.5" r="6.5" />
        <rect x="2" y="2" width="5" height="20" rx="1" fill="#052D49" />
      </svg>
    ),
    x: (
      <svg width={w} height={h} viewBox="0 0 24 24" fill="#fff">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L2.25 2.25h7.172l4.256 5.621zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    deviantart: (
      <svg width={w} height={h} viewBox="0 0 24 24" fill="#05CC47">
        <path d="M19.2 2.4l-3.6 6.24-.84 1.56H19.2v5.52h-6.48l-1.08 1.8-2.64 4.08H4.8l3.6-6.24.84-1.56H4.8V8.28h6.48l1.08-1.8L14.88 2.4H19.2z" />
      </svg>
    ),
    bluesky: (
      <svg width={w} height={h} viewBox="0 0 24 24" fill="#0085ff">
        <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
      </svg>
    ),
  }
  return logos[platform]
}

/** Fills the layer rect — scales with resize drag. */
function PlatformLockupFill({
  platform,
  urlText,
  textFillRatio = 1,
}: {
  platform: Platform
  urlText?: string
  textFillRatio?: number
}) {
  const label = urlText?.trim() || DEFAULT_PLATFORM_LABELS[platform]
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        containerType: "size",
        display: "flex",
        alignItems: "center",
        justifyContent: "stretch",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "72%",
          minHeight: 20,
          display: "flex",
          alignItems: "center",
          gap: "0.35em",
          background: "rgba(0,0,0,0.72)",
          borderRadius: "0.22em",
          padding: "0 0.45em",
          backdropFilter: "blur(4px)",
          boxSizing: "border-box",
          fontSize: `calc(55cqh * ${textFillRatio})`,
        }}
      >
        <div style={{ flexShrink: 0, height: "1.15em", width: "1.15em", display: "flex" }}>
          {platformLogoSvg(platform, "100%")}
        </div>
        <span
          style={{
            flex: 1,
            fontSize: "1em",
            color: "rgba(200,200,200,0.75)",
            fontFamily: "var(--font-inter, Inter, sans-serif)",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   SVG SHELL COMPONENTS — viewBox="0 0 200 200", export-friendly paths only.
   Each shell renders the graphic geometry with zero text content.
   Props: className / style for host <svg>, plus any geometry overrides.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * SaleBurstShell
 * A 14-point starburst centered at (100,100) with outer-stroke ring,
 * concentric inner highlight ring, and a radial top glow gradient.
 */
export function SaleBurstShell({
  id = "saleBurst",
  className,
  style,
}: {
  id?: string
  className?: string
  style?: React.CSSProperties
}) {
  const cx = 100, cy = 100
  const points = 14
  const outerR = 72
  const innerR = outerR * 0.8

  // Build the main burst polygon (alternating outer/inner radii, 28 vertices)
  function burstPath(oR: number, iR: number, angleOffset = 0) {
    return (
      Array.from({ length: points * 2 })
        .map((_, i) => {
          const angle = (i * Math.PI) / points - Math.PI / 2 + angleOffset
          const r = i % 2 === 0 ? oR : iR
          return `${i === 0 ? "M" : "L"}${(cx + r * Math.cos(angle)).toFixed(3)},${(cy + r * Math.sin(angle)).toFixed(3)}`
        })
        .join(" ") + " Z"
    )
  }

  const mainPath  = burstPath(outerR, innerR)           // Primary 14-pt burst
  const innerPath = burstPath(outerR * 0.78, innerR * 0.75) // Concentric inner ring
  const shadowPath = burstPath(outerR, innerR)           // Offset drop shadow (same shape)

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        {/* Radial glow — bright at center-top, fading to transparent */}
        <radialGradient id={`${id}-glow`} cx="50%" cy="42%" r="48%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Drop shadow — same burst shape, offset down-right, low opacity */}
      <path
        d={shadowPath}
        fill="rgba(0,0,0,0.55)"
        transform="translate(6,9)"
      />

      {/* Outer white stroke ring — illustrative outline around entire burst */}
      <path
        d={mainPath}
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinejoin="round"
        opacity="0.88"
      />

      {/* Main burst fill — primary graphic body */}
      <path
        d={mainPath}
        fill="#0e0e0e"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Inner concentric highlight ring — lighter zone closer to center */}
      <path
        d={innerPath}
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Radial top glow — overlaid on fill for center-top catch-light */}
      <path
        d={mainPath}
        fill={`url(#${id}-glow)`}
      />
    </svg>
  )
}

/**
 * StickerOutlineShell
 * A rounded-rectangle sticker with an offset shadow duplicate behind it,
 * a translucent outer halo ring, and an inset top-left highlight band.
 */
export function StickerOutlineShell({
  className,
  style,
}: {
  id?: string
  className?: string
  style?: React.CSSProperties
}) {
  // Sticker body rect: centered, 160×72, rx=18
  const rx = 18, x = 20, y = 64, w = 160, h = 72

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Offset shadow — duplicate rect shifted down-right for sticker depth */}
      <rect
        x={x + 7} y={y + 7}
        width={w} height={h} rx={rx}
        fill="rgba(0,170,111,0.38)"
      />

      {/* Outer halo ring — white translucent ring around the sticker edge */}
      <rect
        x={x - 6} y={y - 6}
        width={w + 12} height={h + 12} rx={rx + 6}
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="4"
      />

      {/* Main sticker body — white fill with green stroke border */}
      <rect
        x={x} y={y}
        width={w} height={h} rx={rx}
        fill="white"
        stroke="#00aa6f"
        strokeWidth="5"
      />

      {/* Inner top highlight band — catch-light across upper third of sticker */}
      <rect
        x={x} y={y}
        width={w} height={h * 0.32} rx={rx}
        fill="rgba(255,255,255,0.55)"
        style={{ mixBlendMode: "overlay" } as React.CSSProperties}
      />

      {/* Bottom inner shadow band — subtle depth under the highlight */}
      <rect
        x={x} y={y + h * 0.7}
        width={w} height={h * 0.3} rx={0}
        fill="rgba(0,170,111,0.08)"
      />
    </svg>
  )
}

/**
 * CornerRibbonShell
 * A top-left horizontal ribbon band with a right-pointing chevron notch at
 * its end, a white top-highlight stripe, an under-ribbon shadow bar,
 * and a fold corner triangle indicating the ribbon's peel depth.
 */
export function CornerRibbonShell({
  className,
  style,
}: {
  id?: string
  className?: string
  style?: React.CSSProperties
}) {
  // Ribbon: full-width at top, height=36
  const rH = 36, rY = 0
  // Chevron notch: right-pointing arrow cut into the ribbon's right edge
  const notchX = 162 // left edge of the notch region
  const notchTip = 180 // x of the rightmost point of the chevron tip
  // Fold triangle: sits below ribbon left corner, indicates wrap depth
  const foldH = 20, foldW = 24

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Under-ribbon shadow bar — flat horizontal shadow below ribbon edge */}
      <rect
        x="0" y={rH}
        width="155" height="9"
        fill="rgba(0,0,0,0.28)"
      />

      {/* Fold corner triangle — dark triangle anchoring ribbon wrap at left edge */}
      <polygon
        points={`0,${rH} 0,${rH + foldH} ${foldW},${rH}`}
        fill="#007a50"
      />

      {/* Main ribbon band — primary horizontal accent bar */}
      <polygon
        points={`0,${rY} ${notchX},${rY} ${notchTip},${rH / 2} ${notchX},${rH} 0,${rH}`}
        fill="#00aa6f"
      />

      {/* Top highlight stripe — bright linear gradient across upper ribbon third */}
      <polygon
        points={`0,${rY} ${notchX},${rY} ${notchTip},${rH / 2} ${notchX * 0.9},${rH * 0.3} 0,${rH * 0.3}`}
        fill="rgba(255,255,255,0.28)"
      />

      {/* Ribbon stroke outline — crisp 1px border defining ribbon edges */}
      <polygon
        points={`0,${rY} ${notchX},${rY} ${notchTip},${rH / 2} ${notchX},${rH} 0,${rH}`}
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
    </svg>
  )
}

/**
 * GhostTagShell
 * A transparent pill CTA with an outer glow ring, a solid white-stroke
 * border, a double-ring box-shadow effect, and an inset top highlight.
 * Represented in SVG as two concentric rounded rectangles.
 */
export function GhostTagShell({
  className,
  style,
}: {
  id?: string
  className?: string
  style?: React.CSSProperties
}) {
  // Main pill: centered 164×52, rx=26 (fully rounded)
  const px = 18, py = 74, pw = 164, ph = 52, pr = 26

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Outer glow ring — wide diffuse halo suggesting luminous edge */}
      <rect
        x={px - 14} y={py - 14}
        width={pw + 28} height={ph + 28} rx={pr + 14}
        fill="none"
        stroke="rgba(155,240,196,0.15)"
        strokeWidth="6"
      />

      {/* Middle accent ring — green tint ring reinforcing the CTA border */}
      <rect
        x={px - 7} y={py - 7}
        width={pw + 14} height={ph + 14} rx={pr + 7}
        fill="none"
        stroke="rgba(155,240,196,0.32)"
        strokeWidth="2"
      />

      {/* Main pill border — solid white stroke defining the ghost pill outline */}
      <rect
        x={px} y={py}
        width={pw} height={ph} rx={pr}
        fill="rgba(0,0,0,0.08)"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="2.5"
      />

      {/* Inner top highlight arc — catch-light across the upper pill surface */}
      <rect
        x={px + 4} y={py + 3}
        width={pw - 8} height={ph * 0.32} rx={pr - 2}
        fill="rgba(255,255,255,0.07)"
      />
    </svg>
  )
}

/**
 * SplitBannerShell
 * A horizontal editorial split: a narrow accent stripe on the left with
 * an inner highlight, and a wide dark plate on the right with top/bottom
 * rule lines. The shell encodes both panels as SVG rects.
 */
export function SplitBannerShell({
  className,
  style,
}: {
  id?: string
  className?: string
  style?: React.CSSProperties
}) {
  // Split at x=22; total band height=68, centered vertically
  const bY = 66, bH = 68
  const stripeW = 22
  const plateX = stripeW, plateW = 200 - stripeW

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Accent stripe — left vertical bar in brand green */}
      <rect
        x="0" y={bY}
        width={stripeW} height={bH}
        fill="#9bf0c4"
      />

      {/* Stripe inner highlight — bright left-edge catch-light on the accent bar */}
      <rect
        x="0" y={bY}
        width={stripeW * 0.42} height={bH}
        fill="rgba(255,255,255,0.32)"
      />

      {/* Dark plate — main text-bearing panel to the right of the stripe */}
      <rect
        x={plateX} y={bY}
        width={plateW} height={bH}
        fill="rgba(0,0,0,0.88)"
      />

      {/* Top rule line — 1px white rule separating plate from artwork above */}
      <line
        x1={plateX} y1={bY}
        x2="200" y2={bY}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />

      {/* Bottom rule line — 1px white rule closing the editorial band below */}
      <line
        x1={plateX} y1={bY + bH}
        x2="200" y2={bY + bH}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />

      {/* Stripe-to-plate join line — thin separator between stripe and dark plate */}
      <line
        x1={plateX} y1={bY}
        x2={plateX} y2={bY + bH}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
      />
    </svg>
  )
}

/**
 * StampMonoShell
 * A dashed-border pill (mono stamp aesthetic) with an outer concentric
 * stroke ring and hollow registration-mark dots at the upper corners.
 */
export function StampMonoShell({
  className,
  style,
}: {
  id?: string
  className?: string
  style?: React.CSSProperties
}) {
  // Main dashed pill: centered 168×64, rx=32
  const px = 16, py = 68, pw = 168, ph = 64, pr = 32
  // Outer concentric ring: +10px padding each side
  const ox = px - 10, oy = py - 10, ow = pw + 20, oh = ph + 20, orx = pr + 10
  // Registration-mark corner dots: hollow circles, top-left + top-right
  const dotR = 5
  const dotsPos = [
    { cx: 22, cy: 22 },
    { cx: 178, cy: 22 },
  ]

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Outer concentric stroke ring — wide halo echoing the pill shape */}
      <rect
        x={ox} y={oy}
        width={ow} height={oh} rx={orx}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.5"
      />

      {/* Main dashed pill — primary stamp body with dashed border */}
      <rect
        x={px} y={py}
        width={pw} height={ph} rx={pr}
        fill="rgba(0,0,0,0.55)"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2"
        strokeDasharray="6 4"
      />

      {/* Inner top highlight — faint catch-light inside the upper pill arc */}
      <rect
        x={px + 6} y={py + 4}
        width={pw - 12} height={ph * 0.28} rx={pr - 4}
        fill="rgba(255,255,255,0.05)"
      />

      {/* Registration-mark dots — hollow corner circles, print-register aesthetic */}
      {dotsPos.map((pos, i) => (
        <circle
          key={i}
          cx={pos.cx} cy={pos.cy} r={dotR}
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1"
        />
      ))}
    </svg>
  )
}

/**
 * FlashPillShell
 * A solid dark pill with an offset drop shadow pill behind it,
 * an outer thin stroke ring, and an inset top highlight arc.
 */
export function FlashPillShell({
  className,
  style,
}: {
  id?: string
  className?: string
  style?: React.CSSProperties
}) {
  // Main pill: centered 168×56, rx=28
  const px = 16, py = 72, pw = 168, ph = 56, pr = 28

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Drop shadow pill — same shape offset down-right for material depth */}
      <rect
        x={px + 5} y={py + 8}
        width={pw} height={ph} rx={pr}
        fill="rgba(0,0,0,0.52)"
      />

      {/* Outer stroke ring — thin halo slightly larger than the pill */}
      <rect
        x={px - 6} y={py - 6}
        width={pw + 12} height={ph + 12} rx={pr + 6}
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="2"
      />

      {/* Main pill body — primary dark container */}
      <rect
        x={px} y={py}
        width={pw} height={ph} rx={pr}
        fill="rgba(0,0,0,0.88)"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.5"
      />

      {/* Inner top highlight arc — catch-light across upper pill surface */}
      <rect
        x={px + 5} y={py + 4}
        width={pw - 10} height={ph * 0.3} rx={pr - 2}
        fill="rgba(255,255,255,0.06)"
      />
    </svg>
  )
}

/**
 * PlatformCardShell
 * A rounded-rectangle card with an offset shadow, a platform color-dot
 * circle with white halo ring, and an inset top highlight strip.
 */
export function PlatformCardShell({
  platformColor = "#FF424D",
  className,
  style,
}: {
  platformColor?: string
  id?: string
  className?: string
  style?: React.CSSProperties
}) {
  // Card: centered 168×64, rx=14
  const cx = 16, cy = 68, cw = 168, ch = 64, cr = 14
  // Logo dot: left side of card
  const dotCx = 48, dotCy = 100, dotR = 18

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Offset shadow card — same card shape shifted for material depth */}
      <rect
        x={cx + 5} y={cy + 7}
        width={cw} height={ch} rx={cr}
        fill="rgba(0,0,0,0.45)"
      />

      {/* Main card body — dark semi-transparent container */}
      <rect
        x={cx} y={cy}
        width={cw} height={ch} rx={cr}
        fill="rgba(17,17,17,0.92)"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1.5"
      />

      {/* Inner top highlight strip — catch-light across upper card edge */}
      <rect
        x={cx} y={cy}
        width={cw} height={ch * 0.22} rx={cr}
        fill="rgba(255,255,255,0.04)"
      />

      {/* Platform color dot — brand-colored circle as platform identity marker */}
      <circle
        cx={dotCx} cy={dotCy} r={dotR}
        fill={platformColor}
      />

      {/* Dot white halo ring — outer white ring framing the platform dot */}
      <circle
        cx={dotCx} cy={dotCy} r={dotR + 3.5}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="2"
      />

      {/* Text placeholder rule lines — indicate where hook text + URL sit */}
      <rect
        x={dotCx + dotR + 8} y={dotCy - 10}
        width={72} height={8} rx={2}
        fill="rgba(255,255,255,0.1)"
      />
      <rect
        x={dotCx + dotR + 8} y={dotCy + 6}
        width={50} height={5} rx={2}
        fill="rgba(255,255,255,0.06)"
      />
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   PROMO COMPOSITE COMPONENTS — shell SVG + stamped text overlay.
   Each Promo* renders its *Shell as an absolute-positioned layer at 100%
   size, then floats hook text and platform lockup on top via z-index.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── 1. SALE BURST ──────────────────────────────────────────────────────── */
export function PromoSaleBurst({
  text,
  fontClass = "impact",
  platform = "patreon",
  scale = 1,
  textFillRatio = 1,
  showPlatformLockup = false,
}: PromoProps) {
  const s = scale
  const textSize = hookEm(5.2, s, textFillRatio)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Shell SVG — burst geometry, no text */}
      <SaleBurstShell
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          filter: `drop-shadow(0 ${2 * s}px ${8 * s}px rgba(0,0,0,0.7))`,
        }}
      />

      {/* Hook text — stamped onto the burst center */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          lineHeight: 0.95,
          padding: `0 ${8 * s}%`,
          ...fontStyles(fontClass),
          fontSize: `${textSize}em`,
          color: "white",
          ...stampedShadow(s),
        }}
      >
        {text}
      </div>

      {/* Platform lockup — subordinate URL bar at bottom */}
      {showPlatformLockup ? (
      <div
        style={{
          position: "absolute",
          bottom: `${4 * s}%`,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3,
        }}
      >
        <PlatformLockup platform={platform} scale={s * 0.72} />
      </div>
      ) : null}
    </div>
  )
}

/* ─── 2. STICKER OUTLINE ─────────────────────────────────────────────────── */
export function PromoStickerOutline({
  text,
  fontClass = "impact",
  platform = "patreon",
  scale = 1,
  textFillRatio = 1,
  showPlatformLockup = false,
}: PromoProps) {
  const s = scale
  const textSize = hookEm(3.6, s, textFillRatio)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Shell SVG — sticker rect, offset shadow, halo, highlight */}
      <StickerOutlineShell
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Hook text — stamped dark ink onto white sticker surface */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          lineHeight: 1,
          ...fontStyles(fontClass),
          fontSize: `${textSize}em`,
          color: "#0e0e0e",
          ...stampedShadowDark(s),
        }}
      >
        {text}
      </div>

      {showPlatformLockup ? (
      <div
        style={{
          position: "absolute",
          bottom: `${4 * s}%`,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3,
        }}
      >
        <PlatformLockup platform={platform} scale={s * 0.7} />
      </div>
      ) : null}
    </div>
  )
}

/* ─── 3. CORNER RIBBON ───────────────────────────────────────────────────── */
export function PromoCornerRibbon({
  text,
  fontClass = "condensed",
  platform = "patreon",
  scale = 1,
  textFillRatio = 1,
  showPlatformLockup = false,
}: PromoProps) {
  const s = scale
  const textSize = hookEm(3.5, s, textFillRatio)

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Shell SVG — ribbon band, chevron notch, fold triangle, shadow */}
      <CornerRibbonShell
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Ribbon text — stamped onto the ribbon band at top-left */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          // Match shell ribbon proportions: height≈18% of container
          height: "18%",
          width: "82%",
          display: "flex",
          alignItems: "center",
          paddingLeft: `${8 * s}px`,
          zIndex: 2,
        }}
      >
        <span
          style={{
            ...fontStyles(fontClass),
            fontSize: `${1.8 * s}em`,
            color: "white",
            lineHeight: 1,
            ...stampedShadow(s * 0.6),
          }}
        >
          {text}
        </span>
      </div>

      {/* Center large hook text — main call-to-action below ribbon */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <span
          style={{
            ...fontStyles(fontClass),
            fontSize: `${textSize}em`,
            color: "white",
            lineHeight: 1,
            ...stampedShadow(s),
          }}
        >
          {text}
        </span>
      </div>

      {showPlatformLockup ? (
      <div
        style={{
          position: "absolute",
          bottom: `${4 * s}%`,
          right: `${4 * s}%`,
          zIndex: 3,
        }}
      >
        <PlatformLockup platform={platform} scale={s * 0.72} />
      </div>
      ) : null}
    </div>
  )
}

/* ─── 4. GHOST TAG ───────────────────────────────────────────────────────── */
export function PromoGhostTag({
  text,
  fontClass = "minimal",
  platform = "patreon",
  scale = 1,
  textFillRatio = 1,
  showPlatformLockup = false,
}: PromoProps) {
  const s = scale
  const textSize = hookEm(2.8, s, textFillRatio)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Shell SVG — glow rings, pill border, inner highlight */}
      <GhostTagShell
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Hook text — green, stamped onto the transparent pill */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          lineHeight: 1,
          ...fontStyles(fontClass),
          fontSize: `${textSize}em`,
          color: "#9bf0c4",
          ...stampedShadow(s, "rgba(0,0,0,0.7)"),
        }}
      >
        {text}
      </div>

      {showPlatformLockup ? (
      <div
        style={{
          position: "absolute",
          bottom: `${4 * s}%`,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3,
        }}
      >
        <PlatformLockup platform={platform} scale={s * 0.68} />
      </div>
      ) : null}
    </div>
  )
}

/* ─── 5. SPLIT BANNER ────────────────────────────────────────────────────── */
export function PromoSplitBanner({
  text,
  fontClass = "condensed",
  platform = "patreon",
  title,
  scale = 1,
  textFillRatio = 1,
  showPlatformLockup = false,
}: PromoProps) {
  const s = scale
  const textSize = hookEm(3.2, s, textFillRatio)

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Shell SVG — accent stripe, dark plate, rule lines */}
      <SplitBannerShell
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Editorial title — italic above the plate */}
      {title && (
        <div
          style={{
            position: "absolute",
            top: `${8 * s}%`,
            left: `${5 * s}%`,
            right: `${5 * s}%`,
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: `${1.8 * s}em`,
              color: "rgba(255,255,255,0.85)",
              fontStyle: "italic",
              letterSpacing: "0.01em",
            }}
          >
            {title}
          </span>
        </div>
      )}

      {/* "New Issue" superlabel — sits inside the dark plate */}
      <div
        style={{
          position: "absolute",
          // Plate starts at ~33% of height (matches shell bY=66/200)
          top: "35%",
          left: "14%",
          zIndex: 2,
          fontFamily: "var(--font-inter, Inter, sans-serif)",
          fontSize: `${0.85 * s}em`,
          color: "#9bf0c4",
          fontWeight: 600,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        New Issue
      </div>

      {/* Hook text — stamped onto the dark plate */}
      <div
        style={{
          position: "absolute",
          top: "44%",
          left: "14%",
          right: "4%",
          zIndex: 2,
          ...fontStyles(fontClass),
          fontSize: `${textSize}em`,
          color: "white",
          lineHeight: 1,
          ...stampedShadow(s),
        }}
      >
        {text}
      </div>

      {showPlatformLockup ? (
      <div
        style={{
          position: "absolute",
          bottom: `${4 * s}%`,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3,
        }}
      >
        <PlatformLockup platform={platform} scale={s * 0.72} />
      </div>
      ) : null}
    </div>
  )
}

/* ─── 6. STAMP MONO ──────────────────────────────────────────────────────── */
export function PromoStampMono({
  text,
  platform = "patreon",
  scale = 1,
  textFillRatio = 1,
  showPlatformLockup = false,
}: PromoProps) {
  const s = scale
  const textSize = hookEm(2.8, s, textFillRatio)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Shell SVG — outer ring, dashed pill, highlight, reg dots */}
      <StampMonoShell
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* "EXCLUSIVE" superlabel — mono uppercase above hook text */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          ...fontStyles("mono"),
          fontSize: `${1.5 * s}em`,
          color: "rgba(155,240,196,0.65)",
          lineHeight: 1,
          letterSpacing: "0.25em",
          marginBottom: 4 * s,
        }}
      >
        EXCLUSIVE
      </div>

      {/* Hook text — stamped mono type inside the dashed pill */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          lineHeight: 1,
          ...fontStyles("mono"),
          fontSize: `${textSize}em`,
          color: "white",
          ...stampedShadow(s),
        }}
      >
        {text}
      </div>

      {showPlatformLockup ? (
      <div
        style={{
          position: "absolute",
          bottom: `${14 * s}%`,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3,
        }}
      >
        <PlatformLockup platform={platform} scale={s * 0.7} />
      </div>
      ) : null}
    </div>
  )
}

/* ─── 7. FLASH PILL ──────────────────────────────────────────────────────── */
export function PromoFlashPill({
  text,
  fontClass = "impact",
  platform = "patreon",
  scale = 1,
  textFillRatio = 1,
  showPlatformLockup = false,
}: PromoProps) {
  const s = scale
  const textSize = hookEm(3.2, s, textFillRatio)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Shell SVG — shadow pill, outer ring, main pill, highlight */}
      <FlashPillShell
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Hook text — stamped onto the dark pill */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          lineHeight: 1,
          ...fontStyles(fontClass),
          fontSize: `${textSize}em`,
          color: "white",
          ...stampedShadow(s),
        }}
      >
        {text}
      </div>

      {showPlatformLockup ? (
      <div
        style={{
          position: "absolute",
          bottom: `${4 * s}%`,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3,
        }}
      >
        <PlatformLockup platform={platform} scale={s * 0.72} />
      </div>
      ) : null}
    </div>
  )
}

/* ─── 8. PLATFORM CARD ───────────────────────────────────────────────────── */
export function PromoPlatformCard({
  text,
  fontClass = "minimal",
  platform = "patreon",
  scale = 1,
  textFillRatio = 1,
}: PromoProps) {
  const s = scale
  const platformColors: Record<Platform, string> = {
    patreon: "#FF424D",
    x: "#ffffff",
    deviantart: "#05CC47",
    bluesky: "#0085ff",
  }
  const platformNames: Record<Platform, string> = {
    patreon: "Patreon",
    x: "X",
    deviantart: "DeviantArt",
    bluesky: "Bluesky",
  }
  const platformUrls: Record<Platform, string> = {
    patreon: "patreon.com/you",
    x: "x.com/you",
    deviantart: "deviantart.com/you",
    bluesky: "bsky.app/you",
  }
  const textSize = hookEm(2.2, s, textFillRatio)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Shell SVG — shadow card, card body, color dot, halo, highlight */}
      <PlatformCardShell
        platformColor={platformColors[platform]}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Card content row — logo initial + hook + URL */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: 12 * s,
          padding: `0 ${18 * s}px`,
          width: "84%",
        }}
      >
        {/* Platform letter — sits over the shell's dot circle */}
        <div
          style={{
            width: 28 * s,
            height: 28 * s,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              ...fontStyles("minimal"),
              fontSize: `${1 * s}em`,
              color: platform === "x" ? "#111" : "white",
              fontWeight: 700,
            }}
          >
            {platformNames[platform][0]}
          </span>
        </div>

        <div style={{ flex: 1 }}>
          {/* Hook text — stamped onto the card */}
          <div
            style={{
              ...fontStyles(fontClass),
              fontSize: `${textSize}em`,
              color: "white",
              lineHeight: 1,
              ...stampedShadow(s * 0.6),
            }}
          >
            {text}
          </div>

          {/* URL — clearly subordinate in size and opacity */}
          <div
            style={{
              fontFamily: "var(--font-inter, Inter, sans-serif)",
              fontSize: `${5.5 * s}px`,
              color: "rgba(255,255,255,0.38)",
              marginTop: 3 * s,
              letterSpacing: "0.08em",
            }}
          >
            {platformUrls[platform]}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── 9. PLATFORM LOCKUP (standalone branding preset) ─────────────────────── */
export function PromoPlatformLockup({
  text,
  platform = "patreon",
  scale = 1,
  textFillRatio = 1,
}: PromoProps) {
  // Thumbnail picker uses small scale — keep compact inline pill
  if (scale < 0.5) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PlatformLockup
          platform={platform}
          scale={scale}
          urlText={text}
          textFillRatio={textFillRatio}
        />
      </div>
    )
  }

  return (
    <PlatformLockupFill platform={platform} urlText={text} textFillRatio={textFillRatio} />
  )
}

/* ─── Render dispatch ─────────────────────────────────────────────────────── */
export type PresetId =
  | "sale_burst"
  | "sticker_outline"
  | "corner_ribbon"
  | "ghost_tag"
  | "split_banner"
  | "stamp_mono"
  | "flash_pill"
  | "platform_card"
  | "platform_lockup"

/** Alias used by Previewizer overlay model. */
export type PromoGraphicId = PresetId

export const PRESET_META: Record<PresetId, { name: string; desc: string; defaultFont: FontClass }> =
  {
    sale_burst: { name: "Flash Sale", desc: "14-pt starburst burst shell", defaultFont: "impact" },
    sticker_outline: {
      name: "Sticker",
      desc: "White rect, green border + shadow",
      defaultFont: "impact",
    },
    corner_ribbon: {
      name: "Corner Drop",
      desc: "Angled top-left ribbon + fold",
      defaultFont: "condensed",
    },
    ghost_tag: {
      name: "Soft CTA",
      desc: "Transparent double-ring pill",
      defaultFont: "minimal",
    },
    split_banner: {
      name: "Editorial",
      desc: "Accent stripe + dark plate",
      defaultFont: "condensed",
    },
    stamp_mono: {
      name: "Exclusive Stamp",
      desc: "Dashed border, mono vibe",
      defaultFont: "mono",
    },
    flash_pill: {
      name: "Classic Pill",
      desc: "Dark pill + outer stroke ring",
      defaultFont: "impact",
    },
    platform_card: {
      name: "Platform Card",
      desc: "Logo dot + URL card layout",
      defaultFont: "minimal",
    },
    platform_lockup: {
      name: "Platform Lockup",
      desc: "Compact logo pill + URL",
      defaultFont: "minimal",
    },
  }

export function PromoGraphicRenderer({
  preset,
  text,
  fontClass,
  platform,
  title,
  scale,
  textFillRatio = 1,
  showPlatformLockup = false,
  opacity = 1,
}: {
  preset: PresetId
  text: string
  fontClass: FontClass
  platform: Platform
  title?: string
  scale?: number
  textFillRatio?: number
  showPlatformLockup?: boolean
  opacity?: number
}) {
  const props = { text, fontClass, platform, title, scale, textFillRatio, showPlatformLockup }
  let inner: ReactNode
  switch (preset) {
    case "sale_burst":
      inner = <PromoSaleBurst {...props} />
      break
    case "sticker_outline":
      inner = <PromoStickerOutline {...props} />
      break
    case "corner_ribbon":
      inner = <PromoCornerRibbon {...props} />
      break
    case "ghost_tag":
      inner = <PromoGhostTag {...props} />
      break
    case "split_banner":
      inner = <PromoSplitBanner {...props} />
      break
    case "stamp_mono":
      inner = <PromoStampMono {...props} />
      break
    case "flash_pill":
      inner = <PromoFlashPill {...props} />
      break
    case "platform_card":
      inner = <PromoPlatformCard {...props} />
      break
    case "platform_lockup":
      inner = <PromoPlatformLockup {...props} />
      break
    default:
      inner = null
  }
  return (
    <div style={{ width: "100%", height: "100%", opacity }}>
      {inner}
    </div>
  )
}

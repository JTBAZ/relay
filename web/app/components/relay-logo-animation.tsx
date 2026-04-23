"use client"

import { useEffect, useRef, useState, useCallback } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  id: number
  arm: number
  progress: number
  speed: number
  scale: number
  opacity: number
}

interface OrbitalDot {
  id: number
  angle: number
  speed: number
  radius: number
  size: number
  opacity: number
  phase: number
}

interface SignalRing {
  id: number
  progress: number
  speed: number
}

interface HubRipple {
  id: number
  progress: number
  speed: number
}

interface MousePosition {
  x: number
  y: number
  normalizedX: number  // -1 to 1
  normalizedY: number  // -1 to 1
}

// ─── Geometry Constants ───────────────────────────────────────────────────────

const CX = 100
const CY = 100
const RING_R      = 78
const RING_STROKE = 3.0
const ARM_STROKE  = 2.6
const HUB_R       = 7
const NODE_R      = 4.2
/** Travel: ripple expands from hub outward (opacity gated by annulus below). */
const HUB_RIPPLE_TRAVEL_R0 = 10
const HUB_RIPPLE_TRAVEL_R1 = RING_R - 2.5
/** Only the annulus between these radii (the “white band” in the reference) shows the ripple. */
const HUB_RIPPLE_BAND_R_IN = 48
const HUB_RIPPLE_BAND_R_OUT = RING_R - 2.5
/** Multiply soft/light VFX opacity (~+30% when hero mark is small). */
const LIGHT_FX = 1.3
const brighter = (o: number) => Math.min(1, o * LIGHT_FX)

const HUB_RIPPLE_MAX_OPACITY = brighter(0.14)
const HUB_RIPPLE_INTERVAL_MS = 4_000
const HUB_RIPPLE_SPEED = 0.00016

// Hub connector arms
const ARMS = [
  { x: CX,      y: CY - 44 },
  { x: CX - 37, y: CY + 25 },
  { x: CX + 37, y: CY + 25 },
]

function armAngle(arm: { x: number; y: number }) {
  return Math.atan2(arm.y - CY, arm.x - CX)
}
const ARM_ANGLES = ARMS.map(armAngle)

// Chevron shape
const CH_TIP  = 4.5
const CH_BACK = 2.8
const CH_HALF = 2.6

function chevronPoints(): string {
  const tip  = `${CH_TIP},0`
  const topL = `${-CH_BACK},${-CH_HALF}`
  const midL = `${CH_TIP * 0.12},0`
  const botL = `${-CH_BACK},${CH_HALF}`
  return `${tip} ${topL} ${midL} ${botL}`
}
const CHEVRON_PTS = chevronPoints()

/** `relayGreen` uses shell tokens: --relay-electric / --relay-green-* */
export type RelayLogoPalette = "gold" | "relayGreen"

const PALETTE: Record<
  RelayLogoPalette,
  {
    core: string
    bright: string
    dim: string
    pale: string
    white: string
    rim: string
    silver: string
    hubRippleStroke: string
  }
> = {
  gold: {
    core: "#B8962D",
    bright: "#D4AF48",
    dim: "#7A6118",
    pale: "#E8D59A",
    white: "#FFF8E7",
    rim: "#E8E4D8",
    silver: "#C8C4B8",
    hubRippleStroke: "#9A6E14",
  },
  relayGreen: {
    core: "#00AA6F",
    bright: "#34d399",
    dim: "#065f46",
    pale: "#6ee7b7",
    white: "#ecfdf5",
    rim: "#d1fae5",
    silver: "#86efac",
    hubRippleStroke: "#047857",
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function easeOutQuad(t: number) {
  return t * (2 - t)
}

/** 0 outside [R_in, R_out]; ramps 0 → max at mid-band → 0 at inner face of the outer ring. */
function hubRippleAnnulusOpacity(r: number, maxOp: number): number {
  const a = HUB_RIPPLE_BAND_R_IN
  const b = HUB_RIPPLE_BAND_R_OUT
  if (r <= a || r >= b) return 0
  const peak = (a + b) * 0.5
  if (r <= peak) {
    return maxOp * (r - a) / (peak - a)
  }
  return maxOp * (b - r) / (b - peak)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RelayLogoAnimation({ palette = "gold" }: { palette?: RelayLogoPalette }) {
  const c = PALETTE[palette]
  const [tick, setTick] = useState(0)
  const frameRef   = useRef<number>(0)
  const startRef   = useRef<number | null>(null)
  const prevTsRef  = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Mouse position for atmospheric response
  const [mouse, setMouse] = useState<MousePosition>({
    x: 100, y: 100, normalizedX: 0, normalizedY: 0
  })

  const stateRef = useRef({
    particles:     [] as Particle[],
    orbitalDots:   [] as OrbitalDot[],
    signalRings:   [] as SignalRing[],
    hubRipples:    [] as HubRipple[],
    hubPulse:      0,
    ringPulse:     0,
    armGlow:       [0, 0, 0] as [number, number, number],
    particleIdSeq: 0,
    hubRippleIdSeq: 0,
    lastHubRippleAt: 0 as number,
    spawnAccum:    [0, 0, 0] as [number, number, number],
  })

  // Mouse tracking handler
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const normalizedX = ((x / rect.width) - 0.5) * 2
    const normalizedY = ((y / rect.height) - 0.5) * 2
    setMouse({ x, y, normalizedX, normalizedY })
  }, [])

  // Attach/detach mouse listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener("mousemove", handleMouseMove)
    return () => container.removeEventListener("mousemove", handleMouseMove)
  }, [handleMouseMove])

  // Initialise static data
  useEffect(() => {
    const s = stateRef.current
    s.orbitalDots = Array.from({ length: 5 }, (_, i) => ({
      id:      i,
      angle:   (i / 5) * Math.PI * 2,
      speed:   0.000080 + i * 0.000011,
      radius:  RING_R + 1.2,
      size:    1.8,
      opacity: 0.38 + (i % 2) * 0.16,
      phase:   i * 0.85,
    }))
    s.signalRings = Array.from({ length: 3 }, (_, i) => ({
      id:       i,
      progress: i / 3,
      speed:    0.000275,
    }))
  }, [])

  // Animation loop
  useEffect(() => {
    const loop = (ts: number) => {
      if (!startRef.current)  startRef.current  = ts
      if (!prevTsRef.current) prevTsRef.current = ts
      const elapsed = ts - startRef.current
      const dt      = Math.min(ts - prevTsRef.current, 50)
      prevTsRef.current = ts
      const s = stateRef.current

      s.hubPulse  = (Math.sin(elapsed * 0.000375) + 1) / 2
      s.ringPulse = (Math.sin(elapsed * 0.000240) + 1) / 2
      s.armGlow = [
        (Math.sin(elapsed * 0.000425 + 0.0)  + 1) / 2,
        (Math.sin(elapsed * 0.000425 + 2.09) + 1) / 2,
        (Math.sin(elapsed * 0.000425 + 4.19) + 1) / 2,
      ]

      for (const dot of s.orbitalDots) {
        dot.angle += dot.speed * dt
      }
      for (const ring of s.signalRings) {
        ring.progress += ring.speed * dt
        if (ring.progress >= 1) ring.progress -= 1
      }

      for (const hr of s.hubRipples) {
        hr.progress += hr.speed * dt
      }
      s.hubRipples = s.hubRipples.filter((hr) => hr.progress < 1.0)

      if (s.lastHubRippleAt === 0) s.lastHubRippleAt = ts
      if (ts - s.lastHubRippleAt >= HUB_RIPPLE_INTERVAL_MS) {
        s.hubRipples.push({
          id: s.hubRippleIdSeq++,
          progress: 0,
          speed: HUB_RIPPLE_SPEED,
        })
        s.lastHubRippleAt = ts
      }

      // Chevron spawning
      const SPAWN_INTERVAL = 1800
      for (let arm = 0; arm < ARMS.length; arm++) {
        s.spawnAccum[arm] += dt
        if (s.spawnAccum[arm] >= SPAWN_INTERVAL) {
          s.spawnAccum[arm] -= SPAWN_INTERVAL
          if (s.particles.filter(p => p.arm === arm).length < 2) {
            s.particles.push({
              id: s.particleIdSeq++,
              arm,
              progress: 0,
              speed: 0.000425 + arm * 0.000022,
              scale: 0.78 + (s.particleIdSeq % 3) * 0.12,
              opacity: 0.75 + (s.particleIdSeq % 4) * 0.065,
            })
          }
        }
      }

      for (const p of s.particles) {
        p.progress += p.speed * dt
      }
      s.particles = s.particles.filter((p) => p.progress < 1.02)

      setTick(t => t + 1)
      frameRef.current = requestAnimationFrame(loop)
    }

    frameRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  const s = stateRef.current

  // Derived values
  const hubGlowR    = HUB_R + 3 + s.hubPulse * 5
  const hubOpacity  = brighter(0.18 + s.hubPulse * 0.28)
  const ringStrokeW = RING_STROKE + s.ringPulse * 1.1

  const sigRings = s.signalRings.map(r => ({
    ...r,
    r: 8 + r.progress * (RING_R - 14),
    opacity: (1 - r.progress) * brighter(0.18),
  }))

  const chevrons = s.particles.map(p => {
    const t        = clamp(p.progress, 0, 1)
    const arm      = ARMS[p.arm]
    const angle    = ARM_ANGLES[p.arm]
    const x        = lerp(CX, arm.x, t)
    const y        = lerp(CY, arm.y, t)
    const fade     = t > 0.88 ? (1 - t) / 0.12 : 1
    const fadeIn   = t < 0.06 ? t / 0.06 : 1
    const angleDeg = (angle * 180) / Math.PI
    return { ...p, x, y, angleDeg, fade: fade * fadeIn }
  })

  // Deterministic stars
  const stars = useRef(
    Array.from({ length: 34 }, (_, i) => ({
      x: 6 + ((i * 41 + i * i * 7) % 188),
      y: 6 + ((i * 59 + i * 11) % 188),
      r: 0.28 + (i % 4) * 0.18,
      opacity: 0.045 + (i % 5) * 0.022,
    }))
  ).current

  // Mouse-responsive atmospheric offset (subtle parallax)
  const atmosphereOffsetX = mouse.normalizedX * 3
  const atmosphereOffsetY = mouse.normalizedY * 3
  const mouseGlowIntensity = 0.03 + (1 - Math.abs(mouse.normalizedX) * Math.abs(mouse.normalizedY)) * 0.04

  return (
    <>
      <style>{`
        @keyframes relayLogoHoverY {
          0%,
          100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -2.25px, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .relay-logo-hover-wrap {
            animation: none !important;
          }
        }
      `}</style>
      <div
        ref={containerRef}
        className="relay-logo-hover-wrap"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          animation: "relayLogoHoverY 5.5s ease-in-out infinite",
          willChange: "transform",
        }}
        aria-label="Relay brand logo animation"
      >
      <svg
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
        aria-hidden="true"
      >
        <defs>
          {/* Hub glow — subtle metallic */}
          <filter id="hub-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Soft glow */}
          <filter id="soft-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Metallic rim glow — tighter for sharp rim lighting */}
          <filter id="rim-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Chevron glow */}
          <filter id="chevron-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Node glow */}
          <filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.0" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Soft expanding band from hub on chevron arrival */}
          <filter id="hub-ripple-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Atmospheric glow — mouse responsive */}
          <filter id="atmosphere-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" result="blur" />
          </filter>

          {/* Outer ring gradient — metallic gold */}
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={c.bright} stopOpacity="0.95" />
            <stop offset="40%"  stopColor={c.core}        stopOpacity="1"    />
            <stop offset="100%" stopColor={c.dim}    stopOpacity="0.72" />
          </linearGradient>

          {/* Metallic rim gradient */}
          <linearGradient id="rim-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={c.rim} stopOpacity="0.9" />
            <stop offset="50%"  stopColor={c.silver} stopOpacity="0.6" />
            <stop offset="100%" stopColor={c.pale}     stopOpacity="0.3" />
          </linearGradient>

          {/* Hub radial gradient */}
          <radialGradient id="hub-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={c.white}  />
            <stop offset="45%"  stopColor={c.bright} />
            <stop offset="100%" stopColor={c.core}        />
          </radialGradient>

          {/* Per-arm linear gradients */}
          {ARMS.map((arm, i) => (
            <linearGradient
              key={`ag-${i}`}
              id={`arm-grad-${i}`}
              x1={CX} y1={CY}
              x2={arm.x} y2={arm.y}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%"   stopColor={c.bright} stopOpacity="1" />
              <stop offset="100%" stopColor={c.core}        stopOpacity={0.55 + s.armGlow[i] * 0.38} />
            </linearGradient>
          ))}

          {/* Node gradient */}
          <radialGradient id="node-grad" cx="38%" cy="35%" r="62%">
            <stop offset="0%"   stopColor={c.white}  />
            <stop offset="55%"  stopColor={c.bright} />
            <stop offset="100%" stopColor={c.core}        />
          </radialGradient>

          {/* Background vignette */}
          <radialGradient id="bg-vignette" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#0D0B08" stopOpacity="0"   />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.7" />
          </radialGradient>

          {/* Space gradient — deep cosmos tones */}
          <radialGradient id="space-gradient" cx="50%" cy="45%" r="70%">
            <stop offset="0%"   stopColor="#0F0D0A" stopOpacity="1" />
            <stop offset="45%"  stopColor="#0A0908" stopOpacity="1" />
            <stop offset="100%" stopColor="#030302" stopOpacity="1" />
          </radialGradient>

          {/* Subtle warm nebula glow */}
          <radialGradient id="nebula-glow" cx="30%" cy="25%" r="60%">
            <stop offset="0%"   stopColor={c.dim} stopOpacity={String(brighter(0.04))} />
            <stop offset="100%" stopColor={c.dim} stopOpacity="0" />
          </radialGradient>

          {/* Secondary nebula — bottom right */}
          <radialGradient id="nebula-glow-2" cx="75%" cy="80%" r="50%">
            <stop offset="0%"   stopColor={c.core} stopOpacity={String(brighter(0.025))} />
            <stop offset="100%" stopColor={c.core} stopOpacity="0" />
          </radialGradient>

          {/* Grid pattern */}
          <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <line x1="20" y1="0" x2="20" y2="20" stroke={c.core} strokeWidth="0.15" opacity={brighter(0.08)} />
            <line x1="0" y1="20" x2="20" y2="20" stroke={c.core} strokeWidth="0.15" opacity={brighter(0.08)} />
          </pattern>

          {/* Fine grid overlay */}
          <pattern id="fine-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <line x1="10" y1="0" x2="10" y2="10" stroke={c.core} strokeWidth="0.08" opacity={brighter(0.04)} />
            <line x1="0" y1="10" x2="10" y2="10" stroke={c.core} strokeWidth="0.08" opacity={brighter(0.04)} />
          </pattern>

          {/* Chevron gradient */}
          <linearGradient id="chevron-grad" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%"   stopColor={c.white}  stopOpacity="1"   />
            <stop offset="55%"  stopColor={c.bright} stopOpacity="0.9" />
            <stop offset="100%" stopColor={c.core}        stopOpacity="0.15" />
          </linearGradient>

          {/* Node pulse ring gradient */}
          <radialGradient id="pulse-grad" cx="50%" cy="50%" r="50%">
            <stop offset="70%"  stopColor={c.bright} stopOpacity="0" />
            <stop offset="100%" stopColor={c.bright} stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* ══ Background — Space-like Atmosphere ════════════════════════════════ */}
        <rect x="0" y="0" width="200" height="200" fill="url(#space-gradient)" />
        <rect x="0" y="0" width="200" height="200" fill="url(#bg-vignette)" />

        {/* Nebula glow layers */}
        <rect x="0" y="0" width="200" height="200" fill="url(#nebula-glow)" />
        <rect x="0" y="0" width="200" height="200" fill="url(#nebula-glow-2)" />

        {/* Fine grid layer — distant, subtle */}
        <rect x="0" y="0" width="200" height="200" fill="url(#fine-grid)"
          opacity={brighter(0.5 + mouse.normalizedX * 0.15)} />

        {/* Main grid pattern — responds to mouse */}
        <rect x="0" y="0" width="200" height="200" fill="url(#grid-pattern)"
          opacity={brighter(0.6 + mouse.normalizedY * 0.2)}
          transform={`translate(${atmosphereOffsetX * 0.5}, ${atmosphereOffsetY * 0.5})`} />

        {/* Mouse-responsive atmospheric glow — central */}
        <ellipse
          cx={100 + atmosphereOffsetX * 5}
          cy={100 + atmosphereOffsetY * 5}
          rx="70"
          ry="70"
          fill={c.core}
          opacity={brighter(mouseGlowIntensity * 0.8)}
          filter="url(#atmosphere-glow)"
        />

        {/* Secondary atmospheric bloom — offset */}
        <ellipse
          cx={100 - atmosphereOffsetX * 3}
          cy={100 - atmosphereOffsetY * 3}
          rx="50"
          ry="50"
          fill={c.dim}
          opacity={brighter(0.02 + Math.abs(mouse.normalizedX) * 0.015)}
          filter="url(#atmosphere-glow)"
        />

        {/* Star field — parallax with mouse */}
        <g transform={`translate(${atmosphereOffsetX * 0.4}, ${atmosphereOffsetY * 0.4})`}>
          {stars.map((star, i) => (
            <circle key={`s-${i}`} cx={star.x} cy={star.y} r={star.r}
              fill={c.pale} opacity={brighter(star.opacity * (0.8 + Math.sin(tick * 0.008 + i) * 0.2))} />
          ))}
        </g>

        {/* ══ Wafting Signal Waves — Background ════════════════════════════════ */}
        {[0, 1, 2].map(i => {
          const waveProgress = ((tick * 0.0006 + i * 0.33) % 1)
          const waveR = 30 + waveProgress * 120
          const waveOpacity = (1 - waveProgress) * brighter(0.025)
          const offsetX = Math.sin(tick * 0.002 + i * 2) * 8
          const offsetY = Math.cos(tick * 0.0015 + i * 1.5) * 6
          return (
            <circle
              key={`wave-${i}`}
              cx={100 + offsetX + atmosphereOffsetX * 2}
              cy={100 + offsetY + atmosphereOffsetY * 2}
              r={waveR}
              fill="none"
              stroke={c.core}
              strokeWidth="0.3"
              opacity={waveOpacity}
              strokeDasharray="2 4"
            />
          )
        })}

        {/* Diagonal signal traces — very subtle, wafting */}
        {[0, 1].map(i => {
          const traceOffset = (tick * 0.0004 + i * 0.5) % 1
          const startX = -20 + traceOffset * 240
          const startY = -20 + traceOffset * 240
          return (
            <line
              key={`trace-${i}`}
              x1={startX}
              y1={startY + 40}
              x2={startX + 30}
              y2={startY}
              stroke={c.core}
              strokeWidth="0.2"
              opacity={brighter(0.03) * (1 - Math.abs(traceOffset - 0.5) * 2)}
            />
          )
        })}

        {/* ══ Expanding signal rings from hub ══════════════════════════════════ */}
        {sigRings.map(r => (
          <circle key={`sr-${r.id}`} cx={CX} cy={CY} r={r.r}
            fill="none" stroke={c.core} strokeWidth="0.5" opacity={r.opacity} />
        ))}

        {/* ══ Hub radiating ring — visible only in annulus; max opacity capped, fades in band then to 0 at inner ring ══ */}
        {s.hubRipples.map((hr) => {
          const p = clamp(hr.progress, 0, 1)
          const t = easeOutQuad(p)
          const rCenter = lerp(HUB_RIPPLE_TRAVEL_R0, HUB_RIPPLE_TRAVEL_R1, t)
          const opacity = hubRippleAnnulusOpacity(
            rCenter,
            HUB_RIPPLE_MAX_OPACITY
          )
          if (opacity <= 0) return null
          const strokeW = 6.5 - p * 2.2
          return (
            <circle
              key={`hripple-${hr.id}`}
              cx={CX}
              cy={CY}
              r={rCenter}
              fill="none"
              stroke={c.hubRippleStroke}
              strokeWidth={strokeW}
              strokeOpacity={1}
              opacity={opacity}
              filter="url(#hub-ripple-glow)"
            />
          )
        })}

        {/* ══ Outer ring — outer diffuse glow ══════════════════════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R + 8}
          fill="none" stroke={c.core} strokeWidth="10"
          opacity={brighter(0.035 + s.ringPulse * 0.025)}
          filter="url(#soft-glow)"
        />

        {/* ══ Outer ring — inner glow band ═════════════════════════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R + 2.5}
          fill="none" stroke={c.bright} strokeWidth="3.5"
          opacity={brighter(0.055 + s.ringPulse * 0.045)}
          filter="url(#soft-glow)"
        />

        {/* ══ Outer ring — crisp core ══════════════════════════════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R}
          fill="none" stroke="url(#ring-grad)"
          strokeWidth={ringStrokeW}
        />

        {/* ══ Outer ring — metallic rim highlight (outer edge) ═════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R + 1.2}
          fill="none" stroke={c.rim} strokeWidth="0.4"
          opacity={brighter(0.35 + s.ringPulse * 0.2)}
          filter="url(#rim-glow)"
        />

        {/* ══ Outer ring — metallic rim highlight (inner edge) ═════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R - 1.4}
          fill="none" stroke={c.rim} strokeWidth="0.35"
          opacity={brighter(0.28 + s.ringPulse * 0.18)}
          filter="url(#rim-glow)"
        />

        {/* ══ Orbital tracer dots ══════════════════════════════════════════════ */}
        {s.orbitalDots.map(dot => (
          <circle key={`od-${dot.id}`}
            cx={CX + Math.cos(dot.angle) * dot.radius}
            cy={CY + Math.sin(dot.angle) * dot.radius}
            r={dot.size}
            fill={c.pale}
            opacity={brighter(dot.opacity * (0.6 + 0.4 * Math.sin(tick * 0.022 + dot.phase)))}
            filter="url(#chevron-glow)"
          />
        ))}

        {/* ══ Arm rails — outer glow + inner glow + core + metallic rim ════════ */}
        {ARMS.map((arm, i) => {
          const glowW = ARM_STROKE + s.armGlow[i] * 2.2
          return (
            <g key={`arm-${i}`}>
              {/* Outer diffuse glow */}
              <line
                x1={CX} y1={CY} x2={arm.x} y2={arm.y}
                stroke={c.core} strokeWidth={glowW + 7} strokeLinecap="round"
                opacity={brighter(0.028 + s.armGlow[i] * 0.032)}
                filter="url(#soft-glow)"
              />
              {/* Inner glow layer */}
              <line
                x1={CX} y1={CY} x2={arm.x} y2={arm.y}
                stroke={c.bright} strokeWidth={glowW + 2.5} strokeLinecap="butt"
                opacity={brighter(0.055 + s.armGlow[i] * 0.10)}
                filter="url(#soft-glow)"
              />
              {/* Core rail — sharp */}
              <line
                x1={CX} y1={CY} x2={arm.x} y2={arm.y}
                stroke={`url(#arm-grad-${i})`}
                strokeWidth={ARM_STROKE} strokeLinecap="butt"
              />
              {/* Metallic rim highlight — platinum */}
              <line
                x1={CX} y1={CY} x2={arm.x} y2={arm.y}
                stroke={c.rim}
                strokeWidth={0.4} strokeLinecap="butt"
                opacity={brighter(0.32 + s.armGlow[i] * 0.22)}
                filter="url(#rim-glow)"
              />
            </g>
          )
        })}

        {/* ══ Endpoint nodes ════════════════════════════════════════════════════ */}
        {ARMS.map((arm, i) => {
          const baseGlow  = 0.07 + s.armGlow[i] * 0.14
          const totalGlow = brighter(clamp(baseGlow, 0, 1))
          const glowR     = NODE_R + 2.2 + s.armGlow[i] * 2.5

          return (
            <g key={`node-${i}`}>
              {/* Outer glow */}
              <circle cx={arm.x} cy={arm.y} r={glowR}
                fill={c.core} opacity={totalGlow}
                filter="url(#node-glow)"
              />

              {/* Core node */}
              <circle cx={arm.x} cy={arm.y} r={NODE_R}
                fill="url(#node-grad)"
              />

              {/* Metallic rim highlight */}
              <circle cx={arm.x} cy={arm.y} r={NODE_R + 0.3}
                fill="none" stroke={c.rim} strokeWidth="0.35"
                opacity={brighter(0.4 + s.armGlow[i] * 0.25)}
                filter="url(#rim-glow)"
              />

              {/* Specular highlight */}
              <circle cx={arm.x - NODE_R * 0.28} cy={arm.y - NODE_R * 0.28} r={NODE_R * 0.38}
                fill={c.white} opacity={brighter(0.32)}
              />
            </g>
          )
        })}

        {/* ══ Chevron particles ════════════════════════════════════════════════ */}
        {chevrons.map((ch) => (
          <g key={`chev-${ch.id}`}
            transform={`translate(${ch.x}, ${ch.y}) rotate(${ch.angleDeg}) scale(${ch.scale})`}
            opacity={brighter(ch.fade * ch.opacity)}
            filter="url(#chevron-glow)"
          >
            <polygon
              points={CHEVRON_PTS}
              fill="url(#chevron-grad)"
            />
            {/* Tip accent — c is palette; avoid shadowing with chevron `ch` */}
            <circle cx={CH_TIP * 0.92} cy="0" r="0.9"
              fill={c.white}
            />
          </g>
        ))}

        {/* ══ Central hub ══════════════════════════════════════════════════════ */}
        {/* Outer glow */}
        <circle cx={CX} cy={CY} r={hubGlowR}
          fill={c.core} opacity={hubOpacity}
          filter="url(#hub-glow)"
        />
        {/* Core */}
        <circle cx={CX} cy={CY} r={HUB_R}
          fill="url(#hub-grad)"
        />
        {/* Crisp edge ring */}
        <circle cx={CX} cy={CY} r={HUB_R + 0.5}
          fill="none" stroke={c.bright} strokeWidth="0.6"
          opacity={brighter(0.7 + s.hubPulse * 0.25)}
        />
        {/* Metallic rim highlight */}
        <circle cx={CX} cy={CY} r={HUB_R + 0.8}
          fill="none" stroke={c.rim} strokeWidth="0.35"
          opacity={brighter(0.45 + s.hubPulse * 0.25)}
          filter="url(#rim-glow)"
        />
        {/* Inner specular */}
        <circle cx={CX - HUB_R * 0.25} cy={CY - HUB_R * 0.25} r={HUB_R * 0.35}
          fill={c.white} opacity={brighter(0.42 + s.hubPulse * 0.22)}
        />
      </svg>
      </div>
    </>
  )
}

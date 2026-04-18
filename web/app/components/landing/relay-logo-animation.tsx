"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  id: number
  arm: number
  progress: number
  speed: number
  scale: number
  opacity: number
}

interface SignalRing {
  id: number
  progress: number
  speed: number
}

interface NodePulse {
  id: number
  nodeIndex: number
  progress: number
  speed: number
}

interface NodeAbsorption {
  active: boolean
  phase: number
  timer: number
  intensity: number
}

// ─── Geometry Constants ───────────────────────────────────────────────────────

const CX = 100
const CY = 100
const RING_R      = 78
const RING_STROKE = 3.0
/** Dark outer rim stroke width (drawn under the gradient ring). */
const RING_OUTLINE  = 6.2
const ARM_STROKE  = 2.6
const HUB_R       = 7
const NODE_R      = 4.2

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

// ─── Green palette — soft gradient + dark outline ───────────────────────────
const GREEN         = "#2D5C47"      // Core green
const GREEN_BRIGHT  = "#4A8B6F"      // Light / highlight
const GREEN_DIM     = "#14332A"      // Thick outline & shadow
const GREEN_PALE    = "#9BC4B0"      // Pale accent
const GREEN_WHITE   = "#E8F5EF"      // Near-white highlight
const RIM_LIGHT     = "#B8D4C8"      // Cool rim on metal
const RIM_MID       = "#7AAA95"      // Mid rim

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

// ─── Component ────────────────────────────────────────────────────────────────

export function RelayLogoAnimation() {
  const [tick, setTick] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const prevTsRef = useRef<number | null>(null);

  const stars = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        x: 6 + ((i * 41 + i * i * 7) % 188),
        y: 6 + ((i * 59 + i * 11) % 188),
        r: 0.28 + (i % 4) * 0.18,
        opacity: 0.045 + (i % 5) * 0.022,
      })),
    []
  );

  const stateRef = useRef({
    particles:       [] as Particle[],
    signalRings:     [] as SignalRing[],
    nodePulses:      [] as NodePulse[],
    nodeAbsorptions: ARMS.map(() => ({
      active: false, phase: 0, timer: 0, intensity: 0,
    })) as NodeAbsorption[],
    hubPulse:        0,
    ringPulse:       0,
    armGlow:         [0, 0, 0] as [number, number, number],
    particleIdSeq:   0,
    pulseIdSeq:      0,
    spawnAccum:      [0, 0, 0] as [number, number, number],
  })

  // Initialise static data
  useEffect(() => {
    const s = stateRef.current
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

      for (const ring of s.signalRings) {
        ring.progress += ring.speed * dt
        if (ring.progress >= 1) ring.progress -= 1
      }
      for (const np of s.nodePulses) {
        np.progress += np.speed * dt
      }
      s.nodePulses = s.nodePulses.filter(np => np.progress < 1.0)

      // Node absorption phases
      for (let ni = 0; ni < s.nodeAbsorptions.length; ni++) {
        const na = s.nodeAbsorptions[ni]
        if (!na.active) continue
        na.timer += dt

        if (na.phase === 0) {
          const t = clamp(na.timer / 120, 0, 1)
          na.intensity = t < 0.5 ? t * 2 : (1 - t) * 2
          if (na.timer >= 120) { na.phase = 1; na.timer = 0 }
        } else if (na.phase === 1) {
          na.intensity = clamp(1 - na.timer / 280, 0, 1)
          if (na.timer >= 280) { na.phase = 2; na.timer = 0 }
        } else if (na.phase === 2) {
          s.nodePulses.push({
            id: s.pulseIdSeq++,
            nodeIndex: ni,
            progress: 0,
            speed: 0.00018,
          })
          na.active = false
          na.intensity = 0
          na.timer = 0
          na.phase = 0
        }
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

      const ARRIVAL_THRESHOLD = 0.96
      const arrivals = s.particles.filter(p => p.progress >= ARRIVAL_THRESHOLD)
      for (const p of arrivals) {
        const na = s.nodeAbsorptions[p.arm]
        if (!na.active) {
          na.active = true
          na.phase = 0
          na.timer = 0
          na.intensity = 0
        }
      }
      s.particles = s.particles.filter(p => p.progress < 1.02)

      setTick(t => t + 1)
      frameRef.current = requestAnimationFrame(loop)
    }

    frameRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  const s = stateRef.current

  // Derived values
  const ringStrokeW = RING_STROKE + s.ringPulse * 1.1

  const sigRings = s.signalRings.map(r => ({
    ...r,
    r: 8 + r.progress * (RING_R - 14),
    opacity: (1 - r.progress) * 0.18,
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
    return { ...p, x, y, angleDeg, fade: fade * fadeIn };
  });

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative" }}
      aria-label="Relay brand logo animation"
    >
      <svg
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
        aria-hidden="true"
      >
        <defs>
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

          {/* Absorption flash */}
          <filter id="absorb-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="3.0" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Outer ring — soft green gradient */}
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={GREEN_WHITE} stopOpacity="0.92" />
            <stop offset="28%"  stopColor={GREEN_PALE}  stopOpacity="0.95" />
            <stop offset="52%"  stopColor={GREEN}       stopOpacity="1"    />
            <stop offset="100%" stopColor={GREEN_BRIGHT} stopOpacity="0.88" />
          </linearGradient>

          {/* Inner rim highlight */}
          <linearGradient id="rim-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={RIM_LIGHT} stopOpacity="0.9" />
            <stop offset="50%"  stopColor={RIM_MID} stopOpacity="0.6" />
            <stop offset="100%" stopColor={GREEN_PALE}     stopOpacity="0.3" />
          </linearGradient>

          {/* Hub radial — soft green */}
          <radialGradient id="hub-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={GREEN_WHITE}  />
            <stop offset="35%"  stopColor={GREEN_PALE}   />
            <stop offset="68%"  stopColor={GREEN_BRIGHT} />
            <stop offset="100%" stopColor={GREEN}       />
          </radialGradient>

          {/* Per-arm linear gradients — soft */}
          {ARMS.map((arm, i) => (
            <linearGradient
              key={`ag-${i}`}
              id={`arm-grad-${i}`}
              x1={CX} y1={CY}
              x2={arm.x} y2={arm.y}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%"   stopColor={GREEN_WHITE} stopOpacity="0.95" />
              <stop offset="40%"  stopColor={GREEN_PALE}  stopOpacity="1"    />
              <stop offset="100%" stopColor={GREEN}       stopOpacity={0.55 + s.armGlow[i] * 0.38} />
            </linearGradient>
          ))}

          {/* Node gradient — soft */}
          <radialGradient id="node-grad" cx="38%" cy="35%" r="62%">
            <stop offset="0%"   stopColor={GREEN_WHITE}  />
            <stop offset="40%"  stopColor={GREEN_PALE}   />
            <stop offset="72%"  stopColor={GREEN_BRIGHT} />
            <stop offset="100%" stopColor={GREEN}       />
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
            <stop offset="0%"   stopColor={GREEN_DIM} stopOpacity="0.04" />
            <stop offset="100%" stopColor={GREEN_DIM} stopOpacity="0" />
          </radialGradient>

          {/* Secondary nebula — bottom right */}
          <radialGradient id="nebula-glow-2" cx="75%" cy="80%" r="50%">
            <stop offset="0%"   stopColor={GREEN} stopOpacity="0.025" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
          </radialGradient>

          {/* Grid pattern */}
          <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <line x1="20" y1="0" x2="20" y2="20" stroke={GREEN} strokeWidth="0.15" opacity="0.08" />
            <line x1="0" y1="20" x2="20" y2="20" stroke={GREEN} strokeWidth="0.15" opacity="0.08" />
          </pattern>

          {/* Fine grid overlay */}
          <pattern id="fine-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <line x1="10" y1="0" x2="10" y2="10" stroke={GREEN} strokeWidth="0.08" opacity="0.04" />
            <line x1="0" y1="10" x2="10" y2="10" stroke={GREEN} strokeWidth="0.08" opacity="0.04" />
          </pattern>

          {/* Chevron gradient */}
          <linearGradient id="chevron-grad" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%"   stopColor={GREEN_WHITE}  stopOpacity="1"   />
            <stop offset="55%"  stopColor={GREEN_BRIGHT} stopOpacity="0.9" />
            <stop offset="100%" stopColor={GREEN}        stopOpacity="0.15" />
          </linearGradient>

          {/* Node pulse ring gradient */}
          <radialGradient id="pulse-grad" cx="50%" cy="50%" r="50%">
            <stop offset="70%"  stopColor={GREEN_BRIGHT} stopOpacity="0" />
            <stop offset="100%" stopColor={GREEN_BRIGHT} stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* ══ Background — Space-like Atmosphere ════════════════════════════════ */}
        <rect x="0" y="0" width="200" height="200" fill="url(#space-gradient)" />
        <rect x="0" y="0" width="200" height="200" fill="url(#bg-vignette)" />

        {/* Nebula glow layers */}
        <rect x="0" y="0" width="200" height="200" fill="url(#nebula-glow)" />
        <rect x="0" y="0" width="200" height="200" fill="url(#nebula-glow-2)" />

        {/* Fine grid layer — distant, subtle */}
        <rect x="0" y="0" width="200" height="200" fill="url(#fine-grid)" opacity={0.5} />

        {/* Main grid pattern */}
        <rect x="0" y="0" width="200" height="200" fill="url(#grid-pattern)" opacity={0.6} />

        {/* Star field */}
        <g>
          {stars.map((star, i) => (
            <circle key={`s-${i}`} cx={star.x} cy={star.y} r={star.r}
              fill={GREEN_PALE} opacity={star.opacity * (0.8 + Math.sin(tick * 0.008 + i) * 0.2)} />
          ))}
        </g>

        {/* ══ Wafting Signal Waves — Background ════════════════════════════════ */}
        {[0, 1, 2].map(i => {
          const waveProgress = ((tick * 0.0006 + i * 0.33) % 1)
          const waveR = 30 + waveProgress * 120
          const waveOpacity = (1 - waveProgress) * 0.025
          const offsetX = Math.sin(tick * 0.002 + i * 2) * 8
          const offsetY = Math.cos(tick * 0.0015 + i * 1.5) * 6
          return (
            <circle
              key={`wave-${i}`}
              cx={100 + offsetX}
              cy={100 + offsetY}
              r={waveR}
              fill="none"
              stroke={GREEN}
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
              stroke={GREEN}
              strokeWidth="0.2"
              opacity={0.03 * (1 - Math.abs(traceOffset - 0.5) * 2)}
            />
          )
        })}

        {/* ══ Expanding signal rings from hub ══════════════════════════════════ */}
        {sigRings.map(r => (
          <circle key={`sr-${r.id}`} cx={CX} cy={CY} r={r.r}
            fill="none" stroke={GREEN} strokeWidth="0.5" opacity={r.opacity} />
        ))}

        {/* ══ Outer ring — outer diffuse glow ══════════════════════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R + 8}
          fill="none" stroke={GREEN} strokeWidth="10"
          opacity={0.035 + s.ringPulse * 0.025}
          filter="url(#soft-glow)"
        />

        {/* ══ Outer ring — inner glow band ═════════════════════════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R + 2.5}
          fill="none" stroke={GREEN_BRIGHT} strokeWidth="3.5"
          opacity={0.055 + s.ringPulse * 0.045}
          filter="url(#soft-glow)"
        />

        {/* ══ Outer ring — soft green gradient stroke ═══════════════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R}
          fill="none" stroke="url(#ring-grad)"
          strokeWidth={ringStrokeW}
        />

        {/* ══ Outer ring — thick dark green outline (outside gradient band) ═══════ */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R + ringStrokeW / 2 + RING_OUTLINE / 2}
          fill="none"
          stroke={GREEN_DIM}
          strokeWidth={RING_OUTLINE}
        />

        {/* ══ Outer ring — metallic rim highlight (outer edge) ═════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R + 1.2}
          fill="none" stroke={RIM_LIGHT} strokeWidth="0.4"
          opacity={0.35 + s.ringPulse * 0.2}
          filter="url(#rim-glow)"
        />

        {/* ══ Outer ring — metallic rim highlight (inner edge) ═════════════════ */}
        <circle cx={CX} cy={CY} r={RING_R - 1.4}
          fill="none" stroke={RIM_LIGHT} strokeWidth="0.35"
          opacity={0.28 + s.ringPulse * 0.18}
          filter="url(#rim-glow)"
        />

        {/* ══ Arm rails — outer glow + inner glow + core + metallic rim ════════ */}
        {ARMS.map((arm, i) => {
          const glowW = ARM_STROKE + s.armGlow[i] * 2.2
          return (
            <g key={`arm-${i}`}>
              {/* Outer diffuse glow */}
              <line
                x1={CX} y1={CY} x2={arm.x} y2={arm.y}
                stroke={GREEN} strokeWidth={glowW + 7} strokeLinecap="round"
                opacity={0.028 + s.armGlow[i] * 0.032}
                filter="url(#soft-glow)"
              />
              {/* Inner glow layer */}
              <line
                x1={CX} y1={CY} x2={arm.x} y2={arm.y}
                stroke={GREEN_BRIGHT} strokeWidth={glowW + 2.5} strokeLinecap="butt"
                opacity={0.055 + s.armGlow[i] * 0.10}
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
                stroke={RIM_LIGHT}
                strokeWidth={0.4} strokeLinecap="butt"
                opacity={0.32 + s.armGlow[i] * 0.22}
                filter="url(#rim-glow)"
              />
            </g>
          )
        })}

        {/* ══ Node pulse rings ═════════════════════════════════════════════════ */}
        {s.nodePulses.map(np => {
          const node    = ARMS[np.nodeIndex]
          const maxR    = 18
          const r       = NODE_R + easeOutQuad(np.progress) * maxR
          const opacity = (1 - np.progress) * 0.13
          return (
            <circle key={`np-${np.id}`}
              cx={node.x} cy={node.y} r={r}
              fill="none"
              stroke={GREEN_BRIGHT} strokeWidth={0.6}
              opacity={opacity}
            />
          )
        })}

        {/* ══ Endpoint nodes with absorption reaction ══════════════════════════ */}
        {ARMS.map((arm, i) => {
          const na        = s.nodeAbsorptions[i]
          const absorb    = na.active ? na.intensity : 0
          const scaleMod  = 1 + absorb * 0.28
          const glowBoost = absorb * 0.55
          const baseGlow  = 0.07 + s.armGlow[i] * 0.14
          const totalGlow = clamp(baseGlow + glowBoost, 0, 1)
          const glowR     = NODE_R + 2.2 + s.armGlow[i] * 2.5 + absorb * 4.5

          return (
            <g key={`node-${i}`}
              transform={`translate(${arm.x}, ${arm.y}) scale(${scaleMod}) translate(${-arm.x}, ${-arm.y})`}
            >
              {/* Absorption flash */}
              {absorb > 0.01 && (
                <circle cx={arm.x} cy={arm.y} r={NODE_R + 4.5 * absorb}
                  fill={GREEN_WHITE} opacity={absorb * 0.4}
                  filter="url(#absorb-glow)"
                />
              )}

              {/* Outer glow */}
              <circle cx={arm.x} cy={arm.y} r={glowR}
                fill={GREEN} opacity={totalGlow}
                filter="url(#node-glow)"
              />

              {/* Core node */}
              <circle cx={arm.x} cy={arm.y} r={NODE_R}
                fill="url(#node-grad)"
              />

              {/* Metallic rim highlight */}
              <circle cx={arm.x} cy={arm.y} r={NODE_R + 0.3}
                fill="none" stroke={RIM_LIGHT} strokeWidth="0.35"
                opacity={0.4 + s.armGlow[i] * 0.25 + absorb * 0.3}
                filter="url(#rim-glow)"
              />

              {/* Specular highlight */}
              <circle cx={arm.x - NODE_R * 0.28} cy={arm.y - NODE_R * 0.28} r={NODE_R * 0.38}
                fill={GREEN_WHITE} opacity={0.32 + absorb * 0.28}
              />
            </g>
          )
        })}

        {/* ══ Chevron particles ════════════════════════════════════════════════ */}
        {chevrons.map(c => (
          <g key={`chev-${c.id}`}
            transform={`translate(${c.x}, ${c.y}) rotate(${c.angleDeg}) scale(${c.scale})`}
            opacity={c.fade * c.opacity}
            filter="url(#chevron-glow)"
          >
            <polygon
              points={CHEVRON_PTS}
              fill="url(#chevron-grad)"
            />
            {/* Tip accent */}
            <circle cx={CH_TIP * 0.92} cy="0" r="0.9"
              fill={GREEN_WHITE}
            />
          </g>
        ))}

        {/* ══ Central hub ══════════════════════════════════════════════════════ */}
        {/* Core */}
        <circle cx={CX} cy={CY} r={HUB_R}
          fill="url(#hub-grad)"
        />
        {/* Crisp edge ring */}
        <circle cx={CX} cy={CY} r={HUB_R + 0.5}
          fill="none" stroke={GREEN_BRIGHT} strokeWidth="0.6"
          opacity={0.7 + s.hubPulse * 0.25}
        />
        {/* Metallic rim highlight */}
        <circle cx={CX} cy={CY} r={HUB_R + 0.8}
          fill="none" stroke={RIM_LIGHT} strokeWidth="0.35"
          opacity={0.45 + s.hubPulse * 0.25}
          filter="url(#rim-glow)"
        />
        {/* Inner specular */}
        <circle cx={CX - HUB_R * 0.25} cy={CY - HUB_R * 0.25} r={HUB_R * 0.35}
          fill={GREEN_WHITE} opacity={0.42 + s.hubPulse * 0.22}
        />
      </svg>
    </div>
  )
}

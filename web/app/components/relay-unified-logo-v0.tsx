"use client";

import { useId } from "react";
import { motion } from "framer-motion";

/**
 * v0 bundle: F:\b_KRGOxDnXLD6\components\relay-logo.tsx
 * Unified animated SVG: open ring + hub/spoke nodes + “relay” + “Gallery”.
 * Self-contained (inline <style> keyframes). Props: size (default 200).
 */
interface RelayUnifiedLogoV0Props {
  size?: number;
  /** Full hero lockup vs compact mark for nav/header. */
  variant?: "full" | "header";
}

export default function RelayUnifiedLogoV0({
  size = 200,
  variant = "full",
}: RelayUnifiedLogoV0Props) {
  const uid = useId().replace(/:/g, "");
  const nodeGlowId = `nodeGlow-${uid}`;
  const pulseRingGradId = `pulseRingGrad-${uid}`;
  const softGlowId = `softGlow-${uid}`;
  const isHeader = variant === "header";
  const svgWidth = size;
  const svgHeight = isHeader ? size : size * 1.2;
  const viewBox = isHeader ? "26 22 148 148" : "0 0 200 240";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        animation: isHeader ? undefined : "breathe 3.8s ease-in-out infinite",
        willChange: isHeader ? undefined : "transform",
      }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Relay"
        role="img"
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id={nodeGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00AA6F" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00AA6F" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={pulseRingGradId} cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="#00AA6F" stopOpacity="0" />
            <stop offset="100%" stopColor="#00AA6F" stopOpacity="0.12" />
          </radialGradient>

          <filter id={softGlowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer pulse ring */}
        <motion.circle
          cx="100"
          cy="96"
          r="74"
          fill="none"
          stroke="#00AA6F"
          strokeWidth="0.8"
          initial={isHeader ? false : { scale: 0.86, opacity: 0 }}
          animate={isHeader ? undefined : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{
            animation: "pulseRingAnim 3.8s ease-out infinite",
            transformBox: "view-box",
            transformOrigin: "100px 96px",
          }}
        />

        {/*
          Main circle arc with a clean gap at the bottom.
          Circumference = 2π × 74 ≈ 464.96
          Gap angle = 38° → gap length = (38/360) × 464.96 ≈ 49.08
          Drawn arc length = 464.96 − 49.08 ≈ 415.88

          SVG strokes start at the 3 o'clock position (rightmost point).
          To centre the gap at 6 o'clock (270° from 3 o'clock = 3/4 of the circle),
          we rotate the element −90° so the stroke starts at 12 o'clock, then
          offset by half the gap so the gap is centred at the bottom.
          strokeDashoffset shifts the start by half the gap length forward,
          placing the gap symmetrically at the bottom.
        */}
        <motion.circle
          cx="100"
          cy="96"
          r="74"
          fill="none"
          stroke="#00AA6F"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="415.88 49.08"
          strokeDashoffset="-140.78"
          filter={`url(#${softGlowId})`}
          initial={isHeader ? false : { opacity: 0, scale: 0.94 }}
          animate={isHeader ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 1.15, delay: 0.12, ease: "easeOut" }}
          style={{
            animation: "arcGlow 3.8s ease-in-out infinite",
            transformBox: "view-box",
            transformOrigin: "100px 96px",
          }}
        />

        {/* Connector lines */}
        <motion.line
          x1="100" y1="94" x2="66" y2="68"
          stroke="#00AA6F" strokeWidth="2.8" strokeLinecap="round"
          opacity="1"
          initial={isHeader ? false : { pathLength: 0, opacity: 0 }}
          animate={isHeader ? undefined : { pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.58, delay: 0.5, ease: "easeOut" }}
        />
        <motion.line
          x1="100" y1="94" x2="134" y2="68"
          stroke="#00AA6F" strokeWidth="2.8" strokeLinecap="round"
          opacity="1"
          initial={isHeader ? false : { pathLength: 0, opacity: 0 }}
          animate={isHeader ? undefined : { pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.58, delay: 0.58, ease: "easeOut" }}
        />
        <motion.line
          x1="100" y1="94" x2="100" y2="136"
          stroke="#00AA6F" strokeWidth="2.8" strokeLinecap="round"
          opacity="1"
          initial={isHeader ? false : { pathLength: 0, opacity: 0 }}
          animate={isHeader ? undefined : { pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.58, delay: 0.66, ease: "easeOut" }}
        />

        <motion.circle
          cx="100" cy="94" r="18" fill={`url(#${nodeGlowId})`}
          initial={isHeader ? false : { scale: 0.5, opacity: 0 }}
          animate={isHeader ? undefined : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.34, ease: "backOut" }}
          style={{ animation: "haloPulse 3.8s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" }}
        />

        {/* Satellite nodes */}
        <motion.g
          initial={isHeader ? false : { x: -10, y: -8, scale: 0.72, opacity: 0 }}
          animate={isHeader ? undefined : { x: 0, y: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.42, delay: 0.84, ease: "backOut" }}
          style={{ transformBox: "view-box", transformOrigin: "66px 68px" }}
        >
          <circle cx="66" cy="68" r="14" fill={`url(#${nodeGlowId})`} style={{ animation: "haloPulse 3.8s ease-in-out infinite" }} />
          <circle cx="66" cy="68" r="8" fill="#00AA6F" />
        </motion.g>
        <motion.g
          initial={isHeader ? false : { x: 10, y: -8, scale: 0.72, opacity: 0 }}
          animate={isHeader ? undefined : { x: 0, y: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.42, delay: 0.92, ease: "backOut" }}
          style={{ transformBox: "view-box", transformOrigin: "134px 68px" }}
        >
          <circle cx="134" cy="68" r="14" fill={`url(#${nodeGlowId})`} style={{ animation: "haloPulse 3.8s ease-in-out infinite", animationDelay: "0.3s" }} />
          <circle cx="134" cy="68" r="8" fill="#00AA6F" />
        </motion.g>
        <motion.g
          initial={isHeader ? false : { x: 0, y: 10, scale: 0.72, opacity: 0 }}
          animate={isHeader ? undefined : { x: 0, y: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.42, delay: 1, ease: "backOut" }}
          style={{ transformBox: "view-box", transformOrigin: "100px 136px" }}
        >
          <circle cx="100" cy="136" r="14" fill={`url(#${nodeGlowId})`} style={{ animation: "haloPulse 3.8s ease-in-out infinite", animationDelay: "0.6s" }} />
          <circle cx="100" cy="136" r="8" fill="#00AA6F" />
        </motion.g>

        {/* Central hub */}
        <motion.circle
          cx="100" cy="94" r="11" fill="#00AA6F"
          initial={isHeader ? false : { scale: 0, opacity: 0 }}
          animate={isHeader ? undefined : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.48, delay: 0.28, ease: "backOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />

        {!isHeader ? (
          <>
            <motion.text
              x="100"
              y="208"
              textAnchor="middle"
              fontFamily="'Geist', 'Inter', system-ui, sans-serif"
              fontWeight="700"
              fontSize="38"
              letterSpacing="-0.5"
              fill="#00AA6F"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 1.08, ease: "easeOut" }}
              style={{ animation: "wordmarkBreath 3.8s ease-in-out infinite" }}
            >
              relay
            </motion.text>

            <motion.text
              x="100"
              y="226"
              textAnchor="middle"
              fontFamily="'Geist', 'Inter', system-ui, sans-serif"
              fontWeight="400"
              fontSize="9.5"
              letterSpacing="2.2"
              fill="#00AA6F"
              opacity="0.78"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.78, y: 0 }}
              transition={{ duration: 0.55, delay: 1.22, ease: "easeOut" }}
            >
              Gallery
            </motion.text>
          </>
        ) : null}
      </svg>

      {!isHeader ? (
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.022); }
        }

        @keyframes pulseRingAnim {
          0%   { opacity: 0;    transform: scale(1); }
          20%  { opacity: 0.5; }
          100% { opacity: 0;    transform: scale(1.22); }
        }

        @keyframes nodePulse {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%       { transform: scale(1.12); opacity: 0.85; }
        }

        @keyframes centerPulse {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%       { transform: scale(1.1); opacity: 0.9; }
        }

        @keyframes haloPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }

        @keyframes arcGlow {
          0%, 100% { stroke-opacity: 1; }
          50%       { stroke-opacity: 0.65; }
        }

        @keyframes connectorPulse {
          0%, 100% { stroke-opacity: 0.9; }
          50%       { stroke-opacity: 0.45; }
        }

        @keyframes wordmarkBreath {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.78; }
        }
      `}</style>
      ) : null}
    </div>
  );
}

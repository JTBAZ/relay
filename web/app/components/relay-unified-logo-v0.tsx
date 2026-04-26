"use client";

/**
 * v0 bundle: F:\b_KRGOxDnXLD6\components\relay-logo.tsx
 * Unified animated SVG: open ring + hub/spoke nodes + “relay” + “Gallery”.
 * Self-contained (inline <style> keyframes). Props: size (default 200).
 */
interface RelayUnifiedLogoV0Props {
  size?: number;
}

export default function RelayUnifiedLogoV0({ size = 200 }: RelayUnifiedLogoV0Props) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "breathe 3.8s ease-in-out infinite",
        willChange: "transform",
      }}
    >
      <svg
        width={size}
        height={size * 1.2}
        viewBox="0 0 200 240"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Relay fintech logo"
        role="img"
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00AA6F" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00AA6F" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="pulseRingGrad" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="#00AA6F" stopOpacity="0" />
            <stop offset="100%" stopColor="#00AA6F" stopOpacity="0.12" />
          </radialGradient>

          <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer pulse ring */}
        <circle
          cx="100"
          cy="96"
          r="74"
          fill="none"
          stroke="#00AA6F"
          strokeWidth="0.8"
          style={{ animation: "pulseRingAnim 3.8s ease-out infinite", transformOrigin: "100px 96px" }}
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
        <circle
          cx="100"
          cy="96"
          r="74"
          fill="none"
          stroke="#00AA6F"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="415.88 49.08"
          strokeDashoffset="-24.54"
          filter="url(#softGlow)"
          transform="rotate(90 100 96)"
          style={{ animation: "arcGlow 3.8s ease-in-out infinite" }}
        />

        {/* Connector lines */}
        <line
          x1="100" y1="94" x2="66" y2="68"
          stroke="#00AA6F" strokeWidth="2.8" strokeLinecap="round"
          opacity="1"
        />
        <line
          x1="100" y1="94" x2="134" y2="68"
          stroke="#00AA6F" strokeWidth="2.8" strokeLinecap="round"
          opacity="1"
        />
        <line
          x1="100" y1="94" x2="100" y2="136"
          stroke="#00AA6F" strokeWidth="2.8" strokeLinecap="round"
          opacity="1"
        />

        {/* Glow halos */}
        <circle cx="66"  cy="68"  r="14" fill="url(#nodeGlow)" style={{ animation: "haloPulse 3.8s ease-in-out infinite" }} />
        <circle cx="134" cy="68"  r="14" fill="url(#nodeGlow)" style={{ animation: "haloPulse 3.8s ease-in-out infinite", animationDelay: "0.3s" }} />
        <circle cx="100" cy="136" r="14" fill="url(#nodeGlow)" style={{ animation: "haloPulse 3.8s ease-in-out infinite", animationDelay: "0.6s" }} />
        <circle cx="100" cy="94"  r="18" fill="url(#nodeGlow)" style={{ animation: "haloPulse 3.8s ease-in-out infinite" }} />

        {/* Satellite nodes */}
        <circle
          cx="66" cy="68" r="8" fill="#00AA6F"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <circle
          cx="134" cy="68" r="8" fill="#00AA6F"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <circle
          cx="100" cy="136" r="8" fill="#00AA6F"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />

        {/* Central hub */}
        <circle
          cx="100" cy="94" r="11" fill="#00AA6F"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />

        {/* Wordmark */}
        <text
          x="100"
          y="208"
          textAnchor="middle"
          fontFamily="'Geist', 'Inter', system-ui, sans-serif"
          fontWeight="700"
          fontSize="38"
          letterSpacing="-0.5"
          fill="#00AA6F"
          style={{ animation: "wordmarkBreath 3.8s ease-in-out infinite" }}
        >
          relay
        </text>

        {/* Subline under wordmark */}
        <text
          x="100"
          y="226"
          textAnchor="middle"
          fontFamily="'Geist', 'Inter', system-ui, sans-serif"
          fontWeight="400"
          fontSize="9.5"
          letterSpacing="2.2"
          fill="#00AA6F"
          opacity="0.5"
        >
          Gallery
        </text>
      </svg>

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
    </div>
  );
}

"use client";

interface BottomPaywallOverlayProps {
  headline?: string;
  body?: string;
  cta?: string;
  onCtaClick?: () => void;
  exportMode?: boolean;
}

export default function BottomPaywallOverlay({
  headline = "Full access!",
  body = "",
  cta = "SEE FULL ART",
  onCtaClick,
  exportMode = false
}: BottomPaywallOverlayProps) {
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
      aria-label="Patreon paywall"
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "55%",
          background: exportMode
            ? "linear-gradient(to bottom, transparent 0%, rgba(10,8,20,0.72) 28%, rgba(10,8,20,0.92) 100%)"
            : "linear-gradient(to bottom, transparent 0%, rgba(10,8,20,0.55) 30%, rgba(10,8,20,0.80) 100%)",
          backdropFilter: exportMode ? undefined : "blur(6px)",
          WebkitBackdropFilter: exportMode ? undefined : "blur(6px)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40%)"
        }}
        aria-hidden="true"
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "55%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "clamp(6px, 2cqh, 16px)",
          pointerEvents: "auto",
          width: "85%",
          maxWidth: "340px",
          textAlign: "center"
        }}
      >
        <div
          style={{
            width: "clamp(40px, 8cqh, 60px)",
            height: "clamp(40px, 8cqh, 60px)",
            flexShrink: 0,
            filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.55))"
          }}
        >
          <svg
            viewBox="0 0 109 118"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Patreon"
            role="img"
            style={{ width: "100%", height: "100%" }}
          >
            <rect width="109" height="118" rx="20" fill="#FF424D" />
            <rect x="18" y="20" width="16" height="78" rx="4" fill="white" />
            <circle cx="68" cy="42" r="27" fill="white" />
          </svg>
        </div>

        <p
          style={{
            color: "rgba(255,255,255,0.90)",
            fontSize: "clamp(10px, 2.4cqh, 13px)",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            margin: 0,
            lineHeight: 1
          }}
        >
          PATREON
        </p>

        <h2
          style={{
            color: "#ffffff",
            fontSize: "clamp(20px, 5.5cqh, 36px)",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.15,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)"
          }}
        >
          {headline}
        </h2>

        {body ? (
          <p
            style={{
              color: "rgba(255,255,255,0.80)",
              fontSize: "clamp(11px, 2.8cqh, 16px)",
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: 400,
              margin: 0,
              lineHeight: 1.5,
              maxWidth: "28ch"
            }}
          >
            {body}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onCtaClick}
          style={{
            marginTop: "clamp(4px, 1.5cqh, 10px)",
            padding: "clamp(8px, 2cqh, 14px) clamp(20px, 6cqw, 36px)",
            background: "linear-gradient(135deg, #7C3AED 0%, #0D9488 100%)",
            border: "none",
            borderRadius: "9999px",
            color: "#ffffff",
            fontSize: "clamp(11px, 2.6cqh, 15px)",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.12em",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(124,58,237,0.5), 0 2px 8px rgba(0,0,0,0.4)",
            transition: "filter 0.15s ease, transform 0.15s ease",
            whiteSpace: "nowrap"
          }}
          aria-label={`${cta} — Patreon paywall`}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

export type { BottomPaywallOverlayProps };

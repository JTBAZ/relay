"use client"

import {
  PRESET_META,
  PromoGraphicRenderer,
  type Platform,
  type PromoGraphicId
} from "./previewizer-v0-promo-graphics";

interface PromoGraphicPickerProps {
  selected: PromoGraphicId
  onSelect: (id: PromoGraphicId) => void
  promoText: string
  platform: Platform
}

const GROUPS: { label: string; ids: PromoGraphicId[] }[] = [
  {
    label: "Platform branding",
    ids: ["platform_lockup"],
  },
  {
    label: "Sale graphics",
    ids: ["sale_burst", "sticker_outline", "corner_ribbon", "flash_pill"],
  },
  {
    label: "Soft CTAs",
    ids: ["ghost_tag", "split_banner", "stamp_mono", "platform_card"],
  },
]

const FONT_BADGE: Record<string, string> = {
  impact:    "Bold",
  condensed: "Cond",
  minimal:   "Mod",
  mono:      "Mono",
}

export function PreviewizerV0GraphicPicker({ selected, onSelect, promoText, platform }: PromoGraphicPickerProps) {
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">

          {/* Group header */}
          <div className="flex items-center gap-2">
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#6b7280",
                fontFamily: "var(--font-inter, Inter, sans-serif)",
              }}
            >
              {group.label}
            </span>
            <div style={{ flex: 1, height: 1, background: "#1f1f1f" }} />
          </div>

          {/* 4-column tile grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
            }}
          >
            {group.ids.map((id) => {
              const meta   = PRESET_META[id]
              const active = selected === id

              return (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  className="group/tile relative flex flex-col items-center gap-1.5 rounded-xl border outline-none focus-visible:ring-2 focus-visible:ring-[#00aa6f] transition-all duration-200"
                  style={{
                    background:  active ? "rgba(0,170,111,0.07)" : "#111",
                    borderColor: active ? "#00aa6f" : "#2a2a2a",
                    boxShadow:   active ? "0 0 0 1px #00aa6f, 0 0 16px rgba(0,170,111,0.18)" : "none",
                    padding: "6px 6px 8px",
                    transform: "scale(1)",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.transform = "scale(1.035)"
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)" }}
                  onFocus={(e) => {
                    if (!active) e.currentTarget.style.transform = "scale(1.035)"
                  }}
                  onBlur={(e) => { e.currentTarget.style.transform = "scale(1)" }}
                  aria-pressed={active}
                  aria-label={`Select ${meta.name} preset`}
                >
                  {/* Thumbnail — 120 × 120 logical, clipped */}
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      position: "relative",
                      overflow: "hidden",
                      borderRadius: 10,
                      background: "linear-gradient(135deg, #1a1025 0%, #0d1a15 55%, #0a0a18 100%)",
                    }}
                  >
                    {/* Art texture backdrop */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage:
                          "radial-gradient(ellipse at 28% 65%, rgba(90,20,130,0.45) 0%, transparent 58%), radial-gradient(ellipse at 72% 28%, rgba(0,90,60,0.32) 0%, transparent 52%)",
                      }}
                    />

                    {/* Graphic overlay */}
                    <div style={{ position: "absolute", inset: 0, fontSize: 14 }}>
                      <PromoGraphicRenderer
                        preset={id}
                        text={promoText}
                        fontClass={meta.defaultFont}
                        platform={platform}
                        scale={0.26}
                      />
                    </div>

                    {/* Hover dim + "change" hint */}
                    <div
                      className="group/tile-hover"
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 10,
                        background: "rgba(0,0,0,0)",
                        transition: "background 0.18s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.28)"
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0)"
                      }}
                    />

                    {/* Selected checkmark badge */}
                    {active && (
                      <div
                        style={{
                          position: "absolute",
                          top: 5,
                          right: 5,
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: "#00aa6f",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 0 0 2px #0a0a0a",
                        }}
                        aria-hidden="true"
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <polyline
                            points="2,6.2 5,9 10,3"
                            stroke="#0a0a0a"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}

                    {/* Font badge — bottom-left */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 5,
                        left: 5,
                        background: "rgba(0,0,0,0.62)",
                        backdropFilter: "blur(4px)",
                        borderRadius: 4,
                        padding: "2px 5px",
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: active ? "#9bf0c4" : "#9ca3af",
                        fontFamily: "var(--font-inter, Inter, sans-serif)",
                      }}
                    >
                      {FONT_BADGE[meta.defaultFont] ?? meta.defaultFont}
                    </div>
                  </div>

                  {/* Tile label */}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: active ? 700 : 500,
                      color: active ? "#9bf0c4" : "#d1d5db",
                      letterSpacing: "0.01em",
                      lineHeight: 1.2,
                      textAlign: "center",
                      fontFamily: "var(--font-inter, Inter, sans-serif)",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

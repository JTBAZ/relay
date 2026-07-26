"use client";

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, MessageCircle } from "lucide-react";
import SnipIcon from "@/app/components/icons/SnipIcon";

interface MediaScrubBarProps {
  mediaCount: number;
  currentIndex: number;
  onHoverIndex: (index: number | null) => void;
  onSelectIndex: (index: number) => void;
  variant?: "relayLogo" | "ringBadge";
  compact?: boolean;
}

const actions = [
  { id: "favorite", label: "Favorite", icon: Heart },
  { id: "snip", label: "Snip", icon: SnipIcon },
  { id: "comment", label: "Comment", icon: MessageCircle },
] as const;

export function RadialMenuMediaScrubBar({
  mediaCount,
  currentIndex,
  onHoverIndex,
  onSelectIndex,
  variant = "relayLogo",
  compact = false,
}: MediaScrubBarProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [hoveredDot, setHoveredDot] = useState<number | null>(null);
  const [menuOpenForDot, setMenuOpenForDot] = useState<number | null>(null);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menuOpenForDot !== null) {
        setMenuOpenForDot(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpenForDot]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (menuOpenForDot === null) {
      setIsHovering(false);
      setHoveredDot(null);
      onHoverIndex(null);
    }
  }, [onHoverIndex, menuOpenForDot]);

  const handleDotHover = useCallback(
    (index: number) => {
      if (menuOpenForDot === null) {
        setHoveredDot(index);
        onHoverIndex(index);
      }
    },
    [onHoverIndex, menuOpenForDot],
  );

  const handleDotLeave = useCallback(() => {
    if (menuOpenForDot === null) {
      setHoveredDot(null);
      onHoverIndex(null);
    }
  }, [menuOpenForDot, onHoverIndex]);

  const handleDotClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.stopPropagation();

      if (menuOpenForDot === index) {
        setMenuOpenForDot(null);
      } else {
        setMenuOpenForDot(index);
        onSelectIndex(index);
      }
    },
    [onSelectIndex, menuOpenForDot],
  );

  const handleActionClick = useCallback((actionId: string, e: MouseEvent) => {
    e.stopPropagation();
    void actionId;
    setMenuOpenForDot(null);
  }, []);

  const isMenuOpen = menuOpenForDot !== null;
  const isExpanded = isHovering || isMenuOpen;
  const radialPositions = compact
    ? [
        { x: -34, y: -38 },
        { x: 0, y: -48 },
        { x: 34, y: -38 },
      ]
    : [
        { x: -38, y: -42 },
        { x: 0, y: -54 },
        { x: 38, y: -42 },
      ];
  const dotHit = compact ? 20 : 24;
  const dotRingRest = compact ? 9 : 11;
  const dotRingHover = compact ? 13 : 16;
  const dotRingSelected = compact ? 18 : 22;
  const dotGlowRest = compact ? 11 : 13;
  const dotGlowHover = compact ? 16 : 19;
  const dotGlowSelected = compact ? 20 : 24;
  const innerDot = compact ? 3 : 4;
  const closeSize = compact ? 19 : 22;
  const actionSize = compact ? 28 : 30;
  const actionIcon = compact ? 12 : 13;
  const trackHeightCollapsed = compact ? 40 : 70;
  const trackHeightExpanded = compact ? 52 : 70;
  const trackWidthCollapsed = compact ? 58 : 70;
  const trackWidthExpanded = compact ? 210 : 244;
  const trackHeight = isExpanded ? trackHeightExpanded : trackHeightCollapsed;

  return (
    <div
      ref={containerRef}
      className="relative z-50 flex items-center justify-center"
      style={{ "--relay-green": "#1B9B6E" } as React.CSSProperties}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        className="relative z-50 cursor-pointer overflow-visible"
        animate={{
          width: isExpanded ? trackWidthExpanded : trackWidthCollapsed,
          height: trackHeight,
        }}
        transition={{
          duration: 0.5,
          ease: [0.23, 1, 0.32, 1],
        }}
      >
        <motion.div
          className="absolute inset-0 border backdrop-blur-sm"
          animate={{
            borderRadius: trackHeight / 2,
            backgroundColor: isMenuOpen
              ? "rgba(10, 21, 16, 0.98)"
              : isExpanded
                ? "rgba(10, 21, 16, 0.95)"
                : "rgba(7, 16, 13, 0.8)",
            borderColor: isMenuOpen
              ? "rgba(27, 155, 110, 0.8)"
              : isExpanded
                ? "rgba(27, 155, 110, 0.7)"
                : "rgba(27, 155, 110, 0.45)",
            boxShadow: isMenuOpen
              ? "0 0 0 1px rgba(27, 155, 110, 0.22), 0 0 32px rgba(27, 155, 110, 0.26), inset 0 0 20px rgba(27, 155, 110, 0.05)"
              : isExpanded
                ? "0 0 0 1px rgba(27, 155, 110, 0.18), 0 0 28px rgba(27, 155, 110, 0.22)"
                : "0 0 0 1px rgba(27, 155, 110, 0.12), 0 0 20px rgba(27, 155, 110, 0.18)",
          }}
          transition={{ duration: 0.35 }}
        />

        <AnimatePresence>
          {!isExpanded && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <motion.div
                className="absolute rounded-full border-2"
                style={{
                  width: compact ? 28 : 38,
                  height: compact ? 28 : 38,
                  borderColor: "rgba(27, 155, 110, 0.5)",
                  opacity: variant === "ringBadge" ? 0 : 1,
                }}
                animate={{
                  boxShadow: compact
                    ? "0 0 10px rgba(27, 155, 110, 0.2), inset 0 0 8px rgba(27, 155, 110, 0.08)"
                    : "0 0 15px rgba(27, 155, 110, 0.3), inset 0 0 10px rgba(27, 155, 110, 0.1)",
                }}
              />

              {variant === "ringBadge" ? (
                <span className="relative flex items-center justify-center gap-1.5" aria-hidden="true">
                  {[0, 1, 2].map((idx) => (
                    <span
                      key={`ring-badge-${idx}`}
                      className="block shrink-0 rounded-full border-2 border-[#1B9B6E]/75 bg-transparent shadow-[0_0_7px_rgba(27,155,110,0.22)]"
                      style={{
                        width: 7,
                        height: 7,
                      }}
                    />
                  ))}
                </span>
              ) : (
                <svg width="28" height="28" viewBox="0 0 28 28" className="relative" aria-hidden="true">
                  <motion.line
                    x1="14"
                    y1="14"
                    x2="14"
                    y2="24"
                    stroke="var(--relay-green)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <motion.line
                    x1="14"
                    y1="14"
                    x2="6"
                    y2="7"
                    stroke="var(--relay-green)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <motion.line
                    x1="14"
                    y1="14"
                    x2="22"
                    y2="7"
                    stroke="var(--relay-green)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="14" cy="14" r="4" fill="var(--relay-green)" />
                  <circle cx="6" cy="7" r="3" fill="var(--relay-green)" />
                  <circle cx="22" cy="7" r="3" fill="var(--relay-green)" />
                  <circle cx="14" cy="24" r="3" fill="var(--relay-green)" />
                </svg>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center overflow-visible px-6 py-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.span
                className={[
                  "pointer-events-none whitespace-nowrap text-center font-medium tracking-wide text-[#A7F3D0]",
                  compact ? "mb-0.5 text-[9px]" : "mb-1 text-[10px]",
                ].join(" ")}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: isMenuOpen ? 0 : 1, y: isMenuOpen ? -2 : 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden="true"
              >
                Click dot for Actions
              </motion.span>

              <div className="relative flex h-6 w-full items-center justify-between">
              {Array.from({ length: mediaCount }).map((_, index) => {
                const isCurrent = index === currentIndex;
                const isHovered = hoveredDot === index;
                const isSelected = menuOpenForDot === index;
                const isOtherDotSelected = isMenuOpen && !isSelected;

                return (
                  <motion.div
                    key={index}
                    className="relative flex items-center justify-center"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: 1,
                      opacity: isOtherDotSelected ? 0.3 : 1,
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{
                      duration: 0.35,
                      delay: index * 0.03,
                      ease: [0.23, 1, 0.32, 1],
                    }}
                    style={{
                      width: dotHit,
                      height: dotHit,
                    }}
                  >
                    <button
                      type="button"
                      className="relative flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-[#1B9B6E]/80"
                      style={{ width: dotHit, height: dotHit }}
                      onMouseEnter={() => handleDotHover(index)}
                      onMouseLeave={handleDotLeave}
                      onClick={(e) => handleDotClick(index, e)}
                      aria-label={
                        isSelected
                          ? `Close media ${index + 1} actions`
                          : `Open media ${index + 1} actions`
                      }
                      aria-expanded={isSelected || undefined}
                      aria-current={isCurrent ? "true" : undefined}
                    >
                      <motion.div
                        className="absolute rounded-full"
                        animate={{
                          width: isSelected ? dotGlowSelected : isHovered ? dotGlowHover : dotGlowRest,
                          height: isSelected ? dotGlowSelected : isHovered ? dotGlowHover : dotGlowRest,
                          opacity: isSelected || isHovered ? 0.6 : 0,
                          background: "radial-gradient(circle, rgba(27, 155, 110, 0.25) 0%, transparent 70%)",
                        }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      />

                      <motion.div
                        className="absolute rounded-full"
                        animate={{
                          width: isSelected ? dotRingSelected : isHovered ? dotRingHover : dotRingRest,
                          height: isSelected ? dotRingSelected : isHovered ? dotRingHover : dotRingRest,
                          borderWidth: 2,
                          borderColor:
                            isSelected || isHovered ? "var(--relay-green)" : "rgba(27, 155, 110, 0.5)",
                          backgroundColor: isSelected ? "#101010" : "transparent",
                          boxShadow: isSelected
                            ? "0 0 12px rgba(27, 155, 110, 0.3)"
                            : isHovered
                              ? "0 0 8px rgba(27, 155, 110, 0.28)"
                              : "none",
                        }}
                        style={{ borderStyle: "solid" }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      />

                      <AnimatePresence mode="wait">
                        {isSelected ? (
                          <motion.span
                            key="close-node"
                            className="absolute z-[31] flex items-center justify-center rounded-full text-[#1B9B6E]"
                            style={{ width: closeSize, height: closeSize }}
                            initial={{ scale: 0.72, opacity: 0, rotate: -20 }}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            exit={{ scale: 0.72, opacity: 0, rotate: 20 }}
                            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                            aria-hidden="true"
                          >
                            <X style={{ width: actionIcon, height: actionIcon }} />
                          </motion.span>
                        ) : isHovered ? (
                          <motion.span
                            key={`fill-${index}`}
                            className="absolute rounded-full bg-[var(--relay-green)]"
                            style={{ width: innerDot, height: innerDot }}
                            initial={{ opacity: 0, scale: 0.45 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.45 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            aria-hidden="true"
                          />
                        ) : null}
                      </AnimatePresence>
                    </button>

                    <AnimatePresence>
                      {isSelected ? (
                        <motion.div
                          className="pointer-events-auto absolute left-1/2 top-1/2 z-[90]"
                          initial={{ opacity: 0, scale: 0.75 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.75 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          aria-hidden={!isSelected}
                        >
                          {actions.map((action, actionIdx) => {
                            const Icon = action.icon;
                            const pos = radialPositions[actionIdx] ?? radialPositions[1];
                            const isActionHovered = hoveredAction === action.id;

                            return (
                              <motion.div
                                key={action.id}
                                className="absolute left-0 top-0"
                                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                                animate={{ x: pos.x, y: pos.y, scale: 1, opacity: 1 }}
                                exit={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                                transition={{
                                  duration: 0.3,
                                  delay: actionIdx * 0.05,
                                  ease: [0.34, 1.56, 0.64, 1],
                                }}
                              >
                                <span
                                  className={[
                                    "pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black shadow-lg transition-all duration-150",
                                    isActionHovered
                                      ? "translate-y-0 scale-100 opacity-100"
                                      : "translate-y-1 scale-95 opacity-0",
                                  ].join(" ")}
                                >
                                  {action.label}
                                  <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
                                </span>

                                <button
                                  type="button"
                                  aria-label={action.label}
                                  className="relative z-[91] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#1B9B6E]/55 bg-[#101010] text-[#1B9B6E] shadow-[0_3px_14px_rgba(0,0,0,0.38)] transition-all duration-200 hover:scale-110 hover:border-[#1B9B6E] hover:text-[#2BC48A] hover:shadow-[0_0_18px_rgba(27,155,110,0.45)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1B9B6E]/80"
                                  style={{ width: actionSize, height: actionSize }}
                                  onMouseEnter={() => setHoveredAction(action.id)}
                                  onMouseLeave={() => setHoveredAction(null)}
                                  onFocus={() => setHoveredAction(action.id)}
                                  onBlur={() => setHoveredAction(null)}
                                  onClick={(e) => handleActionClick(action.id, e)}
                                >
                                  <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1B9B6E] opacity-80 shadow-[0_0_9px_rgba(27,155,110,0.55)]" />
                                  <Icon className="relative z-[1]" style={{ width: actionIcon, height: actionIcon }} />
                                </button>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent
} from "react";
import { Heart, MessageCircle } from "lucide-react";
import SnipIcon from "@/app/components/icons/SnipIcon";

type RailActionKind = "favorite" | "snip" | "comment";

type MediaEdgeRailAction = {
  kind: RailActionKind;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

interface MediaEdgeRailProps {
  /** Total number of media items in the post. */
  count: number;
  /** Currently active media index (0-based). */
  activeIndex: number;
  /** Select a media index by hover / focus / click / track-scrub. */
  onSelect: (index: number) => void;
  /**
   * Outer positioning wrapper classes. Defaults to anchoring on the right edge,
   * vertically centered — identical to the patron feed card rail.
   */
  className?: string;
  /** Stop click events from bubbling to a parent surface (e.g. card open). */
  stopPropagation?: boolean;
  /** Optional active-node radial actions; used in feed view. */
  actions?: MediaEdgeRailAction[];
  /** Notifies parent when the radial action menu opens/closes (e.g. for overflow). */
  onActionMenuOpenChange?: (open: boolean) => void;
}

const ACTION_META: Record<
  RailActionKind,
  { Icon: ComponentType<{ className?: string }> }
> = {
  favorite: { Icon: Heart },
  snip: { Icon: SnipIcon },
  comment: { Icon: MessageCircle }
};

/** Fan outward to the right of the rail — away from the artwork. */
const ACTION_POSITIONS = [
  { x: 78, y: -78 },
  { x: 104, y: 0 },
  { x: 78, y: 78 }
];

/**
 * Collapsed → expanded vertical media rail.
 *
 * Starts as a condensed pill of green-accented dots; on hover/focus it unfolds
 * into a full vertical rail of per-media dots. Hovering/focusing a dot selects
 * that media; the track can also be clicked to scrub to the nearest item.
 *
 * This is the single source of truth for the rail so the patron feed card and the
 * post-detail gallery share identical placement, motion, and behavior.
 */
export function MediaEdgeRail({
  count,
  activeIndex,
  onSelect,
  className = "absolute right-2 top-1/2 z-20 -translate-y-1/2",
  stopPropagation = true,
  actions = [],
  onActionMenuOpenChange
}: MediaEdgeRailProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current != null) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const open = useCallback(() => {
    clearCollapseTimer();
    setExpanded(true);
  }, [clearCollapseTimer]);

  const scheduleCollapse = useCallback(() => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(() => {
      setExpanded(false);
      setActionMenuOpen(false);
      collapseTimerRef.current = null;
    }, 160);
  }, [clearCollapseTimer]);

  useEffect(() => () => clearCollapseTimer(), [clearCollapseTimer]);

  useEffect(() => {
    onActionMenuOpenChange?.(actionMenuOpen);
  }, [actionMenuOpen, onActionMenuOpenChange]);

  useEffect(
    () => () => {
      onActionMenuOpenChange?.(false);
    },
    [onActionMenuOpenChange]
  );

  const onTrackClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (count < 2) return;
      if (stopPropagation) e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.min(
        0.999,
        Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height))
      );
      onSelect(Math.floor(ratio * count));
    },
    [count, onSelect, stopPropagation]
  );

  if (count < 2) return null;

  const collapsedDotCount = Math.min(3, count);
  const collapsedActiveDot =
    collapsedDotCount <= 1
      ? 0
      : Math.round((activeIndex / Math.max(1, count - 1)) * (collapsedDotCount - 1));
  const actionMenuOffsetY =
    count <= 1 ? 0 : (activeIndex / Math.max(1, count - 1) - 0.5) * 68;
  const visibleActions = actions.slice(0, 3);

  return (
    <div
      ref={rootRef}
      className={className}
      onMouseEnter={open}
      onMouseLeave={scheduleCollapse}
      onFocusCapture={open}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        scheduleCollapse();
      }}
    >
      <div className="relative flex items-center justify-end">
        <button
          type="button"
          onClick={(e) => {
            if (stopPropagation) e.stopPropagation();
            if (expanded) {
              setActionMenuOpen(false);
              scheduleCollapse();
              return;
            }
            open();
            if (actions.length > 0) {
              setActionMenuOpen(true);
            }
          }}
          className={[
            "absolute right-0 top-1/2 z-[2] flex -translate-y-1/2 flex-col items-center justify-center gap-[3px] rounded-full border border-white/15 bg-black/55 px-2 py-2 backdrop-blur-sm transition-all duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
            expanded
              ? "pointer-events-none translate-x-1 opacity-0 scale-95"
              : "translate-x-0 opacity-100 scale-100"
          ].join(" ")}
          aria-label={`Open media rail (${count} assets)`}
          aria-expanded={expanded}
        >
          {Array.from({ length: collapsedDotCount }).map((_, idx) => (
            <span
              key={`media-rail-collapsed-dot-${idx}`}
              className="block rounded-full transition-all duration-300"
              style={{
                width: "0.3rem",
                height: idx === collapsedActiveDot ? "0.55rem" : "0.3rem",
                backgroundColor:
                  idx === collapsedActiveDot
                    ? "rgba(64,145,108,0.95)"
                    : "rgba(255,255,255,0.55)",
                boxShadow:
                  idx === collapsedActiveDot ? "0 0 8px rgba(64,145,108,0.7)" : "none"
              }}
            />
          ))}
        </button>

        <div
          className={[
            "relative flex min-h-[132px] min-w-[34px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-full border border-white/10 bg-black/45 px-2 py-2 backdrop-blur-sm transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
            expanded
              ? "translate-x-0 opacity-100 scale-100"
              : "pointer-events-none translate-x-2 opacity-0 scale-95"
          ].join(" ")}
          onClick={onTrackClick}
          aria-hidden={!expanded}
        >
          <span className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-white/15" />
          {Array.from({ length: count }).map((_, idx) => {
            const isActive = idx === activeIndex;
            const hasActions = isActive && actions.length > 0;
            return (
              <div key={`media-rail-dot-wrap-${idx}`} className="relative z-[1]">
                <button
                  type="button"
                  aria-label={
                    hasActions
                      ? `Open media ${idx + 1} actions`
                      : `Show media ${idx + 1} of ${count}`
                  }
                  aria-current={isActive ? "true" : undefined}
                  aria-expanded={hasActions ? actionMenuOpen : undefined}
                  onMouseEnter={(e) => {
                    if (stopPropagation) e.stopPropagation();
                    onSelect(idx);
                    if (!isActive) setActionMenuOpen(false);
                  }}
                  onFocus={(e) => {
                    if (stopPropagation) e.stopPropagation();
                    onSelect(idx);
                    if (!isActive) setActionMenuOpen(false);
                  }}
                  onClick={(e) => {
                    if (stopPropagation) e.stopPropagation();
                    if (hasActions) {
                      setActionMenuOpen((v) => !v);
                      return;
                    }
                    setActionMenuOpen(false);
                    onSelect(idx);
                  }}
                  className="relative flex h-7 w-6 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#40916C]/70"
                >
                  <span
                    className="block rounded-full transition-all duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]"
                    style={{
                      width: "0.375rem",
                      height: isActive ? "1rem" : "0.375rem",
                      backgroundColor: isActive
                        ? "rgba(64,145,108,0.98)"
                        : "rgba(255,255,255,0.5)",
                      boxShadow: isActive ? "0 0 8px rgba(64,145,108,0.75)" : "none",
                      opacity: isActive ? 1 : 0.9
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {visibleActions.length > 0 ? (
          <div
            className={[
              "absolute left-full z-[30] transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
              actionMenuOpen
                ? "pointer-events-auto opacity-100 scale-100"
                : "pointer-events-none opacity-0 scale-75"
            ].join(" ")}
            style={{ top: `calc(50% + ${actionMenuOffsetY}px)` }}
          >
            <div
              className="pointer-events-none absolute left-0 top-0 h-[220px] w-[220px] origin-left -translate-y-1/2 rounded-full transition-all duration-300"
              style={{
                background:
                  "radial-gradient(circle at left center, rgba(27,155,110,0.12) 0%, rgba(27,155,110,0.04) 38%, transparent 70%)"
              }}
            />
            <svg
              className="pointer-events-none absolute left-0 top-0 h-[220px] w-[220px] -translate-y-1/2"
              viewBox="0 -110 220 220"
              aria-hidden
            >
              {visibleActions.map((action, actionIdx) => {
                const pos = ACTION_POSITIONS[actionIdx] ?? ACTION_POSITIONS[1];
                return (
                  <line
                    key={`radial-line-${action.kind}`}
                    x1={0}
                    y1={0}
                    x2={pos.x}
                    y2={pos.y}
                    stroke="#1B9B6E"
                    strokeWidth={2}
                    strokeLinecap="round"
                    opacity={hoveredAction === action.kind ? 0.95 : 0.28}
                    style={{
                      strokeDasharray: 150,
                      strokeDashoffset: actionMenuOpen ? 0 : 150,
                      transition: `stroke-dashoffset 260ms ${actionIdx * 45}ms ease-out, opacity 160ms ease-out`
                    }}
                  />
                );
              })}
            </svg>

            <button
              type="button"
              onClick={(e) => {
                if (stopPropagation) e.stopPropagation();
                setActionMenuOpen(false);
              }}
              className="absolute left-0 top-0 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#1B9B6E] bg-[#101010] text-[#1B9B6E] shadow-[0_0_20px_rgba(27,155,110,0.3)] transition-colors hover:bg-[#161616] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1B9B6E]/80"
              aria-label="Close media actions"
            >
              <span className="block rotate-45 text-xl leading-none">+</span>
            </button>

            {visibleActions.map((action, actionIdx) => {
              const Icon = ACTION_META[action.kind].Icon;
              const pos = ACTION_POSITIONS[actionIdx] ?? ACTION_POSITIONS[1];
              const labelVisible = hoveredAction === action.kind;
              return (
                <div
                  key={action.kind}
                  className="absolute left-0 top-0 transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
                  style={{
                    transform: actionMenuOpen
                      ? `translate(${pos.x}px, ${pos.y}px) scale(1)`
                      : "translate(0px, 0px) scale(0)",
                    transitionDelay: actionMenuOpen ? `${actionIdx * 50}ms` : "0ms"
                  }}
                >
                  <span
                    className={[
                      "pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black shadow-lg transition-all duration-150",
                      labelVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-1 scale-95 opacity-0"
                    ].join(" ")}
                  >
                    {action.label}
                    <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
                  </span>
                  <button
                    type="button"
                    disabled={action.disabled}
                    aria-label={action.label}
                    onMouseEnter={() => setHoveredAction(action.kind)}
                    onMouseLeave={() => setHoveredAction(null)}
                    onFocus={() => setHoveredAction(action.kind)}
                    onBlur={() => setHoveredAction(null)}
                    onClick={(e) => {
                      if (stopPropagation) e.stopPropagation();
                      if (action.disabled) return;
                      action.onSelect();
                      setActionMenuOpen(false);
                    }}
                    className={[
                      "relative flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#1B9B6E]/50 bg-[#101010] text-[#1B9B6E] shadow-[0_4px_16px_rgba(0,0,0,0.35)] transition-all duration-200 hover:scale-110 hover:border-[#1B9B6E] hover:shadow-[0_0_20px_rgba(27,155,110,0.4)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1B9B6E]/80 disabled:cursor-not-allowed disabled:opacity-45",
                      action.active ? "border-[#1B9B6E] text-[#2BC48A]" : ""
                    ].join(" ")}
                  >
                    <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1B9B6E] opacity-80 shadow-[0_0_12px_rgba(27,155,110,0.55)]" />
                    <Icon className="relative z-[1] h-5 w-5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

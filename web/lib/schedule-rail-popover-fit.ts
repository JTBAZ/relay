/** Padding from the viewport edges when fitting schedule-rail popovers. */
export const SCHEDULE_RAIL_POPOVER_VIEWPORT_PAD_PX = 12;

/** Fallback height before the popover has laid out (media events are tall). */
export const SCHEDULE_RAIL_POPOVER_ESTIMATED_HEIGHT_PX = 560;

export type ScheduleRailPopoverFit = {
  /** Offset from the rail root top edge (may be negative — panel can extend above the rail). */
  topPx: number;
  /**
   * Height budget for the panel. Equals content height when it fits in the viewport
   * (no scrollbar). Only shorter than content when the panel must scroll.
   */
  maxHeightPx: number;
  /** True when content is taller than available viewport space. */
  needsScroll: boolean;
};

/**
 * Place a left-of-rail popover so the full panel stays on screen when possible.
 * Prefers growing to content height and shifting upward over an internal scrollbar.
 * Scroll only when content exceeds the viewport.
 */
export function computeScheduleRailPopoverFit(args: {
  rootTop: number;
  rootHeight: number;
  preferredTopInRoot: number;
  contentHeight: number;
  viewportHeight: number;
  pad?: number;
}): ScheduleRailPopoverFit {
  const pad = args.pad ?? SCHEDULE_RAIL_POPOVER_VIEWPORT_PAD_PX;
  const vh = Math.max(0, args.viewportHeight);
  const maxPossibleHeight = Math.max(160, vh - 2 * pad);
  const contentHeight = Math.max(1, args.contentHeight);

  // Use natural content height unless it cannot fit in the viewport at all.
  const height = Math.min(contentHeight, maxPossibleHeight);
  const needsScroll = contentHeight > maxPossibleHeight + 0.5;

  // Prefer the anchor, but shift up so the full panel stays in the viewport.
  let viewportTop = args.rootTop + args.preferredTopInRoot;
  const maxViewportTop = vh - pad - height;
  const minViewportTop = pad;
  if (viewportTop > maxViewportTop) {
    viewportTop = Math.max(minViewportTop, maxViewportTop);
  }
  if (viewportTop < minViewportTop) {
    viewportTop = minViewportTop;
  }

  // Allow negative topPx so the panel can extend above the rail column.
  const topPx = viewportTop - args.rootTop;

  // After pinning to the top pad, recompute how much height still fits.
  const spaceBelowViewport = vh - pad - viewportTop;
  const maxHeightPx = Math.max(
    160,
    Math.min(contentHeight, spaceBelowViewport, maxPossibleHeight)
  );

  return {
    topPx: Math.round(topPx),
    maxHeightPx: Math.round(maxHeightPx),
    needsScroll: needsScroll || maxHeightPx + 0.5 < contentHeight,
  };
}

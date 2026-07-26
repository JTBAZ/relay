"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PositionalComment } from "@/lib/relay-fixtures";
import { CommentPin } from "./comment-pin";

type Props = {
  stackRef?: React.Ref<HTMLDivElement>;
  imageUrls: string[];
  /** Which image is on top / active for pins (0-based). */
  displayIndex: number;
  onDisplayIndexChange?: (index: number) => void;
  /** When true, wheel cycles `displayIndex` (expanded multi-image zoom). */
  enableStackWheel?: boolean;
  /**
   * When true and `imageUrls.length > 1`, render a deck of cards behind the front image.
   * Letterbox uses `false` so only the cover is shown.
   */
  visualStack?: boolean;
  /** `none` lets parent (e.g. feed card) receive clicks instead of pin buttons. */
  pinLayerPointerEvents?: "auto" | "none";
  /** Forwarded to each pin — stop opening parent card on click (feed). */
  pinStopClickPropagation?: boolean;
  title: string;
  comments: PositionalComment[];
  pinLayerVisible: boolean;
  ghostPins: boolean;
  /** Per-pin cascade */
  cascadeEnter: (index: number) => number;
  cascadeExit: (index: number) => number;
  surfaceClassName: string;
  imgClassName: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /**
   * Optional interactive "peek cards" behavior:
   * - back card 1 => next media
   * - back card 2 => skip ahead by two media
   */
  peekInteractive?: boolean;
  onPeekBack1Click?: () => void;
  onPeekBack2Click?: () => void;
  role?: string;
  tabIndex?: number;
  "aria-label"?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") {
        ref(node);
      } else {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    }
  };
}

/**
 * Back-card transforms: nudge left + slight upward shift + CW rotation.
 * `scale` is handled by the parent transform so the card peeks out at the top.
 */
const BACK_1: React.CSSProperties = {
  transform: "translate(-5%, -3%) rotate(-3deg) scale(0.96)",
  transformOrigin: "bottom center",
};

const BACK_2: React.CSSProperties = {
  transform: "translate(-9%, -5.5%) rotate(-5.5deg) scale(0.92)",
  transformOrigin: "bottom center",
};

/** Shared image + absolute pin layer — same % box for letterbox and expanded overlay */
export function GalleryMediaStack({
  stackRef,
  imageUrls,
  displayIndex,
  onDisplayIndexChange,
  enableStackWheel = false,
  visualStack = false,
  pinLayerPointerEvents = "auto",
  pinStopClickPropagation = false,
  title,
  comments,
  pinLayerVisible,
  ghostPins,
  cascadeEnter,
  cascadeExit,
  surfaceClassName,
  imgClassName,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
  onKeyDown,
  peekInteractive = false,
  onPeekBack1Click,
  onPeekBack2Click,
  role,
  tabIndex,
  "aria-label": ariaLabel,
  style,
  children,
}: Props) {
  const wheelRootRef = useRef<HTMLDivElement>(null);
  const displayIndexRef = useRef(displayIndex);
  const onChangeRef = useRef(onDisplayIndexChange);
  displayIndexRef.current = displayIndex;
  onChangeRef.current = onDisplayIndexChange;

  const urls =
    imageUrls.length > 0 ? imageUrls : ["/placeholder.svg?height=800&width=1200"];
  const n = urls.length;
  const safeIndex = ((displayIndex % n) + n) % n;
  const frontSrc = urls[safeIndex];
  const back1Src = urls[(safeIndex + 1) % n];
  const back2Src = n > 2 ? urls[(safeIndex + 2) % n] : undefined;
  const showDeck = visualStack && n > 1;
  const [visibleSrc, setVisibleSrc] = useState(frontSrc);
  const [incomingSrc, setIncomingSrc] = useState<string | null>(null);
  const [incomingReady, setIncomingReady] = useState(false);

  useEffect(() => {
    if (showDeck || frontSrc === visibleSrc || frontSrc === incomingSrc) return;
    setIncomingSrc(frontSrc);
    setIncomingReady(false);
  }, [frontSrc, incomingSrc, showDeck, visibleSrc]);

  useEffect(() => {
    if (!incomingSrc || !incomingReady) return;
    const timer = setTimeout(() => {
      setVisibleSrc(incomingSrc);
      setIncomingSrc(null);
      setIncomingReady(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [incomingReady, incomingSrc]);

  const cycleFromWheel = useCallback(
    (e: WheelEvent) => {
      if (!enableStackWheel || n < 2 || !onChangeRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY === 0) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const next = ((displayIndexRef.current + dir) % n + n) % n;
      onChangeRef.current(next);
    },
    [enableStackWheel, n]
  );

  useEffect(() => {
    const el = wheelRootRef.current;
    if (!el || !enableStackWheel || n < 2) return;
    el.addEventListener("wheel", cycleFromWheel, { passive: false });
    return () => el.removeEventListener("wheel", cycleFromWheel);
  }, [cycleFromWheel, enableStackWheel, n]);

  const mergedRef = mergeRefs(stackRef, wheelRootRef);

  return (
    <div
      ref={mergedRef}
      role={role as React.AriaRole | undefined}
      tabIndex={tabIndex}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      style={style}
      className={surfaceClassName}
    >
      {/*
       * Letterbox (`!showDeck`): block-level `w-full` so `max-w-full` on the img
       * resolves to the dialog column — `inline-flex` shrink-wrap made `%` widths
       * cyclic and collapsed the preview to a narrow strip.
       * Deck (`showDeck`): shrink-wrap to the front image so back cards share its box.
       * NO nested `preserve-3d` — parent pop-out animation already sets it.
       */}
      <div
        className={
          showDeck
            ? "relative inline-flex max-w-full min-w-0 items-center justify-center"
            : "relative flex h-full w-full min-w-0 max-w-full items-center justify-center overflow-hidden"
        }
        style={{ isolation: "isolate" }}
      >
        {showDeck && back2Src && (
          // eslint-disable-next-line @next/next/no-img-element -- fixture / relay URLs
          <img
            key={`back2-${back2Src}`}
            src={back2Src}
            alt=""
            aria-hidden
            draggable={false}
            crossOrigin="anonymous"
            /*
             * Back images must NOT use imgClassName — that class carries max-h/max-w
             * constraints that conflict with filling the container absolutely.
             * Instead they match the front exactly in box size (100% × 100%) and
             * object-fit contains the actual image pixels within that box.
             */
            className={[
              "absolute inset-0 m-auto w-full h-full object-contain",
              peekInteractive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
            ].join(" ")}
            style={{ ...BACK_2, zIndex: 0 }}
            onClick={
              peekInteractive && onPeekBack2Click
                ? (e) => {
                    e.stopPropagation();
                    onPeekBack2Click();
                  }
                : undefined
            }
          />
        )}
        {showDeck && (
          // eslint-disable-next-line @next/next/no-img-element -- fixture / relay URLs
          <img
            key={`back1-${back1Src}`}
            src={back1Src}
            alt=""
            aria-hidden
            draggable={false}
            crossOrigin="anonymous"
            className={[
              "absolute inset-0 m-auto w-full h-full object-contain",
              peekInteractive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
            ].join(" ")}
            style={{ ...BACK_1, zIndex: 1 }}
            onClick={
              peekInteractive && onPeekBack1Click
                ? (e) => {
                    e.stopPropagation();
                    onPeekBack1Click();
                  }
                : undefined
            }
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- fixture / relay URLs */}
        <img
          key={showDeck ? `front-${frontSrc}` : `visible-${visibleSrc}`}
          src={showDeck ? frontSrc : visibleSrc}
          alt={title}
          draggable={false}
          crossOrigin="anonymous"
          className={[
            "pointer-events-none block transition-opacity duration-200 ease-out",
            !showDeck && incomingReady ? "opacity-0" : "opacity-100",
            imgClassName
          ].join(" ")}
          style={{ position: "relative", zIndex: 2 }}
        />
        {!showDeck && incomingSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- fixture / relay URLs
          <img
            key={`incoming-${incomingSrc}`}
            src={incomingSrc}
            alt=""
            aria-hidden
            draggable={false}
            crossOrigin="anonymous"
            onLoad={() => setIncomingReady(true)}
            className={[
              "pointer-events-none absolute inset-0 m-auto block transition-opacity duration-200 ease-out",
              incomingReady ? "opacity-100" : "opacity-0",
              imgClassName
            ].join(" ")}
            style={{ zIndex: 3 }}
          />
        ) : null}
      </div>

      {/* Pin layer — fills the outer surfaceClassName box which is always `relative` */}
      <div
        className={[
          "absolute inset-0 z-20",
          pinLayerPointerEvents === "none" ? "pointer-events-none" : "pointer-events-auto",
        ].join(" ")}
      >
        {comments.map((comment, index) => (
          <CommentPin
            key={comment.id}
            comment={comment}
            index={index}
            variant={ghostPins ? "ghost" : "default"}
            layerVisible={pinLayerVisible}
            cascadeDelayMs={
              pinLayerVisible ? cascadeEnter(index) : cascadeExit(index)
            }
            stopClickPropagation={pinStopClickPropagation}
          />
        ))}
      </div>
      {children}
    </div>
  );
}

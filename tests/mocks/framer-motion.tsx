import React from "react";

const MOTION_PROP_KEYS = new Set([
  "initial",
  "animate",
  "exit",
  "transition",
  "layout",
  "layoutId",
  "variants",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileInView",
  "drag",
  "onAnimationComplete"
]);

function stripMotionProps(props: Record<string, unknown>) {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!MOTION_PROP_KEYS.has(key)) rest[key] = value;
  }
  return rest;
}

/** Resolve MotionValue-like objects so style={{ scale: mv }} works under the vitest stub. */
function resolveStyle(style: unknown): unknown {
  if (!style || typeof style !== "object") return style;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (value && typeof value === "object" && typeof (value as { get?: unknown }).get === "function") {
      out[key] = (value as { get: () => unknown }).get();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function make(tag: keyof JSX.IntrinsicElements) {
  return React.forwardRef<HTMLElement, Record<string, unknown>>(function MotionStub(
    { children, style, ...props },
    ref
  ) {
    return React.createElement(
      tag,
      { ...stripMotionProps(props), style: resolveStyle(style), ref },
      children as React.ReactNode
    );
  });
}

function staticMotionValue(initial = 0) {
  return {
    get: () => initial,
    set: () => {},
    on: () => () => {},
    onChange: () => () => {}
  };
}

export const AnimatePresence = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

export function useReducedMotion() {
  return false;
}

export function useScroll() {
  return {
    scrollY: staticMotionValue(0),
    scrollYProgress: staticMotionValue(0)
  };
}

export function useSpring(source: { get?: () => number } | number) {
  if (typeof source === "number") return staticMotionValue(source);
  if (source && typeof source.get === "function") return source;
  return staticMotionValue(0);
}

export function useTransform(
  _input: unknown,
  _inputRange: number[] | unknown,
  outputRange?: number[]
) {
  const initial = Array.isArray(outputRange) ? outputRange[0] ?? 0 : 0;
  return staticMotionValue(initial);
}

export const motion = {
  div: make("div"),
  img: make("img"),
  button: make("button"),
  span: make("span"),
  p: make("p"),
  section: make("section")
};

export default {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform
};

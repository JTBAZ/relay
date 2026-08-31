"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  lab3RailTransition,
  SCHEDULE_RAIL_LAB3_WIDTH_PX
} from "./lab3-constants";

function useIsLg(): boolean {
  const [lg, setLg] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setLg(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return lg;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  widthPx?: number;
  collapseFocusRef?: { current: HTMLButtonElement | null };
};

export function Lab3ScheduleRailFrame({
  open,
  onOpenChange,
  children,
  widthPx = SCHEDULE_RAIL_LAB3_WIDTH_PX,
  collapseFocusRef
}: Props) {
  const isLg = useIsLg();
  const reduceMotion = useReducedMotion();
  const transition = lab3RailTransition(Boolean(reduceMotion));
  const handleRef = useRef<HTMLButtonElement>(null);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (prevOpen.current && !open) {
      const target =
        !isLg && collapseFocusRef?.current ? collapseFocusRef.current : handleRef.current;
      target?.focus();
    }
    prevOpen.current = open;
  }, [open, isLg, collapseFocusRef]);

  const handle = isLg ? (
    <button
      ref={handleRef}
      type="button"
      data-lab3-rail-handle
      data-lab3-rail-handle-open={open ? "true" : "false"}
      aria-expanded={open}
      aria-label={open ? "Close schedule" : "Open schedule"}
      onClick={() => onOpenChange(!open)}
      className={`absolute left-0 top-1/2 z-[61] flex h-14 w-10 -translate-x-full -translate-y-1/2 items-center justify-center rounded-l-lg border-0 bg-[#1e3328] text-[#9bf0c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bf0c4] ${
        open ? "" : "hover:bg-[#274236]"
      }`}
    >
      <CalendarDays className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
    </button>
  ) : null;

  const panel = (
    <div
      data-lab3-rail-panel
      data-lab3-rail-open={open ? "true" : "false"}
      className="relative h-full min-h-0 overflow-hidden bg-[var(--lab3-surface,#080c0a)]"
      style={{ width: widthPx }}
      aria-hidden={!open}
      ref={(el) => {
        if (!el) return;
        if (open) el.removeAttribute("inert");
        else el.setAttribute("inert", "");
      }}
    >
      {open ? children : null}
    </div>
  );

  if (!isLg) {
    return (
      <>
        {open ? (
          <button
            type="button"
            aria-label="Close schedule"
            className="fixed inset-0 z-[59] bg-black/55 lg:hidden"
            onClick={() => onOpenChange(false)}
            data-lab3-rail-sheet-backdrop
          />
        ) : null}
        <motion.div
          className="pointer-events-auto fixed inset-y-0 right-0 z-[60] lg:hidden"
          initial={false}
          animate={{ x: open ? 0 : "100%" }}
          transition={transition}
          data-lab3-rail-layout="sheet"
        >
          {panel}
        </motion.div>
      </>
    );
  }

  return (
    <div className="relative hidden h-full min-h-0 shrink-0 overflow-visible lg:block" data-lab3-rail-layout="flow">
      {!open ? (
        <div
          data-lab3-rail-edge
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-[60] w-0.5 -translate-x-px bg-[#3d5448]"
        />
      ) : null}
      {handle}
      <motion.div
        className="h-full min-h-0 overflow-hidden"
        initial={false}
        animate={{ width: open ? widthPx : 0 }}
        transition={transition}
        aria-hidden={!open}
        role="complementary"
      >
        {panel}
      </motion.div>
    </div>
  );
}

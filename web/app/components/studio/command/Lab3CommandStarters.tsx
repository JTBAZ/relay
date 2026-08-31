"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { CalendarDays, FileText, LayoutGrid } from "lucide-react";

export type Lab3CommandStarterId = "organize" | "schedule" | "prepare_drafts";

export const LAB3_COMMAND_EXAMPLE_INTERVAL_MS = 7000;
export const LAB3_COMMAND_EXAMPLE_FADE_MS = 200;

export const LAB3_COMMAND_STARTERS: {
  id: Lab3CommandStarterId;
  label: string;
  examples: string[];
}[] = [
  {
    id: "organize",
    label: "Organize",
    examples: [
      "Put Hero Academy in a collection ordered by page, cover first.",
      "Organize the watercolor landscapes newest first into a collection.",
      "Group everything tagged watercolor into one collection."
    ]
  },
  {
    id: "schedule",
    label: "Schedule",
    examples: [
      "Plan a weekly X schedule for Hero Academy, skipping pages already posted on X.",
      "One page a week on X, skip pages already posted there.",
      "Plan the rest of Hero Academy one page a week on X."
    ]
  },
  {
    id: "prepare_drafts",
    label: "Prepare drafts",
    examples: [
      "Use the Patreon descriptions, keep them under the platform limit.",
      "Prepare X drafts from the existing descriptions.",
      "Adapt the Patreon descriptions for Bluesky, keep them under the limit."
    ]
  }
];

type TeachingValue = {
  starter: Lab3CommandStarterId;
  example: string;
  fading: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  setStarter: (id: Lab3CommandStarterId) => void;
  fillCurrent: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  ghostRef: (node: HTMLElement | null) => void;
};

const TeachingContext = createContext<TeachingValue | null>(null);

function useTeaching(): TeachingValue {
  const ctx = useContext(TeachingContext);
  if (!ctx) {
    throw new Error("Lab3 command teaching must wrap ghost and starter rail");
  }
  return ctx;
}

function starterById(id: Lab3CommandStarterId) {
  return LAB3_COMMAND_STARTERS.find((item) => item.id === id) ?? LAB3_COMMAND_STARTERS[0];
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type TeachingProps = {
  paused: boolean;
  disabled: boolean;
  onFill: (example: string) => void;
  onExampleChange?: (example: string) => void;
  children: ReactNode;
};

export function Lab3CommandTeaching({
  paused,
  disabled,
  onFill,
  onExampleChange,
  children
}: TeachingProps) {
  const [starter, setStarterState] = useState<Lab3CommandStarterId>("organize");
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [docHidden, setDocHidden] = useState(false);
  const [inView, setInView] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);
  const hoverCount = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const onFillRef = useRef(onFill);
  onFillRef.current = onFill;
  const onExampleChangeRef = useRef(onExampleChange);
  onExampleChangeRef.current = onExampleChange;

  const examples = starterById(starter).examples;
  const example = examples[index % examples.length] ?? examples[0];

  useEffect(() => {
    onExampleChangeRef.current?.(example);
  }, [example]);

  const rotatePaused = paused || hovered || docHidden || !inView || reduceMotion || disabled;

  useEffect(() => {
    const onVis = () => setDocHidden(typeof document !== "undefined" && document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const ghostRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof IntersectionObserver !== "function") {
      setInView(true);
      return;
    }
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setInView(entries.some((entry) => entry.isIntersecting));
      },
      { threshold: 0.2 }
    );
    observerRef.current.observe(node);
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (rotatePaused) {
      setFading(false);
      return;
    }
    let fadeTimer = 0;
    const tick = window.setInterval(() => {
      setFading(true);
      fadeTimer = window.setTimeout(() => {
        setIndex((current) => current + 1);
        setFading(false);
      }, LAB3_COMMAND_EXAMPLE_FADE_MS);
    }, LAB3_COMMAND_EXAMPLE_INTERVAL_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(fadeTimer);
    };
  }, [rotatePaused, starter]);

  const setStarter = useCallback((id: Lab3CommandStarterId) => {
    setStarterState(id);
    setIndex(0);
    setFading(false);
  }, []);

  const fillCurrent = useCallback(() => {
    if (disabled) return;
    onFillRef.current(example);
  }, [disabled, example]);

  const onHoverEnter = useCallback(() => {
    hoverCount.current += 1;
    setHovered(true);
  }, []);

  const onHoverLeave = useCallback(() => {
    hoverCount.current = Math.max(0, hoverCount.current - 1);
    if (hoverCount.current === 0) setHovered(false);
  }, []);

  const value = useMemo<TeachingValue>(
    () => ({
      starter,
      example,
      fading,
      disabled,
      reduceMotion,
      setStarter,
      fillCurrent,
      onHoverEnter,
      onHoverLeave,
      ghostRef
    }),
    [
      starter,
      example,
      fading,
      disabled,
      reduceMotion,
      setStarter,
      fillCurrent,
      onHoverEnter,
      onHoverLeave,
      ghostRef
    ]
  );

  return (
    <TeachingContext.Provider value={value}>{children}</TeachingContext.Provider>
  );
}

export function Lab3CommandGhost() {
  const {
    example,
    fading,
    disabled,
    reduceMotion,
    fillCurrent,
    onHoverEnter,
    onHoverLeave,
    ghostRef
  } = useTeaching();

  const className = `max-w-full truncate text-left text-[13px] font-normal leading-8 text-[var(--lab3-text-command,#b8c2bc)] sm:text-[14px] ${
    reduceMotion ? "" : "motion-safe:transition-opacity motion-safe:duration-200"
  } ${fading ? "opacity-0" : "opacity-100"}`;

  if (disabled) {
    return (
      <div
        ref={ghostRef}
        data-lab3-command-ghost=""
        data-lab3-command-ghost-disabled=""
        className="pointer-events-none absolute inset-0 z-[1] flex items-center"
        aria-hidden="true"
      >
        <span className={className}>{example}</span>
      </div>
    );
  }

  return (
    <div
      ref={ghostRef}
      data-lab3-command-ghost=""
      className="pointer-events-none absolute inset-0 z-[1] flex items-center"
      aria-hidden="true"
    >
      <span
        onClick={fillCurrent}
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
        className={`pointer-events-auto cursor-pointer ${className}`}
      >
        {example}
      </span>
    </div>
  );
}

const STARTER_ICONS = {
  organize: LayoutGrid,
  schedule: CalendarDays,
  prepare_drafts: FileText
} as const;

export function Lab3CommandStarterRail() {
  const { starter, disabled, setStarter, onHoverEnter, onHoverLeave } = useTeaching();

  return (
    <div
      data-lab3-command-starters=""
      data-lab3-command-starters-inline=""
      className="flex h-11 min-h-[44px] items-center border-t border-[var(--lab3-hairline,#1c211f)]"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <div className="flex w-full gap-1 overflow-x-auto px-2 sm:overflow-visible">
        {LAB3_COMMAND_STARTERS.map((item) => {
          const Icon = STARTER_ICONS[item.id];
          const pressed = starter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              aria-pressed={pressed}
              aria-label={item.label}
              data-lab3-command-starter={item.id}
              onClick={() => setStarter(item.id)}
              className={`flex h-11 min-h-[44px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)] disabled:opacity-55 ${
                pressed
                  ? "text-[var(--lab3-mint,#9bf0c4)]"
                  : "text-[var(--lab3-text-ghost,#9aa49d)] hover:text-[var(--lab3-text-command,#b8c2bc)]"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

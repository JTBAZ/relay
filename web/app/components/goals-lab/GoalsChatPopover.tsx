"use client";

/**
 * Lab-only Goals coach chat frame (mock spine).
 * Visual shell matched to v0 /3 reference: compact header, Relay Coach row,
 * inset greeting card. No Goal Cycle / Schedule Rail writes.
 * Mapping: docs/studio/GOALS_LAB_FRAME_BEAT_MAP.md
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  BREAK_OPTIONS,
  GOALS_POSITIVE_NOTE,
  GOALS_STRATEGY_BODY,
  GOAL_OPTIONS,
  INITIAL_PLAN_ROWS,
  REVISED_PLAN_ROWS,
  STRATEGY_ADJUST_CHIPS,
  VIBE_OPTIONS,
  nextBubbleId,
  resetBubbleSeq,
  type ChatBubble,
  type GoalsBeat,
  type GoalsBreakMode,
  type GoalsGoalId,
  type GoalsVibe,
  type PlanRow
} from "./goals-lab-mock";
import "./goals-lab.css";

type Props = {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
};

const SCAN_LINES = [
  "Looking at your recent posts…",
  "Checking trends for sketches…",
  "Gathering confidence signals…"
];

const DISPLAY: CSSProperties = {
  fontFamily: "var(--font-display), Georgia, serif"
};

function Chip({
  label,
  selected,
  onClick,
  primary
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all active:scale-[0.98] ${
        primary
          ? "border-[#9bf0c4] bg-[#9bf0c4] text-[#050706] hover:brightness-110"
          : selected
            ? "border-[#4e9e7966] bg-[#0a1510] text-[#5fb98f]"
            : "border-[#2a2a2a] bg-[#121212] text-[#b0b0b0] hover:border-[#3a3a3a] hover:text-[#e8e8e8]"
      }`}
    >
      {label}
    </button>
  );
}

function CoachAvatar() {
  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1c2e22] bg-[#0a1510] text-[11px] font-semibold text-[#5fb98f]"
      aria-hidden
    >
      R
    </div>
  );
}

function CoachLabel() {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <CoachAvatar />
      <span className="text-[12px] font-medium text-[#777]">Relay Coach</span>
    </div>
  );
}

function PlanChecklist({ rows }: { rows: PlanRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#0c0c0c]">
      <ul className="divide-y divide-[#161616]">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-[#e8e8e8]">{row.title}</p>
              <p className="mt-0.5 text-[10px] text-[#666]">
                {row.when}
                <span className="mx-1.5 text-[#333]">·</span>
                {row.kind === "upkeep" ? "Upkeep" : "Post"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {row.destinations.map((d) => (
                <span
                  key={d}
                  className="rounded-md border border-[#222] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#888]"
                >
                  {d}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Inset coach message card — /3 signature surface */
function CoachCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1a1a1a] bg-[#111111] px-4 py-4">{children}</div>
  );
}

export function GoalsChatPopover({ open, onClose, triggerRef }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const scanDoneRef = useRef(false);
  const [beat, setBeat] = useState<GoalsBeat>("activate");
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [goal, setGoal] = useState<GoalsGoalId | null>(null);
  const [breakMode, setBreakMode] = useState<GoalsBreakMode | null>(null);
  const [vibe, setVibe] = useState<GoalsVibe | null>(null);
  const [planRows, setPlanRows] = useState<PlanRow[]>(INITIAL_PLAN_ROWS);
  const [revisionCount, setRevisionCount] = useState(0);
  const [scanStep, setScanStep] = useState(0);
  const [draftText, setDraftText] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const seededRef = useRef(false);
  const [layoutTick, setLayoutTick] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const bump = () => setLayoutTick((n) => n + 1);
    bump();
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (seededRef.current) return;
    resetBubbleSeq();
    setBubbles([]);
    setBeat("activate");
    setGoal(null);
    setBreakMode(null);
    setVibe(null);
    setPlanRows(INITIAL_PLAN_ROWS);
    setRevisionCount(0);
    setScanStep(0);
    setDraftText("");
    scanDoneRef.current = false;
    seededRef.current = true;
  }, [open]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [bubbles, beat, scanStep, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (beat !== "scan") return;
    if (reduceMotion) {
      setScanStep(SCAN_LINES.length);
      return;
    }
    if (scanStep >= SCAN_LINES.length) return;
    const t = window.setTimeout(() => setScanStep((s) => s + 1), 700);
    return () => window.clearTimeout(t);
  }, [beat, scanStep, reduceMotion]);

  useEffect(() => {
    if (beat !== "scan" || scanStep < SCAN_LINES.length || scanDoneRef.current) return;
    scanDoneRef.current = true;
    setBubbles((prev) => [
      ...prev,
      {
        id: nextBubbleId(),
        role: "coach",
        kind: "takeaway",
        body: "What I noticed"
      },
      {
        id: nextBubbleId(),
        role: "coach",
        body: "Sketch drops earn the most conversation when they land mid-week - weekends lean quieter for Ava’s audience."
      },
      {
        id: nextBubbleId(),
        role: "coach",
        kind: "strategy",
        body: "Here’s my recommended approach."
      },
      {
        id: nextBubbleId(),
        role: "coach",
        body: GOALS_STRATEGY_BODY
      },
      {
        id: nextBubbleId(),
        role: "coach",
        body: "Is there anything you’d like to adjust or add?"
      }
    ]);
    setBeat("strategy");
  }, [beat, scanStep]);

  if (!open) return null;

  const triggerBox = triggerRef.current?.getBoundingClientRect();
  const width =
    typeof window !== "undefined" ? Math.min(400, window.innerWidth - 24) : 400;
  let left = triggerBox?.left ?? 16;
  if (typeof window !== "undefined" && left + width > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - width - 12);
  }
  const top = (triggerBox?.bottom ?? 56) + 10;

  const append = (next: ChatBubble | ChatBubble[]) => {
    setBubbles((prev) => [...prev, ...(Array.isArray(next) ? next : [next])]);
  };

  const beginPlan = () => {
    append({
      id: nextBubbleId(),
      role: "user",
      body: "Plan this month"
    });
    append({
      id: nextBubbleId(),
      role: "coach",
      body: "What should the next goal be?"
    });
    setBeat("goal");
  };

  const startScan = () => {
    append({
      id: nextBubbleId(),
      role: "coach",
      body: "I’ll scan analytics and trends - this stays short."
    });
    setScanStep(0);
    setBeat("scan");
  };

  const draftPlan = () => {
    append([
      {
        id: nextBubbleId(),
        role: "coach",
        body: "Here’s a draft plan."
      },
      {
        id: nextBubbleId(),
        role: "coach",
        kind: "plan",
        body: "plan"
      }
    ]);
    setBeat("plan");
  };

  const footer = (() => {
    switch (beat) {
      case "activate":
        return null;
      case "goal":
        return (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((opt) => (
                <Chip
                  key={opt.id}
                  label={opt.label}
                  selected={goal === opt.id}
                  onClick={() => setGoal(opt.id)}
                />
              ))}
            </div>
            {goal ? (
              <p className="text-[11px] leading-relaxed text-[#666]">
                {GOAL_OPTIONS.find((o) => o.id === goal)?.help}
              </p>
            ) : null}
            <Chip
              primary
              label="Continue"
              onClick={() => {
                if (!goal) return;
                const label = GOAL_OPTIONS.find((o) => o.id === goal)?.label ?? goal;
                append({ id: nextBubbleId(), role: "user", body: label });
                if (goal === "break") {
                  append({
                    id: nextBubbleId(),
                    role: "coach",
                    body: "How quiet should this month be?"
                  });
                  setBeat("break_mode");
                } else {
                  append({
                    id: nextBubbleId(),
                    role: "coach",
                    body: "What’s the vibe this month?"
                  });
                  setBeat("context");
                }
              }}
            />
          </div>
        );
      case "break_mode":
        return (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              {BREAK_OPTIONS.map((opt) => (
                <Chip
                  key={opt.id}
                  label={opt.label}
                  selected={breakMode === opt.id}
                  onClick={() => setBreakMode(opt.id)}
                />
              ))}
            </div>
            {breakMode ? (
              <p className="text-[11px] leading-relaxed text-[#666]">
                {BREAK_OPTIONS.find((o) => o.id === breakMode)?.help}
              </p>
            ) : null}
            <Chip
              primary
              label="Continue"
              onClick={() => {
                if (!breakMode) return;
                const label =
                  BREAK_OPTIONS.find((o) => o.id === breakMode)?.label ?? breakMode;
                append({ id: nextBubbleId(), role: "user", body: label });
                append({
                  id: nextBubbleId(),
                  role: "coach",
                  body: "What’s the vibe this month?"
                });
                setBeat("context");
              }}
            />
          </div>
        );
      case "context":
        return (
          <div className="flex flex-wrap gap-2">
            {VIBE_OPTIONS.map((opt) => (
              <Chip
                key={opt.id}
                label={opt.label}
                selected={vibe === opt.id}
                onClick={() => {
                  setVibe(opt.id);
                  append({ id: nextBubbleId(), role: "user", body: opt.label });
                  startScan();
                }}
              />
            ))}
          </div>
        );
      case "scan":
        return (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[#666]">
              {scanStep < SCAN_LINES.length ? SCAN_LINES[scanStep] : "Wrapping up…"}
            </p>
            <Chip label="Skip" onClick={() => setScanStep(SCAN_LINES.length)} />
          </div>
        );
      case "strategy":
        return (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              <Chip primary label="Looks good - draft the Plan" onClick={draftPlan} />
              {STRATEGY_ADJUST_CHIPS.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  onClick={() => {
                    append({ id: nextBubbleId(), role: "user", body: label });
                    append({
                      id: nextBubbleId(),
                      role: "coach",
                      body: `Got it - I’ll lean ${label.toLowerCase()} in the draft.`
                    });
                    draftPlan();
                  }}
                />
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = draftText.trim();
                if (!text) return;
                append({ id: nextBubbleId(), role: "user", body: text });
                append({
                  id: nextBubbleId(),
                  role: "coach",
                  body: "Noted - I’ll fold that into the draft."
                });
                setDraftText("");
                draftPlan();
              }}
            >
              <input
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Or type a reply…"
                className="min-w-0 flex-1 rounded-full border border-[#2a2a2a] bg-[#0c0c0c] px-3 py-1.5 text-[12px] text-[#ccc] outline-none placeholder:text-[#555] focus:border-[#3a3a3a]"
              />
            </form>
          </div>
        );
      case "plan":
        return (
          <div className="flex flex-wrap gap-2">
            <Chip
              primary
              label="Looks good"
              onClick={() => {
                append({
                  id: nextBubbleId(),
                  role: "coach",
                  body: "When you’re ready, you’ll confirm and drop art onto the schedule."
                });
                setBeat("done");
              }}
            />
            <Chip
              label="Adjust the plan…"
              onClick={() => {
                append({
                  id: nextBubbleId(),
                  role: "user",
                  body: "Adjust the plan…"
                });
                setBeat("revise");
              }}
            />
          </div>
        );
      case "revise":
        return (
          <div className="space-y-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = draftText.trim();
                if (!text) return;
                const nextCount = revisionCount + 1;
                if (nextCount > 2) {
                  append({
                    id: nextBubbleId(),
                    role: "coach",
                    body: "That’s the AI revision limit for this plan - tweak rows manually next."
                  });
                  setBeat("done");
                  setDraftText("");
                  return;
                }
                setRevisionCount(nextCount);
                setPlanRows(REVISED_PLAN_ROWS);
                append([
                  { id: nextBubbleId(), role: "user", body: text },
                  {
                    id: nextBubbleId(),
                    role: "coach",
                    body: `Revised (${nextCount}/2). Here’s the updated draft.`
                  },
                  {
                    id: nextBubbleId(),
                    role: "coach",
                    kind: "plan",
                    body: "plan"
                  }
                ]);
                setDraftText("");
                setBeat("plan");
              }}
            >
              <input
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Adjust the plan like this…"
                className="min-w-0 flex-1 rounded-full border border-[#2a2a2a] bg-[#0c0c0c] px-3 py-1.5 text-[12px] text-[#ccc] outline-none placeholder:text-[#555] focus:border-[#3a3a3a]"
              />
              <button
                type="submit"
                className="rounded-full border border-[#9bf0c4] bg-[#9bf0c4] px-3.5 py-1.5 text-[12px] font-semibold text-[#050706] transition-all hover:brightness-110 active:scale-[0.98]"
              >
                Revise
              </button>
            </form>
            <span className="text-[10px] tabular-nums text-[#555]">
              AI revisions {Math.min(revisionCount, 2)}/2
            </span>
          </div>
        );
      case "done":
        return (
          <p className="text-[11px] leading-relaxed text-[#666]">
            Frame complete - schedule wiring lands in a later pass. You can close Goals and keep
            browsing the Library.
          </p>
        );
      default:
        return null;
    }
  })();

  const showFooter = footer != null;

  return createPortal(
    <div
      className="fixed z-[200] w-[min(92vw,400px)] max-w-[calc(100vw-1.5rem)]"
      style={{ top, left }}
      data-layout-tick={layoutTick}
    >
      <div
        ref={panelRef}
        id="goals-lab-popover"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-goals-lab-popover
        className={`flex max-h-[min(78vh,560px)] flex-col overflow-hidden rounded-[20px] border border-[#222] bg-[#0d0d0d] shadow-2xl shadow-black/70 ${
          reduceMotion ? "" : "goals-lab-popover-enter"
        }`}
        style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
      >
        {/* Header — /3: green dot + Goals + credit pill + X */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#1a1a1a] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-[#4e9e79]"
              aria-hidden
            />
            <p
              id={titleId}
              className="text-[13px] font-semibold tracking-tight text-[#f0f0f0]"
            >
              Goals
            </p>
            <span className="rounded-full border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-[10px] font-medium text-[#888]">
              1 plan credit
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#666] hover:bg-[#151515] hover:text-[#aaa]"
            aria-label="Close Goals"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </header>

        <div
          ref={transcriptRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5"
        >
          <CoachLabel />

          {beat === "activate" ? (
            <CoachCard>
              <p
                className="text-[22px] font-medium leading-tight tracking-tight text-[#f2f2f2]"
                style={DISPLAY}
              >
                Hey, Ava.
              </p>
              <p className="mt-2.5 text-[12px] leading-snug text-[#8a8a8a]">
                {GOALS_POSITIVE_NOTE}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-[#8a8a8a]">
                Ready to map out July?
              </p>
              <button
                type="button"
                onClick={beginPlan}
                className="mt-4 rounded-full bg-[#9bf0c4] px-4 py-2 text-[12px] font-semibold text-[#050706] transition-all hover:brightness-110 active:scale-[0.98]"
              >
                Plan this month
              </button>
            </CoachCard>
          ) : (
            <div className="space-y-3">
              {/* Opening card stays as transcript context once flow starts */}
              <CoachCard>
                <p
                  className="text-[18px] font-medium leading-tight tracking-tight text-[#f2f2f2]"
                  style={DISPLAY}
                >
                  Hey, Ava.
                </p>
                <p className="mt-2 text-[12px] leading-snug text-[#8a8a8a]">
                  {GOALS_POSITIVE_NOTE}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-[#8a8a8a]">
                  Ready to map out July?
                </p>
              </CoachCard>

              {bubbles.map((b, i) => {
                if (b.kind === "plan") {
                  return <PlanChecklist key={b.id} rows={planRows} />;
                }
                if (b.role === "user") {
                  return (
                    <div key={b.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-full border border-[#1c2e22] bg-[#0a1510] px-3.5 py-1.5 text-[12px] font-medium text-[#5fb98f]">
                        {b.body}
                      </div>
                    </div>
                  );
                }
                if (b.kind === "takeaway") {
                  const detail = bubbles[i + 1];
                  const detailBody =
                    detail &&
                    detail.role === "coach" &&
                    !detail.kind &&
                    !detail.display
                      ? detail.body
                      : null;
                  return (
                    <CoachCard key={b.id}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4e9e79]">
                        {b.body}
                      </p>
                      {detailBody ? (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-[#c8d0cb]">
                          {detailBody}
                        </p>
                      ) : null}
                    </CoachCard>
                  );
                }
                if (b.kind === "strategy") {
                  const detail = bubbles[i + 1];
                  const detailBody =
                    detail &&
                    detail.role === "coach" &&
                    !detail.kind &&
                    !detail.display
                      ? detail.body
                      : null;
                  return (
                    <CoachCard key={b.id}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4e9e79]">
                        Recommended approach
                      </p>
                      <p
                        className="mt-1.5 text-[15px] font-medium tracking-tight text-[#e8e8e8]"
                        style={DISPLAY}
                      >
                        {b.body}
                      </p>
                      {detailBody ? (
                        <p className="mt-2 text-[13px] leading-relaxed text-[#c8d0cb]">
                          {detailBody}
                        </p>
                      ) : null}
                    </CoachCard>
                  );
                }
                if (
                  i > 0 &&
                  (bubbles[i - 1]?.kind === "takeaway" ||
                    bubbles[i - 1]?.kind === "strategy") &&
                  b.role === "coach" &&
                  !b.kind &&
                  !b.display
                ) {
                  return null;
                }
                return (
                  <p
                    key={b.id}
                    className="max-w-[95%] text-[13px] leading-relaxed text-[#b8b8b8]"
                  >
                    {b.body}
                  </p>
                );
              })}

              {beat === "scan" && scanStep < SCAN_LINES.length ? (
                <div className="space-y-2 pt-1">
                  <p className="text-[12px] text-[#888]">{SCAN_LINES[scanStep]}</p>
                  <div className="h-1 overflow-hidden rounded-full bg-[#1a1a1a]">
                    <div
                      className="h-full rounded-full bg-[#4e9e79] transition-[width] duration-500"
                      style={{
                        width: `${((scanStep + 1) / SCAN_LINES.length) * 100}%`
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {showFooter ? (
          <footer className="shrink-0 border-t border-[#1a1a1a] bg-[#0c0c0c] px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

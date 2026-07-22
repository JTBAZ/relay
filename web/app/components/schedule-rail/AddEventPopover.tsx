"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEST_LABELS,
  EVENT_TYPE_LABELS,
  CREATE_EVENT_PICKER,
  SOCIAL_ACTION_TYPES,
  SOCIAL_ACTION_CHIP_LABELS,
  isSocialActionType,
  type Destination,
  type ExactEventType,
  type SocialActionType,
} from "@/lib/schedule-rail-data";
import {
  fetchScheduleLibraryPosts,
  type LibraryPostPickerRow,
} from "@/lib/schedule-rail-api";
import {
  SCHEDULE_DATE_PRESETS,
  defaultScheduleDatetimeLocal,
  formatResolvedScheduleLabel,
  resolveScheduleDatePreset,
  type ScheduleDatePresetId,
} from "@/lib/schedule-date-presets";
import { isoFromDatetimeLocal } from "@/lib/goal-cycle-schedule-local";

/** Lab2 floorplan tokens — soft mint chassis, not sharp gray cards. */
const SHELL =
  "animate-popover-in overflow-hidden rounded-2xl border border-[#242a27] bg-[#0e100f] shadow-2xl shadow-black/60 ring-1 ring-white/5";
const HEADER =
  "flex items-center justify-between border-b border-[#172018] px-4 pb-3 pt-4";
const OPTION =
  "rounded-xl border px-3 py-2.5 text-left text-[12px] transition-all duration-200 active:scale-[0.99]";
const OPTION_ON =
  "border-[#9bf0c4]/45 bg-[#9bf0c414] text-[#edf2ef] shadow-[0_0_0_1px_rgba(155,240,196,0.14)]";
const OPTION_OFF =
  "border-[#1e2a22] bg-[#0a0f0b] text-[#aaa] hover:border-[#243426] hover:text-[#c8d0cb]";
const FIELD =
  "w-full rounded-xl border border-[#242a27] bg-[#0a0f0b] px-3 py-2 text-[12px] text-[#e8e8e8] placeholder-[#555] [color-scheme:dark] focus:border-[#9bf0c4]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9bf0c4]/20";
const PRIMARY =
  "flex-1 rounded-xl bg-[#9bf0c4] py-2.5 text-[12px] font-medium text-[#050706] transition-all hover:bg-[#b8f5d4] active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-[#9bf0c4] disabled:active:scale-100";
const SECONDARY =
  "flex-1 rounded-xl border border-[#242a27] bg-[#ffffff08] py-2.5 text-[12px] text-[#888] transition-all hover:border-[#9bf0c43d] hover:text-[#c8d0cb] disabled:opacity-50";
const CHOICE_CARD =
  "rounded-xl border border-[#1e2a22] bg-[#0a0f0b] px-3 py-2.5 text-left transition-all duration-200 hover:border-[#9bf0c43d] hover:bg-[#0e1410] active:scale-[0.99] disabled:opacity-40";
const SUMMARY =
  "rounded-xl border border-[#1e2a22] bg-[#0a100c] px-3 py-2.5";
const LIST_SHELL =
  "max-h-36 overflow-y-auto rounded-xl border border-[#1e2a22] bg-[#0a0f0b]";

export type PlannedPostFormat = "text" | "image" | "video" | "mixed";

export type CreateEventPayload = {
  event_type: ExactEventType;
  /** Null for custom (no platform). Required for social types. Primary / first selected. */
  destination: NonNullable<Destination> | null;
  /** Multi-platform queue for Post → New Relay draft (Autopost bridge). */
  destinations?: NonNullable<Destination>[];
  due_at: string;
  title: string;
  note: string;
  remind_me: boolean;
  target_mode: "new_post" | "existing_post" | "external_url";
  post_id?: string | null;
  external_url?: string | null;
  create_relay_draft?: boolean;
  planned_format?: PlannedPostFormat;
};

export type MissingPlatformLinkState = {
  post_id: string;
  destination: NonNullable<Destination>;
  message: string;
};

interface AddEventPopoverProps {
  onAdd: (payload: CreateEventPayload) => void | Promise<void>;
  onClose: () => void;
  busy?: boolean;
  error?: string | null;
  /** When create returns missing_platform_link, host can push this to remount the URL field. */
  missingLink?: MissingPlatformLinkState | null;
  onClearMissingLink?: () => void;
  /** Studio Core locked — show upgrade instead of form. */
  locked?: boolean;
  upgradeHref?: string;
  /** Creator timezone from Schedule Rail (IANA). */
  timeZone?: string;
}

const DESTINATIONS = (Object.keys(DEST_LABELS) as Destination[]).filter(
  (d): d is NonNullable<Destination> => Boolean(d)
);

const FORMAT_OPTIONS: { id: PlannedPostFormat; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "mixed", label: "Mixed media" },
];

const FORMAT_TITLE: Record<PlannedPostFormat, string> = {
  text: "Text post",
  image: "Image post",
  video: "Video post",
  mixed: "Mixed media post",
};

function needsUrlOrPost(eventType: ExactEventType): boolean {
  return isSocialActionType(eventType);
}

/** Post dialogue steps vs legacy steps for other event types. */
type Step =
  | "type"
  | "format"
  | "platform"
  | "when"
  | "start"
  | "library"
  | "target"
  | "details";

type PostStartMode = "later" | "library";

/** Staged Create Event form — Studio Core manual social reminders. */
export function AddEventPopover({
  onAdd,
  onClose,
  busy = false,
  error = null,
  missingLink = null,
  onClearMissingLink,
  locked = false,
  upgradeHref = "/studio/settings/billing?feature=studio_core",
  timeZone = "UTC",
}: AddEventPopoverProps) {
  const [step, setStep] = useState<Step>("type");
  const [eventType, setEventType] = useState<ExactEventType>("make_post");
  const [plannedFormat, setPlannedFormat] = useState<PlannedPostFormat>("image");
  const [destination, setDestination] = useState<NonNullable<Destination>>("patreon");
  const [destinations, setDestinations] = useState<NonNullable<Destination>[]>([]);
  const [targetMode, setTargetMode] = useState<"new_post" | "existing_post" | "external_url">(
    "new_post"
  );
  const [postId, setPostId] = useState<string | null>(null);
  const [selectedPostTitle, setSelectedPostTitle] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [title, setTitle] = useState("");
  const [datetime, setDatetime] = useState(() => defaultScheduleDatetimeLocal(timeZone));
  const [datePreset, setDatePreset] = useState<ScheduleDatePresetId | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState("");
  const [posts, setPosts] = useState<LibraryPostPickerRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postQuery, setPostQuery] = useState("");
  /** Blocks accidental create when Enter advances target→details and remounts a submit control. */
  const suppressCreateRef = useRef(false);

  const isCustom = eventType === "custom";
  const isPostDialogue = eventType === "make_post";
  const isSocialDialogue = isSocialActionType(eventType);

  function selectSocialAction(next: SocialActionType) {
    setTitle((titlePrev) => {
      const prevDefault = EVENT_TYPE_LABELS[eventType];
      if (!titlePrev.trim() || titlePrev === prevDefault) {
        return EVENT_TYPE_LABELS[next];
      }
      return titlePrev;
    });
    setEventType(next);
  }

  useEffect(() => {
    if (missingLink) {
      setEventType("make_post");
      setTargetMode("existing_post");
      setPostId(missingLink.post_id);
      setDestination(missingLink.destination);
      setDestinations([missingLink.destination]);
      setStep("library");
    }
  }, [missingLink]);

  const loadPosts = useCallback(async (q?: string) => {
    setPostsLoading(true);
    try {
      const rows = await fetchScheduleLibraryPosts({ q });
      setPosts(rows);
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadingLibrary =
      (isPostDialogue && step === "library") ||
      (step === "target" && targetMode === "existing_post" && eventType !== "custom");
    if (loadingLibrary) {
      void loadPosts(postQuery);
    }
  }, [step, targetMode, postQuery, loadPosts, eventType, isPostDialogue]);

  const stepIndex = useMemo(() => {
    if (step === "type") return 1;
    if (isPostDialogue) {
      if (step === "format") return 2;
      if (step === "platform") return 3;
      if (step === "when") return 4;
      if (step === "start" || step === "library") return 5;
      return 1;
    }
    if (isCustom) {
      if (step === "target") return 2;
      if (step === "details") return 3;
      return 1;
    }
    if (step === "platform") return 2;
    if (step === "target") return 3;
    return 4;
  }, [step, isCustom, isPostDialogue]);

  const stepTotal = isPostDialogue ? 5 : isCustom ? 3 : 4;

  const canAdvanceTarget = useMemo(() => {
    if (isCustom) {
      if (targetMode === "new_post") return true;
      if (targetMode === "external_url") return Boolean(externalUrl.trim());
      return false;
    }
    if (targetMode === "new_post") {
      return eventType === "make_post" || eventType === "schedule_post";
    }
    if (targetMode === "external_url") {
      return Boolean(externalUrl.trim()) || !needsUrlOrPost(eventType);
    }
    if (targetMode === "existing_post") {
      if (!postId) return false;
      if (missingLink && !externalUrl.trim()) return false;
      return true;
    }
    return false;
  }, [isCustom, targetMode, eventType, externalUrl, postId, missingLink]);

  const canAdvancePlatform = destinations.length > 0;
  const canAdvanceLibrary = Boolean(postId) && !(missingLink && !externalUrl.trim());

  const canSubmitLegacy = useMemo(
    () => Boolean(datetime.trim()) && canAdvanceTarget && !busy,
    [datetime, canAdvanceTarget, busy]
  );

  function advanceToDetails() {
    suppressCreateRef.current = true;
    setStep("details");
    window.setTimeout(() => {
      suppressCreateRef.current = false;
    }, 0);
  }

  function toggleDestination(d: NonNullable<Destination>) {
    setDestinations((prev) => {
      const has = prev.includes(d);
      if (has) {
        const next = prev.filter((x) => x !== d);
        if (next[0]) setDestination(next[0]);
        return next;
      }
      const next = [...prev, d];
      setDestination(next[0]!);
      return next;
    });
  }

  function selectSingleDestination(d: NonNullable<Destination>) {
    setDestination(d);
    setDestinations([d]);
    if (isPostDialogue) {
      setStep("when");
      return;
    }
    setStep("target");
  }

  function commitPostCreate(mode: PostStartMode) {
    if (busy) return;
    if (mode === "later") {
      if (!datetime.trim() || destinations.length === 0) return;
      const iso = isoFromDatetimeLocal(datetime, timeZone);
      void Promise.resolve(
        onAdd({
          event_type: "make_post",
          destination: destinations[0]!,
          destinations,
          due_at: iso,
          title: FORMAT_TITLE[plannedFormat],
          note: "",
          remind_me: true,
          target_mode: "new_post",
          post_id: null,
          external_url: null,
          create_relay_draft: true,
          planned_format: plannedFormat,
        })
      ).catch(() => {
        /* host surfaces error */
      });
      return;
    }
    if (!postId || !datetime.trim()) return;
    const iso = isoFromDatetimeLocal(datetime, timeZone);
    void Promise.resolve(
      onAdd({
        event_type: "make_post",
        destination,
        due_at: iso,
        title: selectedPostTitle?.trim() || FORMAT_TITLE[plannedFormat],
        note: "",
        remind_me: true,
        target_mode: "existing_post",
        post_id: postId,
        external_url: externalUrl.trim() || null,
        create_relay_draft: false,
        planned_format: plannedFormat,
      })
    ).catch(() => {
      /* host surfaces error */
    });
  }

  function commitLegacyCreate() {
    if (suppressCreateRef.current || step !== "details" || !canSubmitLegacy) return;
    const iso = isoFromDatetimeLocal(datetime, timeZone);
    void Promise.resolve(
      onAdd({
        event_type: eventType,
        destination: isCustom ? null : destination,
        due_at: iso,
        title: title.trim() || EVENT_TYPE_LABELS[eventType],
        note: note.trim(),
        remind_me: true,
        target_mode: targetMode,
        post_id: !isCustom && targetMode === "existing_post" ? postId : null,
        external_url:
          targetMode === "external_url" ||
          (targetMode === "existing_post" && externalUrl.trim())
            ? externalUrl.trim() || null
            : null,
        create_relay_draft: false,
      })
    ).catch(() => {
      /* host surfaces error */
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "target" && canAdvanceTarget) {
      advanceToDetails();
    }
  }

  function handleTargetFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (canAdvanceTarget) advanceToDetails();
  }

  function goBack() {
    if (isPostDialogue) {
      if (step === "format") setStep("type");
      else if (step === "platform") setStep("format");
      else if (step === "when") setStep("platform");
      else if (step === "start") setStep("when");
      else if (step === "library") setStep("start");
      return;
    }
    if (step === "platform") setStep("type");
    else if (step === "target") setStep(isCustom ? "type" : "platform");
    else setStep("target");
  }

  if (locked) {
    return (
      <div className={`${SHELL} w-[280px]`}>
        <div className={HEADER}>
          <span className="text-[12.5px] font-medium tracking-[-0.01em] text-[#edf2ef]">
            Create event
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[#1e2a22] bg-[#0a0f0b] text-[#69716d] transition-colors hover:border-[#243426] hover:text-[#c8d0cb]"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-[12px] leading-snug text-[#aaa]">
            Manual social reminders are included with Studio Core. Upgrade to schedule one-off
            posts, comment cues, and reposts from the calendar.
          </p>
          <a
            href={upgradeHref}
            className="rounded-xl bg-[#9bf0c4] px-3 py-2.5 text-center text-[12px] font-medium text-[#050706] transition-all hover:bg-[#b8f5d4] active:scale-[0.98]"
          >
            View plans
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`${SHELL} w-[300px]`}>
      <form onSubmit={handleSubmit}>
        <div className={HEADER}>
          <span className="text-[12.5px] font-medium tracking-[-0.01em] text-[#edf2ef]">
            Create event
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[#1e2a22] bg-[#0a0f0b] text-[#69716d] transition-colors hover:border-[#243426] hover:text-[#c8d0cb]"
            aria-label="Close"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path
                d="M2 2L11 11M11 2L2 11"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-4 py-3.5">
          <p className="text-[10px] font-medium tracking-[0.04em] text-[#3d5a46]" aria-live="polite">
            Step {stepIndex} of {stepTotal}
          </p>

          {step === "type" ? (
            <div className="flex flex-col gap-1.5" role="listbox" aria-label="Event type">
              {CREATE_EVENT_PICKER.map((opt) => {
                const selected =
                  opt.id === "social"
                    ? isSocialDialogue
                    : opt.id === "make_post"
                      ? isPostDialogue
                      : isCustom;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      if (opt.id === "make_post") {
                        setEventType("make_post");
                        setTargetMode("new_post");
                        setStep("format");
                        return;
                      }
                      if (opt.id === "custom") {
                        setEventType("custom");
                        setTargetMode("external_url");
                        setPostId(null);
                        setSelectedPostTitle(null);
                        onClearMissingLink?.();
                        setStep("target");
                        return;
                      }
                      // Social umbrella — shared path; action named on details.
                      setEventType("engage_comments");
                      setTitle("");
                      setTargetMode("external_url");
                      setPostId(null);
                      setSelectedPostTitle(null);
                      onClearMissingLink?.();
                      setStep("platform");
                    }}
                    className={`${OPTION} ${selected ? OPTION_ON : OPTION_OFF}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* —— Post dialogue —— */}
          {isPostDialogue && step === "format" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] leading-snug text-[#c8d0cb]">
                Planning a new post — what type?
              </p>
              <div className="flex flex-col gap-1.5" role="listbox" aria-label="Post format">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={plannedFormat === opt.id}
                    onClick={() => {
                      setPlannedFormat(opt.id);
                      setStep("platform");
                    }}
                    className={`${OPTION} ${plannedFormat === opt.id ? OPTION_ON : OPTION_OFF}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isPostDialogue && step === "platform" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] leading-snug text-[#c8d0cb]">Where should it go?</p>
              <p className="text-[10px] leading-snug text-[#666]">
                Select one or more platforms. You&apos;ll finish titles and media in Autopost when
                ready.
              </p>
              <div className="flex flex-col gap-1.5" role="group" aria-label="Platforms">
                {DESTINATIONS.map((d) => {
                  const selected = destinations.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleDestination(d)}
                      className={`${OPTION} ${
                        selected ? OPTION_ON : OPTION_OFF
                      }`}
                    >
                      {DEST_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {isPostDialogue && step === "when" ? (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] leading-snug text-[#c8d0cb]">
                When do you plan to post?
              </p>
              <div className="flex flex-col gap-1.5" role="group" aria-label="When">
                {SCHEDULE_DATE_PRESETS.map((preset) => {
                  const selected =
                    datePreset === preset.id ||
                    (preset.id === "choose_date" && showDatePicker);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        if (preset.id === "choose_date") {
                          setDatePreset("choose_date");
                          setShowDatePicker(true);
                          return;
                        }
                        const resolved = resolveScheduleDatePreset({
                          preset: preset.id,
                          timeZone,
                          currentDatetimeLocal: datetime,
                        });
                        if (resolved) setDatetime(resolved);
                        setDatePreset(preset.id);
                        setShowDatePicker(false);
                      }}
                      className={`${OPTION} ${
                        selected ? OPTION_ON : OPTION_OFF
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              {datePreset && datePreset !== "choose_date" && datetime ? (
                <div className={SUMMARY}>
                  <p className="text-[11px] text-[#c8d0cb]">
                    {formatResolvedScheduleLabel(datetime, timeZone)}
                  </p>
                  <button
                    type="button"
                    className="mt-1 text-[10px] font-medium text-[#9bf0c4] hover:underline"
                    onClick={() => {
                      setShowDatePicker(true);
                      setDatePreset("choose_date");
                    }}
                  >
                    Change time
                  </button>
                </div>
              ) : null}
              {showDatePicker || datePreset === "choose_date" ? (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-[#3d5a46]">
                    Date & time
                  </label>
                  <input
                    type="datetime-local"
                    value={datetime}
                    onChange={(e) => {
                      setDatetime(e.target.value);
                      setDatePreset("choose_date");
                    }}
                    required
                    className={FIELD}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {isPostDialogue && step === "start" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] leading-snug text-[#c8d0cb]">How do you want to start?</p>
              <button
                type="button"
                onClick={() => {
                  setTargetMode("new_post");
                  setPostId(null);
                  onClearMissingLink?.();
                  commitPostCreate("later");
                }}
                disabled={busy || !datetime.trim() || destinations.length === 0}
                className={CHOICE_CARD}
              >
                <span className="block text-[12px] text-[#edf2ef]">Add media later</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-[#666]">
                  We&apos;ll queue the framework and remind you. Drop media when it&apos;s ready —
                  Autopost opens with your platforms set.
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetMode("existing_post");
                  // Library reminders are single-platform for now.
                  setDestinations([destination]);
                  setStep("library");
                }}
                className={CHOICE_CARD}
              >
                <span className="block text-[12px] text-[#edf2ef]">
                  Use an existing Library post
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-[#666]">
                  Take a post already live on one platform and schedule its cross-post to another.
                  Ex: Patreon → Twitter one month after publish.
                </span>
              </button>
            </div>
          ) : null}

          {isPostDialogue && step === "library" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] leading-snug text-[#c8d0cb]">
                Pick a Library post for {DEST_LABELS[destination]}
              </p>
              <p className="text-[10px] leading-snug text-[#666]">
                Library reminders use one platform today. Multi-platform Autopost from Library comes
                later.
              </p>
              <div className="flex flex-col gap-1.5" role="listbox" aria-label="Platform">
                {DESTINATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="option"
                    aria-selected={destination === d}
                    onClick={() => {
                      setDestination(d);
                      setDestinations([d]);
                      setPostId(null);
                      setSelectedPostTitle(null);
                      onClearMissingLink?.();
                    }}
                    className={`${OPTION} ${destination === d ? OPTION_ON : OPTION_OFF}`}
                  >
                    {DEST_LABELS[d]}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={postQuery}
                onChange={(e) => setPostQuery(e.target.value)}
                placeholder="Search Library…"
                className={FIELD}
              />
              <div
                className={LIST_SHELL}
                role="listbox"
                aria-label="Library posts"
              >
                {postsLoading ? (
                  <p className="px-3 py-2 text-[11px] text-[#666]">Loading…</p>
                ) : posts.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-[#666]">No posts found.</p>
                ) : (
                  posts.map((p) => {
                    const badge = p.destinations.find((d) => d.destination === destination);
                    const hasUrl = badge?.has_url === true;
                    return (
                      <button
                        key={p.post_id}
                        type="button"
                        role="option"
                        aria-selected={postId === p.post_id}
                        onClick={() => {
                          setPostId(p.post_id);
                          setSelectedPostTitle(p.title);
                          onClearMissingLink?.();
                        }}
                        className={`flex w-full flex-col gap-0.5 border-b border-[#172018] px-3 py-2 text-left last:border-0 ${
                          postId === p.post_id ? "bg-[#9bf0c414]" : "hover:bg-[#0e1410]"
                        }`}
                      >
                        <span className="truncate text-[12px] text-[#e8e8e8]">{p.title}</span>
                        <span className="text-[10px] text-[#666]">
                          {DEST_LABELS[destination]}: {hasUrl ? "linked" : "needs URL"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {selectedPostTitle ? (
                <p className="text-[10px] text-[#888]">Selected: {selectedPostTitle}</p>
              ) : null}
              {(missingLink ||
                (postId &&
                  posts
                    .find((p) => p.post_id === postId)
                    ?.destinations.find((d) => d.destination === destination)?.has_url ===
                    false)) && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-[#3d5a46]">
                    Link the {DEST_LABELS[destination]} version
                  </label>
                  <p className="text-[10px] leading-snug text-[#888]">
                    {missingLink?.message ??
                      `This Library post has no ${DEST_LABELS[destination]} URL yet. Paste the published link to save it for reuse.`}
                  </p>
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://…"
                    className={FIELD}
                  />
                </div>
              )}
            </div>
          ) : null}

          {/* —— Legacy non-Post flows —— */}
          {!isPostDialogue && step === "platform" && !isCustom ? (
            <div className="flex flex-col gap-2">
              {isSocialDialogue ? (
                <p className="text-[12px] leading-snug text-[#c8d0cb]">
                  Which platform is the post on?
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5" role="listbox" aria-label="Platform">
                {DESTINATIONS.map((d) => {
                  const selected = destination === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => selectSingleDestination(d)}
                      className={`${OPTION} ${
                        selected ? OPTION_ON : OPTION_OFF
                      }`}
                    >
                      {DEST_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isPostDialogue && step === "target" ? (
            <div className="flex flex-col gap-3">
              {isCustom ? (
                <p className="text-[10px] leading-snug text-[#888]">
                  Link any http(s) URL — email, personal site, Slack, Discord, and more. App-specific
                  integrations come later; for now this is a simple open-link reminder.
                </p>
              ) : null}
              {isSocialDialogue ? (
                <p className="text-[12px] leading-snug text-[#c8d0cb]">
                  Point at the published post you want to go back to.
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5" role="group" aria-label="Target">
                {isCustom && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#1e2a22] bg-[#0a0f0b] px-3 py-2.5 text-[12px] text-[#e8e8e8] transition-colors has-[:checked]:border-[#9bf0c4]/45 has-[:checked]:bg-[#9bf0c414]">
                    <input
                      type="radio"
                      name="target"
                      checked={targetMode === "new_post"}
                      onChange={() => {
                        setTargetMode("new_post");
                        onClearMissingLink?.();
                      }}
                      className="accent-[#9bf0c4]"
                    />
                    Open Relay (no URL)
                  </label>
                )}
                {!isCustom ? (
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#1e2a22] bg-[#0a0f0b] px-3 py-2.5 text-[12px] text-[#e8e8e8] transition-colors has-[:checked]:border-[#9bf0c4]/45 has-[:checked]:bg-[#9bf0c414]">
                    <input
                      type="radio"
                      name="target"
                      checked={targetMode === "existing_post"}
                      onChange={() => setTargetMode("existing_post")}
                      className="accent-[#9bf0c4]"
                    />
                    Library post
                  </label>
                ) : null}
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#1e2a22] bg-[#0a0f0b] px-3 py-2.5 text-[12px] text-[#e8e8e8] transition-colors has-[:checked]:border-[#9bf0c4]/45 has-[:checked]:bg-[#9bf0c414]">
                  <input
                    type="radio"
                    name="target"
                    checked={targetMode === "external_url"}
                    onChange={() => {
                      setTargetMode("external_url");
                      onClearMissingLink?.();
                    }}
                    className="accent-[#9bf0c4]"
                  />
                  Pasted URL
                </label>
              </div>

              {!isCustom && targetMode === "existing_post" ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="search"
                    value={postQuery}
                    onChange={(e) => setPostQuery(e.target.value)}
                    placeholder="Search Library…"
                    className={FIELD}
                  />
                  <div
                    className={LIST_SHELL}
                    role="listbox"
                    aria-label="Library posts"
                  >
                    {postsLoading ? (
                      <p className="px-3 py-2 text-[11px] text-[#666]">Loading…</p>
                    ) : posts.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-[#666]">No posts found.</p>
                    ) : (
                      posts.map((p) => {
                        const badge = p.destinations.find((d) => d.destination === destination);
                        const hasUrl = badge?.has_url === true;
                        return (
                          <button
                            key={p.post_id}
                            type="button"
                            role="option"
                            aria-selected={postId === p.post_id}
                            onClick={() => {
                              setPostId(p.post_id);
                              setSelectedPostTitle(p.title);
                              onClearMissingLink?.();
                            }}
                            className={`flex w-full flex-col gap-0.5 border-b border-[#172018] px-3 py-2 text-left last:border-0 ${
                              postId === p.post_id ? "bg-[#9bf0c414]" : "hover:bg-[#0e1410]"
                            }`}
                          >
                            <span className="truncate text-[12px] text-[#e8e8e8]">{p.title}</span>
                            <span className="text-[10px] text-[#666]">
                              {DEST_LABELS[destination]}: {hasUrl ? "linked" : "needs URL"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  {selectedPostTitle ? (
                    <p className="text-[10px] text-[#888]">Selected: {selectedPostTitle}</p>
                  ) : null}
                  {(missingLink ||
                    (postId &&
                      needsUrlOrPost(eventType) &&
                      posts
                        .find((p) => p.post_id === postId)
                        ?.destinations.find((d) => d.destination === destination)?.has_url ===
                        false)) && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium text-[#3d5a46]">
                        Link the {DEST_LABELS[destination]} version
                      </label>
                      <p className="text-[10px] leading-snug text-[#888]">
                        {missingLink?.message ??
                          `This Library post has no ${DEST_LABELS[destination]} URL yet. Paste the published link to save it for reuse.`}
                      </p>
                      <input
                        type="url"
                        value={externalUrl}
                        onChange={(e) => setExternalUrl(e.target.value)}
                        onKeyDown={handleTargetFieldKeyDown}
                        placeholder="https://…"
                        className={FIELD}
                      />
                    </div>
                  )}
                </div>
              ) : null}

              {targetMode === "external_url" ? (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-[#3d5a46]">
                    {isCustom
                      ? "URL"
                      : `${DEST_LABELS[destination]} URL${!needsUrlOrPost(eventType) ? " (optional)" : ""}`}
                  </label>
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    onKeyDown={handleTargetFieldKeyDown}
                    required={isCustom || needsUrlOrPost(eventType)}
                    placeholder="https://…"
                    className={FIELD}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {!isPostDialogue && step === "details" ? (
            <>
              {isSocialDialogue ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-medium text-[#3d5a46]">
                    Action
                  </label>
                  <div className="flex flex-col gap-1.5" role="listbox" aria-label="Social action">
                    {SOCIAL_ACTION_TYPES.map((action) => {
                      const selected = eventType === action;
                      return (
                        <button
                          key={action}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => selectSocialAction(action)}
                          className={`${OPTION} ${selected ? OPTION_ON : OPTION_OFF}`}
                        >
                          {SOCIAL_ACTION_CHIP_LABELS[action]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-[#3d5a46]">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={EVENT_TYPE_LABELS[eventType]}
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-[#3d5a46]">
                  Date & time
                </label>
                <input
                  type="datetime-local"
                  value={datetime}
                  onChange={(e) => setDatetime(e.target.value)}
                  required
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-[#3d5a46]">
                  Note (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Short note…"
                  rows={2}
                  className={`resize-none ${FIELD}`}
                />
              </div>
            </>
          ) : null}

          {error ? <p className="text-[10px] leading-snug text-red-400/90">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-[#172018] px-4 pb-4 pt-3">
          {step !== "type" ? (
            <button
              type="button"
              onClick={goBack}
              disabled={busy}
              className={SECONDARY}
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={SECONDARY}
            >
              Cancel
            </button>
          )}

          {isPostDialogue ? (
            step === "library" ? (
              <button
                type="button"
                disabled={!canAdvanceLibrary || busy}
                onClick={() => commitPostCreate("library")}
                className={PRIMARY}
              >
                {busy ? "Saving…" : "Create"}
              </button>
            ) : step === "start" ? (
              <button
                type="button"
                disabled
                className={`${PRIMARY} opacity-40`}
              >
                Choose above
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  (step === "platform" && !canAdvancePlatform) ||
                  (step === "when" && (!datetime.trim() || !datePreset))
                }
                onClick={() => {
                  if (step === "format") setStep("platform");
                  else if (step === "platform") {
                    setDestination(destinations[0]!);
                    setStep("when");
                  } else if (step === "when") setStep("start");
                }}
                className={PRIMARY}
              >
                Next
              </button>
            )
          ) : step !== "details" ? (
            <button
              type="button"
              disabled={
                (step === "target" && !canAdvanceTarget) ||
                (step === "platform" && !canAdvancePlatform)
              }
              onClick={() => {
                if (step === "type") {
                  if (isCustom) setStep("target");
                  else setStep("platform");
                  return;
                }
                if (step === "platform") {
                  setDestination(destinations[0]!);
                  setStep("target");
                  return;
                }
                setStep("details");
              }}
              className={PRIMARY}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSubmitLegacy}
              onClick={() => commitLegacyCreate()}
              className={PRIMARY}
            >
              {busy ? "Saving…" : "Create"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** @deprecated Use CreateEventPayload */
export type AddScheduledPostPayload = CreateEventPayload & {
  scheduled_for: string;
  destinations: NonNullable<Destination>[];
  destination: Destination;
  notify: boolean;
};

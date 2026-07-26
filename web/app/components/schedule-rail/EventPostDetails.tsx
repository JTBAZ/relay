"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPostTemplate,
  fetchPatreonSyncState,
  fetchPostTemplates,
  type PostTemplateWire,
} from "@/lib/relay-api";
import { renderPostTemplateBody } from "@/lib/post-template-client";
import { buildPatreonHomepageUrl } from "@/lib/previewizer-destination-qr";
import { updateScheduleRailPostDetails } from "@/lib/schedule-rail-api";
import type { ReadyItem, ScheduleEvent } from "@/lib/schedule-rail-data";

type EventItem = ScheduleEvent | ReadyItem;

type LineChip = {
  id: string;
  label: string;
  body: string;
  kind: "default" | "saved";
};

export type EventPostDetailsProps = {
  event: EventItem;
  /** Owner creator id — loads Patreon vanity for CTA chips. */
  creatorId?: string;
  /** Rail id used for attach / post-details (task, occurrence, or group primary). */
  railEventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: {
    title: string;
    description: string | null;
    tags: string[];
    post_details_state: "authored";
  }) => void;
};

function insertAtCursor(
  value: string,
  insert: string,
  start: number,
  end: number
): { next: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
  const chunk = `${needsSpaceBefore ? " " : ""}${insert}${needsSpaceAfter ? " " : ""}`;
  const next = `${before}${chunk}${after}`;
  return { next, caret: before.length + chunk.length };
}

function patreonCtaBody(patreonUrl: string | null): string {
  if (patreonUrl) {
    return `Full post and early access on Patreon: ${patreonUrl}`;
  }
  return "Full post and early access on Patreon.";
}

const COMMS_OPEN_BODY =
  "Commissions are open. Message me if you want to talk about a piece.";

const chipClass =
  "rounded-lg border border-[#2a2a2a] bg-[#121212] px-2 py-0.5 text-[10px] font-medium text-[#ccc] transition-colors hover:border-[#3a3a3a] hover:text-[#edf2ef] active:scale-[0.98]";

export function EventPostDetails({
  event,
  creatorId,
  railEventId,
  open,
  onOpenChange,
  onSaved,
}: EventPostDetailsProps) {
  const detailsReady = event.post_details_state === "authored";

  const [title, setTitle] = useState(event.title ?? "");
  const [description, setDescription] = useState(event.post_description ?? "");
  const [tags, setTags] = useState<string[]>(event.post_tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [savedLines, setSavedLines] = useState<PostTemplateWire[]>([]);
  const [patreonUrl, setPatreonUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [customBusy, setCustomBusy] = useState(false);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  useEffect(() => {
    if (!open) return;
    setTitle(event.title ?? "");
    setDescription(event.post_description ?? "");
    setTags(event.post_tags ?? []);
    setSaveError(null);
    setCustomOpen(false);
    setCustomName("");
    setCustomBody("");
  }, [open, event.id, event.title, event.post_description, event.post_tags]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const { templates } = await fetchPostTemplates();
        if (!cancelled) setSavedLines(templates);
      } catch {
        /* chips still work with defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const cid = creatorId?.trim();
    if (!open || !cid) return;
    let cancelled = false;
    void (async () => {
      try {
        const sync = await fetchPatreonSyncState(cid);
        const vanity = sync.campaign_display?.patreon_name?.trim();
        if (!cancelled) {
          setPatreonUrl(vanity ? buildPatreonHomepageUrl(vanity) : null);
        }
      } catch {
        if (!cancelled) setPatreonUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, creatorId]);

  const rememberSelection = useCallback(() => {
    const el = descriptionRef.current;
    if (!el) return;
    selectionRef.current = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  }, []);

  const addTag = useCallback((raw: string) => {
    const label = raw.trim().replace(/^#/, "");
    if (!label) return;
    setTags((prev) =>
      prev.some((t) => t.toLowerCase() === label.toLowerCase()) ? prev : [...prev, label].slice(0, 20)
    );
    setTagDraft("");
  }, []);

  const insertText = useCallback(
    (raw: string) => {
      const resolved = renderPostTemplateBody(raw, { title, tags });
      const { start, end } = selectionRef.current;
      const { next, caret } = insertAtCursor(description, resolved, start, end);
      setDescription(next);
      requestAnimationFrame(() => {
        const el = descriptionRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
        selectionRef.current = { start: caret, end: caret };
      });
    },
    [description, tags, title]
  );

  const defaultChips: LineChip[] = [
    {
      id: "default-patreon-cta",
      label: "Patreon CTA",
      body: patreonCtaBody(patreonUrl),
      kind: "default",
    },
    {
      id: "default-comms-open",
      label: "Comms Open",
      body: COMMS_OPEN_BODY,
      kind: "default",
    },
  ];

  const savedChips: LineChip[] = savedLines.map((line) => ({
    id: line.template_id,
    label: line.name,
    body: line.body,
    kind: "saved" as const,
  }));

  const saveCustomLine = useCallback(async () => {
    const name = customName.trim();
    const body = customBody.trim();
    if (!name) {
      setSaveError("Give this line a short title.");
      return;
    }
    if (!body) {
      setSaveError("Write the line text.");
      return;
    }
    setCustomBusy(true);
    setSaveError(null);
    try {
      const { template } = await createPostTemplate({ name, body, tags });
      setSavedLines((prev) => [template, ...prev]);
      insertText(body);
      setCustomOpen(false);
      setCustomName("");
      setCustomBody("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save line.");
    } finally {
      setCustomBusy(false);
    }
  }, [customBody, customName, insertText, tags]);

  const commitDetails = useCallback(async () => {
    setBusy(true);
    setSaveError(null);
    try {
      const result = await updateScheduleRailPostDetails(railEventId, {
        title: title.trim() || null,
        description: description.trim() || null,
        tags,
      });
      onSaved({
        title: result.title,
        description: result.description,
        tags: result.tags,
        post_details_state: result.post_details_state,
      });
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save post details.");
    } finally {
      setBusy(false);
    }
  }, [description, onOpenChange, onSaved, railEventId, tags, title]);

  if (!open) {
    return (
      <div className="px-4 pb-3" data-testid="event-post-details-cta">
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="w-full rounded-xl border border-[#2a3a32] bg-[#121a16] px-3 py-2 text-left text-[12px] font-medium text-[#9bf0c4] transition-colors hover:bg-[#18241e] active:scale-[0.99]"
        >
          {detailsReady ? "Post details ready" : "Add post details"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-3 px-4 pb-3" data-testid="event-post-details-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-[#e8e8e8]">Post details</p>
        <button
          type="button"
          className="text-[11px] text-[#666] hover:text-[#aaa]"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-[#aaa]">Title</span>
        <span className="text-[10px] leading-snug text-[#666]">
          Shown where a platform supports a title.
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="w-full rounded-xl border border-[#2a2a2a] bg-[#0a0c0b] px-2.5 py-2 text-[12px] text-[#edf2ef] outline-none focus:border-[#9bf0c466] focus:ring-1 focus:ring-[#9bf0c433]"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-[#aaa]">Description</span>
          <span className="text-[10px] leading-snug text-[#666]">
            The main text people will read.
          </span>
          <textarea
            ref={descriptionRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onSelect={rememberSelection}
            onKeyUp={rememberSelection}
            onClick={rememberSelection}
            rows={4}
            className="w-full resize-none rounded-xl border border-[#2a2a2a] bg-[#0a0c0b] px-2.5 py-2 text-[12px] leading-relaxed text-[#edf2ef] outline-none focus:border-[#9bf0c466] focus:ring-1 focus:ring-[#9bf0c433]"
          />
        </label>

        <div
          className="flex flex-wrap gap-1"
          data-testid="saved-line-chips"
          aria-label="Insert a saved line"
        >
          {defaultChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={chipClass}
              onClick={() => {
                rememberSelection();
                insertText(chip.body);
              }}
            >
              {chip.label}
            </button>
          ))}
          {savedChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={chipClass}
              onClick={() => {
                rememberSelection();
                insertText(chip.body);
              }}
            >
              {chip.label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg border border-dashed border-[#3a3a3a] bg-transparent px-2 py-0.5 text-[10px] font-medium text-[#888] transition-colors hover:border-[#9bf0c466] hover:text-[#9bf0c4] active:scale-[0.98]"
            onClick={() => {
              rememberSelection();
              setCustomOpen(true);
              setSaveError(null);
            }}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-[#aaa]">Tags</span>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
              className="rounded-lg border border-[#2a3a32] bg-[#121a16] px-1.5 py-0.5 text-[10px] text-[#9bf0c4]"
              aria-label={`Remove tag ${tag}`}
            >
              {tag}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagDraft);
            }
          }}
          onBlur={() => addTag(tagDraft)}
          placeholder="Add a tag"
          className="w-full rounded-xl border border-[#2a2a2a] bg-[#0a0c0b] px-2.5 py-2 text-[12px] text-[#edf2ef] outline-none placeholder:text-[#555] focus:border-[#9bf0c466] focus:ring-1 focus:ring-[#9bf0c433]"
        />
      </div>

      {saveError && !customOpen ? (
        <p className="text-[10px] leading-snug text-red-400/90" role="alert">
          {saveError}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void commitDetails()}
        className="w-full rounded-xl bg-[#9bf0c4] px-3 py-2 text-[12.5px] font-medium text-[#0a100c] transition-transform hover:bg-[#b8f5d4] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save post details"}
      </button>

      {customOpen ? (
        <div
          className="absolute inset-x-3 top-10 z-10 rounded-xl border border-[#2a3a32] bg-[#0e100f] p-3 shadow-xl shadow-black/50 ring-1 ring-white/5"
          role="dialog"
          aria-modal="true"
          aria-label="Custom saved line"
          data-testid="custom-saved-line-modal"
        >
          <p className="text-[12px] font-medium text-[#e8e8e8]">Custom line</p>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[#888]">Title</span>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={80}
                autoFocus
                placeholder="e.g. Shop link"
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#0a0c0b] px-2 py-1.5 text-[11px] text-[#edf2ef] outline-none placeholder:text-[#555] focus:border-[#9bf0c466]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[#888]">Text</span>
              <textarea
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                rows={3}
                placeholder="What to insert"
                className="w-full resize-none rounded-lg border border-[#2a2a2a] bg-[#0a0c0b] px-2 py-1.5 text-[11px] leading-relaxed text-[#edf2ef] outline-none placeholder:text-[#555] focus:border-[#9bf0c466]"
              />
            </label>
            {saveError ? (
              <p className="text-[10px] leading-snug text-red-400/90" role="alert">
                {saveError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-0.5">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[11px] text-[#888] hover:text-[#ccc]"
                onClick={() => {
                  setCustomOpen(false);
                  setSaveError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={customBusy}
                className="rounded-lg bg-[#9bf0c4] px-2.5 py-1 text-[11px] font-medium text-[#0a100c] disabled:opacity-50"
                onClick={() => void saveCustomLine()}
              >
                {customBusy ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

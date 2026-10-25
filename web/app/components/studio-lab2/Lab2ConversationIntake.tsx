"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { Link2, MessageSquare, X } from "lucide-react";
import LibraryEditorPanel from "@/app/components/studio/LibraryEditorPanel";
import { LabStagingDock, type StagingIntakeHandle } from "@/app/components/studio/LabStagingDock";
import type { ImportBinItem } from "@/app/components/LibraryImportBay";
import {
  createAutopostDraft, fetchAutopostDraft, patchAutopostDraft, fetchCreatorStyleProfile, putCreatorStyleProfile,
  type AutopostDraftWire
} from "@/lib/relay-api";
import { RELAY_LIBRARY_STAGING_REFRESH } from "@/lib/library-staging-events";
import type { Lab2EditorSelection } from "./Lab2ActivePostsLive";
import { createScheduledPost } from "@/lib/schedule-rail-api";
import type { ScheduleEvent } from "@/lib/schedule-rail-data";

type Props = {
  creatorId: string;
  selection: Lab2EditorSelection;
  onChanged: () => void;
  onCorridorDragChange: (dragging: boolean) => void;
  onAutopost: (items: ImportBinItem[]) => void;
  onScheduled?: (event: ScheduleEvent) => void;
};
const control = "rounded-md border border-[var(--lib-border)] px-2.5 py-2 text-xs hover:bg-[var(--lib-muted)] focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)] disabled:opacity-40";
const field = "w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-xs text-[var(--lib-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]";
type Turn = { role: "user" | "assistant"; text: string };
type LocalCopy = { title: string; body: string; updatedAt: string };
type Saved = { draftId?: string; links: string[]; turns: Turn[]; edits?: LocalCopy; recovery?: LocalCopy };

function readSaved(creatorId: string): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(`relay.lab2.intake:${creatorId}`) ?? "null") as Saved | null;
    if (saved && Array.isArray(saved.links) && Array.isArray(saved.turns)) {
      const copy = (value: LocalCopy | undefined) => value && typeof value.title === "string" && typeof value.body === "string" && typeof value.updatedAt === "string" ? value : undefined;
      return { draftId: typeof saved.draftId === "string" ? saved.draftId : undefined, links: saved.links.filter((link) => typeof link === "string" && /^https?:\/\//.test(link)).slice(0, 12), turns: saved.turns.filter((turn) => turn && ["user", "assistant"].includes(turn.role) && typeof turn.text === "string").slice(-30), edits: copy(saved.edits), recovery: copy(saved.recovery) };
    }
  } catch { /* Optional browser storage. */ }
  return { links: [], turns: [] };
}
function referenceLinks(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/[^\s<>"']+/g) ?? []).map((value) => value.replace(/[),.;!?]+$/, "")))];
}

/** One composer uses staging for new drafts and the Library cart for existing posts. */
export default function Lab2ConversationIntake({ creatorId, selection, onChanged, onCorridorDragChange, onAutopost, onScheduled }: Props) {
  const scheduleDialog = useRef<HTMLDialogElement>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [destinations, setDestinations] = useState<Array<"patreon" | "x" | "deviantart" | "bluesky">>([]);
  const styleDialog = useRef<HTMLDialogElement>(null);
  const styleWait = useRef<{ resolve: () => void; reject: (reason: Error) => void } | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleBusy, setStyleBusy] = useState(false);
  const [styleError, setStyleError] = useState("");
  const [tone, setTone] = useState<"friendly" | "professional" | "warm" | "playful" | "formal">("friendly");
  useEffect(() => { if (styleOpen) styleDialog.current?.showModal(); }, [styleOpen]);
  useEffect(() => { if (scheduleOpen) scheduleDialog.current?.showModal(); }, [scheduleOpen]);
  const [links, setLinks] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [attachments, setAttachments] = useState<ImportBinItem[]>([]);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeFailed, setIntakeFailed] = useState(false);
  const [draft, setDraft] = useState<AutopostDraftWire | null>(null);
  const [recovery, setRecovery] = useState<LocalCopy | undefined>();
  const [scheduledReview, setScheduledReview] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const intake = useRef<StagingIntakeHandle>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const persistedDraftId = useRef<string | undefined>();
  const hydrated = useRef(false);
  const hasBothTargets = selection.context.selectedPostIds.length > 0 && (attachments.length > 0 || Boolean(draft));

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const saved = readSaved(creatorId);
    setLinks(saved.links); setTurns(saved.turns); setRecovery(saved.recovery);
    persistedDraftId.current = saved.draftId;
    hydrated.current = true;
    if (saved.draftId) void fetchAutopostDraft(saved.draftId).then(({ draft: next }) => {
      if (!active) return;
      if (next.creator_id !== creatorId) throw new Error("This draft belongs to another studio.");
      if (next.linked_post_id) {
        if (saved.edits) setRecovery(saved.edits);
        setScheduledReview(`/studio/distribution?draft_id=${encodeURIComponent(next.draft_id)}`);
        persistedDraftId.current = undefined;
        setStatus("This draft is scheduled. Open its review to make further changes.");
        return;
      }
      if (next.published_post_id || !["nudged", "drafting", "previewing"].includes(next.status)) {
        if (saved.edits) setRecovery(saved.edits);
        persistedDraftId.current = undefined;
        setStatus("The saved draft is no longer editable. Select material to start another.");
        return;
      }
      setDraft(next);
      const edits = saved.edits?.updatedAt === next.updated_at ? saved.edits : undefined;
      if (saved.edits && !edits) setRecovery(saved.edits);
      setTitle(edits?.title ?? next.title ?? ""); setBody(edits?.body ?? next.body_text ?? "");
    }).catch((cause: unknown) => { if (active) { setRestoreFailed(true); setError(`${cause instanceof Error ? cause.message : "Could not restore the draft."} Reload to retry before continuing.`); } })
      .finally(() => { if (active) setRestoring(false); });
    else setRestoring(false);
    return () => { active = false; mounted.current = false; };
  }, [creatorId]);
  useEffect(() => {
    if (!hydrated.current || restoring || restoreFailed) return;
    try { localStorage.setItem(`relay.lab2.intake:${creatorId}`, JSON.stringify({ draftId: persistedDraftId.current, links, turns: turns.slice(-30), ...(draft && (title !== (draft.title ?? "") || body !== (draft.body_text ?? "")) ? { edits: { title, body, updatedAt: draft.updated_at } } : {}), recovery })); }
    catch { /* Drafts remain on the server if browser storage is unavailable. */ }
  }, [creatorId, links, turns, draft, title, body, restoring, restoreFailed, recovery]);

  function acceptDraft(next: AutopostDraftWire) {
    if (!mounted.current || next.creator_id !== creatorId) return;
    persistedDraftId.current = next.draft_id;
    setDraft(next); setTitle(next.title ?? ""); setBody(next.body_text ?? "");
  }
  function addLinks(text: string) {
    const found = referenceLinks(text);
    if (!found.length) { setError("Use a full http or https link."); return; }
    setLinks((previous) => [...new Set([...previous, ...found])].slice(0, 12));
    setLinkInput(""); setLinkOpen(false); setError(null);
  }
  function drop(event: DragEvent) {
    const files = Array.from(event.dataTransfer.files);
    const url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    if (!files.length && !referenceLinks(url).length) return;
    event.preventDefault(); event.stopPropagation(); setDragging(false);
    if (files.length) void intake.current?.uploadFiles(files);
    else addLinks(url);
  }
  function withReferenceContext(message: string, saveLinks = true) {
    const messageLinks = referenceLinks(message);
    const references = [...new Set([...links, ...messageLinks])];
    if (saveLinks && messageLinks.length) setLinks(references.slice(0, 12));
    const referenceContext = references.length ? `\n\nReference links (URL text only; Relay has not fetched their contents):\n${references.join("\n")}` : "";
    return { message: message + referenceContext, referenceContext };
  }
  async function prepareAttachedDraft(message: string, referenceContext: string, frozenAttachments: ImportBinItem[], frozenDraft: AutopostDraftWire | null) {
    if (intakeBusy || restoring) throw new Error("Wait for attached material to finish loading, then send your request again.");
    if (!frozenAttachments.length && !frozenDraft) throw new Error("Attach files or open a draft before preparing a draft.");
    if (selection.writeBlocked) throw new Error("Resolve the studio sync issue before preparing a draft.");
    if (pending.current) return null;
    if (!frozenDraft) {
      const { profile } = await fetchCreatorStyleProfile();
      if (!profile || profile.tone_preset === "none") {
        setStyleOpen(true);
        await new Promise<void>((resolve, reject) => { styleWait.current = { resolve, reject }; });
      }
    }
    pending.current = true; setDraftBusy(true); setError(null); setStatus("Preparing draft…");
    const prior = frozenDraft?.intent ? `${frozenDraft.intent}\n\nCorrection: ` : "";
    const intent = prior + message + referenceContext;
    try {
    const result = frozenDraft
        ? await patchAutopostDraft(frozenDraft.draft_id, { intent, regenerate: true, title, body_text: body, ...(frozenAttachments.length ? { media_ids: [...new Set([...frozenDraft.media_ids, ...frozenAttachments.map((item) => item.id)])] } : {}) })
        : await createAutopostDraft({ media_ids: [...new Set(frozenAttachments.map((item) => item.id))], generate: true, intent, status: "drafting", composer_step: "draft-post" });
      if (!mounted.current) return null;
      acceptDraft(result.draft);
      setTurns((previous) => [...previous, { role: "user", text: message }, { role: "assistant", text: "Prepared a draft from your attached material. Review the copy below or describe a correction." }]);
      setStatus("Draft saved. Nothing has been published.");
      window.dispatchEvent(new Event(RELAY_LIBRARY_STAGING_REFRESH));
      return true;
    } catch (cause) { if (mounted.current) setStatus(""); throw cause; }
    finally { pending.current = false; if (mounted.current) setDraftBusy(false); }
  }
  async function prepareMessage(message: string) {
    const frozenContext = structuredClone(selection.context);
    const libraryRequest = frozenContext.selectedPostIds.length > 0 || (!attachments.length && !draft && Boolean(frozenContext.loadedPostIds?.length));
    const { message: preparedMessage, referenceContext } = withReferenceContext(message, !libraryRequest);
    if (libraryRequest) return { message: preparedMessage, context: frozenContext };
    if (intakeBusy || restoring) throw new Error("Wait for attached material to finish loading, then send your request again.");
    const prepared = await prepareAttachedDraft(message, referenceContext, [...attachments], draft);
    return prepared ? { handled: true as const } : null;
  }
  async function prepareDraftMessage(message: string): Promise<boolean> {
    const { referenceContext } = withReferenceContext(message);
    return Boolean(await prepareAttachedDraft(message, referenceContext, [...attachments], draft));
  }
  async function saveCopy() {
    if (!draft || pending.current) return;
    pending.current = true; setDraftBusy(true); setError(null); setStatus("Saving draft…");
    try {
      const { draft: next } = await patchAutopostDraft(draft.draft_id, { title, body_text: body });
      if (!mounted.current) return;
      acceptDraft(next); setStatus("Draft saved. Nothing has been published.");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not save the draft. Try again."); }
    finally { pending.current = false; if (mounted.current) setDraftBusy(false); }
  }
  const draftDirty = Boolean(draft && (title !== (draft.title ?? "") || body !== (draft.body_text ?? "")));
  async function scheduleDraft() {
    if (!draft || pending.current || draftDirty) return;
    if (!destinations.length || !scheduleTime || new Date(scheduleTime).getTime() <= Date.now()) { setError("Choose at least one platform and a future date and time."); return; }
    pending.current = true; setDraftBusy(true); setError(null);
    try {
      const event = await createScheduledPost({ draft_id: draft.draft_id, scheduled_for: new Date(scheduleTime).toISOString(), destinations, notify: false });
       setScheduleOpen(false); setDraft(null); persistedDraftId.current = undefined; setTurns([]); setLinks([]);
      setScheduledReview(`/studio/distribution?draft_id=${encodeURIComponent(draft.draft_id)}`);
      setStatus("Draft added to the schedule. Publishing still needs your review."); onScheduled?.(event); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scheduling failed. Try again."); }
    finally { pending.current = false; setDraftBusy(false); }
  }
  const material = (
    <div className="studio-material">
      <LabStagingDock creatorId={creatorId} variant="conversation" intakeRef={intake} onError={setError} onSelectionChange={setAttachments} onBusyChange={setIntakeBusy} onUploadFailureChange={setIntakeFailed} onCorridorDragChange={onCorridorDragChange} onAutopost={onAutopost} onAddToNewPost={onAutopost} />
      <button type="button" className="studio-link-toggle" aria-expanded={linkOpen} onClick={() => setLinkOpen((value) => !value)}><Link2 size={14} aria-hidden />Add link</button>
      {linkOpen ? <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); addLinks(linkInput); }}>
        <label className="sr-only" htmlFor="lab2-reference-link">Reference link</label>
        <input id="lab2-reference-link" type="url" name="reference" autoComplete="off" className={`${field} min-w-0 flex-1`} placeholder="Paste a reference link…" value={linkInput} onChange={(event) => setLinkInput(event.target.value)} />
        <button type="submit" className={control}><Link2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />Attach link</button>
      </form> : null}
      {links.length ? <ul className="mt-2 space-y-1">{links.map((url) => <li key={url} className="flex min-w-0 items-center gap-2 text-xs"><a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-all text-[var(--lib-primary)] underline underline-offset-2">{url}</a><button type="button" aria-label={`Remove reference ${url}`} className={control} onClick={() => setLinks((previous) => previous.filter((item) => item !== url))}><X className="h-3 w-3" aria-hidden /></button></li>)}</ul> : null}
      {links.length ? <p className="studio-reference-note">Links are references only. Their contents are not imported.</p> : null}
      <p role="status" className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">{restoring ? "Restoring draft…" : intakeBusy ? "Processing material…" : draft ? `Editing attached draft · ${draft.media_ids.length} files` : attachments.length ? `${attachments.length} files attached · Your request will prepare a draft, without publishing.` : selection.context.selectedPostIds.length ? `${selection.context.selectedPostIds.length} Library posts selected` : ""}</p>
      {hasBothTargets ? <p className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">Send request uses the selected Library posts. Use “Prepare attached draft” to update this draft.</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
  const conversation = <>
    {!draft && !turns.length ? <div className="studio-editor-welcome"><MessageSquare size={28} aria-hidden /><h2>What are you working on?</h2><p>Attach artwork, or choose posts from your gallery. Tell Relay what to do.</p></div> : null}

      {turns.length ? <ol aria-label="Draft conversation" className="mt-3 space-y-2">{turns.slice(-6).map((turn, index) => <li key={index} className="whitespace-pre-wrap break-words text-xs"><span className="font-medium">{turn.role === "user" ? "You: " : "Relay: "}</span>{turn.text}</li>)}</ol> : null}
      {recovery ? <div className="my-3 rounded-md border border-[var(--lib-warning)] p-3 text-xs"><p>The saved draft changed elsewhere. Your unsaved copy is still available.</p><button type="button" className={`${control} mt-2`} onClick={() => { setTitle(recovery.title); setBody(recovery.body); setRecovery(undefined); }}>Restore my unsaved copy</button><button type="button" className={`${control} mt-2 ml-2`} onClick={() => setRecovery(undefined)}>Keep saved copy</button></div> : null}
      {draft ? <section aria-label="Attached draft" className="mt-3 space-y-2">
        <h3 className="text-sm font-semibold">Review your draft</h3><p className="text-xs text-[var(--lib-fg-muted)]">{draft.media_ids.length} attached files · Saved privately</p>
        
        <label htmlFor="lab2-draft-title" className="block text-xs">Draft title</label><input id="lab2-draft-title" name="title" autoComplete="off" className={field} maxLength={2000} value={title} disabled={draftBusy} onChange={(event) => setTitle(event.target.value)} />
        <label htmlFor="lab2-draft-body" className="block text-xs">Draft description</label><textarea id="lab2-draft-body" name="description" autoComplete="off" className={field} rows={3} value={body} disabled={draftBusy} onChange={(event) => setBody(event.target.value)} />
        <div className="flex flex-wrap items-center gap-2"><button type="button" className={control} disabled={draftBusy || selection.writeBlocked || !draftDirty} onClick={() => void saveCopy()}>Save draft changes</button>
          <button type="button" className={control} disabled={draftDirty || draftBusy || selection.writeBlocked} onClick={() => setScheduleOpen(true)}>Choose platforms & schedule</button>
          <Link className={control} href={`/studio/autopost?draft_id=${encodeURIComponent(draft.draft_id)}`} onClick={(event) => { if (draftDirty || draftBusy) { event.preventDefault(); setError("Save your draft changes before opening publishing review."); } }}>Open draft</Link>
          <button type="button" className={control} disabled={draftBusy || draftDirty} onClick={() => { setDraft(null); persistedDraftId.current = undefined; setTurns([]); setLinks([]); setTitle(""); setBody(""); setStatus("Draft kept in Autopost. Select material or Library posts to continue."); }}>Leave draft</button></div>
      </section> : null}
      {status ? <p role="status" className="mt-2 text-xs text-[var(--lib-primary)]">{status}</p> : null}
      {scheduledReview ? <Link href={scheduledReview} className={`${control} mt-3 inline-block`}>Open scheduled review</Link> : null}
  </>;
  return (
    <section data-lab2-conversation-intake className={`library-shell relative h-full min-h-0 ${dragging ? "ring-2 ring-inset ring-[var(--lib-ring)]" : ""}`}
      onDragOver={(event) => { if ([...event.dataTransfer.types].some((type) => ["Files", "text/uri-list"].includes(type))) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={drop}
      onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void intake.current?.uploadFiles(files); } }}>
      <LibraryEditorPanel creatorId={creatorId} inline context={selection.context} selectedItems={selection.selectedItems} writeBlocked={selection.writeBlocked} inputBlocked={intakeBusy || intakeFailed || draftBusy || restoring || restoreFailed} onChanged={onChanged} intake={material} conversation={conversation} prepareMessage={prepareMessage} prepareDraftMessage={draft || attachments.length ? prepareDraftMessage : undefined} />
      {styleOpen ? <dialog ref={styleDialog} className="studio-order-dialog" aria-labelledby="studio-style-heading" onCancel={() => { setStyleOpen(false); styleWait.current?.reject(new Error("Choose a writing style before generating a draft. Your request is kept.")); }}>
        <h2 id="studio-style-heading">Choose your writing style</h2><p>Relay will use this style for your drafts. Your files and request are ready.</p>
        <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); setStyleBusy(true); setStyleError(""); void putCreatorStyleProfile({ tone_preset: tone }).then(() => { setStyleOpen(false); styleWait.current?.resolve(); styleWait.current = null; }).catch((cause) => setStyleError(cause instanceof Error ? cause.message : "Could not save your style. Try again.")).finally(() => setStyleBusy(false)); }}>
          <label className="block text-sm">Writing style<select className={`${field} mt-2`} value={tone} disabled={styleBusy} onChange={(event) => setTone(event.target.value as typeof tone)}>{["friendly", "professional", "warm", "playful", "formal"].map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label>
          {styleError ? <p role="alert" className="text-sm text-red-300">{styleError}</p> : null}
          <div className="flex gap-2"><button type="submit" disabled={styleBusy} className={`${control} studio-confirm-order`}>{styleBusy ? "Saving…" : "Save style & prepare draft"}</button><button type="button" className={control} disabled={styleBusy} onClick={() => { setStyleOpen(false); styleWait.current?.reject(new Error("Your request is kept. Choose a writing style when you are ready.")); }}>Cancel</button></div>
        </form>
      </dialog> : null}
      {scheduleOpen ? <dialog ref={scheduleDialog} className="studio-order-dialog" aria-labelledby="draft-schedule-title" onCancel={() => setScheduleOpen(false)} onClose={() => setScheduleOpen(false)}>
        <div className="flex items-center justify-between gap-4"><h2 id="draft-schedule-title">Schedule this draft</h2><button type="button" className={control} aria-label="Close scheduling" disabled={draftBusy} onClick={() => setScheduleOpen(false)}><X size={16} aria-hidden /></button></div>
        <p>{title || "Untitled draft"} · {draft?.media_ids.length} attached files. This saves a calendar entry; it does not publish.</p>
        <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void scheduleDraft(); }}>
          <fieldset><legend className="mb-2 text-sm">Platforms</legend><div className="flex flex-wrap gap-4">{(["patreon", "x", "deviantart", "bluesky"] as const).map((destination) => <label key={destination} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={destinations.includes(destination)} disabled={draftBusy} onChange={(event) => setDestinations((previous) => event.target.checked ? [...previous, destination] : previous.filter((item) => item !== destination))} />{destination === "x" ? "X" : destination === "deviantart" ? "DeviantArt" : destination === "patreon" ? "Patreon" : "Bluesky"}</label>)}</div></fieldset>
          <label className="block text-sm">Date and time · {Intl.DateTimeFormat().resolvedOptions().timeZone}<input type="datetime-local" name="scheduledFor" required className={`${field} mt-2`} value={scheduleTime} disabled={draftBusy} onChange={(event) => setScheduleTime(event.target.value)} /></label>
          {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
          <button type="submit" disabled={draftBusy} className={`${control} studio-confirm-order`}>{draftBusy ? "Scheduling…" : "Confirm schedule"}</button>
        </form>
      </dialog> : null}
    </section>
  );
}

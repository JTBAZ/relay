"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, MessageSquare, PencilLine, RotateCcw, Send, Trash2, X } from "lucide-react";
import {
  applyLibraryEditorSession, createLibraryEditorSession, fetchLibraryEditorCapabilities,
  fetchLibraryEditorSession, reviseLibraryEditorSession, sendLibraryEditorMessage, undoLibraryEditorCommit,
  type CartItem, type CommitReceipt, type EditAction, type EditorContext, type EditorPerformanceSubjectRef, type EditorSession,
  type LibraryEditorCapabilities, type NamingProvenance
} from "@/lib/gallery-editor-api";
import { relayBrowserMediaUrl, RelayApiError, type GalleryItem } from "@/lib/relay-api";
import PiecePerformanceAnswerView from "./PiecePerformanceAnswerView";

type Props = { creatorId: string; context: EditorContext; selectedItems: GalleryItem[]; onChanged: () => void; writeBlocked?: boolean;
  inline?: boolean; intake?: ReactNode; conversation?: ReactNode; inputBlocked?: boolean;
  prepareMessage?: (message: string) => Promise<{ message: string; context: EditorContext } | { handled: true } | null>;
  prepareDraftMessage?: (message: string) => Promise<boolean>;
};
const notice = "Changes titles in Relay. Existing Patreon posts are unchanged.";
type TitleScope = "post" | "work" | "series";
const button = "inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--lib-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--lib-muted)] disabled:cursor-not-allowed disabled:opacity-40";
const input = "w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-xs text-[var(--lib-fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]";
function key(creatorId: string): string { return `relay.library-editor.session:${creatorId}`; }
function readSavedSession(creatorId: string): string | null { try { return localStorage.getItem(key(creatorId)); } catch { return null; } }
function storeSession(creatorId: string, id: string): void { try { localStorage.setItem(key(creatorId), id); } catch { /* Browser storage is optional. */ } }

/** Only creator-authenticated Relay thumbnail routes are rendered in the change cart. */
function cartThumbnail(url?: string): string | null {
  return url && /^\/api\/v1\/export\/media\/[^/?#]+\/[^/?#]+\/thumb$/.test(url) ? relayBrowserMediaUrl(url) : null;
}
function readable(value: unknown): string {
  if (value == null) return "None";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(readable).join(", ") || "None";
  if (typeof value !== "object") return String(value);
  const fields = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof fields.title === "string") parts.push(fields.title || "Untitled");
  if (typeof fields.description === "string" || fields.description === null) {
    const text = typeof fields.description === "string" ? fields.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "None";
    parts.push(`Description: ${text || "None"}`);
  }
  if (Array.isArray(fields.tags)) parts.push(`Tags: ${readable(fields.tags)}`);
  if (Array.isArray(fields.mediaIds)) parts.push(`Media order: ${readable(fields.mediaIds)}`);
  if (Array.isArray(fields.collectionIds)) parts.push(`Collections: ${readable(fields.collectionIds)}`);
  if (Array.isArray(fields.postIds)) parts.push(`Post order: ${readable(fields.postIds)}`);
  if (Array.isArray(fields.workIds)) parts.push(`Works: ${readable(fields.workIds)}`);
  if (Array.isArray(fields.mediaTags)) for (const delta of fields.mediaTags as Array<Record<string, unknown>>) parts.push(`Media ${readable(delta.mediaId)} tags: +${readable(delta.add)}; −${readable(delta.remove)}`);
  if (typeof fields.workId === "string" && fields.workId) parts.push(`Work: ${fields.workId}`);
  if (typeof fields.seriesId === "string" && fields.seriesId) parts.push(`Series: ${fields.seriesId}`);
  if (typeof fields.partLabel === "string") parts.push(`Part: ${fields.partLabel}`);
  if (typeof fields.memberLabel === "string") parts.push(`Variant: ${fields.memberLabel}`);
  if (typeof fields.sortOrder === "number") parts.push(`Position: ${fields.sortOrder + 1}`);
  if (typeof fields.titleMode === "string") parts.push(fields.titleMode === "custom" ? "Custom title" : fields.titleMode === "source" ? "Source title" : fields.titleMode === "inherit_work" ? "Inherits work title" : fields.titleMode === "inherit_series" ? "Inherits series title" : "Independent title");
  return parts.join("\n") || "No change";
}
function CartRow({ item, busy, onRemove, onKeepTitle, onFamilyTitle }: { item: CartItem; busy: boolean; onRemove: () => void; onKeepTitle?: () => void; onFamilyTitle?: () => void }) {
  const thumbnail = cartThumbnail(item.thumbnailUrl);
  return (
    <li className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
      <div className="flex items-start gap-2">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- bounded authenticated Relay thumbnail
          <img src={thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs font-semibold">{item.title || "Untitled"}</p>
          <p className="mt-1 text-[10px] text-[var(--lib-fg-muted)]">{item.targetType}{item.preservedReason === "source_post_title" ? " · Last synced title preserved" : item.preservedReason === "independent_work" ? " · Independent work title preserved" : ""}{item.related ? " · Related post unchanged" : ""}{item.inherited ? " · Inherits family title" : ""}{item.exception ? readable(item.before) === readable(item.after) ? " · Custom title preserved" : " · Custom post title" : ""}</p>
        </div>
        {item.actionIds.length ? <button type="button" className="rounded p-1 text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] disabled:opacity-40" aria-label={`Remove actions affecting ${item.title || "Untitled"}`} disabled={busy} onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></button> : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
        <div><dt className="mb-1 text-[var(--lib-fg-muted)]">Before</dt><dd className="whitespace-pre-wrap break-words">{readable(item.before)}</dd></div>
        <div><dt className="mb-1 text-[var(--lib-primary)]">After</dt><dd className="whitespace-pre-wrap break-words">{readable(item.after)}</dd></div>
      </dl>
      {onKeepTitle ? <button type="button" className={`${button} mt-2`} disabled={busy} onClick={onKeepTitle}>Keep this post title as an exception</button> : null}
      {onFamilyTitle ? <button type="button" className={`${button} mt-2`} disabled={busy} onClick={onFamilyTitle}>Use family title</button> : null}
    </li>
  );
}

/** The conversational editor proposes a server preview. Only Apply changes commits it. */
export default function LibraryEditorPanel({ creatorId, context, selectedItems, onChanged, writeBlocked = false, inline = false, intake, conversation, prepareMessage, prepareDraftMessage, inputBlocked = false }: Props) {
  const [capabilities, setCapabilities] = useState<LibraryEditorCapabilities | null>(null);
  const [open, setOpen] = useState(false);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [receipt, setReceipt] = useState<CommitReceipt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conversationScroll = useRef<HTMLDivElement>(null);
  const focusComposerAfterGeneration = useRef<number | null>(null);
  const pendingPerformanceScrollId = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [hydratedPromptCreator, setHydratedPromptCreator] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleScope, setTitleScope] = useState<TitleScope>("post");
  const [performanceScope, setPerformanceScope] = useState<"post" | "work">("post");
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const manualTitle = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<EditorSession | null>(null);
  const creatorRef = useRef(creatorId);
  const pending = useRef(false);
  const turnEpoch = useRef(0);
  const operationGeneration = useRef(0);
  const activeTurn = useRef<{ epoch: number; creatorId: string; controller: AbortController; sessionId?: string; revision?: number } | null>(null);
  const applyKey = useRef<string | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const workIds = useMemo(() => [...new Set(selectedItems.map((item) => item.creative_work_id).filter((id): id is string => Boolean(id)))], [selectedItems]);
  const selectedPostIds = [...new Set(context.selectedPostIds)];
  const selectedWorkIds = selectedPostIds.map((postId) => selectedItems.find((item) => item.post_id === postId)?.creative_work_id ?? null);
  const selectedWorkId = selectedWorkIds.length > 0 && selectedWorkIds.every((id) => id !== null && id === selectedWorkIds[0]) ? selectedWorkIds[0] : null;
  const seriesIds = useMemo(() => [...new Set(selectedItems.map((item) => (item as GalleryItem & { naming?: NamingProvenance }).naming?.seriesId).filter((id): id is string => Boolean(id)))], [selectedItems]);
  const allSelectedPostsHaveWorks = context.selectedPostIds.every((postId) => selectedItems.some((item) => item.post_id === postId && item.creative_work_id));
  const targetIds = titleScope === "post" ? context.selectedPostIds : titleScope === "work" ? workIds : seriesIds;

  useLayoutEffect(() => {
    operationGeneration.current += 1;
    creatorRef.current = creatorId;
    turnEpoch.current += 1;
    activeTurn.current?.controller.abort();
    activeTurn.current = null;
    const controller = new AbortController();
    const generation = operationGeneration.current;
    focusComposerAfterGeneration.current = null;
    pendingPerformanceScrollId.current = null;
    setCapabilities(null); setOpen(inline); setSession(null); setReceipt(null); setError(null);
    sessionRef.current = null; applyKey.current = null; pending.current = false; setBusy(null);
    if (creatorId) void fetchLibraryEditorCapabilities(creatorId, controller.signal).then((next) => {
      if (!controller.signal.aborted && generation === operationGeneration.current && creatorId === creatorRef.current) setCapabilities(next);
    }).catch(() => { /* A disabled/older server omits the editor affordance. */ });
    return () => { operationGeneration.current += 1; turnEpoch.current += 1; activeTurn.current?.controller.abort(); activeTurn.current = null; controller.abort(); };
  }, [creatorId, inline]);
  useEffect(() => {
    if (!open || inline) return;
    (composer.current ?? manualTitle.current)?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, inline]);
  useEffect(() => { if (titleScope === "work" && !workIds.length || titleScope === "series" && !seriesIds.length) setTitleScope("post"); }, [titleScope, workIds.length, seriesIds.length]);
  const selectedPostKey = selectedPostIds.join(",");
  useEffect(() => { setPerformanceScope("post"); }, [selectedPostKey]);

  const acceptSession = useCallback((next: EditorSession, options: { openCartReview?: boolean } = {}) => {
    if (next.creatorId !== creatorRef.current) throw new Error("The active studio changed. Reopen the Library editor.");
    const active = activeTurn.current;
    if (active?.sessionId && (next.id !== active.sessionId || next.revision !== active.revision)) {
      active.controller.abort(); activeTurn.current = null; turnEpoch.current += 1;
    }
    sessionRef.current = next; setSession(next); storeSession(next.creatorId, next.id);
    setReceipt(next.lastReceipt ?? null); applyKey.current = null;
    if (inline && options.openCartReview !== false && next.cart.actions.length) setReviewOpen(true);
  }, [inline]);
  useEffect(() => {
    if (reviewOpen && !reviewDialog.current?.open) reviewDialog.current?.showModal();
    if (!reviewOpen && reviewDialog.current?.open) reviewDialog.current?.close();
  }, [reviewOpen]);
  useLayoutEffect(() => {
    const pendingReportId = pendingPerformanceScrollId.current;
    const scrollContainer = conversationScroll.current;
    if (!pendingReportId || !scrollContainer) return;
    const target = Array.from(scrollContainer.querySelectorAll<HTMLElement>("[data-performance-report]"))
      .find((element) => element.dataset.performanceReport === pendingReportId);
    pendingPerformanceScrollId.current = null;
    if (!target) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const top = scrollContainer.scrollTop + target.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
    scrollContainer.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  }, [session]);
  useLayoutEffect(() => {
    const generation = focusComposerAfterGeneration.current;
    if (busy || generation === null) return;
    focusComposerAfterGeneration.current = null;
    if (generation === operationGeneration.current && creatorRef.current === creatorId) composer.current?.focus();
  }, [busy, creatorId]);
  const operate = useCallback(async (label: string, action: () => Promise<void>, restoreFocus = false) => {
    if (pending.current) return;
    const owner = creatorRef.current;
    const generation = operationGeneration.current;
    pending.current = true; setBusy(label); setError(null);
    try { await action(); if (restoreFocus && creatorRef.current === owner && operationGeneration.current === generation) focusComposerAfterGeneration.current = generation; }
    catch (cause) { if (creatorRef.current === owner && operationGeneration.current === generation) { setError(cause instanceof Error ? cause.message : "Library editing failed. Try again."); if (restoreFocus) focusComposerAfterGeneration.current = generation; } }
    finally { if (creatorRef.current === owner && operationGeneration.current === generation) { pending.current = false; setBusy(null); } }
  }, []);
  const ensureSession = useCallback(async (initialContext: EditorContext = contextRef.current): Promise<EditorSession> => {
    if (sessionRef.current) return sessionRef.current;
    const owner = creatorRef.current;
    const generation = operationGeneration.current;
    const saved = readSavedSession(owner);
    let next: EditorSession;
    if (saved) {
      try { next = await fetchLibraryEditorSession(saved); }
      catch (cause) { if (!(cause instanceof RelayApiError) || cause.status !== 404) throw cause; next = await createLibraryEditorSession(owner, initialContext); }
    } else next = await createLibraryEditorSession(owner, initialContext);
    if (owner !== creatorRef.current || next.creatorId !== owner || generation !== operationGeneration.current) throw new Error("The active studio changed. Reopen the Library editor.");
    acceptSession(next);
    return next;
  }, [acceptSession]);
  const showEditor = () => { setOpen(true); void operate("Loading draft", async () => { await ensureSession(); }); };
  const proposeTitle = () => void operate("Preparing preview", async () => {
    const current = await ensureSession();
    let actions = current.cart.actions;
    if (editingActionId) actions = actions.map((a) => a.id === editingActionId && (a.kind === "rename_post" || a.kind === "rename_work" || a.kind === "rename_series") ? { ...a, title: title.trim() } : a);
    else actions = [...actions, ...targetIds.map((id): EditAction => titleScope === "work" ? { id: crypto.randomUUID(), kind: "rename_work", workId: id, title: title.trim() }
      : titleScope === "series" ? { id: crypto.randomUUID(), kind: "rename_series", seriesId: id, title: title.trim() }
      : { id: crypto.randomUUID(), kind: "rename_post", postId: id, title: title.trim() })];
    acceptSession(await reviseLibraryEditorSession(current, actions, contextRef.current)); setTitle(""); setEditingActionId(null);
  });
  const setInheritance = (mode: "inherit_post_title" | "source_post_title") => void operate("Preparing preview", async () => {
    const current = await ensureSession();
    const actions: EditAction[] = contextRef.current.selectedPostIds.map((postId) => ({ id: crypto.randomUUID(), kind: mode, postId }));
    acceptSession(await reviseLibraryEditorSession(current, [...current.cart.actions, ...actions], contextRef.current));
  });
  const reviseActions = (actions: EditAction[]) => void operate("Updating preview", async () => {
    const current = await ensureSession();
    acceptSession(await reviseLibraryEditorSession(current, actions, contextRef.current)); setEditingActionId(null);
  });
  const send = () => {
    const text = message.trim();
    if (!text || pending.current) return;
    const frozenContext = structuredClone(context);
    const frozenItems = selectedItems.map((item) => ({ postId: item.post_id, workId: item.creative_work_id ?? null }));
    const frozenPostIds = [...new Set(frozenContext.selectedPostIds)];
    const workIdsForAnchors = frozenPostIds.map((postId) => frozenItems.find((item) => item.postId === postId)?.workId ?? null);
    const singleWorkId = workIdsForAnchors.length > 0 && workIdsForAnchors.every((id) => id !== null && id === workIdsForAnchors[0]) ? workIdsForAnchors[0] : null;
    const frozenSubject: EditorPerformanceSubjectRef | undefined = capabilities?.performance?.enabled
      ? performanceScope === "work" && singleWorkId ? { kind: "work", id: singleWorkId }
        : performanceScope === "post" && frozenPostIds.length === 1 ? { kind: "post", id: frozenPostIds[0]! } : undefined
      : undefined;
    const owner = creatorId;
    const epoch = ++turnEpoch.current;
    activeTurn.current?.controller.abort();
    const controller = new AbortController();
    activeTurn.current = { epoch, creatorId: owner, controller };
    void operate("Thinking", async () => {
      try {
        const prepared = prepareMessage ? await prepareMessage(text) : { message: text, context: frozenContext };
        const active = activeTurn.current;
        if (!active || active.epoch !== epoch || active.creatorId !== creatorRef.current || owner !== creatorRef.current || controller.signal.aborted) return;
        if (!prepared) return;
        if ("handled" in prepared) { setMessage(""); return; }
        if (!capabilities?.aiAvailable) throw new Error("Library conversation is unavailable. You can still preview title changes below.");
        const current = await ensureSession(frozenContext);
        if (activeTurn.current !== active || controller.signal.aborted || owner !== creatorRef.current) return;
        active.sessionId = current.id; active.revision = current.revision;
        const next = await sendLibraryEditorMessage(current, prepared.message, frozenContext, frozenSubject, controller.signal);
        const latest = activeTurn.current;
        if (!latest || latest.epoch !== epoch || latest.controller.signal.aborted || owner !== creatorRef.current || next.creatorId !== owner) return;
        if (sessionRef.current && (sessionRef.current.id !== current.id || sessionRef.current.revision !== current.revision)) return;
        const previousReportIds = new Set(current.messages.flatMap((entry) => entry.role === "assistant" && entry.performanceAnswer ? [entry.performanceAnswer.report_id] : []));
        for (let index = next.messages.length - 1; index >= 0; index -= 1) {
          const entry = next.messages[index];
          const reportId = entry?.role === "assistant" ? entry.performanceAnswer?.report_id : undefined;
          if (reportId && !previousReportIds.has(reportId)) { pendingPerformanceScrollId.current = reportId; break; }
        }
        activeTurn.current = null;
        acceptSession(next, { openCartReview: next.cart.revision !== current.cart.revision });
        setMessage("");
      } finally {
        if (activeTurn.current?.epoch === epoch) activeTurn.current = null;
      }
    }, true);
  };
  const prepareDraft = () => {
    const text = message.trim();
    if (!text || !prepareDraftMessage || pending.current) return;
    void operate("Preparing attached draft", async () => {
      if (await prepareDraftMessage(text)) setMessage("");
    }, true);
  };
  const apply = () => void operate("Applying changes", async () => {
    const current = await ensureSession();
    // Retain this key after a failed response so a retry cannot duplicate an accepted commit.
    applyKey.current ??= crypto.randomUUID();
    const result = await applyLibraryEditorSession(current, applyKey.current);
    if (creatorRef.current !== current.creatorId) return;
    setReceipt(result.receipt); setReviewOpen(false); onChanged();
    const next = await fetchLibraryEditorSession(current.id); acceptSession(next); setReceipt(result.receipt);
  });
  const undo = () => void operate("Undoing changes", async () => {
    if (!receipt) return;
    const owner = creatorRef.current;
    const result = await undoLibraryEditorCommit(receipt.id);
    if (creatorRef.current !== owner) return;
    setReceipt(result.receipt); setReviewOpen(false); onChanged();
    if (sessionRef.current) { const next = await fetchLibraryEditorSession(sessionRef.current.id); acceptSession(next); setReceipt(result.receipt); }
  });
  const refreshDraft = () => void operate("Refreshing draft", async () => {
    if (!sessionRef.current) return;
    const latest = await fetchLibraryEditorSession(sessionRef.current.id);
    acceptSession(await reviseLibraryEditorSession(latest, latest.cart.actions, contextRef.current));
  });

  useLayoutEffect(() => {
    if (!inline || !creatorId) return;
    setHydratedPromptCreator(null);
    try { setMessage(localStorage.getItem(`relay.lab2.prompt:${creatorId}`) ?? ""); } catch { /* Optional browser storage. */ }
    setHydratedPromptCreator(creatorId);
  }, [creatorId, inline]);
  useEffect(() => {
    if (!inline || !creatorId || hydratedPromptCreator !== creatorId) return;
    try { localStorage.setItem(`relay.lab2.prompt:${creatorId}`, message); } catch { /* Optional browser storage. */ }
  }, [creatorId, inline, message, hydratedPromptCreator]);
  useEffect(() => {
    if (inline && capabilities?.enabled) void operate("Loading draft", async () => { await ensureSession(); });
  }, [inline, capabilities?.enabled, operate, ensureSession]);

  if (!capabilities?.enabled && !inline) return null;
  const actions = session?.cart.actions ?? [];
  const conflicts = session?.cart.conflicts ?? [];
  const hasSelectedLibraryPosts = inline && context.selectedPostIds.length > 0;
  const disabled = Boolean(busy) || writeBlocked || inputBlocked && !hasSelectedLibraryPosts || inline && hydratedPromptCreator !== creatorId || !inline && !capabilities?.enabled;
  const draftActionDisabled = disabled || inputBlocked;
  const composerForm = (capabilities?.aiAvailable || inline && prepareMessage ? <form className="mt-3" onSubmit={(event) => { event.preventDefault(); send(); }}><label htmlFor={reviewOpen ? "studio-order-message" : "library-editor-message"} className={inline ? "sr-only" : "mb-1 block text-[11px] font-medium"}>{inline ? "Your request" : "What would you like to change?"}</label><textarea ref={composer} id={reviewOpen ? "studio-order-message" : "library-editor-message"} className={input} rows={2} maxLength={8000} name="message" autoComplete="off" value={message} disabled={disabled} onChange={(event) => setMessage(event.target.value)} placeholder={inline ? "Describe what Relay should do…" : "Rename the selected work, preserving its custom post titles…"} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!disabled && message.trim()) send(); } }} />
      {inline && capabilities?.performance?.enabled && selectedPostIds.length ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--lib-fg-muted)]">
        {selectedWorkId ? <label className="flex min-h-8 items-center gap-2">Performance scope<select aria-label="Performance scope" className={`${button} min-w-0 max-w-full bg-[var(--lib-input)]`} value={performanceScope} disabled={disabled} onChange={(event) => setPerformanceScope(event.target.value as "post" | "work")}>
          <option value="post">Selected {selectedPostIds.length === 1 ? "post" : "posts"}</option><option value="work">Entire selected work</option>
        </select></label> : <span>{selectedPostIds.length === 1 ? "Selected post is the default performance scope." : "Choose one post or one work to ask about performance."}</span>}
        <span>Performance defaults to 30 days across linked platforms.</span>
      </div> : null}
      <div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={disabled || !message.trim()} type="submit"><Send className="h-3.5 w-3.5" aria-hidden />{inline ? "Send request" : "Propose changes"}</button>{inline && prepareDraftMessage ? <button className={button} disabled={draftActionDisabled || !message.trim()} type="button" onClick={prepareDraft}>Prepare attached draft</button> : null}</div>
    </form>
                : <p className="mt-3 text-xs text-[var(--lib-fg-muted)]">Conversation is unavailable. You can still preview title changes below.</p>);
  const changeCart = (!inline || actions.length || conflicts.length ? <section className="mt-5 border-t border-[var(--lib-border)] pt-4" aria-labelledby="library-change-cart-heading">
              <div className="flex items-center justify-between"><h3 id="library-change-cart-heading" className="text-xs font-semibold">Change cart · {session?.cart.items.length ?? 0} items</h3>{actions.length ? <button type="button" className="text-[11px] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] disabled:opacity-40" disabled={disabled} onClick={() => reviseActions([])}>Discard all</button> : null}</div>
              {conflicts.length ? <div><ul role="alert" className="mt-2 space-y-1 text-xs text-[var(--lib-warning)]">{conflicts.map((conflict, index) => <li key={index}>{conflict}</li>)}</ul><button className={`${button} mt-2`} type="button" disabled={Boolean(busy)} onClick={refreshDraft}>Refresh draft</button></div> : null}
              {session?.cart.items.length ? <ul className="mt-3 space-y-2">{session.cart.items.map((item, index) => <CartRow key={`${item.targetType}:${item.targetId}:${index}`} item={item} busy={disabled} onRemove={() => reviseActions(actions.filter((action) => !item.actionIds.includes(action.id)))} onKeepTitle={item.targetType === "post" && item.inherited && (item.before as { title?: string })?.title !== (item.after as { title?: string })?.title ? () => reviseActions([...actions, { id: crypto.randomUUID(), kind: "rename_post", postId: item.targetId, title: (item.before as { title: string }).title }]) : undefined} onFamilyTitle={item.targetType === "post" && item.exception && Boolean((item.after as { workId?: string })?.workId) ? () => reviseActions([...actions, { id: crypto.randomUUID(), kind: "inherit_post_title", postId: item.targetId }]) : undefined} />)}</ul> : <p className="mt-3 rounded-lg border border-dashed border-[var(--lib-border)] p-3 text-xs text-[var(--lib-fg-muted)]">No pending changes. Nothing is saved until you apply the cart.</p>}
              {actions.some((a) => a.kind === "rename_post" || a.kind === "rename_work" || a.kind === "rename_series") ? <details className="mt-3 text-xs"><summary className="cursor-pointer text-[var(--lib-fg-muted)]">Revise a proposed title</summary><ul className="mt-2 space-y-1">{actions.filter((a): a is Extract<EditAction, { title: string }> => a.kind === "rename_post" || a.kind === "rename_work" || a.kind === "rename_series").map((action) => <li key={action.id}><button type="button" className="text-left text-[var(--lib-primary)] disabled:opacity-40" disabled={disabled} onClick={() => { setEditingActionId(action.id); setTitle(action.title); }}>{action.title}</button></li>)}</ul></details> : null}
            </section> : null);
  const applyFooter = (!inline || actions.length || busy ? <footer className="shrink-0 border-t border-[var(--lib-border)] p-4">
            {receipt?.summary ? <p className="mb-2 text-[11px] text-[var(--lib-fg-muted)]">{receipt.summary}</p> : null}
            {busy ? <p role="status" className="mb-2 flex items-center gap-2 text-xs text-[var(--lib-fg-muted)]"><Loader2 className="h-3.5 w-3.5 animate-spin" />{busy}…</p> : null}
            <button type="button" className={`${button} w-full border-[var(--lib-primary)] bg-[var(--lib-primary)] text-[var(--lib-primary-fg)] hover:bg-[var(--lib-primary)]/90`} disabled={disabled || !actions.length || Boolean(conflicts.length)} onClick={apply}><Check className="h-4 w-4" />Apply {actions.length || ""} {actions.length === 1 ? "change" : "changes"}</button>
            <p className="mt-2 text-center text-[10px] text-[var(--lib-fg-muted)]">{session?.cart.notice || capabilities?.notice || notice}</p>
          </footer> : null);
  const errorNotice = error ? <div role="alert" className="mt-3 rounded border border-[var(--lib-destructive)]/40 p-3 text-xs text-[var(--lib-destructive)]"><p>{error}</p><button className={`${button} mt-2`} type="button" disabled={Boolean(busy)} onClick={refreshDraft}>Refresh draft</button></div> : null;
  return (
    <>
      {!inline ? <div className="flex shrink-0 items-center justify-end border-b border-[var(--lib-border)] bg-[var(--lib-bg)] px-4 py-1.5">
        <button ref={trigger} type="button" onClick={showEditor} aria-expanded={open} aria-controls="library-editor-panel" className={button}><MessageSquare className="h-3.5 w-3.5" />Edit Library{actions.length ? <span className="rounded bg-[var(--lib-primary)]/15 px-1 text-[var(--lib-primary)]">{actions.length}</span> : null}</button>
      </div> : null}
      {open ? (
        <aside id="library-editor-panel" aria-label={inline ? "Conversational editor" : "Library editor"} data-has-conversation={Boolean(session?.messages.length)} className={inline ? "studio-conversation flex h-full min-h-0 w-full flex-col bg-[var(--lib-bg)]" : "fixed bottom-0 right-0 top-0 z-[90] flex w-full max-w-[440px] flex-col border-l border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl shadow-black/40"}>
          <header className={`flex shrink-0 items-center justify-between border-b border-[var(--lib-border)] ${inline ? "px-4 py-3" : "p-4"}`}>
            <div><h2 className="text-sm font-semibold">{inline ? "Editor" : "Edit Library"}</h2><p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">{inline ? "Tell Relay what to prepare or change." : "Propose, review, then apply."}</p></div>
            {!inline ? <button type="button" className="rounded p-1.5 hover:bg-[var(--lib-muted)]" aria-label="Close Library editor" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X className="h-4 w-4" /></button> : null}
          </header>
          <div ref={conversationScroll} className="studio-conversation-scroll min-h-0 flex-1 overflow-y-auto p-4">
            {!inline ? <><p className="text-[11px] text-[var(--lib-fg-muted)]">{context.selectedPostIds.length} selected posts · {context.selectedMediaIds?.length ?? 0} selected assets{context.activeCollectionId ? " · Collection selected" : ""}</p>
            <p className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">{capabilities?.notice || notice}</p></> : null}
            {writeBlocked ? <p role="status" className="mt-3 rounded border border-[var(--lib-warning)]/40 p-2 text-xs text-[var(--lib-warning)]">Resolve the studio sync issue before applying changes.</p> : null}
            {!inline ? errorNotice : null}

            <section className={inline ? "" : "mt-4"} aria-label="Conversation">
              {inline && !session?.messages.length && !conversation ? <p>Select a post or attach a file to begin.</p> : null}
              {session?.messages.length ? <ol className="space-y-2">{session.messages.map((entry, index) => <li key={index} data-performance-report={entry.role === "assistant" ? entry.performanceAnswer?.report_id : undefined} className={`min-w-0 break-words rounded-lg border border-[var(--lib-border)] p-3 text-xs ${entry.role === "user" ? "bg-[var(--lib-muted)]" : "bg-[var(--lib-bg)]"}`}><span className="mb-1 block text-[10px] font-medium text-[var(--lib-fg-muted)]">{entry.role === "user" ? "You" : "Library assistant"}</span>{entry.role === "assistant" && entry.performanceAnswer ? <PiecePerformanceAnswerView answer={entry.performanceAnswer} /> : entry.text}</li>)}</ol> : !inline ? <p className="rounded-lg border border-dashed border-[var(--lib-border)] p-3 text-xs text-[var(--lib-fg-muted)]">Select posts and describe the change. You can find work anywhere in your Library.</p> : null}
              {inline ? conversation : intake}
              {!inline ? composerForm : null}
            </section>

            <details className={`mt-4 ${inline && !context.selectedPostIds.length ? "hidden" : ""}`} open={inline ? undefined : true}>
            <summary className={inline ? "cursor-pointer text-xs text-[var(--lib-fg-muted)]" : "hidden"}>Manual title changes</summary>
            <section className="mt-5 border-t border-[var(--lib-border)] pt-4" aria-labelledby="library-title-edit-heading">
              <h3 id="library-title-edit-heading" className="text-xs font-semibold">{editingActionId ? "Revise proposed title" : "Title changes"}</h3>
              <form className="mt-2 space-y-2" onSubmit={(event) => { event.preventDefault(); proposeTitle(); }}>
                {!editingActionId ? <><label className="block text-[11px] text-[var(--lib-fg-muted)]" htmlFor="library-title-scope">Change title of</label><select id="library-title-scope" className={input} value={titleScope} disabled={disabled} onChange={(event) => setTitleScope(event.target.value as TitleScope)}><option value="post">Selected posts — custom titles</option><option value="work" disabled={!workIds.length}>Selected works — inherited post titles</option><option value="series" disabled={!seriesIds.length}>Selected series — inherited work titles</option></select><p className="text-[10px] text-[var(--lib-fg-muted)]">{titleScope === "post" ? "Sets a custom title on each selected post." : "Custom post titles are preserved. Review every affected member in the cart."}</p></> : null}
                <label className="block text-[11px] text-[var(--lib-fg-muted)]" htmlFor="library-new-title">New title</label><input ref={manualTitle} id="library-new-title" className={input} value={title} maxLength={500} disabled={disabled} onChange={(event) => setTitle(event.target.value)} />
                {!targetIds.length && !editingActionId ? <p className="text-[11px] text-[var(--lib-fg-muted)]">Select a post in the Library to preview a title change.</p> : null}
                {targetIds.length > 100 ? <p className="text-[11px] text-[var(--lib-warning)]">Choose at most 100 targets for one preview.</p> : null}
                <button type="submit" className={button} disabled={disabled || !title.trim() || !editingActionId && (!targetIds.length || targetIds.length > 100)}><PencilLine className="h-3.5 w-3.5" />{editingActionId ? "Update preview" : "Preview titles"}</button>
                {editingActionId ? <button type="button" className={`${button} ml-2`} onClick={() => { setEditingActionId(null); setTitle(""); }}>Cancel revision</button> : null}
              </form>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={disabled || !context.selectedPostIds.length || !allSelectedPostsHaveWorks || context.selectedPostIds.length > 100} onClick={() => setInheritance("inherit_post_title")}>Use work titles</button><button type="button" className={button} disabled={disabled || !context.selectedPostIds.length || context.selectedPostIds.length > 100} onClick={() => setInheritance("source_post_title")}>Use source titles</button></div>
            </section>
            </details>

            {inline ? actions.length ? <button type="button" className={button} onClick={() => setReviewOpen(true)}>Review order · {session?.cart.items.length ?? 0} items</button> : null : changeCart}
            {receipt && (!inline || !receipt.reversedAt) ? <section role="status" className="mt-4 rounded-lg border border-[var(--lib-primary)]/35 bg-[var(--lib-primary)]/10 p-3 text-xs"><p className="font-medium">{receipt.reversedAt ? "Changes undone" : `Applied ${receipt.actionCount} ${receipt.actionCount === 1 ? "change" : "changes"}`}</p><p className="mt-1 text-[11px]">{receipt.affectedPostIds.length} affected posts{receipt.preservedExceptions.length ? ` · ${receipt.preservedExceptions.length} title exceptions preserved` : ""}</p>{!receipt.reversedAt ? <button type="button" className={`${button} mt-2`} disabled={disabled} onClick={undo}><RotateCcw className="h-3.5 w-3.5" />Undo this batch</button> : null}</section> : null}
          </div>
          {inline ? <div className="studio-composer">{!reviewOpen ? errorNotice : null}{intake}{!reviewOpen ? composerForm : <button type="button" className={button} onClick={() => setReviewOpen(true)}>Review order</button>}</div> : null}
          {!inline ? applyFooter : busy ? <p role="status" className="px-6 pb-3 text-xs text-[var(--lib-fg-muted)]">{busy}…</p> : null}
          {inline && reviewOpen ? <dialog ref={reviewDialog} className="studio-order-dialog" aria-labelledby="studio-order-title" onCancel={() => setReviewOpen(false)} onClose={() => setReviewOpen(false)}>
            <div className="flex items-center justify-between gap-4"><h2 id="studio-order-title">Verify your order</h2><button type="button" aria-label="Close order review" className={button} disabled={Boolean(busy)} onClick={() => setReviewOpen(false)}><X size={16} aria-hidden /></button></div>
            <p>Check the selected work and each proposed change. Remove an item below, or describe a correction before confirming.</p>
            {changeCart}
            {editingActionId ? <form className="mt-4 space-y-2" onSubmit={(event) => { event.preventDefault(); proposeTitle(); }}><label htmlFor="studio-reviewed-title" className="block text-xs">Revise proposed title</label><input id="studio-reviewed-title" className={input} maxLength={500} value={title} disabled={disabled} onChange={(event) => setTitle(event.target.value)} /><button type="submit" className={button} disabled={disabled || !title.trim()}>Update preview</button></form> : null}
            {error ? <p role="alert" className="mt-3 text-xs text-red-300">{error}</p> : null}
            {composerForm}
            {applyFooter}
          </dialog> : null}
        </aside>
      ) : null}
    </>
  );
}

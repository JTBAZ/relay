"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, MessageSquare, PencilLine, RotateCcw, Send, Trash2, X } from "lucide-react";
import {
  applyLibraryEditorSession, createLibraryEditorSession, fetchLibraryEditorCapabilities,
  fetchLibraryEditorSession, reviseLibraryEditorSession, sendLibraryEditorMessage, undoLibraryEditorCommit,
  type CartItem, type CommitReceipt, type EditAction, type EditorContext, type EditorSession,
  type LibraryEditorCapabilities, type NamingProvenance
} from "@/lib/gallery-editor-api";
import { relayBrowserMediaUrl, type GalleryItem } from "@/lib/relay-api";

type Props = { creatorId: string; context: EditorContext; selectedItems: GalleryItem[]; onChanged: () => void; writeBlocked?: boolean };
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
export default function LibraryEditorPanel({ creatorId, context, selectedItems, onChanged, writeBlocked = false }: Props) {
  const [capabilities, setCapabilities] = useState<LibraryEditorCapabilities | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [receipt, setReceipt] = useState<CommitReceipt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [titleScope, setTitleScope] = useState<TitleScope>("post");
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const manualTitle = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<EditorSession | null>(null);
  const creatorRef = useRef(creatorId);
  const pending = useRef(false);
  const applyKey = useRef<string | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  creatorRef.current = creatorId;
  const workIds = useMemo(() => [...new Set(selectedItems.map((item) => item.creative_work_id).filter((id): id is string => Boolean(id)))], [selectedItems]);
  const seriesIds = useMemo(() => [...new Set(selectedItems.map((item) => (item as GalleryItem & { naming?: NamingProvenance }).naming?.seriesId).filter((id): id is string => Boolean(id)))], [selectedItems]);
  const allSelectedPostsHaveWorks = context.selectedPostIds.every((postId) => selectedItems.some((item) => item.post_id === postId && item.creative_work_id));
  const targetIds = titleScope === "post" ? context.selectedPostIds : titleScope === "work" ? workIds : seriesIds;

  useEffect(() => {
    const controller = new AbortController();
    setCapabilities(null); setOpen(false); setSession(null); setReceipt(null); setError(null);
    sessionRef.current = null; applyKey.current = null; pending.current = false; setBusy(null);
    if (creatorId) void fetchLibraryEditorCapabilities(creatorId, controller.signal).then(setCapabilities).catch(() => { /* A disabled/older server omits the editor affordance. */ });
    return () => controller.abort();
  }, [creatorId]);
  useEffect(() => {
    if (!open) return;
    (composer.current ?? manualTitle.current)?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => { if (titleScope === "work" && !workIds.length || titleScope === "series" && !seriesIds.length) setTitleScope("post"); }, [titleScope, workIds.length, seriesIds.length]);

  const acceptSession = useCallback((next: EditorSession) => {
    if (next.creatorId !== creatorRef.current) throw new Error("The active studio changed. Reopen the Library editor.");
    sessionRef.current = next; setSession(next); storeSession(next.creatorId, next.id);
    setReceipt(next.lastReceipt ?? null); applyKey.current = null;
  }, []);
  const operate = useCallback(async (label: string, action: () => Promise<void>) => {
    if (pending.current) return;
    const owner = creatorRef.current;
    pending.current = true; setBusy(label); setError(null);
    try { await action(); }
    catch (cause) { if (creatorRef.current === owner) setError(cause instanceof Error ? cause.message : "Library editing failed. Try again."); }
    finally { if (creatorRef.current === owner) { pending.current = false; setBusy(null); } }
  }, []);
  const ensureSession = useCallback(async (): Promise<EditorSession> => {
    if (sessionRef.current) return sessionRef.current;
    const owner = creatorRef.current;
    const saved = readSavedSession(owner);
    let next: EditorSession;
    if (saved) {
      try { next = await fetchLibraryEditorSession(saved); }
      catch { next = await createLibraryEditorSession(owner, contextRef.current); }
    } else next = await createLibraryEditorSession(owner, contextRef.current);
    if (owner !== creatorRef.current || next.creatorId !== owner) throw new Error("The active studio changed. Reopen the Library editor.");
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
  const send = () => void operate("Thinking", async () => {
    const text = message.trim();
    if (!text) return;
    const current = await ensureSession();
    acceptSession(await sendLibraryEditorMessage(current, text, contextRef.current)); setMessage("");
  });
  const apply = () => void operate("Applying changes", async () => {
    const current = await ensureSession();
    // Retain this key after a failed response so a retry cannot duplicate an accepted commit.
    applyKey.current ??= crypto.randomUUID();
    const result = await applyLibraryEditorSession(current, applyKey.current);
    if (creatorRef.current !== current.creatorId) return;
    setReceipt(result.receipt); onChanged();
    const next = await fetchLibraryEditorSession(current.id); acceptSession(next); setReceipt(result.receipt);
  });
  const undo = () => void operate("Undoing changes", async () => {
    if (!receipt) return;
    const owner = creatorRef.current;
    const result = await undoLibraryEditorCommit(receipt.id);
    if (creatorRef.current !== owner) return;
    setReceipt(result.receipt); onChanged();
    if (sessionRef.current) { const next = await fetchLibraryEditorSession(sessionRef.current.id); acceptSession(next); setReceipt(result.receipt); }
  });
  const refreshDraft = () => void operate("Refreshing draft", async () => {
    if (!sessionRef.current) return;
    const latest = await fetchLibraryEditorSession(sessionRef.current.id);
    acceptSession(await reviseLibraryEditorSession(latest, latest.cart.actions, contextRef.current));
  });

  if (!capabilities?.enabled) return null;
  const actions = session?.cart.actions ?? [];
  const conflicts = session?.cart.conflicts ?? [];
  const disabled = Boolean(busy) || writeBlocked;
  return (
    <>
      <div className="flex shrink-0 items-center justify-end border-b border-[var(--lib-border)] bg-[var(--lib-bg)] px-4 py-1.5">
        <button ref={trigger} type="button" onClick={showEditor} aria-expanded={open} aria-controls="library-editor-panel" className={button}><MessageSquare className="h-3.5 w-3.5" />Edit Library{actions.length ? <span className="rounded bg-[var(--lib-primary)]/15 px-1 text-[var(--lib-primary)]">{actions.length}</span> : null}</button>
      </div>
      {open ? (
        <aside id="library-editor-panel" aria-label="Library editor" className="fixed bottom-0 right-0 top-0 z-[90] flex w-full max-w-[440px] flex-col border-l border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl shadow-black/40">
          <header className="flex shrink-0 items-center justify-between border-b border-[var(--lib-border)] p-4">
            <div><h2 className="text-sm font-semibold">Edit Library</h2><p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">Propose, review, then apply.</p></div>
            <button type="button" className="rounded p-1.5 hover:bg-[var(--lib-muted)]" aria-label="Close Library editor" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X className="h-4 w-4" /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <p className="text-[11px] text-[var(--lib-fg-muted)]">{context.selectedPostIds.length} selected posts · {context.selectedMediaIds?.length ?? 0} selected assets{context.activeCollectionId ? " · Collection selected" : ""}</p>
            <p className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">{capabilities.notice || notice}</p>
            {writeBlocked ? <p role="status" className="mt-3 rounded border border-[var(--lib-warning)]/40 p-2 text-xs text-[var(--lib-warning)]">Resolve the studio sync issue before applying changes.</p> : null}
            {error ? <div role="alert" className="mt-3 rounded border border-[var(--lib-destructive)]/40 p-3 text-xs text-[var(--lib-destructive)]"><p>{error}</p><button className={`${button} mt-2`} type="button" disabled={Boolean(busy)} onClick={refreshDraft}>Refresh draft</button></div> : null}

            <section className="mt-4" aria-label="Conversation">
              {session?.messages.length ? <ol className="space-y-2">{session.messages.map((entry, index) => <li key={index} className={`whitespace-pre-wrap break-words rounded-lg border border-[var(--lib-border)] p-3 text-xs ${entry.role === "user" ? "bg-[var(--lib-muted)]" : "bg-[var(--lib-bg)]"}`}><span className="mb-1 block text-[10px] font-medium text-[var(--lib-fg-muted)]">{entry.role === "user" ? "You" : "Library assistant"}</span>{entry.text}</li>)}</ol> : <p className="rounded-lg border border-dashed border-[var(--lib-border)] p-3 text-xs text-[var(--lib-fg-muted)]">Select posts and describe the change. You can find work anywhere in your Library.</p>}
              {capabilities.aiAvailable ? <form className="mt-3" onSubmit={(event) => { event.preventDefault(); send(); }}><label htmlFor="library-editor-message" className="mb-1 block text-[11px] font-medium">What would you like to change?</label><textarea ref={composer} id="library-editor-message" className={input} rows={3} maxLength={8000} value={message} disabled={disabled} onChange={(event) => setMessage(event.target.value)} placeholder="Rename the selected work, preserving its custom post titles…" onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!disabled && message.trim()) send(); } }} /><button className={`${button} mt-2`} disabled={disabled || !message.trim()} type="submit"><Send className="h-3.5 w-3.5" />Propose changes</button></form>
                : <p className="mt-3 text-xs text-[var(--lib-fg-muted)]">Conversation is unavailable. You can still preview title changes below.</p>}
            </section>

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

            <section className="mt-5 border-t border-[var(--lib-border)] pt-4" aria-labelledby="library-change-cart-heading">
              <div className="flex items-center justify-between"><h3 id="library-change-cart-heading" className="text-xs font-semibold">Change cart · {session?.cart.items.length ?? 0} items</h3>{actions.length ? <button type="button" className="text-[11px] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] disabled:opacity-40" disabled={disabled} onClick={() => reviseActions([])}>Discard all</button> : null}</div>
              {conflicts.length ? <div><ul role="alert" className="mt-2 space-y-1 text-xs text-[var(--lib-warning)]">{conflicts.map((conflict, index) => <li key={index}>{conflict}</li>)}</ul><button className={`${button} mt-2`} type="button" disabled={Boolean(busy)} onClick={refreshDraft}>Refresh draft</button></div> : null}
              {session?.cart.items.length ? <ul className="mt-3 space-y-2">{session.cart.items.map((item, index) => <CartRow key={`${item.targetType}:${item.targetId}:${index}`} item={item} busy={disabled} onRemove={() => reviseActions(actions.filter((action) => !item.actionIds.includes(action.id)))} onKeepTitle={item.targetType === "post" && item.inherited && (item.before as { title?: string })?.title !== (item.after as { title?: string })?.title ? () => reviseActions([...actions, { id: crypto.randomUUID(), kind: "rename_post", postId: item.targetId, title: (item.before as { title: string }).title }]) : undefined} onFamilyTitle={item.targetType === "post" && item.exception && Boolean((item.after as { workId?: string })?.workId) ? () => reviseActions([...actions, { id: crypto.randomUUID(), kind: "inherit_post_title", postId: item.targetId }]) : undefined} />)}</ul> : <p className="mt-3 rounded-lg border border-dashed border-[var(--lib-border)] p-3 text-xs text-[var(--lib-fg-muted)]">No pending changes. Nothing is saved until you apply the cart.</p>}
              {actions.some((a) => a.kind === "rename_post" || a.kind === "rename_work" || a.kind === "rename_series") ? <details className="mt-3 text-xs"><summary className="cursor-pointer text-[var(--lib-fg-muted)]">Revise a proposed title</summary><ul className="mt-2 space-y-1">{actions.filter((a): a is Extract<EditAction, { title: string }> => a.kind === "rename_post" || a.kind === "rename_work" || a.kind === "rename_series").map((action) => <li key={action.id}><button type="button" className="text-left text-[var(--lib-primary)] disabled:opacity-40" disabled={disabled} onClick={() => { setEditingActionId(action.id); setTitle(action.title); }}>{action.title}</button></li>)}</ul></details> : null}
            </section>
            {receipt ? <section role="status" className="mt-4 rounded-lg border border-[var(--lib-primary)]/35 bg-[var(--lib-primary)]/10 p-3 text-xs"><p className="font-medium">{receipt.reversedAt ? "Changes undone" : `Applied ${receipt.actionCount} ${receipt.actionCount === 1 ? "change" : "changes"}`}</p><p className="mt-1 text-[11px]">{receipt.affectedPostIds.length} affected posts{receipt.preservedExceptions.length ? ` · ${receipt.preservedExceptions.length} title exceptions preserved` : ""}</p>{!receipt.reversedAt ? <button type="button" className={`${button} mt-2`} disabled={disabled} onClick={undo}><RotateCcw className="h-3.5 w-3.5" />Undo this batch</button> : null}</section> : null}
          </div>
          <footer className="shrink-0 border-t border-[var(--lib-border)] p-4">
            {busy ? <p role="status" className="mb-2 flex items-center gap-2 text-xs text-[var(--lib-fg-muted)]"><Loader2 className="h-3.5 w-3.5 animate-spin" />{busy}…</p> : null}
            <button type="button" className={`${button} w-full border-[var(--lib-primary)] bg-[var(--lib-primary)] text-[var(--lib-primary-fg)] hover:bg-[var(--lib-primary)]/90`} disabled={disabled || !actions.length || Boolean(conflicts.length)} onClick={apply}><Check className="h-4 w-4" />Apply {actions.length || ""} {actions.length === 1 ? "change" : "changes"}</button>
            <p className="mt-2 text-center text-[10px] text-[var(--lib-fg-muted)]">{session?.cart.notice || capabilities.notice || notice}</p>
          </footer>
        </aside>
      ) : null}
    </>
  );
}
